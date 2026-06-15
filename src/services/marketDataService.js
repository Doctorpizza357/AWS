/**
 * Market Data Service
 * Fetches real data from BLS Public Data API v2.
 *
 * OE (OEWS) Series ID format (from oe.txt / hlpforma.htm):
 *   Position 1-2:  OE (survey prefix)
 *   Position 3:    U  (seasonal adjustment, U=unadjusted)
 *   Position 4:    Area type (N=National, S=State, M=Metropolitan)
 *   Position 5-11: Area code (7 digits; national=0000000, state=SS00000)
 *   Position 12-17: Industry code (6 digits; 000000=cross-industry)
 *   Position 18-23: Occupation code (6 digits; SOC without dash)
 *   Position 24-25: Datatype code (2 digits)
 *
 * Datatype codes (from oe.datatype):
 *   01=Employment, 04=Annual mean wage,
 *   11=Annual 10th pct, 12=Annual 25th pct, 13=Annual median,
 *   14=Annual 75th pct, 15=Annual 90th pct,
 *   16=Emp per 1000, 17=Location Quotient
 *
 * API v2: POST https://api.bls.gov/publicAPI/v2/timeseries/data/
 *   - Supports a registration key
 *   - Returns the requested date range
 *   - Max 20 series per request
 */

// Proxied through CRA dev server (see src/setupProxy.js) to avoid CORS.
// In production, replace with your own backend proxy or serverless function.
const BLS_API_BASE = '/api/bls';
const BLS_API_KEY = process.env.REACT_APP_BLS_API_KEY;

// SOC codes (6 digits, no dash)
const CAREER_SOC = {
  'software-engineer': '151252',
  'data-scientist': '152051',
  'biomedical-engineer': '172031',
  'aerospace-engineer': '172011',
  'environmental-scientist': '192041',
  'cybersecurity-analyst': '151212',
  'cloud-architect': '151241',
  'robotics-engineer': '172141',
  'renewable-energy-engineer': '172081',
};

const STATE_FIPS = {
  'AL':'01','AK':'02','AZ':'04','AR':'05','CA':'06','CO':'08','CT':'09',
  'DE':'10','FL':'12','GA':'13','HI':'15','ID':'16','IL':'17','IN':'18',
  'IA':'19','KS':'20','KY':'21','LA':'22','ME':'23','MD':'24','MA':'25',
  'MI':'26','MN':'27','MS':'28','MO':'29','MT':'30','NE':'31','NV':'32',
  'NH':'33','NJ':'34','NM':'35','NY':'36','NC':'37','ND':'38','OH':'39',
  'OK':'40','OR':'41','PA':'42','RI':'44','SC':'45','SD':'46','TN':'47',
  'TX':'48','UT':'49','VT':'50','VA':'51','WA':'53','WV':'54','WI':'55',
  'WY':'56',
};

const STATE_NAMES = {
  'AL':'Alabama','AK':'Alaska','AZ':'Arizona','AR':'Arkansas',
  'CA':'California','CO':'Colorado','CT':'Connecticut','DE':'Delaware',
  'FL':'Florida','GA':'Georgia','HI':'Hawaii','ID':'Idaho',
  'IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas',
  'KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland',
  'MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi',
  'MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada',
  'NH':'New Hampshire','NJ':'New Jersey','NM':'New Mexico','NY':'New York',
  'NC':'North Carolina','ND':'North Dakota','OH':'Ohio','OK':'Oklahoma',
  'OR':'Oregon','PA':'Pennsylvania','RI':'Rhode Island','SC':'South Carolina',
  'SD':'South Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah',
  'VT':'Vermont','VA':'Virginia','WA':'Washington','WV':'West Virginia',
  'WI':'Wisconsin','WY':'Wyoming',
};

/**
 * Build a national OE series ID.
 * Example: OEUN000000000000015125213
 *   OE + U + N + 0000000 + 000000 + 151252 + 13
 */
function nationalSeriesId(socCode, datatypeCode) {
  return `OEUN0000000000000${socCode}${datatypeCode}`;
}

/**
 * Fetch a single series via BLS API v2 POST.
 * Returns the series object from the response.
 */
async function fetchSeries(seriesId) {
  const [series] = await fetchMultipleSeries([seriesId]);
  return series;
}

/**
 * Fetch multiple series via BLS API v2 POST.
 * Automatically batches if more than 20 series are requested.
 */
async function fetchMultipleSeries(seriesIds) {
  // Batch into chunks of 20 (v2 limit)
  const BATCH_SIZE = 20;
  const chunks = [];
  for (let i = 0; i < seriesIds.length; i += BATCH_SIZE) {
    chunks.push(seriesIds.slice(i, i + BATCH_SIZE));
  }

  const currentYear = new Date().getFullYear();

  const buildRequestBody = (chunk) => {
    const body = {
      seriesid: chunk,
      startyear: String(currentYear - 10),
      endyear: String(currentYear),
    };

    if (BLS_API_KEY) {
      body.registrationkey = BLS_API_KEY;
    }

    return body;
  };

  let allSeries = [];
  for (const chunk of chunks) {
    const res = await fetch(BLS_API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildRequestBody(chunk)),
    });

    if (!res.ok) throw new Error(`BLS API returned ${res.status}`);
    const json = await res.json();

    if (json.status !== 'REQUEST_SUCCEEDED') {
      console.error('[BLS] Request failed:', json.message, 'Series:', chunk[0]);
      throw new Error(json.message?.join('; ') || 'BLS request failed');
    }
    allSeries = allSeries.concat(json.Results.series);
  }

  return allSeries;
}

// ─── PUBLIC API ──────────────────────────────────────────────────────────────

/**
 * Predictive Salary Arc — the one we're testing.
 * Fetches national percentile wages (p10, p25, median, p75, p90) from BLS,
 * then projects forward using the observed growth rate.
 */
export async function fetchSalaryData(careerId) {
  const soc = CAREER_SOC[careerId];
  if (!soc) return { historical: [], predicted: [] };

  // Build series IDs for each percentile (national, cross-industry)
  const seriesIds = [
    nationalSeriesId(soc, '11'), // Annual 10th percentile
    nationalSeriesId(soc, '12'), // Annual 25th percentile
    nationalSeriesId(soc, '13'), // Annual median
    nationalSeriesId(soc, '14'), // Annual 75th percentile
    nationalSeriesId(soc, '15'), // Annual 90th percentile
  ];

  // v2 POST — returns the requested range when a key is provided
  const results = await fetchMultipleSeries(seriesIds);

  // Collect all years from the response
  const yearsSet = new Set();
  results.forEach(s => {
    if (s?.data) s.data.forEach(d => { if (d.value !== '-') yearsSet.add(+d.year); });
  });
  const years = [...yearsSet].sort((a, b) => a - b);

  // Map to historical array
  const keys = ['p10', 'p25', 'median', 'p75', 'p90'];
  const historical = years.map(year => {
    const row = { year, source: 'BLS' };
    keys.forEach((key, idx) => {
      const series = results[idx];
      const point = series?.data?.find(d => d.year === String(year) && d.value !== '-');
      row[key] = point ? Math.round(parseFloat(point.value)) : null;
    });
    return row;
  }).filter(r => r.median != null);

  // Calculate CAGR from observed median values
  let cagr = 0.035;
  if (historical.length >= 2) {
    const first = historical[0];
    const last = historical[historical.length - 1];
    const n = last.year - first.year;
    if (n > 0 && first.median > 0) {
      cagr = Math.pow(last.median / first.median, 1 / n) - 1;
    }
  }

  // Project forward 10 years
  const lastMedian = historical[historical.length - 1]?.median || 100000;
  const lastYear = historical[historical.length - 1]?.year || 2024;

  const predicted = [];
  for (let y = lastYear + 1; y <= lastYear + 10; y++) {
    const out = y - lastYear;
    const med = Math.round(lastMedian * Math.pow(1 + cagr, out));
    const unc = out * 0.015;
    predicted.push({
      year: y,
      median: med,
      confidenceLow: Math.round(med * (1 - unc)),
      confidenceHigh: Math.round(med * (1 + unc)),
      source: 'PREDICTION',
    });
  }

  return { historical, predicted };
}

// ─── Heatmap: state-level LQ, wage, employment ──────────────────────────────

/**
 * Build a state-level OE series ID.
 * Example for Alabama (FIPS 01), SOC 151252, datatype 17 (LQ):
 *   OE + U + S + 0100000 + 000000 + 151252 + 17
 */
function stateSeriesId(fips, socCode, datatypeCode) {
  return `OEUS${fips}00000000000${socCode}${datatypeCode}`;
}

export async function fetchMarketOverview(careerId) {
  const soc = CAREER_SOC[careerId];
  if (!soc) return { source: 'PENDING', data: [] };
  const id = nationalSeriesId(soc, '01'); // national employment
  const series = await fetchMultipleSeries([id]);
  return { source: 'BLS_LIVE', data: series };
}

/**
 * Heatmap data: state-level Location Quotient, Mean Wage, Employment.
 * 
 * BLS v2 supports a registration key and a larger request window.
 * Strategy: fetch LQ + wage for ALL states using fetchMultipleSeries batching
 * (it handles the 20-series-per-request limit automatically).
 */
export async function fetchHeatmapData(careerId) {
  const soc = CAREER_SOC[careerId];
  if (!soc) return [];

  const allStates = Object.entries(STATE_FIPS);

  // Build series IDs: LQ + mean wage for every state
  const ids = [];
  allStates.forEach(([, fips]) => {
    ids.push(stateSeriesId(fips, soc, '17')); // LQ
    ids.push(stateSeriesId(fips, soc, '04')); // Mean wage
  });

  // Also get national employment for context
  ids.push(nationalSeriesId(soc, '01'));

  // fetchMultipleSeries handles batching into groups of 20 automatically
  const series = await fetchMultipleSeries(ids);

  const nationalEmp = latestAnnualValue(series[series.length - 1]) || 0;

  // Parse state data — each state has 2 consecutive series (LQ, wage)
  return allStates.map(([stateCode], i) => {
    const lqSeries = series[i * 2];
    const wageSeries = series[i * 2 + 1];
    const lq = latestAnnualValue(lqSeries) || 0;
    const wage = latestAnnualValue(wageSeries) || 0;

    return {
      stateCode,
      stateName: STATE_NAMES[stateCode],
      locationQuotient: Math.round(lq * 100) / 100,
      employment: lq > 0 ? Math.round(nationalEmp / 50 * lq) : 0,
      meanWage: Math.round(wage),
      percentChange: 0,
    };
  });
}

/** Extract latest annual value (period A01) from a series. */
function latestAnnualValue(series) {
  if (!series?.data?.length) return null;
  const annual = series.data.find(d => d.period === 'A01' && d.value !== '-');
  if (annual) return parseFloat(annual.value);
  const any = series.data.find(d => d.value !== '-');
  return any ? parseFloat(any.value) : null;
}

// ─── Viability Index ─────────────────────────────────────────────────────────

/**
 * Viability: derived from real BLS national employment + wage data vs CPI.
 * Uses CPI-U (CUUR0000SA0) for inflation comparison.
 *
 * BLS OEWS data is annual (period A01) and typically has a 1-2 year lag.
 * Without a registration key, the API may return only the most recent year.
 * We handle this by:
 *  - Computing per-year growth rates when multi-year data is available
 *  - Using the absolute level of wages and employment as differentiators when
 *    growth data is unavailable (different careers have very different wage levels)
 *  - Comparing annualized CPI growth to annualized wage growth
 */
export async function fetchViabilityData(careerId) {
  const soc = CAREER_SOC[careerId];
  if (!soc) return [];

  const empId = nationalSeriesId(soc, '01');   // Employment
  const wageId = nationalSeriesId(soc, '04');  // Annual mean wage
  const cpiId = 'CUUR0000SA0';                 // CPI-U All Items

  const series = await fetchMultipleSeries([empId, wageId, cpiId]);
  const empS = series[0];
  const wageS = series[1];
  const cpiS = series[2];

  // Get values for growth calculation
  const empVals = extractYearValues(empS);
  const wageVals = extractYearValues(wageS);
  const cpiVals = extractAllMonthlyValues(cpiS);

  // Employment growth % (annualized)
  let empGrowth = 0;
  const empYears = Object.keys(empVals).sort();
  if (empYears.length >= 2) {
    const oldest = empVals[empYears[0]];
    const newest = empVals[empYears[empYears.length - 1]];
    const n = parseInt(empYears[empYears.length - 1]) - parseInt(empYears[0]);
    if (oldest > 0 && n > 0) empGrowth = (Math.pow(newest / oldest, 1 / n) - 1) * 100;
  }

  // Wage growth % (annualized)
  let wageGrowth = 0;
  let latestWage = 0;
  const wageYears = Object.keys(wageVals).sort();
  if (wageYears.length >= 2) {
    const oldest = wageVals[wageYears[0]];
    const newest = wageVals[wageYears[wageYears.length - 1]];
    const n = parseInt(wageYears[wageYears.length - 1]) - parseInt(wageYears[0]);
    if (oldest > 0 && n > 0) wageGrowth = (Math.pow(newest / oldest, 1 / n) - 1) * 100;
    latestWage = newest;
  } else if (wageYears.length === 1) {
    latestWage = wageVals[wageYears[0]];
  }

  // Latest employment level
  let latestEmp = 0;
  if (empYears.length >= 1) {
    latestEmp = empVals[empYears[empYears.length - 1]];
  }

  // CPI inflation % (annualized, using latest available year-over-year)
  let inflation = 0;
  const cpiYearMonths = Object.keys(cpiVals).sort();
  if (cpiYearMonths.length >= 13) {
    // Use year-over-year from the most recent 12-month span
    const latest = cpiVals[cpiYearMonths[cpiYearMonths.length - 1]];
    const yearAgo = cpiVals[cpiYearMonths[cpiYearMonths.length - 13]];
    if (yearAgo > 0) inflation = ((latest - yearAgo) / yearAgo) * 100;
  } else if (cpiYearMonths.length >= 2) {
    const oldest = cpiVals[cpiYearMonths[0]];
    const newest = cpiVals[cpiYearMonths[cpiYearMonths.length - 1]];
    const months = cpiYearMonths.length - 1;
    if (oldest > 0 && months > 0) inflation = (Math.pow(newest / oldest, 12 / months) - 1) * 100;
  }

  const realWage = wageGrowth - inflation;

  // Career-specific differentiation signals:
  // - wageLevel: higher-paying careers score higher on capital inflow & viability
  // - empLevel: larger employment pools indicate mature, stable demand
  // Scale wage level (50k-200k range → 0-1 signal)
  const wageLevelSignal = Math.max(0, Math.min(1, (latestWage - 50000) / 150000));
  // Scale employment (10k-500k range → 0-1 signal)
  const empLevelSignal = Math.max(0, Math.min(1, (latestEmp - 10000) / 490000));

  const clamp = (v) => Math.max(10, Math.min(90, Math.round(v)));
  const trend = (v) => v > 2 ? 'up' : v < -2 ? 'down' : 'stable';

  // Use both growth data AND level data to differentiate careers.
  // When growth data is 0 (insufficient time range), level signals still vary by career.
  return [
    {
      id: 'ai-displacement', label: 'AI Displacement Risk',
      value: clamp(50 - empGrowth * 3 - empLevelSignal * 15),
      rawValue: Math.round((50 - empGrowth * 3)) / 100,
      unit: 'risk score', trend: trend(-empGrowth),
    },
    {
      id: 'capital-inflow', label: 'Capital Inflow Rate',
      value: clamp(40 + (empGrowth + wageGrowth) * 2 + wageLevelSignal * 30),
      rawValue: Math.round((empGrowth + wageGrowth) * 10) / 10,
      unit: '% combined growth', trend: trend(empGrowth + wageGrowth),
    },
    {
      id: 'supply-demand', label: 'Supply vs Demand',
      value: clamp(45 + empGrowth * 5 + empLevelSignal * 20),
      rawValue: Math.round(empGrowth * 10) / 10,
      unit: '% emp growth', trend: trend(empGrowth),
    },
    {
      id: 'wage-growth', label: 'Wage Growth vs Inflation',
      value: clamp(50 + realWage * 4 + wageLevelSignal * 15),
      rawValue: Math.round(realWage * 10) / 10,
      unit: '% real', trend: trend(realWage),
    },
    {
      id: 'cola-delta', label: 'COLA Adjusted Value',
      value: clamp(45 + realWage * 5 + wageLevelSignal * 20),
      rawValue: Math.round(realWage * 10) / 10,
      unit: '% delta', trend: trend(realWage),
    },
  ];
}

/** Extract annual (A01) values keyed by year. */
function extractYearValues(series) {
  const vals = {};
  if (!series?.data) return vals;
  series.data.forEach(d => {
    if (d.period === 'A01' && d.value !== '-') {
      vals[d.year] = parseFloat(d.value);
    }
  });
  return vals;
}

/** Extract all monthly CPI values keyed by "YYYY-MM" for proper ordering. */
function extractAllMonthlyValues(series) {
  const vals = {};
  if (!series?.data) return vals;
  series.data.forEach(d => {
    if (d.period && d.period.startsWith('M') && d.value !== '-') {
      const month = d.period.replace('M', '');
      vals[`${d.year}-${month}`] = parseFloat(d.value);
    }
  });
  return vals;
}

/** Extract December (M12) CPI values keyed by year. */
function extractDecemberValues(series) {
  const vals = {};
  if (!series?.data) return vals;
  series.data.forEach(d => {
    if (d.period === 'M12' && d.value !== '-') {
      vals[d.year] = parseFloat(d.value);
    }
  });
  return vals;
}

// ─── Job Stream ──────────────────────────────────────────────────────────────

/**
 * Job listings are coming soon.
 * Return an empty list for now.
 */
export async function fetchJobListings() {
  return [];
}
