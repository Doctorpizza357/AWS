// SkillBridge backend property tests.
//
// Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5
// Properties: 23, 24
//
// Run with `npm test` from the server/ directory. Uses node:test (built into
// Node 18+) and fast-check. Targets the helpers exported from
// `server/index.js`: the four request validators and `mapToBackendError`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fc = require('fast-check');

const {
  validateRequirementsRequest,
  validateSeedAssessmentRequest,
  validateRoadmapRequest,
  validateProjectsRequest,
  mapToBackendError,
} = require('./index');

const NUM_RUNS = 100;

// ─── Shared arbitraries ────────────────────────────────────────────────────

// A plain object (i.e. passes the server's isPlainObject check).
const plainObjectArb = fc.dictionary(fc.string(), fc.anything());

// Defined-but-not-plain-object values (cover `null`, arrays, primitives).
const nonPlainObjectArb = fc.oneof(
  fc.constant(null),
  fc.array(fc.anything(), { maxLength: 5 }),
  fc.string(),
  fc.integer(),
  fc.boolean(),
);

// Bodies that are not plain objects (top-level shape failures).
const nonPlainBodyArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.anything(), { maxLength: 3 }),
);

// careerId: string of length [1, 128].
const validCareerIdArb = fc.string({ minLength: 1, maxLength: 128 });
const invalidCareerIdArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 129, maxLength: 130 }),
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 3 }),
  plainObjectArb,
);

// resumeText: string of length [0, 50000].
const validResumeTextArb = fc.string({ minLength: 0, maxLength: 200 });
const invalidResumeTextArb = fc.oneof(
  // Length 50001 (one past the upper bound). Generated rarely thanks to
  // fast-check's oneof bias toward earlier branches.
  fc.string({ minLength: 50001, maxLength: 50001 }),
  fc.integer(),
  fc.constant(null),
  fc.boolean(),
  fc.array(fc.string(), { maxLength: 3 }),
  plainObjectArb,
);

// focusSkills: array of length [0, 50].
const validFocusSkillsArb = fc.array(fc.string(), { maxLength: 50 });
const invalidFocusSkillsArb = fc.oneof(
  fc.array(fc.string(), { minLength: 51, maxLength: 60 }),
  fc.string(),
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
  plainObjectArb,
);

// count: integer in [1, 10].
const validCountArb = fc.integer({ min: 1, max: 10 });
const invalidCountArb = fc.oneof(
  fc.constant(0),
  fc.integer({ min: 11, max: 100 }),
  fc.integer({ min: -100, max: -1 }),
  fc
    .double({ min: 0.1, max: 9.9, noNaN: true, noDefaultInfinity: true })
    .filter((n) => !Number.isInteger(n)),
  fc.string(),
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(NaN),
  fc.boolean(),
);

// excludeIds: array of length [0, 200].
const validExcludeIdsArb = fc.array(fc.string(), { maxLength: 200 });
const invalidExcludeIdsArb = fc.oneof(
  fc.array(fc.string(), { minLength: 201, maxLength: 220 }),
  fc.string(),
  fc.integer(),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
  plainObjectArb,
);

// requirements (array — content not validated by the request validator).
const validRequirementsArrayArb = fc.array(plainObjectArb, { maxLength: 5 });
const invalidRequirementsArrayArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.constant(null),
  fc.boolean(),
  plainObjectArb,
);

// assessment: { skills: plain object, ... }.
const validAssessmentArb = fc.record({
  skills: plainObjectArb,
  updatedAt: fc.option(fc.string(), { nil: undefined }),
});
const invalidAssessmentArb = fc.oneof(
  fc.constant(null),
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.array(fc.anything(), { maxLength: 3 }),
  // Plain object but skills isn't a plain object.
  fc.record({ skills: nonPlainObjectArb }),
  // Plain object missing skills entirely.
  fc.record({ updatedAt: fc.string() }),
);

// profile: optional plain object. Invalid means defined-and-not-plain-object.
const invalidProfileArb = nonPlainObjectArb;

// ─── Property 23: request validators reject out-of-bounds inputs ───────────
//
// Validates: Requirements 15.1, 15.2, 15.3, 15.4
//
// For each of the four request validators we assert two directions with
// ≥ 100 fast-check runs each:
//   (a) any *valid* body of the documented shape passes the validator.
//   (b) any body that has *exactly one* field mutated outside its
//       documented bound fails the validator.
// We additionally cover the top-level "body must be a plain object" rule
// once per validator with a small fc.assert pass.

test('Property 23 — validateRequirementsRequest rejects out-of-bounds inputs', async (t) => {
  // (a) Valid bodies pass.
  await t.test('accepts valid bodies (careerId length 1..128)', () => {
    fc.assert(
      fc.property(validCareerIdArb, (careerId) => {
        assert.equal(validateRequirementsRequest({ careerId }), true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) Single-field mutation fails.
  await t.test('rejects when careerId is mutated out of bounds', () => {
    fc.assert(
      fc.property(invalidCareerIdArb, (careerId) => {
        assert.equal(validateRequirementsRequest({ careerId }), false);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Top-level: body must itself be a plain object.
  await t.test('rejects non-plain-object bodies', () => {
    fc.assert(
      fc.property(nonPlainBodyArb, (body) => {
        assert.equal(validateRequirementsRequest(body), false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

test('Property 23 — validateSeedAssessmentRequest rejects out-of-bounds inputs', async (t) => {
  // (a) Valid bodies — including all three optional/required fields.
  await t.test('accepts valid bodies', () => {
    fc.assert(
      fc.property(
        fc.record({
          resumeText: validResumeTextArb,
          profile: plainObjectArb,
          requirements: validRequirementsArrayArb,
        }),
        (body) => {
          assert.equal(validateSeedAssessmentRequest(body), true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Valid bodies omitting the optional profile / requirements fields also pass.
  await t.test('accepts valid bodies with optional fields omitted', () => {
    fc.assert(
      fc.property(validResumeTextArb, (resumeText) => {
        assert.equal(validateSeedAssessmentRequest({ resumeText }), true);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) Single-field mutations.
  await t.test('rejects when resumeText is mutated out of bounds', () => {
    fc.assert(
      fc.property(
        fc.record({
          resumeText: invalidResumeTextArb,
          profile: plainObjectArb,
          requirements: validRequirementsArrayArb,
        }),
        (body) => {
          assert.equal(validateSeedAssessmentRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when profile is defined but not a plain object', () => {
    fc.assert(
      fc.property(
        fc.record({
          resumeText: validResumeTextArb,
          profile: invalidProfileArb,
          requirements: validRequirementsArrayArb,
        }),
        (body) => {
          assert.equal(validateSeedAssessmentRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when requirements is defined but not an array', () => {
    fc.assert(
      fc.property(
        fc.record({
          resumeText: validResumeTextArb,
          profile: plainObjectArb,
          requirements: invalidRequirementsArrayArb,
        }),
        (body) => {
          assert.equal(validateSeedAssessmentRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects non-plain-object bodies', () => {
    fc.assert(
      fc.property(nonPlainBodyArb, (body) => {
        assert.equal(validateSeedAssessmentRequest(body), false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

test('Property 23 — validateRoadmapRequest rejects out-of-bounds inputs', async (t) => {
  // (a) Valid bodies.
  await t.test('accepts valid bodies', () => {
    fc.assert(
      fc.property(
        fc.record({
          dreamJobId: validCareerIdArb,
          requirements: validRequirementsArrayArb,
          assessment: validAssessmentArb,
          profile: plainObjectArb,
        }),
        (body) => {
          assert.equal(validateRoadmapRequest(body), true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) Single-field mutations.
  await t.test('rejects when dreamJobId is mutated out of bounds', () => {
    fc.assert(
      fc.property(
        fc.record({
          dreamJobId: invalidCareerIdArb,
          requirements: validRequirementsArrayArb,
          assessment: validAssessmentArb,
          profile: plainObjectArb,
        }),
        (body) => {
          assert.equal(validateRoadmapRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when requirements is not an array', () => {
    fc.assert(
      fc.property(
        fc.record({
          dreamJobId: validCareerIdArb,
          requirements: invalidRequirementsArrayArb,
          assessment: validAssessmentArb,
          profile: plainObjectArb,
        }),
        (body) => {
          assert.equal(validateRoadmapRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when assessment is not a plain object with plain-object skills', () => {
    fc.assert(
      fc.property(
        fc.record({
          dreamJobId: validCareerIdArb,
          requirements: validRequirementsArrayArb,
          assessment: invalidAssessmentArb,
          profile: plainObjectArb,
        }),
        (body) => {
          assert.equal(validateRoadmapRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when profile is defined but not a plain object', () => {
    fc.assert(
      fc.property(
        fc.record({
          dreamJobId: validCareerIdArb,
          requirements: validRequirementsArrayArb,
          assessment: validAssessmentArb,
          profile: invalidProfileArb,
        }),
        (body) => {
          assert.equal(validateRoadmapRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects non-plain-object bodies', () => {
    fc.assert(
      fc.property(nonPlainBodyArb, (body) => {
        assert.equal(validateRoadmapRequest(body), false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

test('Property 23 — validateProjectsRequest rejects out-of-bounds inputs', async (t) => {
  // (a) Valid bodies.
  await t.test('accepts valid bodies', () => {
    fc.assert(
      fc.property(
        fc.record({
          careerId: validCareerIdArb,
          focusSkills: validFocusSkillsArb,
          count: validCountArb,
          excludeIds: validExcludeIdsArb,
        }),
        (body) => {
          assert.equal(validateProjectsRequest(body), true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // (b) Single-field mutations.
  await t.test('rejects when careerId is mutated out of bounds', () => {
    fc.assert(
      fc.property(
        fc.record({
          careerId: invalidCareerIdArb,
          focusSkills: validFocusSkillsArb,
          count: validCountArb,
          excludeIds: validExcludeIdsArb,
        }),
        (body) => {
          assert.equal(validateProjectsRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when focusSkills is mutated out of bounds', () => {
    fc.assert(
      fc.property(
        fc.record({
          careerId: validCareerIdArb,
          focusSkills: invalidFocusSkillsArb,
          count: validCountArb,
          excludeIds: validExcludeIdsArb,
        }),
        (body) => {
          assert.equal(validateProjectsRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when count is mutated out of bounds (incl. non-integer)', () => {
    fc.assert(
      fc.property(
        fc.record({
          careerId: validCareerIdArb,
          focusSkills: validFocusSkillsArb,
          count: invalidCountArb,
          excludeIds: validExcludeIdsArb,
        }),
        (body) => {
          assert.equal(validateProjectsRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects when excludeIds is mutated out of bounds', () => {
    fc.assert(
      fc.property(
        fc.record({
          careerId: validCareerIdArb,
          focusSkills: validFocusSkillsArb,
          count: validCountArb,
          excludeIds: invalidExcludeIdsArb,
        }),
        (body) => {
          assert.equal(validateProjectsRequest(body), false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  await t.test('rejects non-plain-object bodies', () => {
    fc.assert(
      fc.property(nonPlainBodyArb, (body) => {
        assert.equal(validateProjectsRequest(body), false);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ─── Property 24: mapToBackendError produces a bounded message ─────────────
//
// Validates: Requirement 15.5
//
// For arbitrary inputs (including Errors, plain strings, plain objects, null,
// undefined, numbers, arrays, very long strings, and nested structures),
// `mapToBackendError(err)` must always return `{ ok: false, message }` where
// `typeof message === 'string'` and `message.length ∈ [1, 500]`.

test('Property 24 — mapToBackendError returns { ok:false, message ∈ [1,500] }', async (t) => {
  // Mix in real Error instances and pathological string/object shapes
  // alongside fast-check's generic `anything`.
  const errArb = fc.oneof(
    fc.anything(),
    fc.string().map((s) => new Error(s)),
    fc.constant(new Error()),
    fc.constant(new Error('')),
    fc.string().map((s) => ({ message: s })),
    fc.constant({ message: '' }),
    // Long message strings — both inside Error and as plain strings — to
    // exercise the 500-char clamp.
    fc.string({ minLength: 600, maxLength: 800 }).map((s) => new Error(s)),
    fc.string({ minLength: 600, maxLength: 800 }),
    fc.constant(null),
    fc.constant(undefined),
  );

  await t.test('always returns the documented shape and bounded length', () => {
    fc.assert(
      fc.property(errArb, (err) => {
        const result = mapToBackendError(err);
        assert.equal(result.ok, false);
        assert.equal(typeof result.message, 'string');
        assert.ok(
          result.message.length >= 1 && result.message.length <= 500,
          `message length ${result.message.length} not in [1, 500]`,
        );
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
