const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const aws4 = require('aws4');
const multer = require('multer');
const pdfParse = require('pdf-parse');

function parsePdfBuffer(buffer) {
  // Support v1 simple function API
  if (typeof pdfParse === 'function') return pdfParse(buffer);

  // Support default export function shape
  if (pdfParse && typeof pdfParse.default === 'function') return pdfParse.default(buffer);

  const PDFParseClass = (pdfParse && pdfParse.PDFParse) || (pdfParse && pdfParse.default && pdfParse.default.PDFParse);
  if (typeof PDFParseClass === 'function') {
    const parser = new PDFParseClass({ data: buffer });
    // parser.getText() returns an object with `.text` and other metadata
    return parser.getText();
  }

  try {
    const nodeModule = require('pdf-parse/dist/node/cjs/index.cjs');
    const NodePDFParse = nodeModule && nodeModule.PDFParse;
    if (typeof NodePDFParse === 'function') {
      const parser = new NodePDFParse({ data: buffer });
      return parser.getText();
    }
  } catch (err) {
  }

  console.error('pdf-parse diagnostics:', { type: typeof pdfParse, keys: pdfParse && Object.keys ? Object.keys(pdfParse) : undefined });
  throw new Error('pdf-parse export not found');
}
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
- Adhere strictly to clean markdown principles: use headings, bold parameters for visual anchors, and horizontal rules (---) to divide distinct conceptual blocks.`;

const SCENARIO_SYSTEM_PROMPT = 'You are a career simulation engine. Always respond with valid JSON.';
const DIFFICULTY_XP = {
  easy: 10,
  medium: 20,
  hard: 30,
};

// CORS: allow configured origins + local dev
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin === allowed || origin.endsWith('.vercel.app'))) {
      return callback(null, true);
    }
    // In development, allow localhost on any port
    if (origin.match(/^http:\/\/localhost:\d+$/)) {
      return callback(null, true);
    }
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Multer config for PDF uploads (max 5MB, in-memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'), false);
    }
  },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'pathfindr-backend' });
});

// Test seam: when set, routes call this override instead of issuing a
// SigV4-signed request to AWS Bedrock. Production callers leave it `null` and
// the real fetch path runs unchanged. See `__setTestBedrockInvoker` below.
let _testBedrockInvoker = null;

function hasBedrockConfig() {
  // When a test override is registered, treat the backend as configured so
  // routes do not short-circuit with HTTP 501 just because the test env lacks
  // AWS credentials.
  if (_testBedrockInvoker) return true;
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
  // Test seam: bypass SigV4 + network when an override is registered.
  if (_testBedrockInvoker) {
    return _testBedrockInvoker({ messages, systemPrompt, maxTokens, temperature, topP });
  }

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
  try { return JSON.parse(responseText); } catch (_) {}
  let text = responseText.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON found');
  let raw = text.slice(start, end + 1);
  try { return JSON.parse(raw); } catch (_) {}
  // Walk char-by-char: escape newlines/tabs/backticks only inside strings
  let fixed = '', inStr = false, esc = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (esc) { fixed += c; esc = false; continue; }
    if (c === '\\') { fixed += c; esc = true; continue; }
    if (c === '"') { inStr = !inStr; fixed += c; continue; }
    if (inStr) {
      if (c === '\n') { fixed += '\\n'; continue; }
      if (c === '\r') { continue; }
      if (c === '\t') { fixed += '\\t'; continue; }
      if (c === '`') { fixed += "'"; continue; }
    }
    fixed += c;
  }
  try { return JSON.parse(fixed); } catch (_) {}
  // Truncate at last complete value and close
  const lastComma = fixed.lastIndexOf('",');
  if (lastComma > 0) {
    let trunc = fixed.substring(0, lastComma + 1);
    const open = (trunc.match(/{/g) || []).length;
    const close = (trunc.match(/}/g) || []).length;
    trunc += '}'.repeat(Math.max(0, open - close));
    try { return JSON.parse(trunc); } catch (_) {}
  }
  throw new Error('Failed to parse AI response as JSON');
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

// â”€â”€â”€ Resume Analysis Endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RESUME_ANALYSIS_SYSTEM_PROMPT = `You are a resume analysis engine for a STEM career exploration platform aimed at students. Your job is to extract structured career profile information from resumes.

Analyze the resume text and determine if it contains ENOUGH information to build a complete career profile. A complete profile needs:
1. The person's name
2. At least 2 clear interests/fields of interest
3. At least 2 identifiable skills
4. Some indication of work style preference (office/lab/field/mixed)
5. Some indication of career motivation

If the resume IS COMPLETE (has enough info for all 5 areas), respond with:
{
  "status": "complete",
  "profile": {
    "name": "<extracted name>",
    "interests": ["<interest1>", "<interest2>", ...],
    "skills": ["<skill1>", "<skill2>", ...],
    "preferences": {
      "workstyle": "<one of: Office / Remote (Computer-based work), Laboratory (Research & experiments), Field Work (Outdoors & travel), Mixed (Variety of settings)>",
      "motivation": "<one of: Making a positive impact on society, Solving complex technical challenges, Financial stability and growth, Innovation and creating new things>"
    }
  }
}

If the resume is INCOMPLETE (missing key areas), respond with:
{
  "status": "incomplete",
  "extractedData": {
    "name": "<name if found, or empty string>",
    "interests": ["<any interests found>"],
    "skills": ["<any skills found>"],
    "workstyle": "<if determinable, or empty string>",
    "motivation": "<if determinable, or empty string>"
  },
  "followUpQuestions": [
    {
      "id": "<unique_id>",
      "question": "<question text>",
      "type": "multi-select | single-select | text",
      "options": ["<option1>", "<option2>", ...]
    }
  ]
}

Rules for follow-up questions:
- Only ask about information that is MISSING or UNCLEAR from the resume
- Use the same question style as an onboarding quiz (friendly, encouraging)
- For interests/skills use "multi-select" with relevant options
- For workstyle/motivation use "single-select" with the exact options listed above
- For name use "text" type
- Maximum 3 follow-up questions
- Options for interests should come from: Coding & Programming, Mathematics, Biology & Life Sciences, Physics & Space, Chemistry, Environmental Science, Robotics & Hardware, Data & Analytics, Design & UX, Healthcare & Medicine, AI & Machine Learning, Sustainability
- Options for skills should come from: Problem Solving, Creative Thinking, Teamwork, Writing & Communication, Math & Numbers, Research, Leadership, Attention to Detail, Critical Thinking, Hands-on Building, Public Speaking, Organization

Always respond with valid JSON only. No markdown fences or extra text.`;

app.post('/api/resume/analyze', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, message: 'No PDF file uploaded' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message: 'Resume analysis backend not configured. Ensure AWS Bedrock credentials are set.',
    });
  }

  try {
    // Extract text from PDF
    const pdfData = await parsePdfBuffer(req.file.buffer);
    const resumeText = pdfData.text;

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({
        ok: false,
        message: 'Could not extract sufficient text from the PDF. Please ensure it is not a scanned image.',
      });
    }

    // Send to Bedrock for analysis
    const responseText = await invokeBedrockConverse({
      messages: [
        {
          role: 'user',
          content: [{ text: `Analyze this resume and extract career profile information:\n\n${resumeText}` }],
        },
      ],
      systemPrompt: RESUME_ANALYSIS_SYSTEM_PROMPT,
      maxTokens: 1200,
      temperature: 0.3,
      topP: 0.9,
    });

    const analysis = parseJsonFromResponse(responseText);

    return res.json({ ok: true, analysis });
  } catch (err) {
    console.error('Resume analysis failed:', err);
    return res.status(500).json({ ok: false, message: 'Resume analysis failed', error: String(err) });
  }
});

// â”€â”€â”€ Interview Intelligence Endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const INTERVIEW_SYSTEM = 'You are an expert interview coach and career advisor. Always respond with valid JSON only.';

app.post('/api/interview/analyze-response', async (req, res) => {
  const { question, answer, role, difficulty } = req.body || {};
  if (!question || !answer) return res.status(400).json({ ok: false, message: 'Missing question or answer' });
  if (!hasBedrockConfig()) return res.status(501).json({ ok: false, message: 'Bedrock not configured' });
  try {
    const prompt = `Analyze this interview response.\nRole: ${role}\nDifficulty: ${difficulty}\nQuestion: ${question}\nAnswer: ${answer}\n\nReturn JSON:\n{"technicalAccuracy":{"score":0-100,"feedback":"..."},"communicationClarity":{"score":0-100,"feedback":"..."},"depth":{"score":0-100,"feedback":"..."},"relevance":{"score":0-100,"feedback":"..."},"overallScore":0-100,"strengths":["..."],"improvements":["..."],"sampleAnswer":"brief ideal answer","followUpQuestions":["..."]}`;
    const text = await invokeBedrockConverse({ messages: [{ role: 'user', content: [{ text: prompt }] }], systemPrompt: INTERVIEW_SYSTEM, maxTokens: 1500, temperature: 0.7 });
    res.json({ ok: true, analysis: parseJsonFromResponse(text) });
  } catch (err) { console.error('Interview analysis failed:', err); res.status(500).json({ ok: false, message: String(err) }); }
});

app.post('/api/interview/generate-questions', async (req, res) => {
  const { jobDescription, type, difficulty } = req.body || {};
  if (!jobDescription) return res.status(400).json({ ok: false, message: 'Missing jobDescription' });
  if (!hasBedrockConfig()) return res.status(501).json({ ok: false, message: 'Bedrock not configured' });
  try {
    const prompt = `Based on this job description, generate 5 ${type || 'technical'} interview questions (${difficulty || 'mid'} level).\n\nJob Description:\n${jobDescription}\n\nReturn JSON:\n{"questions":[{"id":"q1","question":"...","type":"${type || 'technical'}","difficulty":"${difficulty || 'mid'}","expectedTopics":["..."],"timeLimit":120,"tips":"..."}]}`;
    const text = await invokeBedrockConverse({ messages: [{ role: 'user', content: [{ text: prompt }] }], systemPrompt: INTERVIEW_SYSTEM, maxTokens: 1500, temperature: 0.8 });
    const parsed = parseJsonFromResponse(text);
    res.json({ ok: true, questions: parsed.questions || [] });
  } catch (err) { console.error('Question generation failed:', err); res.status(500).json({ ok: false, message: String(err) }); }
});

app.post('/api/interview/analyze-resume', async (req, res) => {
  const { resumeText, jobDescription } = req.body || {};
  if (!resumeText || !jobDescription) return res.status(400).json({ ok: false, message: 'Missing resumeText or jobDescription' });
  if (!hasBedrockConfig()) return res.status(501).json({ ok: false, message: 'Bedrock not configured' });
  try {
    const prompt = `You are an ATS optimization specialist.\n\nResume:\n${resumeText}\n\nJob Description:\n${jobDescription}\n\nAnalyze and return JSON:\n{"matchScore":0-100,"atsScore":0-100,"keywordMatches":["..."],"missingKeywords":["..."],"strengths":["..."],"improvements":[{"section":"...","suggestion":"...","priority":"high|medium|low"}],"skillsGap":[{"skill":"...","importance":"critical|important|nice-to-have","suggestion":"..."}],"formatSuggestions":["..."],"overallFeedback":"2-3 sentences"}`;
    const text = await invokeBedrockConverse({ messages: [{ role: 'user', content: [{ text: prompt }] }], systemPrompt: INTERVIEW_SYSTEM, maxTokens: 2000, temperature: 0.5 });
    res.json({ ok: true, analysis: parseJsonFromResponse(text) });
  } catch (err) { console.error('Resume analysis failed:', err); res.status(500).json({ ok: false, message: String(err) }); }
});

app.post('/api/interview/generate-resume', async (req, res) => {
  const { resumeText, jobDescription, analysis } = req.body || {};
  if (!resumeText || !jobDescription) return res.status(400).json({ ok: false, message: 'Missing resumeText or jobDescription' });
  if (!hasBedrockConfig()) return res.status(501).json({ ok: false, message: 'Bedrock not configured' });
  try {
    const missing = analysis?.missingKeywords?.join(', ') || 'N/A';
    const improvements = analysis?.improvements?.map(i => i.suggestion).join('; ') || 'N/A';
    const prompt = `You are an expert resume writer. Rewrite this resume optimized for the job.\n\nRULES: Keep truthful. Incorporate missing keywords. Use action verbs. Quantify achievements.\nStructure: NAME (centered), CONTACT, PROFESSIONAL SUMMARY (2-3 sentences), EXPERIENCE (bullets with action verbs), SKILLS, EDUCATION\n\nOriginal Resume:\n${resumeText}\n\nJob Description:\n${jobDescription}\n\nMissing Keywords: ${missing}\nImprovements: ${improvements}\n\nReturn JSON:\n{"optimizedResume":"the COMPLETE rewritten resume with \\n for line breaks, ALL CAPS section headers, bullets with bullet char","changesSummary":["change1","change2"],"estimatedNewScore":85}\n\nThe optimizedResume MUST be the full resume text ready to send to an employer.`;
    const text = await invokeBedrockConverse({ messages: [{ role: 'user', content: [{ text: prompt }] }], systemPrompt: INTERVIEW_SYSTEM, maxTokens: 4000, temperature: 0.5 });
    res.json({ ok: true, resume: parseJsonFromResponse(text) });
  } catch (err) { console.error('Resume generation failed:', err); res.status(500).json({ ok: false, message: String(err) }); }
});

app.post('/api/interview/extract-pdf', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: 'No PDF file uploaded' });
  try {
    const pdfData = await parsePdfBuffer(req.file.buffer);
    const text = typeof pdfData === 'string' ? pdfData : (pdfData.text || '');
    if (!text || text.trim().length < 20) return res.status(400).json({ ok: false, message: 'Could not extract text. PDF may be image-based.' });
    res.json({ ok: true, text: text.trim() });
  } catch (err) { console.error('PDF extraction failed:', err); res.status(500).json({ ok: false, message: 'PDF extraction failed', error: String(err) }); }
});

app.post('/api/interview/code-review', async (req, res) => {
  const { code, language, problemDescription } = req.body || {};
  if (!code) return res.status(400).json({ ok: false, message: 'Missing code' });
  if (!hasBedrockConfig()) return res.status(501).json({ ok: false, message: 'Bedrock not configured' });
  try {
    const prompt = `You are a senior software engineer conducting a code review.

PROBLEM: ${problemDescription || 'General coding problem'}

CANDIDATE'S CODE:
\`\`\`
${code}
\`\`\`

Analyze their actual code. Return ONLY this JSON structure:
{"correctness":{"score":0,"issues":["list specific bugs"]},"efficiency":{"score":0,"timeComplexity":"O(?)","spaceComplexity":"O(?)","suggestions":["optimization tips"]},"codeQuality":{"score":0,"feedback":["style feedback"]},"edgeCases":["cases handled or missed"],"overallScore":0,"improvements":["what to fix"],"alternativeApproaches":["other approaches"],"solutionHint":"One sentence describing the optimal approach and key insight"}

Fill in real scores 0-100 and specific feedback about THEIR code. Be specific - reference their actual logic.`;
    const text = await invokeBedrockConverse({ messages: [{ role: 'user', content: [{ text: prompt }] }], systemPrompt: INTERVIEW_SYSTEM, maxTokens: 3000, temperature: 0.5 });
    res.json({ ok: true, review: parseJsonFromResponse(text) });
  } catch (err) { console.error('Code review failed:', err); res.status(500).json({ ok: false, message: String(err) }); }
});

app.post('/api/interview/tailored-problems', async (req, res) => {
  const { jobDescription } = req.body || {};
  if (!jobDescription) return res.status(400).json({ ok: false, message: 'Missing jobDescription' });
  if (!hasBedrockConfig()) return res.status(501).json({ ok: false, message: 'Bedrock not configured' });
  try {
    const prompt = `Generate 3 coding problems for this role's technical interview.\n\nJob Description:\n${jobDescription}\n\nReturn JSON:\n{"problems":[{"id":"p1","title":"...","difficulty":"easy|medium|hard","category":"...","description":"full problem","examples":[{"input":"...","output":"...","explanation":"..."}],"constraints":["..."],"starterCode":{"javascript":"function solution() {\\n  \\n}","python":"def solution():\\n    pass"},"hints":["..."],"optimalComplexity":{"time":"O(...)","space":"O(...)"},"relevance":"why relevant"}]}`;
    const text = await invokeBedrockConverse({ messages: [{ role: 'user', content: [{ text: prompt }] }], systemPrompt: INTERVIEW_SYSTEM, maxTokens: 3000, temperature: 0.7 });
    const parsed = parseJsonFromResponse(text);
    res.json({ ok: true, problems: parsed.problems || [] });
  } catch (err) { console.error('Problem generation failed:', err); res.status(500).json({ ok: false, message: String(err) }); }
});

// â”€â”€â”€ 404 & Listen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ─── SkillBridge helpers (Task 17) ──────────────────────────────────────────
// Pure helpers used by the /api/skillbridge/* routes added in tasks 18–21.
// Mirrors the validators that live in src/services/skillbridgeService.js so
// the server can independently enforce request and response shapes per
// Requirement 15. Endpoint wiring is intentionally deferred to later tasks.

const SKILLBRIDGE_REQUIREMENTS_SYSTEM_PROMPT = 'You are a STEM-career skills analyst. Always respond with valid JSON.';
const SKILLBRIDGE_SEED_ASSESSMENT_SYSTEM_PROMPT = 'You are a self-assessment seeding engine. Always respond with valid JSON.';
const SKILLBRIDGE_ROADMAP_SYSTEM_PROMPT = 'You are a personalized career-roadmap planner. Always respond with valid JSON.';
const SKILLBRIDGE_PROJECTS_SYSTEM_PROMPT = 'You are a project recommendation engine. Always respond with valid JSON.';

const SKILLBRIDGE_DIFFICULTIES = ['easy', 'medium', 'hard'];

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringWithLen(value, minLen, maxLen) {
  return typeof value === 'string' && value.length >= minLen && value.length <= maxLen;
}

function isNonEmptyString(value, maxLen = Number.MAX_SAFE_INTEGER) {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLen;
}

function isIntegerInRange(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isFiniteNumberInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function isIso8601String(value) {
  if (typeof value !== 'string' || !ISO_8601_REGEX.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

// ─── Request validators (Req 15.1, 15.2, 15.3, 15.4) ────────────────────────

function validateRequirementsRequest(body) {
  if (!isPlainObject(body)) return false;
  return isStringWithLen(body.careerId, 1, 128);
}

function validateSeedAssessmentRequest(body) {
  if (!isPlainObject(body)) return false;
  if (!isStringWithLen(body.resumeText, 0, 50000)) return false;
  if (body.profile !== undefined && !isPlainObject(body.profile)) return false;
  if (body.requirements !== undefined && !Array.isArray(body.requirements)) return false;
  return true;
}

function validateRoadmapRequest(body) {
  if (!isPlainObject(body)) return false;
  if (!isStringWithLen(body.dreamJobId, 1, 128)) return false;
  if (!Array.isArray(body.requirements)) return false;
  if (!isPlainObject(body.assessment)) return false;
  if (!isPlainObject(body.assessment.skills)) return false;
  if (body.profile !== undefined && !isPlainObject(body.profile)) return false;
  return true;
}

function validateProjectsRequest(body) {
  if (!isPlainObject(body)) return false;
  if (!isStringWithLen(body.careerId, 1, 128)) return false;
  if (!Array.isArray(body.focusSkills) || body.focusSkills.length > 50) return false;
  if (!isIntegerInRange(body.count, 1, 10)) return false;
  if (!Array.isArray(body.excludeIds) || body.excludeIds.length > 200) return false;
  return true;
}

// ─── Response validators (Properties 20, 21, 22 + seed assessment) ──────────

function validateRequirementsResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;
  if (!Array.isArray(payload.requirements)) return false;
  if (payload.requirements.length < 5 || payload.requirements.length > 15) return false;

  for (const requirement of payload.requirements) {
    if (!isPlainObject(requirement)) return false;
    if (!isStringWithLen(requirement.skillId, 1, 64)) return false;
    if (!isStringWithLen(requirement.name, 1, 120)) return false;
    if (typeof requirement.rationale !== 'string' || requirement.rationale.length > 500) return false;
    if (!isIntegerInRange(requirement.targetLevel, 0, 100)) return false;
    if (!isFiniteNumberInRange(requirement.weight, 0, 1)) return false;
  }

  return true;
}

function validateRoadmapResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;

  const roadmap = payload.roadmap;
  if (!isPlainObject(roadmap)) return false;
  if (!isNonEmptyString(roadmap.id, 256)) return false;
  if (!isNonEmptyString(roadmap.dreamJobId, 128)) return false;
  if (!isIso8601String(roadmap.generatedAt)) return false;
  if (!Array.isArray(roadmap.phases)) return false;
  if (roadmap.phases.length < 3 || roadmap.phases.length > 6) return false;

  for (const phase of roadmap.phases) {
    if (!isPlainObject(phase)) return false;
    if (!isIntegerInRange(phase.weekStart, 1, Number.MAX_SAFE_INTEGER)) return false;
    if (!isIntegerInRange(phase.weekEnd, 1, Number.MAX_SAFE_INTEGER)) return false;
    if (phase.weekStart > phase.weekEnd) return false;
    if (!Array.isArray(phase.projectIds)) return false;
    if (phase.projectIds.length < 1 || phase.projectIds.length > 3) return false;
  }

  return true;
}

function isValidProjectShape(project) {
  if (!isPlainObject(project)) return false;
  if (!isNonEmptyString(project.id)) return false;
  if (!Array.isArray(project.careerIds)) return false;
  if (!Array.isArray(project.skills)) return false;
  if (!SKILLBRIDGE_DIFFICULTIES.includes(project.difficulty)) return false;
  if (!isNonEmptyString(project.title)) return false;
  if (typeof project.summary !== 'string') return false;
  if (!Array.isArray(project.deliverables)) return false;
  if (project.deliverables.length < 1 || project.deliverables.length > 10) return false;
  if (!isIntegerInRange(project.estHours, 1, 200)) return false;
  return true;
}

function validateProjectsResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;
  if (!Array.isArray(payload.projects)) return false;
  if (payload.projects.length < 1 || payload.projects.length > 5) return false;

  for (const project of payload.projects) {
    if (!isValidProjectShape(project)) return false;
    if (project.aiGenerated !== true) return false;
  }

  return true;
}

function validateSeedAssessmentResponse(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.ok !== true) return false;
  if (!isPlainObject(payload.levels)) return false;

  for (const value of Object.values(payload.levels)) {
    if (!isIntegerInRange(value, 0, 100)) return false;
  }

  return true;
}

// ─── Prompt builders (mirroring design.md outlines) ─────────────────────────

function buildRequirementsPrompt(careerId) {
  return `Career: ${careerId}.
List 5 to 15 skill requirements for an entry-level role in this career.

Respond with this exact JSON shape and no markdown fences:
{
  "requirements": [
    { "skillId": "kebab-case-id", "name": "Display Name", "targetLevel": 80, "weight": 0.15, "rationale": "Why this skill matters" }
  ]
}

Rules:
- skillId: kebab-case, non-empty, at most 64 characters; never duplicated.
- name: non-empty, at most 120 characters.
- targetLevel: integer in [0, 100].
- weight: number in [0, 1] inclusive; the array sums to approximately 1.0.
- rationale: string of at most 500 characters.
- Provide between 5 and 15 entries inclusive.`;
}

function buildSeedAssessmentPrompt({ resumeText, profile, requirements }) {
  const profileJson = JSON.stringify(profile || {}, null, 2);
  const requirementsJson = JSON.stringify(requirements || [], null, 2);
  const resume = typeof resumeText === 'string' && resumeText.length > 0 ? resumeText : '(none provided)';

  return `Given the resume, profile, and required skills below, estimate the student's current proficiency for each required skill on a 0–100 scale.

Profile:
${profileJson}

Required skills:
${requirementsJson}

Resume text:
${resume}

Respond with this exact JSON shape and no markdown fences:
{
  "levels": { "skill-id": 50 }
}

Rules:
- Provide one entry per required skillId.
- Each level must be an integer in [0, 100].
- Default unknown skills to 50.`;
}

function buildRoadmapPrompt({ dreamJobId, requirements, assessment, profile }) {
  const requirementsJson = JSON.stringify(requirements || [], null, 2);
  const assessmentJson = JSON.stringify(assessment || {}, null, 2);
  const profileJson = JSON.stringify(profile || {}, null, 2);

  return `Build a 3–6 phase weekly roadmap for "${dreamJobId}" that closes the highest-gap skills first.

Profile:
${profileJson}

Skill requirements:
${requirementsJson}

Current skill assessment:
${assessmentJson}

Respond with this exact JSON shape and no markdown fences:
{
  "roadmap": {
    "id": "non-empty-id",
    "dreamJobId": "${dreamJobId}",
    "generatedAt": "<ISO-8601 timestamp>",
    "phases": [
      {
        "id": "phase-1",
        "label": "Foundations",
        "weekStart": 1,
        "weekEnd": 2,
        "focusSkills": ["skill-id"],
        "topics": ["topic"],
        "resources": [ { "title": "Resource", "provider": "Provider", "topic": "topic" } ],
        "projectIds": ["project-id"]
      }
    ]
  }
}

Rules:
- phases: 3 to 6 inclusive, ordered chronologically.
- Each phase: weekStart and weekEnd are positive integers with weekStart ≤ weekEnd.
- Each phase: 1 to 3 projectIds inclusive.
- topics: at most 8 entries per phase.
- focusSkills must be a subset of the requirement skillIds above.
- resources: { title, provider, topic } only — do NOT include any URL field.
- The dreamJobId field must echo "${dreamJobId}" exactly.`;
}

function buildProjectsPrompt({ careerId, focusSkills, count, excludeIds }) {
  const focusJson = JSON.stringify(focusSkills || [], null, 2);
  const excludeJson = JSON.stringify(excludeIds || [], null, 2);

  return `Generate ${count} buildable portfolio projects for a "${careerId}" student.

Focus skills:
${focusJson}

Exclude these project ids:
${excludeJson}

Respond with this exact JSON shape and no markdown fences:
{
  "projects": [
    {
      "id": "unique-project-id",
      "careerIds": ["${careerId}"],
      "skills": ["skill-id"],
      "difficulty": "easy",
      "title": "Project title",
      "summary": "1–3 sentence summary.",
      "deliverables": ["deliverable"],
      "estHours": 20,
      "aiGenerated": true
    }
  ]
}

Rules:
- Provide between 1 and 5 projects (cap at 5 even if count is higher).
- difficulty: one of "easy", "medium", "hard".
- deliverables: 1 to 10 entries inclusive.
- estHours: integer in [1, 200].
- aiGenerated must be true on every entry.
- Project ids must not appear in the exclude list and must be unique within the response.`;
}

// ─── Backend error mapper (Req 15.5) ────────────────────────────────────────
// Returns { ok: false, message } with message length in [1, 500].

function mapToBackendError(err) {
  let raw;
  if (err == null) {
    raw = 'Unknown backend error';
  } else if (typeof err === 'string') {
    raw = err;
  } else if (err instanceof Error && typeof err.message === 'string') {
    raw = err.message;
  } else if (typeof err === 'object' && typeof err.message === 'string') {
    raw = err.message;
  } else {
    try {
      raw = JSON.stringify(err);
    } catch (_serializeErr) {
      raw = String(err);
    }
  }

  let message = String(raw).trim();
  if (message.length === 0) message = 'Unknown backend error';
  if (message.length > 500) message = message.slice(0, 500);
  return { ok: false, message };
}

// ─── SkillBridge routes ─────────────────────────────────────────────────────

// Task 18 — POST /api/skillbridge/requirements
// Flow: request validator → 400; Bedrock call → 502 via mapToBackendError;
// JSON parse + response validator → 500 'AI returned non-JSON'; success → 200
// `{ ok: true, careerId, requirements }`. Per Reqs 2.2, 2.6, 15.1, 15.5–15.7.
app.post('/api/skillbridge/requirements', async (req, res) => {
  if (!validateRequirementsRequest(req.body)) {
    return res.status(400).json({ ok: false, message: 'Invalid request body' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message:
        'SkillBridge backend not configured. Ensure AWS_BEDROCK_MODEL_ID and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set on the server for SigV4.',
    });
  }

  const { careerId } = req.body;

  let responseText;
  try {
    responseText = await invokeBedrockConverse({
      messages: [
        {
          role: 'user',
          content: [{ text: buildRequirementsPrompt(careerId) }],
        },
      ],
      systemPrompt: SKILLBRIDGE_REQUIREMENTS_SYSTEM_PROMPT,
      maxTokens: 1500,
      temperature: 0.4,
      topP: 0.9,
    });
  } catch (err) {
    console.error('SkillBridge requirements Bedrock call failed:', err);
    return res.status(502).json(mapToBackendError(err));
  }

  let parsed;
  try {
    parsed = parseJsonFromResponse(responseText);
  } catch (err) {
    console.error('SkillBridge requirements JSON parse failed:', err);
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  const candidate = { ok: true, requirements: parsed && parsed.requirements };
  if (!validateRequirementsResponse(candidate)) {
    console.error('SkillBridge requirements payload failed shape validation');
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  return res.status(200).json({ ok: true, careerId, requirements: candidate.requirements });
});

// Task 19 — POST /api/skillbridge/seed-assessment
// Flow: request validator → 400; Bedrock call → 502 via mapToBackendError;
// JSON parse + post-validate → 500 'AI returned non-JSON'; success → 200
// `{ ok: true, levels }`. Per Reqs 15.2, 15.5–15.7.
//
// Coercion: every level is coerced to an integer in [0, 100] before the
// strict validator runs — non-numeric / NaN / missing → 50, finite numbers
// → Math.round then clamp.
app.post('/api/skillbridge/seed-assessment', async (req, res) => {
  if (!validateSeedAssessmentRequest(req.body)) {
    return res.status(400).json({ ok: false, message: 'Invalid request body' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message:
        'SkillBridge backend not configured. Ensure AWS_BEDROCK_MODEL_ID and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set on the server for SigV4.',
    });
  }

  const { resumeText, profile, requirements } = req.body;

  let responseText;
  try {
    responseText = await invokeBedrockConverse({
      messages: [
        {
          role: 'user',
          content: [{ text: buildSeedAssessmentPrompt({ resumeText, profile, requirements }) }],
        },
      ],
      systemPrompt: SKILLBRIDGE_SEED_ASSESSMENT_SYSTEM_PROMPT,
      maxTokens: 1200,
      temperature: 0.3,
      topP: 0.9,
    });
  } catch (err) {
    console.error('SkillBridge seed-assessment Bedrock call failed:', err);
    return res.status(502).json(mapToBackendError(err));
  }

  let parsed;
  try {
    parsed = parseJsonFromResponse(responseText);
  } catch (err) {
    console.error('SkillBridge seed-assessment JSON parse failed:', err);
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  // Coerce/clamp every level to an integer in [0, 100] before validating.
  // Per task notes: missing / non-numeric / NaN → 50; finite numbers →
  // Math.round then clamp into the [0, 100] range.
  const rawLevels = parsed && parsed.levels;
  const coercedLevels = {};
  if (isPlainObject(rawLevels)) {
    for (const [skillId, value] of Object.entries(rawLevels)) {
      let level;
      if (typeof value === 'number' && Number.isFinite(value)) {
        level = Math.round(value);
      } else {
        level = 50;
      }
      if (level < 0) level = 0;
      if (level > 100) level = 100;
      coercedLevels[skillId] = level;
    }
  }

  const candidate = { ok: true, levels: coercedLevels };
  if (!validateSeedAssessmentResponse(candidate)) {
    console.error('SkillBridge seed-assessment payload failed shape validation');
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  return res.status(200).json({ ok: true, levels: coercedLevels });
});

// Task 20 — POST /api/skillbridge/roadmap
// Flow: request validator → 400; Bedrock call → 502 via mapToBackendError;
// JSON parse + response validator → 500 'AI returned non-JSON'; success → 200
// `{ ok: true, roadmap }`. Per Reqs 8.2–8.5, 15.3, 15.5–15.7.
//
// Response shape is enforced by validateRoadmapResponse (3–6 phases, 1–3
// projectIds per phase, weekStart/weekEnd are positive integers with
// weekStart ≤ weekEnd). The dreamJobId echo from Req 8.2 is checked
// separately against the request body.
app.post('/api/skillbridge/roadmap', async (req, res) => {
  if (!validateRoadmapRequest(req.body)) {
    return res.status(400).json({ ok: false, message: 'Invalid request body' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message:
        'SkillBridge backend not configured. Ensure AWS_BEDROCK_MODEL_ID and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set on the server for SigV4.',
    });
  }

  const { dreamJobId, requirements, assessment, profile } = req.body;

  let responseText;
  try {
    responseText = await invokeBedrockConverse({
      messages: [
        {
          role: 'user',
          content: [{ text: buildRoadmapPrompt({ dreamJobId, requirements, assessment, profile }) }],
        },
      ],
      systemPrompt: SKILLBRIDGE_ROADMAP_SYSTEM_PROMPT,
      maxTokens: 3000,
      temperature: 0.5,
      topP: 0.9,
    });
  } catch (err) {
    console.error('SkillBridge roadmap Bedrock call failed:', err);
    return res.status(502).json(mapToBackendError(err));
  }

  let parsed;
  try {
    parsed = parseJsonFromResponse(responseText);
  } catch (err) {
    console.error('SkillBridge roadmap JSON parse failed:', err);
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  const candidate = { ok: true, roadmap: parsed && parsed.roadmap };
  if (!validateRoadmapResponse(candidate)) {
    console.error('SkillBridge roadmap payload failed shape validation');
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  // Req 8.2: dreamJobId on the returned roadmap must echo the requested value.
  if (candidate.roadmap.dreamJobId !== dreamJobId) {
    console.error('SkillBridge roadmap dreamJobId echo mismatch');
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  return res.status(200).json({ ok: true, roadmap: candidate.roadmap });
});

// Task 21 — POST /api/skillbridge/projects
// Flow: request validator → 400; Bedrock call → 502 via mapToBackendError;
// JSON parse + response validator → 500 'AI returned non-JSON'; success → 200
// `{ ok: true, projects }`. Per Reqs 10.4, 15.4, 15.5–15.7.
//
// Response shape is enforced by validateProjectsResponse: projects.length ∈
// [1, 5], every entry conforms to the catalog shape and has aiGenerated:
// true.
app.post('/api/skillbridge/projects', async (req, res) => {
  if (!validateProjectsRequest(req.body)) {
    return res.status(400).json({ ok: false, message: 'Invalid request body' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message:
        'SkillBridge backend not configured. Ensure AWS_BEDROCK_MODEL_ID and AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY are set on the server for SigV4.',
    });
  }

  const { careerId, focusSkills, count, excludeIds } = req.body;

  let responseText;
  try {
    responseText = await invokeBedrockConverse({
      messages: [
        {
          role: 'user',
          content: [{ text: buildProjectsPrompt({ careerId, focusSkills, count, excludeIds }) }],
        },
      ],
      systemPrompt: SKILLBRIDGE_PROJECTS_SYSTEM_PROMPT,
      maxTokens: 2500,
      temperature: 0.6,
      topP: 0.9,
    });
  } catch (err) {
    console.error('SkillBridge projects Bedrock call failed:', err);
    return res.status(502).json(mapToBackendError(err));
  }

  let parsed;
  try {
    parsed = parseJsonFromResponse(responseText);
  } catch (err) {
    console.error('SkillBridge projects JSON parse failed:', err);
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  const candidate = { ok: true, projects: parsed && parsed.projects };
  if (!validateProjectsResponse(candidate)) {
    console.error('SkillBridge projects payload failed shape validation');
    return res.status(500).json({ ok: false, message: 'AI returned non-JSON' });
  }

  return res.status(200).json({ ok: true, projects: candidate.projects });
});

// ─── Text-to-Speech (Edge TTS — free neural voices) ─────────────────────────
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

app.post('/api/tts', async (req, res) => {
  const { text, voice } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ ok: false, message: 'Missing text' });
  }

  try {
    const tts = new MsEdgeTTS();
    // Use a natural-sounding neural voice; default to a US English male voice
    const selectedVoice = voice || 'en-US-GuyNeural';
    await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = tts.toStream(text);

    if (!audioStream || typeof audioStream.pipe !== 'function') {
      throw new Error('TTS provider did not return a readable audio stream');
    }

    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
    });

    audioStream.pipe(res);

    audioStream.on('error', (err) => {
      console.error('TTS stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: 'TTS generation failed' });
      } else {
        res.end();
      }
    });
  } catch (err) {
    console.error('TTS failed:', err);
    res.status(500).json({ ok: false, message: 'TTS generation failed', error: String(err) });
  }
});

// ─── LinkedIn Profile Analysis Endpoint ──────────────────────────────────────

const LINKEDIN_ANALYSIS_SYSTEM_PROMPT = `You are a career profile extraction engine for a STEM career exploration platform aimed at students. Your job is to extract structured career profile information from LinkedIn profile text.

Analyze the pasted LinkedIn profile text and determine if it contains ENOUGH information to build a complete career profile. A complete profile needs:
1. The person's name
2. At least 2 clear interests/fields of interest
3. At least 2 identifiable skills
4. Some indication of work style preference (office/lab/field/mixed)
5. Some indication of career motivation

If the profile IS COMPLETE (has enough info for all 5 areas), respond with:
{
  "status": "complete",
  "profile": {
    "name": "<extracted name>",
    "interests": ["<interest1>", "<interest2>", ...],
    "skills": ["<skill1>", "<skill2>", ...],
    "preferences": {
      "workstyle": "<one of: Office / Remote (Computer-based work), Laboratory (Research & experiments), Field Work (Outdoors & travel), Mixed (Variety of settings)>",
      "motivation": "<one of: Making a positive impact on society, Solving complex technical challenges, Financial stability and growth, Innovation and creating new things>"
    }
  }
}

If the profile is INCOMPLETE (missing key areas), respond with:
{
  "status": "incomplete",
  "extractedData": {
    "name": "<name if found, or empty string>",
    "interests": ["<any interests found>"],
    "skills": ["<any skills found>"],
    "workstyle": "<if determinable, or empty string>",
    "motivation": "<if determinable, or empty string>"
  },
  "followUpQuestions": [
    {
      "id": "<unique_id>",
      "question": "<question text>",
      "type": "multi-select | single-select | text",
      "options": ["<option1>", "<option2>", ...]
    }
  ]
}

Rules for follow-up questions:
- Only ask about information that is MISSING or UNCLEAR from the profile
- Use the same question style as an onboarding quiz (friendly, encouraging)
- For interests/skills use "multi-select" with relevant options
- For workstyle/motivation use "single-select" with the exact options listed above
- For name use "text" type
- Maximum 3 follow-up questions
- Options for interests should come from: Coding & Programming, Mathematics, Biology & Life Sciences, Physics & Space, Chemistry, Environmental Science, Robotics & Hardware, Data & Analytics, Design & UX, Healthcare & Medicine, AI & Machine Learning, Sustainability
- Options for skills should come from: Problem Solving, Creative Thinking, Teamwork, Writing & Communication, Math & Numbers, Research, Leadership, Attention to Detail, Critical Thinking, Hands-on Building, Public Speaking, Organization

Always respond with valid JSON only. No markdown fences or extra text.`;

app.post('/api/linkedin/analyze', async (req, res) => {
  const { profileText, profileUrl } = req.body || {};

  if (!profileText || typeof profileText !== 'string' || profileText.trim().length < 30) {
    return res.status(400).json({ ok: false, message: 'Please paste more of your LinkedIn profile text (at least a few sentences).' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message: 'LinkedIn analysis backend not configured. Ensure AWS Bedrock credentials are set.',
    });
  }

  try {
    const contextNote = profileUrl ? `LinkedIn Profile URL: ${profileUrl}\n\n` : '';
    const responseText = await invokeBedrockConverse({
      messages: [
        {
          role: 'user',
          content: [{ text: `${contextNote}Analyze this LinkedIn profile and extract career profile information:\n\n${profileText.trim()}` }],
        },
      ],
      systemPrompt: LINKEDIN_ANALYSIS_SYSTEM_PROMPT,
      maxTokens: 1200,
      temperature: 0.3,
      topP: 0.9,
    });

    const analysis = parseJsonFromResponse(responseText);
    return res.json({ ok: true, analysis });
  } catch (err) {
    console.error('LinkedIn analysis failed:', err);
    return res.status(500).json({ ok: false, message: 'LinkedIn analysis failed', error: String(err) });
  }
});

// ─── Role Model Matching Endpoint ────────────────────────────────────────────

// Map career titles to Wikidata occupation entity IDs
const CAREER_TO_WIKIDATA_OCCUPATIONS = {
  'software engineer': ['Q82594'],        // computer scientist
  'data scientist': ['Q82594', 'Q170790'], // computer scientist, statistician
  'biomedical engineer': ['Q2919046'],    // biomedical engineer
  'aerospace engineer': ['Q15895020'],    // aerospace engineer
  'environmental scientist': ['Q16742096', 'Q520549'], // environmental scientist, ecologist
  'cybersecurity analyst': ['Q82594'],    // computer scientist
  'cloud architect': ['Q82594'],          // computer scientist
  'robotics engineer': ['Q15895020', 'Q81096'], // aerospace engineer, engineer
  'renewable energy engineer': ['Q81096', 'Q16742096'], // engineer, environmental scientist
};

// Fallback occupation IDs for general STEM
const FALLBACK_OCCUPATIONS = ['Q82594', 'Q81096', 'Q170790']; // computer scientist, engineer, statistician

async function queryWikidataForPeople(occupationIds, limit = 15) {
  const occupationValues = occupationIds.map(id => `wd:${id}`).join(' ');

  const sparql = `
SELECT DISTINCT ?person ?personLabel ?personDescription ?occupationLabel ?employerLabel ?article WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person wdt:P106 ?occupation .
  VALUES ?occupation { ${occupationValues} }
  ?person wdt:P21 ?gender .
  OPTIONAL { ?person wdt:P108 ?employer . }
  ?article schema:about ?person .
  ?article schema:isPartOf <https://en.wikipedia.org/> .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT ${limit}
  `.trim();

  const url = 'https://query.wikidata.org/sparql';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/sparql-results+json',
      'User-Agent': 'STEMPathfindR/1.0 (educational project)',
    },
    body: `query=${encodeURIComponent(sparql)}`,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Wikidata SPARQL query failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const results = data.results?.bindings || [];

  // Deduplicate by person URI and build structured list
  const seen = new Set();
  const people = [];
  for (const row of results) {
    const uri = row.person?.value || '';
    if (seen.has(uri)) continue;
    seen.add(uri);

    const name = row.personLabel?.value || '';
    // Skip items that look like QIDs (unresolved labels)
    if (!name || /^Q\d+$/.test(name)) continue;

    const wikiUrl = row.article?.value || '';

    people.push({
      name,
      description: row.personDescription?.value || '',
      occupation: row.occupationLabel?.value || '',
      organization: row.employerLabel?.value || '',
      wikiUrl,
    });
  }

  return people;
}

const ROLE_MODEL_MATCH_SYSTEM_PROMPT = `You are a role model matching assistant. You will be given a list of REAL people from Wikidata and a student's profile. Your job is to pick the 3 best matches and write personalized content for each.

You MUST only use people from the provided list. Do NOT add anyone else. Do NOT change their names.

Always respond with valid JSON only. No markdown fences or extra text.`;

app.post('/api/role-models/match', async (req, res) => {
  const { profile, activeCareerGoal, recommendedCareers } = req.body || {};

  if (!profile || typeof profile !== 'object') {
    return res.status(400).json({ ok: false, message: 'Missing profile in request body' });
  }

  if (!hasBedrockConfig()) {
    return res.status(501).json({
      ok: false,
      message: 'Role model matching backend not configured. Ensure AWS Bedrock credentials are set.',
    });
  }

  try {
    // Determine which occupations to query from Wikidata
    const careerTitle = activeCareerGoal?.title
      || (recommendedCareers && recommendedCareers.length > 0 ? recommendedCareers[0].title : '');
    const careerKey = careerTitle.toLowerCase();
    const occupationIds = CAREER_TO_WIKIDATA_OCCUPATIONS[careerKey] || FALLBACK_OCCUPATIONS;

    // Step 1: Get verified real people from Wikidata
    let wikidataPeople = [];
    try {
      wikidataPeople = await queryWikidataForPeople(occupationIds, 15);
    } catch (wikiErr) {
      console.error('Wikidata query failed, falling back:', wikiErr);
      // If Wikidata is down, try fallback occupations
      try {
        wikidataPeople = await queryWikidataForPeople(FALLBACK_OCCUPATIONS, 15);
      } catch (fallbackErr) {
        console.error('Wikidata fallback also failed:', fallbackErr);
      }
    }

    if (wikidataPeople.length === 0) {
      return res.status(502).json({ ok: false, message: 'Could not fetch role model data. Please try again later.' });
    }

    // Step 2: Use Bedrock to pick the 3 best matches and write personalized content
    const interests = Array.isArray(profile.interests) ? profile.interests.join(', ') : 'Not specified';
    const skills = Array.isArray(profile.skills) ? profile.skills.join(', ') : 'Not specified';
    const motivation = profile.preferences?.motivation || 'Not specified';

    const peopleList = wikidataPeople.map((p, i) =>
      `${i + 1}. ${p.name} — ${p.description || 'No description'}${p.organization ? ` (${p.organization})` : ''}`
    ).join('\n');

    const prompt = `Here are REAL verified people from Wikidata who work in ${careerTitle || 'STEM'}:

${peopleList}

Student profile:
- Career goal: ${careerTitle || 'General STEM'}
- Interests: ${interests}
- Skills: ${skills}
- Motivation: ${motivation}

Pick the 3 people from the list above who would be the BEST role models for this student. Then for each, write:
- A 2-3 sentence bio about their career journey
- Why they're a great match for this student (1-2 sentences)
- 3 key achievements

Return JSON:
{
  "roleModels": [
    {
      "id": "kebab-case-id",
      "name": "EXACT name from the list above — do not modify",
      "title": "Their job title or role",
      "organization": "Where they work/worked",
      "field": "${careerTitle || 'STEM'}",
      "bio": "2-3 sentence bio",
      "matchReason": "Why they match this student",
      "achievements": ["achievement 1", "achievement 2", "achievement 3"]
    }
  ]
}

RULES:
- You MUST use the EXACT names from the list. Do not rename anyone or add people not on the list.
- Pick people who are diverse (different backgrounds, perspectives).
- The matchReason should reference the student's specific interests/skills/motivation.`;

    const responseText = await invokeBedrockConverse({
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      systemPrompt: ROLE_MODEL_MATCH_SYSTEM_PROMPT,
      maxTokens: 2000,
      temperature: 0.3,
      topP: 0.9,
    });

    const parsed = parseJsonFromResponse(responseText);
    const roleModels = Array.isArray(parsed.roleModels) ? parsed.roleModels : [];

    // Enrich with verified Wikipedia URLs from Wikidata results
    const wikiUrlMap = {};
    for (const p of wikidataPeople) {
      wikiUrlMap[p.name.toLowerCase()] = p.wikiUrl;
    }

    const enriched = roleModels.map(model => {
      const wikiUrl = wikiUrlMap[model.name.toLowerCase()] || '';
      return {
        ...model,
        sourceUrl: wikiUrl || `https://www.google.com/search?q=${encodeURIComponent(model.name + ' ' + (model.field || 'STEM'))}`,
      };
    });

    return res.json({ ok: true, roleModels: enriched });
  } catch (err) {
    console.error('Role model matching failed:', err);
    return res.status(500).json({ ok: false, message: 'Role model matching failed', error: String(err) });
  }
});

app.use((_req, res) => {
  res.status(404).json({ ok: false, message: 'Not found' });
});

// Only start the HTTP server when run directly (e.g. `node index.js`). When
// this module is `require()`d (e.g. from skillbridge.test.js to access the
// SkillBridge helpers), we skip listen so tests don't spin up a real server.
if (require.main === module) {
  app.listen(port, () => {
    console.log(`Pathfindr backend listening on http://localhost:${port}`);
  });
}

// Expose pure SkillBridge helpers for unit / property testing. The express
// `app` is also exported so HTTP-level contract tests can drive the routes
// via `app.listen(0)` + global `fetch`. The `__setTestBedrockInvoker` /
// `__resetTestBedrockInvoker` pair lets tests replace the SigV4 + network
// call inside `invokeBedrockConverse` with an arbitrary stub — production
// behavior is unchanged because the override defaults to `null`.
module.exports = {
  app,
  validateRequirementsRequest,
  validateSeedAssessmentRequest,
  validateRoadmapRequest,
  validateProjectsRequest,
  validateRequirementsResponse,
  validateRoadmapResponse,
  validateProjectsResponse,
  validateSeedAssessmentResponse,
  buildRequirementsPrompt,
  buildSeedAssessmentPrompt,
  buildRoadmapPrompt,
  buildProjectsPrompt,
  mapToBackendError,
  __setTestBedrockInvoker(fn) {
    _testBedrockInvoker = typeof fn === 'function' ? fn : null;
  },
  __resetTestBedrockInvoker() {
    _testBedrockInvoker = null;
  },
};
