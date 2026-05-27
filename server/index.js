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

app.use((_req, res) => {
  res.status(404).json({ ok: false, message: 'Not found' });
});

app.listen(port, () => {
  console.log(`Pathfindr backend listening on http://localhost:${port}`);
});
