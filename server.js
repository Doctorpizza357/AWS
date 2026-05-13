const path = require('path');
const express = require('express');
require('dotenv').config();
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3000;
const AWS_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-pro-v1:0';
const bedrockToken = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();

const bedrockClient = new BedrockRuntimeClient({
  region: AWS_REGION,
  ...(bedrockToken ? { token: { token: bedrockToken } } : {})
});

console.log('Bedrock client configured?', !!bedrockClient);

const careerKeywordMap = {
  software: 'software developer',
  data: 'data scientist',
  cyber: 'cybersecurity',
  biomedical: 'biomedical engineer',
  robotics: 'robotics',
  environmental: 'environmental engineer',
  mechanical: 'mechanical engineer'
};

app.get('/api/jobs', async (req, res) => {
  const careerId = req.query.careerId || '';
  const location = req.query.location || 'remote';
  const country = (req.query.country || process.env.ADZUNA_DEFAULT_COUNTRY || 'us').toLowerCase();

  const keyword = careerKeywordMap[careerId] || careerId || 'engineer';

  // Prefer Adzuna when API keys are provided
  if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY) {
    try {
      const adzunaUrl = new URL(`https://api.adzuna.com/v1/api/jobs/${country}/search/1`);
      adzunaUrl.searchParams.set('app_id', process.env.ADZUNA_APP_ID);
      adzunaUrl.searchParams.set('app_key', process.env.ADZUNA_APP_KEY);
      adzunaUrl.searchParams.set('what', `${keyword}`);
      if (String(location || '').trim().toLowerCase() !== 'remote') {
        adzunaUrl.searchParams.set('where', location);
      } else {
        adzunaUrl.searchParams.set('what', `${keyword} remote`);
      }
      adzunaUrl.searchParams.set('results_per_page', '12');
      adzunaUrl.searchParams.set('sort_by', 'date');
      adzunaUrl.searchParams.set('content-type', 'application/json');

      const r = await fetch(adzunaUrl.toString());
      const data = await r.json();
      const jobs = Array.isArray(data.results) ? data.results.map((job) => ({
        title: job.title,
        company_name: job.company?.display_name || job.company?.display_name || null,
        location: job.location?.display_name || (job.location?.area || []).slice(-1)[0] || location,
        url: job.redirect_url || job.redirect_url || '#',
        tags: [job.category?.label, job.contract_time, job.contract_type].filter(Boolean)
      })) : [];

      res.json(jobs);
      return;
    } catch (err) {
      console.error('Adzuna error', err.message || err);
      // fall through to public fallback
    }
  }

  // Public fallback: ArbeitNow job board
  try {
    const r = await fetch('https://www.arbeitnow.com/api/job-board-api');
    const data = await r.json();
    const jobs = Array.isArray(data.data) ? data.data : [];
    const normalizedLocation = String(location || '').toLowerCase();

    const filtered = jobs.filter((job) => {
      const haystack = [job.title, job.company_name, job.location, ...(job.tags || [])].join(' ').toLowerCase();
      const matchesKeyword = haystack.includes(keyword.toLowerCase());
      const matchesLocation = normalizedLocation === 'remote' || haystack.includes(normalizedLocation) || (job.location && String(job.location).toLowerCase().includes(normalizedLocation));
      return matchesKeyword && matchesLocation;
    }).slice(0, 12).map((job) => ({
      title: job.title,
      company_name: job.company_name,
      location: Array.isArray(job.location) ? job.location.join(', ') : job.location || 'Location not listed',
      url: job.url || '#',
      tags: job.tags || job.job_types || []
    }));

    res.json(filtered);
  } catch (err) {
    console.error('Fallback job API error', err.message || err);
    res.json([]);
  }
});

app.post('/api/assistant', async (req, res) => {
  const { prompt, profile, rankings } = req.body || {};
  console.log('Assistant request received. bedrockClient present:', !!bedrockClient, 'prompt length:', String(prompt || '').length);

  // Use Amazon Bedrock directly when a Bedrock API key is available.
  // Require Bedrock: if no Bedrock client, return service unavailable
  if (!bedrockClient) {
    console.warn('Assistant request but Bedrock not configured');
    return res.status(503).json({ error: 'Bedrock not configured' });
  }

  try {
    const topTwo = Array.isArray(rankings) ? rankings.slice(0, 3) : [];
    const systemPrompt = [
      'You are a concise STEM career coach for students, parents, counselors, and career switchers.',
      'Explain differences in plain language.',
      'Use the provided profile and career matches to give practical advice.',
      'Return only the answer text with no markdown bullets unless the prompt asks for a list.'
    ].join(' ');

    const userPrompt = JSON.stringify({ prompt, profile, rankings: topTwo });

    const command = new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: [{ role: 'user', content: [{ text: userPrompt }] }],
      inferenceConfig: { maxTokens: 500, temperature: 0.6, topP: 0.9 }
    });

    const response = await bedrockClient.send(command);
    console.log('Bedrock response (raw):', JSON.stringify(response, null, 2));
    const text = response.output?.message?.content?.map((part) => part.text).filter(Boolean).join('').trim();

    if (!text) {
      console.error('Bedrock returned no text');
      return res.status(502).json({ error: 'Bedrock returned no text' });
    }

    return res.json({ reply: text, source: 'bedrock' });
  } catch (err) {
    console.error('Bedrock runtime error', err && (err.stack || err.message) || err);
    return res.status(502).json({ error: 'Bedrock runtime error', detail: err && (err.message || err) });
  }
});

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      const fallbackPort = Number(port) + 1;
      console.warn(`Port ${port} is in use. Retrying on ${fallbackPort}...`);
      startServer(fallbackPort);
      return;
    }

    throw err;
  });
}

startServer(PORT);
