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
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const MODEL_ID = process.env.AWS_BEDROCK_MODEL_ID || '';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || '';

const ASSISTANT_SYSTEM_PROMPT = `You are "Pathfinder AI," the elite, omnipresent career coach, technical mentor, and navigation assistant for the "STEM Career Explorer" platform. Your mission is to support students as they navigate gamified pathways, unlock technical concepts, and analyze their readiness for the high-tech workforce.

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
- Adhere strictly to clean markdown principles: use headings (##, ###), bold parameters for visual anchors, and horizontal rules (---) to divide distinct conceptual blocks.`;

const SCENARIO_SYSTEM_PROMPT = 'You are a career simulation engine. Always respond with valid JSON.';
const DIFFICULTY_XP = {
  easy: 10,
  medium: 20,
  hard: 30,
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pathfindr-backend' });
});

function hasBedrockConfig() {
  return Boolean(MODEL_ID && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY);
}

function bedrockEndpoint() {
  return `https://bedrock-runtime.${AWS_REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/converse`;
}

function signBedrockRequest(body) {
  const url = new URL(bedrockEndpoint());
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

  aws4.sign(signOpts, {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
    sessionToken: AWS_SESSION_TOKEN || undefined,
  });

  return signOpts;
}

async function invokeBedrockConverse({ messages, systemPrompt, maxTokens = 800, temperature = 0.8, topP = 0.9 }) {
  const body = JSON.stringify({
    modelId: MODEL_ID,
    messages,
    system: [{ text: systemPrompt }],
    inferenceConfig: { maxTokens, temperature, topP },
  });

  const signOpts = signBedrockRequest(body);
  const response = await fetch(bedrockEndpoint(), {
    method: 'POST',
    headers: signOpts.headers,
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      // Keep raw text when Bedrock does not send JSON.
    }

    throw new Error(`Bedrock error ${response.status}: ${JSON.stringify(parsed || text)}`);
  }

  const data = await response.json();
  const assistantContent = data.output?.message?.content || [];
  const responseText = assistantContent.map((block) => block.text || '').join('\n').trim();

  if (!responseText) {
    throw new Error('Bedrock returned no text');
  }

  return responseText;
}

function parseJsonFromResponse(responseText) {
  try {
    return JSON.parse(responseText);
  } catch (error) {
    const trimmedText = responseText.trim();
    const fencedMatch = trimmedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (fencedMatch) {
      return JSON.parse(fencedMatch[1]);
    }

    const startIndex = trimmedText.indexOf('{');
    const endIndex = trimmedText.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return JSON.parse(trimmedText.slice(startIndex, endIndex + 1));
    }

    throw error;
  }
}

function normalizeProfileList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim());
}

function buildScenarioPrompt({ career, scenario, userProfile, variation }) {
  const interests = normalizeProfileList(userProfile?.interests);
  const skills = normalizeProfileList(userProfile?.skills);
  const interestsText = interests.length > 0 ? interests.join(', ') : 'Not provided';
  const skillsText = skills.length > 0 ? skills.join(', ') : 'Not provided';

  return `You are a career simulation engine for a STEM career exploration platform.
Generate a fresh, original day-in-the-life scenario for a ${career?.title || 'STEM professional'}.

Career context:
- Career: ${career?.title || 'Unknown'}
- Field: ${career?.field || 'Unknown'}
- Existing scenario title: ${scenario?.title || 'Untitled'}
- Existing scenario description: ${scenario?.description || 'No description provided'}
- Variation seed: ${variation || 'none'}

Student profile:
- Interests: ${interestsText}
- Skills: ${skillsText}

Generate a JSON response with this structure:
{
  "difficulty": "easy | medium | hard",
  "narrative": "A 2-3 paragraph immersive description of the scenario",
  "challenge": "The specific challenge or decision point",
  "options": [
    {
      "id": "a",
      "text": "Option description",
      "outcome": "What happens if chosen",
      "correct": true,
      "xp": 20,
      "traits": ["analytical", "collaborative"]
    }
  ]
}

Requirements:
- Create a scenario that feels unique, vivid, and different from stock examples.
- Use realistic people, stakes, tools, and constraints that fit the career.
- Include 3-4 realistic options with different approaches.
- Mark exactly one option as correct and give only that option XP.
- Scale the correct option XP by difficulty: easy = 10, medium = 20, hard = 30.
- Make the scenario engaging for high school and college students.
- Do not include markdown fences or extra commentary outside the JSON.
- Avoid reusing the same narrative beats across runs; this should support repeated custom generations.`;
}

function normalizeScenarioPayload(payload) {
  const rawDifficulty = String(payload?.difficulty || 'medium').toLowerCase();
  const difficulty = Object.prototype.hasOwnProperty.call(DIFFICULTY_XP, rawDifficulty) ? rawDifficulty : 'medium';
  const rewardXp = DIFFICULTY_XP[difficulty];
  const sourceOptions = Array.isArray(payload?.options) ? payload.options : [];

  const options = sourceOptions.map((option, index) => {
    const id = option?.id || String.fromCharCode(97 + index);
    return {
      ...option,
      id,
      correct: Boolean(option?.correct || option?.isCorrect),
    };
  });

  let correctIndex = options.findIndex((option) => option.correct);
  if (correctIndex === -1 && options.length > 0) {
    correctIndex = 0;
  }

  return {
    ...payload,
    difficulty,
    rewardXp,
    correctOptionId: options[correctIndex]?.id || null,
    options: options.map((option, index) => ({
      ...option,
      correct: index === correctIndex,
      isCorrect: index === correctIndex,
      xp: index === correctIndex ? rewardXp : 0,
      rewardXp: index === correctIndex ? rewardXp : 0,
    })),
  };
}

app.post('/api/assistant/message', async (req, res) => {
  const { message } = req.body || {};

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing message in request body' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message:
        'Assistant backend not configured. Ensure AWS_BEDROCK_MODEL_ID and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set on the server for SigV4.',
      received: message,
    });
  }

  try {
    const responseText = await invokeBedrockConverse({
      messages: [{ role: 'user', content: [{ text: message }] }],
      systemPrompt: ASSISTANT_SYSTEM_PROMPT,
    });

    return res.json({ ok: true, assistant: responseText });
  } catch (err) {
    console.error('Bedrock assistant proxy failed:', err);
    return res.status(500).json({ ok: false, message: 'Assistant proxy failed', error: String(err) });
  }
});

app.post('/api/scenarios/generate', async (req, res) => {
  const { career, scenario, userProfile, variation } = req.body || {};

  if (!career || !scenario) {
    return res.status(400).json({ ok: false, message: 'Missing career or scenario in request body' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message:
        'Scenario backend not configured. Ensure AWS_BEDROCK_MODEL_ID and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set on the server for SigV4.',
    });
  }

  try {
    const responseText = await invokeBedrockConverse({
      messages: [
        {
          role: 'user',
          content: [{ text: buildScenarioPrompt({ career, scenario, userProfile, variation }) }],
        },
      ],
      systemPrompt: SCENARIO_SYSTEM_PROMPT,
      maxTokens: 1000,
      temperature: 0.85,
      topP: 0.9,
    });

    const scenarioJson = parseJsonFromResponse(responseText);
    return res.json({ ok: true, scenario: normalizeScenarioPayload(scenarioJson) });
  } catch (err) {
    console.error('Scenario generation failed:', err);
    return res.status(500).json({ ok: false, message: 'Scenario generation failed', error: String(err) });
  }
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, message: 'Not found' });
});

app.listen(port, () => {
  console.log(`Pathfindr backend listening on http://localhost:${port}`);
});
