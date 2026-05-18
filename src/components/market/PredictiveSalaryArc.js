import React, { useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import './PredictiveSalaryArc.css';

function PredictiveSalaryArc({ data, loading, compact }) {
  const [selectedPercentile, setSelectedPercentile] = useState('median');

  if (loading) {
    return (
      <div className={`salary-arc-container ${compact ? 'compact' : ''}`}>
        <div className="salary-skeleton mi-skeleton" style={{ height: compact ? 180 : 400 }}></div>
      </div>
    );
  }

  if (!data || (!data.historical?.length && !data.predicted?.length)) {
    return (
      <div className={`salary-arc-container ${compact ? 'compact' : ''}`}>
        <div className="salary-empty">No salary data available</div>
      </div>
    );
  }

  // Combine historical and predicted data for the chart
  const chartData = [
    ...data.historical.map(d => ({
      year: d.year,
      median: d.median,
      p10: d.p10,
      p25: d.p25,
      p75: d.p75,
      p90: d.p90,
      type: 'historical',
    })),
    ...data.predicted.map(d => ({
      year: d.year,
      median: d.median,
      confidenceLow: d.confidenceLow,
      confidenceHigh: d.confidenceHigh,
      type: 'predicted',
    })),
  ];

  const formatCurrency = (value) => {
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}k`;
    return `$${value}`;
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    const isPredicted = point?.type === 'predicted';

    return (
      <div className="salary-tooltip">
        <div className="salary-tooltip-header">
          {label} {isPredicted && <span className="predicted-badge">Predicted</span>}
        </div>
        {point?.median && (
          <div className="salary-tooltip-row">
            <span>Median</span>
            <span className="salary-tooltip-value">${point.median.toLocaleString()}</span>
          </div>
        )}
        {point?.p90 && (
          <div className="salary-tooltip-row">
            <span>90th Percentile</span>
            <span className="salary-tooltip-value">${point.p90.toLocaleString()}</span>
          </div>
        )}
        {point?.p10 && (
          <div className="salary-tooltip-row">
            <span>10th Percentile</span>
            <span className="salary-tooltip-value">${point.p10.toLocaleString()}</span>
          </div>
        )}
        {point?.confidenceHigh && (
          <div className="salary-tooltip-row">
            <span>Confidence Range</span>
            <span className="salary-tooltip-value">
              ${point.confidenceLow.toLocaleString()} – ${point.confidenceHigh.toLocaleString()}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`salary-arc-container ${compact ? 'compact' : ''}`}>
      {!compact && (
        <div className="salary-controls">
          <div className="percentile-selector">
            {['p10', 'p25', 'median', 'p75', 'p90'].map(p => (
              <button
                key={p}
                className={`percentile-btn ${selectedPercentile === p ? 'active' : ''}`}
                onClick={() => setSelectedPercentile(p)}
              >
                {p === 'median' ? 'Median' : p.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="salary-legend-custom">
            <span className="legend-item">
              <span className="legend-dot historical"></span> Historical (BLS)
            </span>
            <span className="legend-item">
              <span className="legend-dot predicted"></span> Predicted
            </span>
            <span className="legend-item">
              <span className="legend-dot confidence"></span> Confidence Interval
            </span>
          </div>
        </div>
      )}

      <div className="salary-chart" style={{ height: compact ? 160 : 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="historicalGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ffc8" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00ffc8" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="predictedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="confidenceGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="year"
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              axisLine={{ stroke: '#1e293b' }}
            />
            <YAxis
              stroke="#475569"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickFormatter={formatCurrency}
              axisLine={{ stroke: '#1e293b' }}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Confidence interval band */}
            <Area
              type="monotone"
              dataKey="confidenceHigh"
              stroke="none"
              fill="url(#confidenceGradient)"
              fillOpacity={1}
            />
            <Area
              type="monotone"
              dataKey="confidenceLow"
              stroke="none"
              fill="#0a0f1a"
              fillOpacity={1}
            />

            {/* Historical range */}
            {selectedPercentile !== 'median' && (
              <Area
                type="monotone"
                dataKey={selectedPercentile}
                stroke="#00b4d8"
                strokeWidth={1}
                fill="url(#historicalGradient)"
                fillOpacity={0.5}
                dot={false}
              />
            )}

            {/* Main median line */}
            <Area
              type="monotone"
              dataKey="median"
              stroke="#00ffc8"
              strokeWidth={2}
              fill="url(#historicalGradient)"
              dot={false}
              activeDot={{ r: 5, fill: '#00ffc8', stroke: '#0a0f1a', strokeWidth: 2 }}
            />

            {/* Prediction boundary */}
            <ReferenceLine
              x={2026}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={0.5}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {!compact && (
        <div className="salary-insights">
          <div className="insight-card">
            <span className="insight-value">
              ${data.historical?.[data.historical.length - 1]?.median?.toLocaleString() || '—'}
            </span>
            <span className="insight-label">Current Median</span>
          </div>
          <div className="insight-card">
            <span className="insight-value">
              ${data.predicted?.[data.predicted.length - 1]?.median?.toLocaleString() || '—'}
            </span>
            <span className="insight-label">2035 Projected</span>
          </div>
          <div className="insight-card">
            <span className="insight-value accent">
              {data.historical?.length >= 2
                ? `+${(((data.historical[data.historical.length - 1].median / data.historical[0].median) - 1) * 100).toFixed(1)}%`
                : '—'}
            </span>
            <span className="insight-label">Total Growth (2015–2026)</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default PredictiveSalaryArc;
