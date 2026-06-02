// Bedrock endpoint contract tests for the four /api/skillbridge/* routes.
//
// Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7
//
// Strategy: the express `app` is exported by `./index.js`. We bind it to a
// random port via `app.listen(0)` and drive it with the global `fetch`. The
// real SigV4 + network call inside `invokeBedrockConverse` is replaced by a
// test override (`__setTestBedrockInvoker`) so the routes never reach AWS.
//
// For each endpoint we exercise the documented status-code mapping:
//   - 200 success: the override returns valid JSON the server validator accepts.
//   - 400 invalid body: an empty body fails the request validator.
//   - 502 Bedrock error: the override rejects, mapped via mapToBackendError.
//   - 500 invalid AI JSON: the override returns garbage that fails JSON.parse
//     (or otherwise fails the structural validator).

const test = require('node:test');
const assert = require('node:assert/strict');

const { app, __setTestBedrockInvoker, __resetTestBedrockInvoker } = require('./index');

// ─── Test harness ──────────────────────────────────────────────────────────

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  __resetTestBedrockInvoker();
  await new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

// Reset the Bedrock override after each test so leaked state cannot leak
// between cases.
test.afterEach(() => {
  __resetTestBedrockInvoker();
});

async function postJson(pathname, body) {
  const init = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${pathname}`, init);
  let json = null;
  try {
    json = await res.json();
  } catch (_e) {
    json = null;
  }
  return { status: res.status, body: json };
}

// ─── Reusable shaped payloads ──────────────────────────────────────────────

const VALID_REQUIREMENTS_PAYLOAD = {
  requirements: [
    { skillId: 'communication', name: 'Communication', rationale: 'core', targetLevel: 80, weight: 0.2 },
    { skillId: 'problem-solving', name: 'Problem Solving', rationale: 'core', targetLevel: 75, weight: 0.2 },
    { skillId: 'teamwork', name: 'Teamwork', rationale: 'core', targetLevel: 70, weight: 0.2 },
    { skillId: 'critical-thinking', name: 'Critical Thinking', rationale: 'core', targetLevel: 70, weight: 0.2 },
    { skillId: 'adaptability', name: 'Adaptability', rationale: 'core', targetLevel: 65, weight: 0.2 },
  ],
};

const VALID_SEED_ASSESSMENT_PAYLOAD = {
  levels: {
    'communication': 60,
    'problem-solving': 70,
  },
};

function validRoadmapPayload(dreamJobId) {
  return {
    roadmap: {
      id: 'roadmap-1',
      dreamJobId,
      generatedAt: '2025-01-01T00:00:00.000Z',
      phases: [
        { id: 'p1', label: 'Foundations', weekStart: 1, weekEnd: 2, focusSkills: [], topics: [], resources: [], projectIds: ['proj-a'] },
        { id: 'p2', label: 'Build', weekStart: 3, weekEnd: 4, focusSkills: [], topics: [], resources: [], projectIds: ['proj-b'] },
        { id: 'p3', label: 'Polish', weekStart: 5, weekEnd: 6, focusSkills: [], topics: [], resources: [], projectIds: ['proj-c'] },
      ],
    },
  };
}

const VALID_PROJECTS_PAYLOAD = {
  projects: [
    {
      id: 'proj-1',
      careerIds: ['software-engineer'],
      skills: ['javascript'],
      difficulty: 'easy',
      title: 'CLI Todo',
      summary: 'Build a small CLI todo app.',
      deliverables: ['Working CLI', 'README'],
      estHours: 8,
      aiGenerated: true,
    },
  ],
};

// ─── POST /api/skillbridge/requirements ────────────────────────────────────

test('POST /api/skillbridge/requirements — 200 on valid body and valid AI JSON', async () => {
  __setTestBedrockInvoker(async () => JSON.stringify(VALID_REQUIREMENTS_PAYLOAD));

  const { status, body } = await postJson('/api/skillbridge/requirements', { careerId: 'software-engineer' });

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.careerId, 'software-engineer');
  assert.deepEqual(body.requirements, VALID_REQUIREMENTS_PAYLOAD.requirements);
});

test('POST /api/skillbridge/requirements — 400 on empty body', async () => {
  // No invoker set: a 400 must short-circuit before any Bedrock call.
  const { status, body } = await postJson('/api/skillbridge/requirements', {});

  assert.equal(status, 400);
  assert.deepEqual(body, { ok: false, message: 'Invalid request body' });
});

test('POST /api/skillbridge/requirements — 502 when Bedrock invoker rejects', async () => {
  __setTestBedrockInvoker(async () => {
    throw new Error('Bedrock 503 ServiceUnavailable');
  });

  const { status, body } = await postJson('/api/skillbridge/requirements', { careerId: 'software-engineer' });

  assert.equal(status, 502);
  assert.equal(body.ok, false);
  assert.equal(typeof body.message, 'string');
  assert.ok(body.message.length >= 1 && body.message.length <= 500);
});

test('POST /api/skillbridge/requirements — 500 when AI returns garbage JSON', async () => {
  __setTestBedrockInvoker(async () => 'not actually json at all');

  const { status, body } = await postJson('/api/skillbridge/requirements', { careerId: 'software-engineer' });

  assert.equal(status, 500);
  assert.deepEqual(body, { ok: false, message: 'AI returned non-JSON' });
});

// ─── POST /api/skillbridge/seed-assessment ─────────────────────────────────

test('POST /api/skillbridge/seed-assessment — 200 on valid body and valid AI JSON', async () => {
  __setTestBedrockInvoker(async () => JSON.stringify(VALID_SEED_ASSESSMENT_PAYLOAD));

  const { status, body } = await postJson('/api/skillbridge/seed-assessment', {
    resumeText: 'Engineer with 2 years of experience.',
    profile: { name: 'Test User' },
    requirements: VALID_REQUIREMENTS_PAYLOAD.requirements,
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  // Coerced/clamped levels still match for in-range integer values.
  assert.deepEqual(body.levels, VALID_SEED_ASSESSMENT_PAYLOAD.levels);
});

test('POST /api/skillbridge/seed-assessment — 400 on empty body', async () => {
  const { status, body } = await postJson('/api/skillbridge/seed-assessment', {});

  assert.equal(status, 400);
  assert.deepEqual(body, { ok: false, message: 'Invalid request body' });
});

test('POST /api/skillbridge/seed-assessment — 502 when Bedrock invoker rejects', async () => {
  __setTestBedrockInvoker(async () => {
    throw new Error('Bedrock connection reset');
  });

  const { status, body } = await postJson('/api/skillbridge/seed-assessment', { resumeText: '' });

  assert.equal(status, 502);
  assert.equal(body.ok, false);
  assert.equal(typeof body.message, 'string');
  assert.ok(body.message.length >= 1 && body.message.length <= 500);
});

test('POST /api/skillbridge/seed-assessment — 500 when AI returns garbage JSON', async () => {
  __setTestBedrockInvoker(async () => 'definitely not a json document');

  const { status, body } = await postJson('/api/skillbridge/seed-assessment', { resumeText: '' });

  assert.equal(status, 500);
  assert.deepEqual(body, { ok: false, message: 'AI returned non-JSON' });
});

// ─── POST /api/skillbridge/roadmap ─────────────────────────────────────────

test('POST /api/skillbridge/roadmap — 200 on valid body and valid AI JSON', async () => {
  const dreamJobId = 'data-scientist';
  __setTestBedrockInvoker(async () => JSON.stringify(validRoadmapPayload(dreamJobId)));

  const { status, body } = await postJson('/api/skillbridge/roadmap', {
    dreamJobId,
    requirements: VALID_REQUIREMENTS_PAYLOAD.requirements,
    assessment: { skills: { 'communication': 50 } },
    profile: {},
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.roadmap.dreamJobId, dreamJobId);
  assert.equal(body.roadmap.phases.length, 3);
});

test('POST /api/skillbridge/roadmap — 400 on empty body', async () => {
  const { status, body } = await postJson('/api/skillbridge/roadmap', {});

  assert.equal(status, 400);
  assert.deepEqual(body, { ok: false, message: 'Invalid request body' });
});

test('POST /api/skillbridge/roadmap — 502 when Bedrock invoker rejects', async () => {
  __setTestBedrockInvoker(async () => {
    throw new Error('Bedrock 502 BadGateway');
  });

  const { status, body } = await postJson('/api/skillbridge/roadmap', {
    dreamJobId: 'data-scientist',
    requirements: [],
    assessment: { skills: {} },
  });

  assert.equal(status, 502);
  assert.equal(body.ok, false);
  assert.equal(typeof body.message, 'string');
  assert.ok(body.message.length >= 1 && body.message.length <= 500);
});

test('POST /api/skillbridge/roadmap — 500 when AI returns garbage JSON', async () => {
  __setTestBedrockInvoker(async () => 'still no json here');

  const { status, body } = await postJson('/api/skillbridge/roadmap', {
    dreamJobId: 'data-scientist',
    requirements: [],
    assessment: { skills: {} },
  });

  assert.equal(status, 500);
  assert.deepEqual(body, { ok: false, message: 'AI returned non-JSON' });
});

// ─── POST /api/skillbridge/projects ────────────────────────────────────────

test('POST /api/skillbridge/projects — 200 on valid body and valid AI JSON', async () => {
  __setTestBedrockInvoker(async () => JSON.stringify(VALID_PROJECTS_PAYLOAD));

  const { status, body } = await postJson('/api/skillbridge/projects', {
    careerId: 'software-engineer',
    focusSkills: ['javascript'],
    count: 1,
    excludeIds: [],
  });

  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.projects, VALID_PROJECTS_PAYLOAD.projects);
});

test('POST /api/skillbridge/projects — 400 on empty body', async () => {
  const { status, body } = await postJson('/api/skillbridge/projects', {});

  assert.equal(status, 400);
  assert.deepEqual(body, { ok: false, message: 'Invalid request body' });
});

test('POST /api/skillbridge/projects — 502 when Bedrock invoker rejects', async () => {
  __setTestBedrockInvoker(async () => {
    throw new Error('Bedrock 500 InternalServerError');
  });

  const { status, body } = await postJson('/api/skillbridge/projects', {
    careerId: 'software-engineer',
    focusSkills: [],
    count: 1,
    excludeIds: [],
  });

  assert.equal(status, 502);
  assert.equal(body.ok, false);
  assert.equal(typeof body.message, 'string');
  assert.ok(body.message.length >= 1 && body.message.length <= 500);
});

test('POST /api/skillbridge/projects — 500 when AI returns garbage JSON', async () => {
  __setTestBedrockInvoker(async () => 'this body cannot be parsed');

  const { status, body } = await postJson('/api/skillbridge/projects', {
    careerId: 'software-engineer',
    focusSkills: [],
    count: 1,
    excludeIds: [],
  });

  assert.equal(status, 500);
  assert.deepEqual(body, { ok: false, message: 'AI returned non-JSON' });
});
