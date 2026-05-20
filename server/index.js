const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const aws4 = require('aws4');
const { URL } = require('url');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pathfindr-backend' });
});

app.post('/api/assistant/message', (req, res) => {
  const { message } = req.body || {};

  const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
  const MODEL_ID = process.env.AWS_BEDROCK_MODEL_ID || '';
  const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
  const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
  const AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || '';

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing message in request body' });
  }


  // Require a model id and SigV4 access key+secret
  const hasSigV4 = AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY;

  if (!MODEL_ID || !hasSigV4) {
    return res.status(501).json({
      ok: false,
      message:
        'Assistant backend not configured. Ensure AWS_BEDROCK_MODEL_ID and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set on the server for SigV4.',
      received: message,
    });
  }

  const BEDROCK_ENDPOINT = `https://bedrock-runtime.${AWS_REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/converse`;

  (async () => {
    try {
      const body = JSON.stringify({
        modelId: MODEL_ID,
        messages: [{ role: 'user', content: [{ text: message }] }],
        system: [{ text: 'You are an assistant that responds with helpful, concise answers.' }],
        inferenceConfig: { maxTokens: 800, temperature: 0.8, topP: 0.9 },
      });

      let resp;

      // SigV4 signing with access key/secret (required)
      if (AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY) {
        const url = new URL(BEDROCK_ENDPOINT);
        const signOpts = {
          host: url.host,
          path: url.pathname + url.search,
          service: 'bedrock',
          region: AWS_REGION,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body,
        };

        // aws4 will add Authorization and x-amz-* headers
        aws4.sign(signOpts, {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
          sessionToken: AWS_SESSION_TOKEN || undefined,
        });

        resp = await fetch(BEDROCK_ENDPOINT, {
          method: 'POST',
          headers: signOpts.headers,
          body,
        });
      } else {
        // Should not reach here because hasSigV4 is required above, but guard defensively
        return res.status(501).json({ ok: false, message: 'SigV4 credentials missing on server' });
      }

      if (!resp.ok) {
        const txt = await resp.text();
        let parsed = null;
        try {
          parsed = JSON.parse(txt);
        } catch (e) {
          // not JSON
        }
        console.error('Bedrock returned non-OK', { status: resp.status, body: parsed || txt });
        return res.status(502).json({ ok: false, message: 'Bedrock error', status: resp.status, body: parsed || txt });
      }

      let data;
      try {
        data = await resp.json();
      } catch (parseErr) {
        const txt = await resp.text().catch(() => '');
        console.error('Failed to parse Bedrock JSON response', parseErr, txt);
        return res.status(502).json({ ok: false, message: 'Failed to parse Bedrock response', error: String(parseErr), body: txt });
      }
      const assistantContent = data.output?.message?.content || [];
      const responseText = assistantContent.map((b) => b.text || '').join('\n').trim();

      if (!responseText) {
        return res.status(502).json({ ok: false, message: 'Bedrock returned no text' });
      }

      return res.json({ ok: true, assistant: responseText });
    } catch (err) {
      console.error('Bedrock proxy failed:', err);
      return res.status(500).json({ ok: false, message: 'Assistant proxy failed', error: String(err) });
    }
  })();
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, message: 'Not found' });
});

app.listen(port, () => {
  console.log(`Pathfindr backend listening on http://localhost:${port}`);
});
