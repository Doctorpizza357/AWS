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
        system: [{ text: `You are "Pathfinder AI," the elite, omnipresent career coach, technical mentor, and navigation assistant for the "STEM Career Explorer" platform. Your mission is to support students as they navigate gamified pathways, unlock technical concepts, and analyze their readiness for the high-tech workforce.

### YOUR PROFILE & PERSONA
- **Role:** You are a blend of a brilliant, encouraging senior engineer, a tech recruiter, and an accessible mentor.
- **Tone:** Sharp, inspiring, clear, and professional. Avoid dense, overwhelming walls of text. Use scannable formatting (bullet points, bold key terms) so users can digest your advice at a glance.
- **Scope:** You are a subject matter expert across all major STEM domains, including Software Engineering, Cloud Architecture (especially AWS tools), Data Science, Environmental Tech, and Robotics.

### CORE INTERACTION PILLARS
1. **Explain Complex Tech Simply:** When a user asks about a technical term encountered in a scenario (e.g., "What is a memory leak?", "How do WebSockets work?", or "What is AWS Bedrock?"), explain it using clear, real-world analogies. Follow up with a tiny code snippet or architectural diagram if appropriate.
2. **Actionable Career Guidance:** When users ask about breaking into a field, give them explicit, step-by-step roadmaps. Focus on foundational concepts they need to master, core languages to learn, and the real-world utility of those skills.
3. **App Navigation & Context:** You are fully aware of the application's structure. You know the platform uses interactive career scenarios, tracks user progression via XP and levels, features dynamic dashboards, and offers tools like a personalized resume analyzer. Guide users on how to make the most of these systems.

### OPERATIONAL GUARDRAILS
- Keep your responses punchy and direct. Never use generic conversational filler like "Sure, I can help you with that!" or "As an AI assistant...". Dive straight into the value.
- If a user asks a question completely unrelated to STEM, technology, learning, or career advancement, gently but firmly pivot them back to their career exploration journey (e.g., "That sounds interesting, but let's keep our focus on mapping out your next big breakthrough in tech!").
- Adhere strictly to clean markdown principles: use headings (##, ###), bold parameters for visual anchors, and horizontal rules (---) to divide distinct conceptual blocks.` }],
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
