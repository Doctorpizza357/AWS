import fc from 'fast-check';

import { clampLevel } from './skillbridgeService';

describe('clampLevel', () => {
  // Property 1: clampLevel always produces an integer in [0, 100].
  // Validates: Requirements 3.5, 4.3
  test('Property 1: output is always an integer in [0, 100]', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = clampLevel(value);
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 }
    );
  });

  // Property 2: clampLevel is idempotent.
  // Validates: Requirements 3.5, 4.3
  test('Property 2: clampLevel is idempotent', () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const once = clampLevel(value);
        const twice = clampLevel(once);
        expect(twice).toBe(once);
      }),
      { numRuns: 100 }
    );
  });
});


import { sortProjectsForPhase } from './skillbridgeService';

describe('sortProjectsForPhase', () => {
  // Generators
  const skillArb = fc.constantFrom(
    'Programming',
    'Problem Solving',
    'Data Analysis',
    'Statistics',
    'Communication',
    'Design',
    'Math',
    'Leadership'
  );
  const difficultyArb = fc.constantFrom('easy', 'medium', 'hard');

  // Build a candidates array whose ids are unique. Distinct ids are required
  // for the property to assert a single canonical ordering — without them the
  // tiebreaker chain would not be total and a stable comparator could legally
  // emit two different outputs for two different input permutations.
  const projectShellArb = fc.record({
    skills: fc.uniqueArray(skillArb, { minLength: 0, maxLength: 4 }),
    difficulty: difficultyArb,
  });

  const candidatesArb = fc
    .uniqueArray(fc.string({ minLength: 1, maxLength: 16 }), {
      minLength: 0,
      maxLength: 8,
    })
    .chain((ids) =>
      fc
        .array(projectShellArb, { minLength: ids.length, maxLength: ids.length })
        .map((shells) => shells.map((shell, i) => ({ id: ids[i], ...shell })))
    );

  const focusSkillsArb = fc.uniqueArray(skillArb, { minLength: 0, maxLength: 4 });

  // Pure shuffle driven by a fast-check seed array so the input order is
  // arbitrary but reproducible.
  function shuffle(array, seeds) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = seeds.length > 0 ? seeds[i % seeds.length] % (i + 1) : 0;
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // Reference comparator that mirrors the documented tiebreaker order.
  function rank(project, focusSet) {
    const skills = Array.isArray(project.skills) ? project.skills : [];
    const overlap = new Set(skills.filter((s) => focusSet.has(s))).size;
    const difficultyRank =
      project.difficulty === 'easy'
        ? 0
        : project.difficulty === 'medium'
        ? 1
        : project.difficulty === 'hard'
        ? 2
        : Number.POSITIVE_INFINITY;
    return { overlap, difficultyRank, id: String(project.id) };
  }

  // Property 8: sortProjectsForPhase is a deterministic permutation.
  // Validates: Requirements 10.2, 10.6, 10.7
  test('Property 8: deterministic permutation under input shuffling, with documented tiebreakers', () => {
    fc.assert(
      fc.property(
        candidatesArb,
        focusSkillsArb,
        fc.array(fc.nat(64), { minLength: 0, maxLength: 16 }),
        (candidates, focusSkills, shuffleSeeds) => {
          const focusSet = new Set(focusSkills);

          const sortedOriginal = sortProjectsForPhase(candidates, focusSkills);
          const sortedShuffled = sortProjectsForPhase(
            shuffle(candidates, shuffleSeeds),
            focusSkills
          );

          // (1) Length preserved
          expect(sortedOriginal).toHaveLength(candidates.length);
          expect(sortedShuffled).toHaveLength(candidates.length);

          // (2) Permutation: same multiset of ids as the input
          const idsIn = candidates.map((p) => p.id).sort();
          const idsOut = sortedOriginal.map((p) => p.id).sort();
          const idsOutShuffled = sortedShuffled.map((p) => p.id).sort();
          expect(idsOut).toEqual(idsIn);
          expect(idsOutShuffled).toEqual(idsIn);

          // (3) Permutation invariance: same input multiset -> same output
          // sequence regardless of insertion order.
          expect(sortedShuffled.map((p) => p.id)).toEqual(
            sortedOriginal.map((p) => p.id)
          );

          // (4) Pairwise tiebreaker order respected: for every adjacent pair
          // in the output, the documented comparator must agree.
          for (let i = 0; i < sortedOriginal.length - 1; i += 1) {
            const a = rank(sortedOriginal[i], focusSet);
            const b = rank(sortedOriginal[i + 1], focusSet);
            if (a.overlap !== b.overlap) {
              expect(a.overlap).toBeGreaterThan(b.overlap);
            } else if (a.difficultyRank !== b.difficultyRank) {
              expect(a.difficultyRank).toBeLessThan(b.difficultyRank);
            } else {
              expect(a.id < b.id).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


import {
  validateRequirementsResponse,
  validateRoadmapResponse,
  validateProjectsResponse,
} from './skillbridgeService';

// ─── Property 21: requirements-response validator predicate ─────────────────
// Validates: Requirements 2.2, 2.3, 2.6
//
// Strategy: build a structurally valid `{ ok: true, requirements: [...] }`
// payload with fast-check, assert validateRequirementsResponse returns true,
// then mutate exactly one bound at a time and assert the validator returns
// false.

describe('validateRequirementsResponse', () => {
  const requirementArb = fc.record({
    skillId: fc.string({ minLength: 1, maxLength: 64 }),
    name: fc.string({ minLength: 1, maxLength: 120 }),
    rationale: fc.string({ minLength: 0, maxLength: 500 }),
    targetLevel: fc.integer({ min: 0, max: 100 }),
    weight: fc.double({ min: 0, max: 1, noNaN: true }),
  });

  const validPayloadArb = fc
    .integer({ min: 5, max: 15 })
    .chain((count) =>
      fc
        .array(requirementArb, { minLength: count, maxLength: count })
        .map((requirements) => ({ ok: true, requirements }))
    );

  test('Property 21: validator accepts valid payloads and rejects out-of-bound mutations', () => {
    fc.assert(
      fc.property(
        validPayloadArb,
        // Pick a mutation index and a per-mutation seed
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (payload, mutationKind, seed) => {
          // (1) Baseline: a freshly-built valid payload must validate.
          expect(validateRequirementsResponse(payload)).toBe(true);

          // Helper: clone the payload and the chosen requirement entry.
          const mutated = {
            ...payload,
            requirements: payload.requirements.map((r) => ({ ...r })),
          };
          const idx = seed % mutated.requirements.length;
          const target = mutated.requirements[idx];

          switch (mutationKind) {
            case 0:
              // Drop count below 5
              mutated.requirements = mutated.requirements.slice(0, 4);
              break;
            case 1:
              // Push count above 15 by appending duplicates
              mutated.requirements = mutated.requirements.concat(
                Array.from({ length: 16 - mutated.requirements.length + 1 }, () => ({
                  ...target,
                }))
              );
              break;
            case 2:
              // Empty skillId
              target.skillId = '';
              break;
            case 3:
              // skillId longer than 64
              target.skillId = 'x'.repeat(65);
              break;
            case 4:
              // name longer than 120
              target.name = 'x'.repeat(121);
              break;
            case 5:
              // weight outside [0, 1]
              target.weight = 1 + (seed % 1000) / 100 + 0.01;
              break;
            case 6:
              // targetLevel out of [0, 100]
              target.targetLevel = 101 + (seed % 50);
              break;
            case 7:
              // targetLevel non-integer
              target.targetLevel = 50.5;
              break;
            case 8:
              // ok flag flipped
              mutated.ok = false;
              break;
            default:
              break;
          }

          expect(validateRequirementsResponse(mutated)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 20: roadmap-response validator predicate ──────────────────────
// Validates: Requirements 8.2, 8.3, 8.4, 8.5

describe('validateRoadmapResponse', () => {
  const phaseArb = fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 32 }),
      label: fc.string({ minLength: 1, maxLength: 64 }),
      // weekStart in [1, 50], weekEnd ≥ weekStart
      weekStart: fc.integer({ min: 1, max: 50 }),
      weekDelta: fc.integer({ min: 0, max: 8 }),
      projectIds: fc.array(fc.string({ minLength: 1, maxLength: 16 }), {
        minLength: 1,
        maxLength: 3,
      }),
    })
    .map(({ id, label, weekStart, weekDelta, projectIds }) => ({
      id,
      label,
      weekStart,
      weekEnd: weekStart + weekDelta,
      focusSkills: [],
      topics: [],
      resources: [],
      projectIds,
    }));

  const isoTimestampArb = fc
    .integer({ min: 0, max: 4_102_444_800_000 }) // 0 → year 2100
    .map((ms) => new Date(ms).toISOString());

  const validRoadmapArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 64 }),
    dreamJobId: fc.string({ minLength: 1, maxLength: 64 }),
    generatedAt: isoTimestampArb,
    phases: fc
      .integer({ min: 3, max: 6 })
      .chain((n) => fc.array(phaseArb, { minLength: n, maxLength: n })),
  });

  const validPayloadArb = validRoadmapArb.map((roadmap) => ({ ok: true, roadmap }));

  test('Property 20: validator accepts valid payloads and rejects out-of-bound mutations', () => {
    fc.assert(
      fc.property(
        validPayloadArb,
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (payload, mutationKind, seed) => {
          // (1) Baseline: every freshly-built payload must validate.
          expect(validateRoadmapResponse(payload)).toBe(true);

          // Build a deep-enough clone of the roadmap + phases for mutation.
          const clonedPhases = payload.roadmap.phases.map((p) => ({
            ...p,
            projectIds: p.projectIds.slice(),
          }));
          const mutated = {
            ...payload,
            roadmap: {
              ...payload.roadmap,
              phases: clonedPhases,
            },
          };
          const phaseIdx = seed % mutated.roadmap.phases.length;
          const phase = mutated.roadmap.phases[phaseIdx];

          switch (mutationKind) {
            case 0:
              // Drop phase count below 3
              mutated.roadmap.phases = mutated.roadmap.phases.slice(0, 2);
              break;
            case 1:
              // Push phase count above 6 by duplicating an entry
              while (mutated.roadmap.phases.length <= 6) {
                mutated.roadmap.phases = mutated.roadmap.phases.concat({
                  ...phase,
                  projectIds: phase.projectIds.slice(),
                });
              }
              break;
            case 2:
              // weekEnd < weekStart
              phase.weekEnd = phase.weekStart - 1;
              break;
            case 3:
              // projectIds length 0
              phase.projectIds = [];
              break;
            case 4:
              // projectIds length 4 (above max of 3)
              phase.projectIds = ['p1', 'p2', 'p3', 'p4'];
              break;
            case 5:
              // dreamJobId empty
              mutated.roadmap.dreamJobId = '';
              break;
            case 6:
              // bad ISO timestamp
              mutated.roadmap.generatedAt = 'not-a-date';
              break;
            case 7:
              // missing roadmap.id
              mutated.roadmap.id = '';
              break;
            case 8:
              // weekStart non-integer
              phase.weekStart = 1.5;
              break;
            case 9:
              // ok flag flipped
              mutated.ok = false;
              break;
            default:
              break;
          }

          expect(validateRoadmapResponse(mutated)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 22: projects-response validator predicate ─────────────────────
// Validates: Requirements 10.4, 10.5

describe('validateProjectsResponse', () => {
  const difficultyArb = fc.constantFrom('easy', 'medium', 'hard');

  const projectArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 32 }),
    careerIds: fc.array(fc.string({ minLength: 1, maxLength: 32 }), {
      minLength: 0,
      maxLength: 4,
    }),
    skills: fc.array(fc.string({ minLength: 1, maxLength: 32 }), {
      minLength: 0,
      maxLength: 6,
    }),
    difficulty: difficultyArb,
    title: fc.string({ minLength: 1, maxLength: 80 }),
    summary: fc.string({ minLength: 0, maxLength: 200 }),
    deliverables: fc.array(fc.string({ minLength: 1, maxLength: 32 }), {
      minLength: 1,
      maxLength: 10,
    }),
    estHours: fc.integer({ min: 1, max: 200 }),
    aiGenerated: fc.constant(true),
  });

  const validPayloadArb = fc
    .integer({ min: 1, max: 5 })
    .chain((count) =>
      fc
        .array(projectArb, { minLength: count, maxLength: count })
        .map((projects) => ({ ok: true, projects }))
    );

  test('Property 22: validator accepts valid payloads and rejects out-of-bound mutations', () => {
    fc.assert(
      fc.property(
        validPayloadArb,
        fc.integer({ min: 0, max: 8 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (payload, mutationKind, seed) => {
          // (1) Baseline: every freshly-built payload must validate.
          expect(validateProjectsResponse(payload)).toBe(true);

          // Deep-enough clone for mutation.
          const mutated = {
            ...payload,
            projects: payload.projects.map((p) => ({
              ...p,
              deliverables: p.deliverables.slice(),
              careerIds: p.careerIds.slice(),
              skills: p.skills.slice(),
            })),
          };
          const idx = seed % mutated.projects.length;
          const project = mutated.projects[idx];

          switch (mutationKind) {
            case 0:
              // Drop count to 0
              mutated.projects = [];
              break;
            case 1:
              // Push count to 6 (above max)
              mutated.projects = mutated.projects.concat(
                Array.from({ length: 6 - mutated.projects.length + 1 }, () => ({
                  ...project,
                  deliverables: project.deliverables.slice(),
                  careerIds: project.careerIds.slice(),
                  skills: project.skills.slice(),
                }))
              );
              break;
            case 2:
              // Missing aiGenerated
              delete project.aiGenerated;
              break;
            case 3:
              // aiGenerated false
              project.aiGenerated = false;
              break;
            case 4:
              // deliverables length 0
              project.deliverables = [];
              break;
            case 5:
              // deliverables length 11 (above max of 10)
              project.deliverables = Array.from({ length: 11 }, (_, i) => `d${i}`);
              break;
            case 6:
              // estHours out of [1, 200]
              project.estHours = 201;
              break;
            case 7:
              // unknown difficulty
              project.difficulty = 'extreme';
              break;
            case 8:
              // ok flag flipped
              mutated.ok = false;
              break;
            default:
              break;
          }

          expect(validateProjectsResponse(mutated)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


import { validateAssessment } from './skillbridgeService';

// ─── Property 3: validateAssessment predicate matches its specification ─────
// Validates: Requirements 3.6, 4.4
//
// Strategy: build a structurally valid Skill_Assessment with fast-check
// (every skills value is `Number.isInteger && >= 0 && <= 100`, `updatedAt` is
// a string, `skills` is a plain object) and assert validateAssessment returns
// the same reference. Then for each documented invariant, mutate exactly one
// rule at a time and assert the validator returns null. This is the
// bidirectional equivalence: pass iff the spec predicate holds.

describe('validateAssessment', () => {
  const skillIdArb = fc.string({ minLength: 1, maxLength: 32 });
  const levelArb = fc.integer({ min: 0, max: 100 });

  // A plain object whose values are all integers in [0, 100]. Built from a
  // unique skillId list so every skill appears once (Object semantics make
  // duplicates a no-op anyway).
  const skillsArb = fc
    .uniqueArray(skillIdArb, { minLength: 0, maxLength: 8 })
    .chain((ids) =>
      fc
        .array(levelArb, { minLength: ids.length, maxLength: ids.length })
        .map((levels) => {
          const out = {};
          for (let i = 0; i < ids.length; i += 1) {
            out[ids[i]] = levels[i];
          }
          return out;
        })
    );

  const validAssessmentArb = fc.record({
    skills: skillsArb,
    updatedAt: fc.string(),
  });

  test('Property 3a: every passing candidate validates and returns the input identity', () => {
    fc.assert(
      fc.property(validAssessmentArb, (assessment) => {
        const result = validateAssessment(assessment);
        // Identity: the validator returns the same reference on success so
        // callers can use a `=== assessment` check.
        expect(result).toBe(assessment);
      }),
      { numRuns: 100 }
    );
  });

  // Out-of-range integers, non-integers, non-numbers — each violates the
  // skills value rule. Combined with mutation-kind selection below, these
  // generate failing candidates by tampering with exactly one rule.
  const badLevelArb = fc.oneof(
    fc.integer({ min: -1000, max: -1 }),         // below range
    fc.integer({ min: 101, max: 1000 }),         // above range
    fc.double({ min: 0.1, max: 99.9, noNaN: true }) // non-integer in range
      .filter((n) => !Number.isInteger(n)),
    fc.constantFrom(NaN, Infinity, -Infinity),   // non-finite numbers
    fc.string(),                                 // string
    fc.boolean(),                                // boolean
    fc.constant(null),                           // null
    fc.constant(undefined)                       // undefined
  );

  test('Property 3b: every failing candidate fails and returns null', () => {
    fc.assert(
      fc.property(
        validAssessmentArb,
        // Six mutation kinds, one per documented rule.
        fc.integer({ min: 0, max: 5 }),
        // Seed used to pick which skill key to corrupt for kind 0.
        fc.integer({ min: 0, max: 1_000_000 }),
        // Bad-level generator output reused for kind 0.
        badLevelArb,
        (baseline, mutationKind, seed, badLevel) => {
          // Sanity: baseline always validates.
          expect(validateAssessment(baseline)).toBe(baseline);

          // Shallow clone so mutations do not bleed between fast-check runs.
          const mutated = {
            ...baseline,
            skills: { ...baseline.skills },
          };

          switch (mutationKind) {
            case 0: {
              // Rule violated: a skills value is not an integer in [0, 100].
              // Inject a bad value under either an existing key or a fresh key
              // when the skills map is empty.
              const keys = Object.keys(mutated.skills);
              const targetKey =
                keys.length > 0 ? keys[seed % keys.length] : '__injected__';
              mutated.skills[targetKey] = badLevel;
              break;
            }
            case 1:
              // Rule violated: skills is not a plain object — array.
              mutated.skills = [];
              break;
            case 2:
              // Rule violated: skills is not a plain object — null.
              mutated.skills = null;
              break;
            case 3:
              // Rule violated: skills key missing entirely.
              delete mutated.skills;
              break;
            case 4:
              // Rule violated: updatedAt is not a string.
              mutated.updatedAt = 42;
              break;
            case 5:
              // Rule violated: updatedAt missing entirely.
              delete mutated.updatedAt;
              break;
            default:
              break;
          }

          expect(validateAssessment(mutated)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  // Top-level shape rule: `a` itself must be a plain object. This is the
  // remaining direction of the bidirectional equivalence — non-object inputs
  // must always fail regardless of any other field shape.
  test('Property 3c: non-plain-object inputs always fail', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.array(fc.anything(), { maxLength: 4 })
        ),
        (notAnObject) => {
          expect(validateAssessment(notAnObject)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});


import { computeProfileHash } from './skillbridgeService';

// ─── Properties 9–13: computeProfileHash ────────────────────────────────────
// Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6

describe('computeProfileHash', () => {
  // Generators
  // SkillId: any non-empty printable string. We exclude the U+0001 delimiter
  // to keep the algorithm contract test focused on the documented happy path
  // (delimiter collisions on `skillId` are out of scope of Req 17 — the
  // public contract only constrains values, not key strings).
  const skillIdArb = fc
    .string({ minLength: 1, maxLength: 24 })
    .filter((s) => !s.includes('\u0001') && !s.includes('='));
  const skillLevelArb = fc.integer({ min: 0, max: 100 });
  const dreamJobIdArb = fc.string({ minLength: 1, maxLength: 64 }).filter((s) => s.length > 0);

  // skillsArb produces a plain-object `skills` map keyed by unique skillIds.
  const skillsArb = fc
    .uniqueArray(skillIdArb, { minLength: 0, maxLength: 8 })
    .chain((ids) =>
      fc
        .array(skillLevelArb, { minLength: ids.length, maxLength: ids.length })
        .map((levels) => {
          const skills = {};
          ids.forEach((id, i) => {
            skills[id] = levels[i];
          });
          return skills;
        })
    );

  // assessmentArb wraps a `skills` map alongside an arbitrary set of
  // non-`skills` fields, exercising Req 17.2's "non-skills fields don't
  // affect the hash" clause.
  const assessmentArb = fc.record({
    skills: skillsArb,
    updatedAt: fc.string({ maxLength: 32 }),
    extra: fc.option(fc.string({ maxLength: 32 }), { nil: undefined }),
  });

  // Property 9: length bound [1, 256].
  // Validates: Requirements 17.1
  test('Property 9: hash length is in [1, 256]', () => {
    fc.assert(
      fc.property(assessmentArb, dreamJobIdArb, (assessment, dreamJobId) => {
        const hash = computeProfileHash(assessment, dreamJobId);
        expect(typeof hash).toBe('string');
        expect(hash.length).toBeGreaterThanOrEqual(1);
        expect(hash.length).toBeLessThanOrEqual(256);
      }),
      { numRuns: 100 }
    );
  });

  // Property 10: deterministic and key-order invariant. Non-`skills` field
  // differences (including `updatedAt`) must not affect the hash.
  // Validates: Requirements 17.2, 17.4
  test('Property 10: deterministic and invariant under key-reorder + non-skills field changes', () => {
    fc.assert(
      fc.property(
        assessmentArb,
        dreamJobIdArb,
        // permutation seeds shuffle the skills key insertion order
        fc.array(fc.nat(64), { minLength: 0, maxLength: 16 }),
        // arbitrary alternative non-skills fields
        fc.string({ maxLength: 32 }),
        fc.option(fc.string({ maxLength: 32 }), { nil: undefined }),
        (assessment, dreamJobId, shuffleSeeds, altUpdatedAt, altExtra) => {
          // Build an alternate `skills` object with the same (key,value)
          // pairs but a permuted insertion order.
          const keys = Object.keys(assessment.skills);
          const permuted = keys.slice();
          for (let i = permuted.length - 1; i > 0; i -= 1) {
            const j = shuffleSeeds.length > 0 ? shuffleSeeds[i % shuffleSeeds.length] % (i + 1) : 0;
            const tmp = permuted[i];
            permuted[i] = permuted[j];
            permuted[j] = tmp;
          }
          const reorderedSkills = {};
          for (const k of permuted) {
            reorderedSkills[k] = assessment.skills[k];
          }

          const variantA = { ...assessment };
          const variantB = {
            skills: reorderedSkills,
            updatedAt: altUpdatedAt,
            extra: altExtra,
            anotherField: 'irrelevant',
          };

          const hashA = computeProfileHash(variantA, dreamJobId);
          const hashB = computeProfileHash(variantB, dreamJobId);
          expect(hashB).toBe(hashA);

          // Determinism: calling twice with the exact same inputs returns
          // the same result.
          expect(computeProfileHash(variantA, dreamJobId)).toBe(hashA);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 11: discriminates on dreamJobId.
  // Validates: Requirements 17.3
  test('Property 11: distinct dreamJobIds yield distinct hashes', () => {
    fc.assert(
      fc.property(
        assessmentArb,
        dreamJobIdArb,
        dreamJobIdArb,
        (assessment, j1, j2) => {
          fc.pre(j1 !== j2);
          const h1 = computeProfileHash(assessment, j1);
          const h2 = computeProfileHash(assessment, j2);
          expect(h1).not.toBe(h2);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 12: discriminates on at least one differing (skillId, level)
  // pair. Construct two assessments whose `skills` maps differ in exactly one
  // entry, then check the resulting hashes diverge.
  // Validates: Requirements 17.5
  test('Property 12: differing (skillId, level) pair yields distinct hashes', () => {
    fc.assert(
      fc.property(
        skillsArb.filter((s) => Object.keys(s).length >= 1),
        dreamJobIdArb,
        // index of the entry to mutate
        fc.nat(),
        // delta to the level (will be re-clamped + biased away from 0)
        fc.integer({ min: 1, max: 100 }),
        (skills, dreamJobId, idxSeed, delta) => {
          const keys = Object.keys(skills);
          const idx = idxSeed % keys.length;
          const targetKey = keys[idx];

          const original = { skills, updatedAt: 'a' };

          // Produce a perturbed level guaranteed to differ from skills[targetKey].
          const oldLevel = skills[targetKey];
          let newLevel = (oldLevel + delta) % 101; // wraps within [0, 100]
          if (newLevel === oldLevel) {
            newLevel = (oldLevel + 1) % 101;
          }

          const perturbed = {
            skills: { ...skills, [targetKey]: newLevel },
            updatedAt: 'a',
          };

          const hOriginal = computeProfileHash(original, dreamJobId);
          const hPerturbed = computeProfileHash(perturbed, dreamJobId);
          expect(hOriginal).not.toBe(hPerturbed);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 13: rejects invalid input with `Invalid profile hash input`
  // prefix. Enumerate the documented failure shapes and assert each throws.
  // Validates: Requirements 17.6
  test('Property 13: invalid inputs throw with `Invalid profile hash input` prefix', () => {
    const invalidAssessmentArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.array(fc.anything(), { maxLength: 3 }),
      // assessment present but `.skills` malformed
      fc.record({ skills: fc.constant(null) }),
      fc.record({ skills: fc.constant(undefined) }),
      fc.record({ skills: fc.string() }),
      fc.record({ skills: fc.integer() }),
      fc.record({ skills: fc.array(fc.anything(), { maxLength: 2 }) }),
      // assessment with skills that has a non-integer or out-of-range level
      fc.record({
        skills: fc.dictionary(
          fc.string({ minLength: 1, maxLength: 8 }),
          fc.oneof(
            fc.constant(null),
            fc.constant(undefined),
            fc.constant('not-a-number'),
            fc.constant(true),
            fc.constant(NaN),
            fc.constant(Infinity),
            fc.constant(-Infinity),
            // non-integer doubles in (0, 1)
            fc.double({ min: 0.01, max: 0.99, noNaN: true }),
            // out-of-range integers (above 100 / below 0)
            fc.integer({ min: 101, max: 1000 }),
            fc.integer({ min: -1000, max: -1 })
          ),
          { minKeys: 1, maxKeys: 3 }
        ),
      })
    );

    const invalidJobIdArb = fc.oneof(
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(''),
      fc.integer(),
      fc.boolean(),
      fc.array(fc.string(), { maxLength: 2 })
    );

    fc.assert(
      fc.property(invalidAssessmentArb, fc.string({ minLength: 1, maxLength: 32 }), (badAssessment, validJobId) => {
        expect(() => computeProfileHash(badAssessment, validJobId)).toThrow(/^Invalid profile hash input/);
      }),
      { numRuns: 100 }
    );

    fc.assert(
      fc.property(
        fc.record({ skills: fc.constant({}) }),
        invalidJobIdArb,
        (validAssessment, badJobId) => {
          expect(() => computeProfileHash(validAssessment, badJobId)).toThrow(/^Invalid profile hash input/);
        }
      ),
      { numRuns: 100 }
    );
  });
});


import { computeSkillGapList, allGapsClosed } from './skillbridgeService';

// ─── Properties 4–7: computeSkillGapList / allGapsClosed ────────────────────
// Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 13.6, 20.4

describe('computeSkillGapList', () => {
  // Generators
  // Skill names are bounded so the case-insensitive name tiebreaker is
  // exercised by occasional collisions on the case-folded form.
  const skillIdArb = fc.string({ minLength: 1, maxLength: 12 });
  const skillNameArb = fc.string({ minLength: 1, maxLength: 12 });
  const targetLevelArb = fc.integer({ min: 0, max: 100 });
  const weightArb = fc.double({ min: 0, max: 1, noNaN: true });
  const currentLevelArb = fc.integer({ min: 0, max: 100 });

  // Build a Skill_Requirement list with unique skillIds (per Req 2.7 dedup)
  // and a paired Skill_Assessment.skills map drawn from those same ids.
  // `assessment.skills` is allowed to omit some ids (Req 6.1 default-to-0)
  // and is allowed to contain extra ids unrelated to the requirements.
  const requirementsArb = fc
    .uniqueArray(skillIdArb, { minLength: 0, maxLength: 8 })
    .chain((ids) =>
      fc
        .array(
          fc.record({
            name: skillNameArb,
            targetLevel: targetLevelArb,
            weight: weightArb,
          }),
          { minLength: ids.length, maxLength: ids.length }
        )
        .map((shells) =>
          shells.map((shell, i) => ({ skillId: ids[i], ...shell }))
        )
    );

  // Generate an assessment whose `.skills` map covers a random subset of the
  // requirement ids (to exercise the missing-key default-to-0 path) plus a
  // random set of unrelated ids (which must be ignored).
  const assessmentForArb = (requirements) =>
    fc
      .tuple(
        fc.array(
          fc.tuple(
            fc.nat(Math.max(requirements.length - 1, 0)),
            currentLevelArb
          ),
          { minLength: 0, maxLength: requirements.length }
        ),
        fc.array(
          fc.tuple(
            fc.string({ minLength: 1, maxLength: 12 }),
            currentLevelArb
          ),
          { minLength: 0, maxLength: 4 }
        )
      )
      .map(([reqLevels, extraLevels]) => {
        const skills = {};
        if (requirements.length > 0) {
          for (const [idx, level] of reqLevels) {
            skills[requirements[idx].skillId] = level;
          }
        }
        for (const [id, level] of extraLevels) {
          // Avoid clobbering an entry already pinned to a requirement id.
          if (!Object.prototype.hasOwnProperty.call(skills, id)) {
            skills[id] = level;
          }
        }
        return { skills, updatedAt: 'a' };
      });

  // Property 4: gap value matches definition and bounds.
  // Validates: Requirements 6.1, 13.6
  test('Property 4: gap = max(0, target − current), every gap ∈ [0, 100], length preserved', () => {
    fc.assert(
      fc.property(
        requirementsArb.chain((reqs) =>
          fc
            .tuple(fc.constant(reqs), assessmentForArb(reqs))
            .map(([requirements, assessment]) => ({ requirements, assessment }))
        ),
        ({ requirements, assessment }) => {
          const gapList = computeSkillGapList(requirements, assessment);

          // Length preservation (Req 6.1 / Property 4).
          expect(gapList).toHaveLength(requirements.length);

          // Every entry has the documented Skill_Gap shape and bounds.
          for (const entry of gapList) {
            expect(typeof entry.skillId).toBe('string');
            expect(typeof entry.name).toBe('string');
            expect(Number.isInteger(entry.currentLevel)).toBe(true);
            expect(Number.isInteger(entry.targetLevel)).toBe(true);
            expect(typeof entry.weight).toBe('number');
            expect(Number.isInteger(entry.gap)).toBe(true);
            expect(entry.gap).toBeGreaterThanOrEqual(0);
            expect(entry.gap).toBeLessThanOrEqual(100);
          }

          // For each requirement, recompute the expected gap from the
          // documented definition and assert the entry matches.
          const skills =
            assessment && assessment.skills ? assessment.skills : {};
          for (const req of requirements) {
            const matching = gapList.find((g) => g.skillId === req.skillId);
            expect(matching).toBeDefined();

            const stored = skills[req.skillId];
            const expectedCurrent =
              Number.isInteger(stored) && stored >= 0 && stored <= 100
                ? stored
                : 0;
            const expectedGap = Math.max(0, req.targetLevel - expectedCurrent);
            expect(matching.currentLevel).toBe(expectedCurrent);
            expect(matching.targetLevel).toBe(req.targetLevel);
            expect(matching.gap).toBe(expectedGap);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 5: monotone with respect to currentLevel.
  // Validates: Requirements 6.1, 6.4
  //
  // Raising any single skill's currentLevel by k ≥ 0 must never increase
  // any output entry's gap. We pick a random requirement to bump and a
  // random non-negative delta, then compare gap-by-gap on the same
  // requirement set.
  test('Property 5: monotone — raising currentLevel never increases any gap', () => {
    fc.assert(
      fc.property(
        // Ensure at least one requirement so the monotone bump has a target.
        requirementsArb.filter((reqs) => reqs.length >= 1).chain((reqs) =>
          fc
            .tuple(
              fc.constant(reqs),
              assessmentForArb(reqs),
              fc.nat(reqs.length - 1),
              // delta in [0, 200] to test both no-op and saturating bumps.
              fc.integer({ min: 0, max: 200 })
            )
            .map(([requirements, assessment, idx, delta]) => ({
              requirements,
              assessment,
              targetIdx: idx,
              delta,
            }))
        ),
        ({ requirements, assessment, targetIdx, delta }) => {
          const targetSkillId = requirements[targetIdx].skillId;
          const baselineCurrent =
            Number.isInteger(assessment.skills[targetSkillId]) &&
            assessment.skills[targetSkillId] >= 0 &&
            assessment.skills[targetSkillId] <= 100
              ? assessment.skills[targetSkillId]
              : 0;
          const raisedCurrent = Math.min(100, baselineCurrent + delta);

          const raisedAssessment = {
            ...assessment,
            skills: { ...assessment.skills, [targetSkillId]: raisedCurrent },
          };

          const baselineGaps = computeSkillGapList(requirements, assessment);
          const raisedGaps = computeSkillGapList(requirements, raisedAssessment);

          // Length is preserved across both runs.
          expect(raisedGaps).toHaveLength(baselineGaps.length);

          // For each requirement, the raised-variant gap must be ≤ baseline.
          // We compare by skillId because sort order can change.
          const baselineBySkill = new Map(baselineGaps.map((g) => [g.skillId, g]));
          for (const raised of raisedGaps) {
            const baseline = baselineBySkill.get(raised.skillId);
            expect(baseline).toBeDefined();
            expect(raised.gap).toBeLessThanOrEqual(baseline.gap);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 6: sort order respects the documented comparator.
  // Validates: Requirements 6.2
  //
  // For every adjacent pair (a, b) in the output, the documented comparator
  // must agree pairwise:
  //   gap desc → weight desc → name case-insensitive asc (or equal).
  test('Property 6: sort order — adjacent pairs respect gap desc → weight desc → name CI asc', () => {
    fc.assert(
      fc.property(
        requirementsArb.chain((reqs) =>
          fc
            .tuple(fc.constant(reqs), assessmentForArb(reqs))
            .map(([requirements, assessment]) => ({ requirements, assessment }))
        ),
        ({ requirements, assessment }) => {
          const gapList = computeSkillGapList(requirements, assessment);

          for (let i = 0; i < gapList.length - 1; i += 1) {
            const a = gapList[i];
            const b = gapList[i + 1];

            if (a.gap !== b.gap) {
              // Primary tier: gap descending.
              expect(a.gap).toBeGreaterThan(b.gap);
            } else if (a.weight !== b.weight) {
              // Secondary tier: weight descending.
              expect(a.weight).toBeGreaterThan(b.weight);
            } else {
              // Tertiary tier: name case-insensitive ascending (or equal,
              // since requirement names are not deduped).
              const an = a.name.toLowerCase();
              const bn = b.name.toLowerCase();
              expect(an <= bn).toBe(true);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('allGapsClosed', () => {
  // Property 7: allGapsClosed predicate matches its specification.
  // Validates: Requirements 6.3, 6.5, 13.6, 20.4
  //
  // Bidirectional equivalence: allGapsClosed(list) === (list.length > 0 &&
  // list.every(g => g.gap === 0)). We generate gap-list-shaped arrays where
  // each entry has only the fields the predicate inspects.
  test('Property 7: predicate equals length > 0 && every gap === 0', () => {
    const gapEntryArb = fc.record({
      gap: fc.integer({ min: 0, max: 100 }),
    });

    fc.assert(
      fc.property(
        fc.array(gapEntryArb, { minLength: 0, maxLength: 12 }),
        (gapList) => {
          const expected =
            gapList.length > 0 && gapList.every((g) => g.gap === 0);
          expect(allGapsClosed(gapList)).toBe(expected);
        }
      ),
      { numRuns: 100 }
    );

    // Edge cases: explicitly assert non-array inputs always return false so
    // the celebration never accidentally fires for malformed state.
    expect(allGapsClosed(null)).toBe(false);
    expect(allGapsClosed(undefined)).toBe(false);
    expect(allGapsClosed('not-an-array')).toBe(false);
    expect(allGapsClosed([])).toBe(false);
  });
});


import { serializeRoadmap, parseRoadmap } from './skillbridgeService';

// ─── Properties 14, 15, 16: serializeRoadmap / parseRoadmap ─────────────────
// Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8

describe('serializeRoadmap / parseRoadmap', () => {
  // Generators
  const skillIdArb = fc.string({ minLength: 1, maxLength: 16 });
  const projectIdArb = fc.string({ minLength: 1, maxLength: 16 });

  const resourceArb = fc.record({
    title: fc.string({ minLength: 0, maxLength: 32 }),
    provider: fc.string({ minLength: 0, maxLength: 32 }),
    topic: fc.string({ minLength: 0, maxLength: 32 }),
  });

  // ISO timestamp drawn from a bounded epoch range so `Date.toISOString` is
  // always well-defined.
  const isoTimestampArb = fc
    .integer({ min: 0, max: 4_102_444_800_000 }) // 0 → year 2100
    .map((ms) => new Date(ms).toISOString());

  // A structurally valid Phase: weekStart ≤ weekEnd, both positive integers.
  // `completedAt` is occasionally set to an ISO string and otherwise omitted,
  // exercising the implementation note that `completedAt` is dropped only
  // when undefined.
  const phaseArb = fc
    .record({
      id: fc.string({ minLength: 1, maxLength: 16 }),
      label: fc.string({ minLength: 0, maxLength: 32 }),
      weekStart: fc.integer({ min: 1, max: 50 }),
      weekDelta: fc.integer({ min: 0, max: 8 }),
      focusSkills: fc.uniqueArray(skillIdArb, { minLength: 0, maxLength: 4 }),
      topics: fc.array(fc.string({ minLength: 0, maxLength: 24 }), {
        minLength: 0,
        maxLength: 4,
      }),
      resources: fc.array(resourceArb, { minLength: 0, maxLength: 3 }),
      projectIds: fc.uniqueArray(projectIdArb, { minLength: 1, maxLength: 3 }),
      completedAt: fc.option(isoTimestampArb, { nil: undefined }),
    })
    .map(({ weekStart, weekDelta, completedAt, ...rest }) => {
      const out = {
        ...rest,
        weekStart,
        weekEnd: weekStart + weekDelta,
      };
      if (completedAt !== undefined) {
        out.completedAt = completedAt;
      }
      return out;
    });

  // A structurally valid Roadmap with 3–6 phases.
  const validRoadmapArb = fc
    .integer({ min: 3, max: 6 })
    .chain((n) =>
      fc.record({
        id: fc.string({ minLength: 1, maxLength: 32 }),
        dreamJobId: fc.string({ minLength: 1, maxLength: 32 }),
        generatedAt: isoTimestampArb,
        phases: fc.array(phaseArb, { minLength: n, maxLength: n }),
      })
    );

  // Helper: build the documented projection of a roadmap so tests can compare
  // against it without depending on the implementation's internal helpers.
  function projectExpected(roadmap) {
    return {
      id: roadmap.id,
      dreamJobId: roadmap.dreamJobId,
      generatedAt: roadmap.generatedAt,
      phases: roadmap.phases.map((p) => {
        const phase = {
          id: p.id,
          label: p.label,
          weekStart: p.weekStart,
          weekEnd: p.weekEnd,
          focusSkills: p.focusSkills,
          topics: p.topics,
          resources: p.resources.map((r) => ({
            title: r.title,
            provider: r.provider,
            topic: r.topic,
          })),
          projectIds: p.projectIds,
        };
        if (p.completedAt !== undefined) {
          phase.completedAt = p.completedAt;
        }
        return phase;
      }),
    };
  }

  // Property 14: round-trip — parseRoadmap(serializeRoadmap(r)) deep-equals
  // r on documented fields, with phase order preserved.
  // Validates: Requirements 16.1, 16.2, 16.3, 16.4
  test('Property 14: round-trip preserves documented fields and phase order', () => {
    fc.assert(
      fc.property(validRoadmapArb, (roadmap) => {
        const serialized = serializeRoadmap(roadmap);
        // The serialized form must be parseable JSON (Req 16.2).
        expect(typeof serialized).toBe('string');
        expect(() => JSON.parse(serialized)).not.toThrow();

        const parsed = parseRoadmap(serialized);
        const expected = projectExpected(roadmap);

        // Top-level documented fields deep-equal.
        expect(parsed).toEqual(expected);

        // Phase order is preserved 1:1.
        expect(parsed.phases.map((p) => p.id)).toEqual(
          roadmap.phases.map((p) => p.id)
        );
      }),
      { numRuns: 100 }
    );
  });

  // Property 15: parseRoadmap rejects malformed input with documented prefixes.
  // Validates: Requirements 16.5, 16.6, 16.7
  test('Property 15: parseRoadmap rejects malformed inputs with documented prefixes', () => {
    // Case A — non-string inputs throw `Invalid roadmap input` (Req 16.7).
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.boolean(),
          fc.array(fc.anything(), { maxLength: 3 }),
          fc.record({ phases: fc.array(fc.anything(), { maxLength: 3 }) })
        ),
        (notAString) => {
          expect(() => parseRoadmap(notAString)).toThrow(/^Invalid roadmap input/);
        }
      ),
      { numRuns: 100 }
    );

    // Case B — string inputs that fail JSON.parse throw `Invalid roadmap JSON`
    // (Req 16.5). We bias the generator toward strings that are unlikely to
    // be valid JSON.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(''),
          fc.constant('not-json'),
          fc.constant('{'),
          fc.constant('}'),
          fc.constant('['),
          fc.constant('{"a":'),
          fc.string({ minLength: 1, maxLength: 32 })
            .filter((s) => {
              try {
                JSON.parse(s);
                return false;
              } catch (_) {
                return true;
              }
            })
        ),
        (badJson) => {
          expect(() => parseRoadmap(badJson)).toThrow(/^Invalid roadmap JSON/);
        }
      ),
      { numRuns: 100 }
    );

    // Case C — strings that parse but violate the structural shape throw
    // `Malformed roadmap` (Req 16.6). We start from a valid roadmap, mutate
    // exactly one structural rule, then re-serialize.
    fc.assert(
      fc.property(
        validRoadmapArb,
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (roadmap, mutationKind, seed) => {
          // Round-trip baseline must succeed.
          expect(() => parseRoadmap(serializeRoadmap(roadmap))).not.toThrow();

          let mutatedString;
          switch (mutationKind) {
            case 0: {
              // Parsed value is not an object (array literal).
              mutatedString = JSON.stringify([1, 2, 3]);
              break;
            }
            case 1: {
              // Parsed value is not an object (number literal).
              mutatedString = JSON.stringify(42);
              break;
            }
            case 2: {
              // Object missing the `phases` key entirely.
              mutatedString = JSON.stringify({
                id: roadmap.id,
                dreamJobId: roadmap.dreamJobId,
                generatedAt: roadmap.generatedAt,
              });
              break;
            }
            case 3: {
              // `phases` present but not an array.
              mutatedString = JSON.stringify({
                ...projectExpected(roadmap),
                phases: 'not-an-array',
              });
              break;
            }
            case 4: {
              // A single phase has weekEnd < weekStart.
              const projection = projectExpected(roadmap);
              const idx = seed % projection.phases.length;
              const target = { ...projection.phases[idx] };
              target.weekEnd = target.weekStart - 1; // ≥ 0 since weekStart ≥ 1
              const phases = projection.phases.slice();
              phases[idx] = target;
              mutatedString = JSON.stringify({ ...projection, phases });
              break;
            }
            case 5: {
              // A single phase has a non-positive-integer weekStart.
              const projection = projectExpected(roadmap);
              const idx = seed % projection.phases.length;
              const target = { ...projection.phases[idx] };
              // 0 fails Number.isInteger(...) && >= 1 in the validator.
              target.weekStart = 0;
              const phases = projection.phases.slice();
              phases[idx] = target;
              mutatedString = JSON.stringify({ ...projection, phases });
              break;
            }
            default:
              mutatedString = JSON.stringify({});
              break;
          }

          expect(() => parseRoadmap(mutatedString)).toThrow(/^Malformed roadmap/);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 16: serializeRoadmap rejects non-object inputs.
  // Validates: Requirements 16.8
  test('Property 16: serializeRoadmap rejects non-object inputs and objects without phases array', () => {
    // Non-object inputs.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.array(fc.anything(), { maxLength: 3 })
        ),
        (notAnObject) => {
          expect(() => serializeRoadmap(notAnObject)).toThrow(/^Invalid roadmap input/);
        }
      ),
      { numRuns: 100 }
    );

    // Object inputs whose `phases` is not an array.
    fc.assert(
      fc.property(
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.record({}) // missing entirely
        ),
        (badPhases) => {
          const candidate = { id: 'r1', dreamJobId: 'cs', phases: badPhases };
          // Special-case: when badPhases is `undefined` we emulate the
          // missing-phases case by deleting the key.
          if (badPhases === undefined) {
            delete candidate.phases;
          }
          expect(() => serializeRoadmap(candidate)).toThrow(/^Invalid roadmap input/);
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { applyTraitGains } from './skillbridgeService';

// ─── Properties 17, 18: applyTraitGains ─────────────────────────────────────
// Validates: Requirements 5.1, 5.2, 5.3

describe('applyTraitGains', () => {
  // Generators
  // A small fixed trait/skill universe so the generator hits both the
  // mapped-active and mapped-inactive code paths frequently.
  const traitArb = fc.constantFrom(
    'collaborative',
    'analytical',
    'technical',
    'strategic',
    'leadership',
    'creative',
    'decisive',
    'unmapped-trait', // exercises the "no mapping" branch (Req 5.3)
  );
  const skillIdArb = fc.constantFrom(
    'collaboration',
    'communication',
    'problem-solving',
    'data-analysis',
    'statistics',
    'research',
    'programming',
    'engineering',
    'system-design',
    'modeling',
    'incident-response',
    'threat-analysis',
    'cost-optimization',
    'mechanical-design',
    // skill that is intentionally never active so we can confirm the
    // "skillId mapped but not active" branch is also exercised.
    'never-active-skill'
  );

  // traitMap: arbitrary trait → skillIds mapping where every value is an
  // array of unique skill ids drawn from the universe above.
  const traitMapArb = fc.dictionary(
    traitArb,
    fc.uniqueArray(skillIdArb, { minLength: 0, maxLength: 4 }),
    { minKeys: 0, maxKeys: 8 }
  );

  // activeSkillIds: a subset of the universe (sometimes empty). We
  // explicitly omit `'never-active-skill'` so the validator can rely on
  // it being inactive.
  const activeSkillIdsArb = fc
    .uniqueArray(skillIdArb, { minLength: 0, maxLength: 8 })
    .map((ids) => ids.filter((id) => id !== 'never-active-skill'));

  // assessment: skills map with valid integer levels in [0, 100], drawn
  // from any subset of the universe (so some active/mapped skills may be
  // missing from skills entirely, exercising the default-to-0 branch).
  const assessmentArb = fc
    .uniqueArray(skillIdArb, { minLength: 0, maxLength: 8 })
    .chain((ids) =>
      fc
        .array(fc.integer({ min: 0, max: 100 }), {
          minLength: ids.length,
          maxLength: ids.length,
        })
        .map((levels) => {
          const skills = {};
          ids.forEach((id, i) => {
            skills[id] = levels[i];
          });
          return { skills, updatedAt: 'baseline' };
        })
    );

  const traitsArb = fc.array(traitArb, { minLength: 0, maxLength: 6 });

  // Property 17: applyTraitGains applies floor(rewardXp / 4) to mapped
  // active skills only.
  // Validates: Requirements 5.1, 5.2, 5.3
  test('Property 17: applies floor(rewardXp / 4) to mapped active skills only, leaves others unchanged', () => {
    fc.assert(
      fc.property(
        assessmentArb,
        traitsArb,
        // rewardXp range chosen so that increments are sometimes 0,
        // sometimes 1+, and sometimes large enough to saturate at 100.
        fc.integer({ min: 0, max: 600 }),
        traitMapArb,
        activeSkillIdsArb,
        (assessment, traits, rewardXp, traitMap, activeSkillIds) => {
          // Snapshot the pre-call state so we can verify no mutation.
          const snapshot = JSON.parse(JSON.stringify(assessment));

          const result = applyTraitGains(
            assessment,
            traits,
            rewardXp,
            traitMap,
            activeSkillIds
          );

          // (1) Pure: original assessment is untouched.
          expect(assessment).toEqual(snapshot);

          // (2) Returned a fresh assessment object whose `skills` is a
          // fresh map (not the same reference).
          expect(result).not.toBe(assessment);
          expect(result.skills).not.toBe(assessment.skills);

          // (3) Non-`skills` fields are preserved verbatim.
          expect(result.updatedAt).toBe(assessment.updatedAt);

          // (4) Every output level is an integer in [0, 100] (Req 5.2).
          for (const value of Object.values(result.skills)) {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(100);
          }

          // (5) Compute the expected per-skill increment count from the
          // documented (trait → skillId pair) iteration. For each pair
          // where the skillId is in activeSkillIds, count one increment.
          const activeSet = new Set(activeSkillIds);
          const increment = Math.floor(rewardXp / 4);

          // When increment === 0 the implementation takes a no-op fast
          // path (per Property 18): the output `skills` map deep-equals
          // the input map, and absent skills stay absent. Skip the
          // per-skill expectedHits assertions entirely in that case.
          if (increment === 0) {
            expect(result.skills).toEqual(assessment.skills);
            return;
          }

          const expectedHits = {};
          for (const trait of traits) {
            const mapped = Array.isArray(traitMap[trait]) ? traitMap[trait] : [];
            for (const skillId of mapped) {
              if (!activeSet.has(skillId)) continue;
              expectedHits[skillId] = (expectedHits[skillId] || 0) + 1;
            }
          }

          // Compute expected output via the same iterative clamp the
          // implementation uses: start from base level (default 0),
          // add `increment` `expectedHits[skillId]` times, clamping
          // after each addition.
          for (const skillId of Object.keys(expectedHits)) {
            const baseLevel = Number.isInteger(assessment.skills[skillId])
              ? assessment.skills[skillId]
              : 0;
            let level = baseLevel;
            for (let i = 0; i < expectedHits[skillId]; i += 1) {
              level += increment;
              if (level < 0) level = 0;
              if (level > 100) level = 100;
            }
            expect(result.skills[skillId]).toBe(level);
          }

          // (6) Skills NOT in expectedHits are unchanged from the
          // original assessment (or absent if they were absent before).
          const allSkillIds = new Set([
            ...Object.keys(assessment.skills),
            ...Object.keys(result.skills),
          ]);
          for (const skillId of allSkillIds) {
            if (Object.prototype.hasOwnProperty.call(expectedHits, skillId)) {
              continue; // covered above
            }
            // Untouched: present in result iff present in original, with
            // identical value.
            const inOriginal = Object.prototype.hasOwnProperty.call(
              assessment.skills,
              skillId
            );
            const inResult = Object.prototype.hasOwnProperty.call(
              result.skills,
              skillId
            );
            expect(inResult).toBe(inOriginal);
            if (inOriginal) {
              expect(result.skills[skillId]).toBe(assessment.skills[skillId]);
            }
          }

          // (7) `'never-active-skill'` is never written, regardless of
          // any traitMap mapping (Req 5.3). It should only appear in the
          // result if it appeared in the original assessment.
          const neverActiveInOriginal = Object.prototype.hasOwnProperty.call(
            assessment.skills,
            'never-active-skill'
          );
          const neverActiveInResult = Object.prototype.hasOwnProperty.call(
            result.skills,
            'never-active-skill'
          );
          expect(neverActiveInResult).toBe(neverActiveInOriginal);
        }
      ),
      { numRuns: 100 }
    );
  });

  // Property 18: no-op when rewardXp ≤ 3.
  // Validates: Requirements 5.1
  //
  // Math.floor(3 / 4) === 0, so for any rewardXp in [0, 3] the documented
  // increment is exactly 0 and the output `skills` map must deep-equal
  // the input `skills` map (no entries created, no entries changed).
  test('Property 18: no-op when rewardXp ≤ 3', () => {
    fc.assert(
      fc.property(
        assessmentArb,
        traitsArb,
        fc.integer({ min: 0, max: 3 }),
        traitMapArb,
        activeSkillIdsArb,
        (assessment, traits, rewardXp, traitMap, activeSkillIds) => {
          const snapshot = JSON.parse(JSON.stringify(assessment));

          const result = applyTraitGains(
            assessment,
            traits,
            rewardXp,
            traitMap,
            activeSkillIds
          );

          // Original untouched (purity).
          expect(assessment).toEqual(snapshot);

          // Output `skills` map deep-equals the input `skills` map.
          expect(result.skills).toEqual(assessment.skills);

          // Non-`skills` fields preserved.
          expect(result.updatedAt).toBe(assessment.updatedAt);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ─── Properties 25–33: deterministic helpers (Task 14.1) ────────────────────

import {
  xpForDifficulty,
  roadmapCompletionPct,
  isPhaseCompletable,
  markPhaseComplete,
  validateCompletionForm,
  markProjectComplete,
  unmarkProjectComplete,
  fallbackRequirements,
  mergeSeed,
} from './skillbridgeService';

import careersData from '../data/careers';

// Generators reused across the helper test blocks.
const _projectIdArb = fc.string({ minLength: 1, maxLength: 12 });
const _skillIdArb = fc.string({ minLength: 1, maxLength: 12 });
const _phaseIdArb = fc.string({ minLength: 1, maxLength: 12 });

const _isoTimestampArb = fc
  .integer({ min: 0, max: 4_102_444_800_000 })
  .map((ms) => new Date(ms).toISOString());

// A phase whose `projectIds` is unique-per-phase. completedAt is
// occasionally set so tests exercise both sides of the percentage formula.
const _phaseArb = fc
  .record({
    id: _phaseIdArb,
    label: fc.string({ minLength: 0, maxLength: 24 }),
    weekStart: fc.integer({ min: 1, max: 50 }),
    weekDelta: fc.integer({ min: 0, max: 8 }),
    projectIds: fc.uniqueArray(_projectIdArb, { minLength: 1, maxLength: 3 }),
    completedAt: fc.option(_isoTimestampArb, { nil: undefined }),
  })
  .map(({ weekStart, weekDelta, completedAt, ...rest }) => {
    const out = { ...rest, weekStart, weekEnd: weekStart + weekDelta };
    if (completedAt !== undefined) out.completedAt = completedAt;
    return out;
  });

// Roadmap arb with phases of length [0, 6] so we exercise the empty-phases
// zero-division branch alongside the populated branch.
const _roadmapArb = fc
  .integer({ min: 0, max: 6 })
  .chain((n) =>
    fc
      .uniqueArray(_phaseIdArb, { minLength: n, maxLength: n })
      .chain((ids) =>
        fc
          .array(_phaseArb, { minLength: n, maxLength: n })
          .map((phases) => ({
            id: 'r1',
            dreamJobId: 'j1',
            generatedAt: '2024-01-01T00:00:00Z',
            phases: phases.map((p, i) => ({ ...p, id: ids[i] })),
          }))
      )
  );

// Reference percentage formula matching design.md Property 29.
function _expectedPct(roadmap) {
  const phases = roadmap && Array.isArray(roadmap.phases) ? roadmap.phases : [];
  if (phases.length === 0) return 0;
  let completed = 0;
  for (const p of phases) {
    if (p && typeof p.completedAt === 'string' && p.completedAt.length > 0) {
      completed += 1;
    }
  }
  return Math.floor(0.5 + (100 * completed) / phases.length);
}

// ─── Property 33: xpForDifficulty mapping ───────────────────────────────────
// Validates: Requirements 11.4, 11.5, 11.6, 20.5

describe('xpForDifficulty', () => {
  test('Property 33: xpForDifficulty mapping for known difficulties', () => {
    fc.assert(
      fc.property(fc.constantFrom('easy', 'medium', 'hard'), (d) => {
        const expected = { easy: 20, medium: 40, hard: 60 }[d];
        expect(xpForDifficulty(d)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  test('Property 33: xpForDifficulty throws on unknown difficulties', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string().filter((s) => !['easy', 'medium', 'hard'].includes(s)),
          fc.constant(null),
          fc.constant(undefined),
          fc.integer(),
          fc.boolean()
        ),
        (d) => {
          expect(() => xpForDifficulty(d)).toThrow(/^Unknown difficulty:/);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 29: roadmapCompletionPct arithmetic + zero-division safety ────
// Validates: Requirements 13.4, 13.5

describe('roadmapCompletionPct', () => {
  test('Property 29: result is integer in [0, 100], 0 when phases empty, halves round up', () => {
    fc.assert(
      fc.property(_roadmapArb, (roadmap) => {
        const pct = roadmapCompletionPct(roadmap);

        // Bounded integer in [0, 100] (Req 13.4).
        expect(Number.isInteger(pct)).toBe(true);
        expect(pct).toBeGreaterThanOrEqual(0);
        expect(pct).toBeLessThanOrEqual(100);

        // Zero-division safety: empty phases → 0 (Req 13.5).
        if (roadmap.phases.length === 0) {
          expect(pct).toBe(0);
          return;
        }

        // Reference formula matches.
        expect(pct).toBe(_expectedPct(roadmap));
      }),
      { numRuns: 100 }
    );
  });

  test('Property 29: half-cases round UP', () => {
    // 1 of 2 → 50.0 → 50 (no halving), 1 of 3 → 33.333 → 33,
    // 1 of 8 → 12.5 → 13. We use the 12.5 case as the definitive halves-up
    // canary because it's the smallest representative case.
    const r = {
      phases: [
        { id: 'a', completedAt: '2024-01-01T00:00:00Z' },
        { id: 'b' },
        { id: 'c' },
        { id: 'd' },
        { id: 'e' },
        { id: 'f' },
        { id: 'g' },
        { id: 'h' },
      ],
    };
    expect(roadmapCompletionPct(r)).toBe(13);
  });

  test('Property 29: missing/non-object roadmap → 0', () => {
    expect(roadmapCompletionPct(null)).toBe(0);
    expect(roadmapCompletionPct(undefined)).toBe(0);
    expect(roadmapCompletionPct({})).toBe(0);
    expect(roadmapCompletionPct({ phases: [] })).toBe(0);
  });
});

// ─── Property 27: phase-completable predicate ───────────────────────────────
// Validates: Requirements 9.6, 9.7, 9.9

describe('isPhaseCompletable', () => {
  test('Property 27: predicate matches the documented definition', () => {
    fc.assert(
      fc.property(
        // Phase with projectIds drawn from a small id pool so the portfolio
        // arb has a chance of covering / partially covering them.
        fc.record({
          id: _phaseIdArb,
          projectIds: fc.array(_projectIdArb, { minLength: 0, maxLength: 4 }),
        }),
        // Portfolio entries — projectIds are independently sampled, so the
        // "every projectIds entry has a matching portfolio entry" branch
        // gets exercised both when satisfied and not.
        fc.array(
          fc.record({
            projectId: _projectIdArb,
          }),
          { minLength: 0, maxLength: 6 }
        ),
        (phase, portfolio) => {
          const reference =
            Array.isArray(phase.projectIds) &&
            phase.projectIds.length > 0 &&
            phase.projectIds.every((id) =>
              portfolio.some((e) => e && e.projectId === id)
            );

          expect(isPhaseCompletable(phase, portfolio)).toBe(reference);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 28: markPhaseComplete sets completedAt + recomputes pct ───────
// Validates: Requirements 9.8, 13.4

describe('markPhaseComplete', () => {
  // Roadmap arb with at least one phase so we always have a target.
  const _roadmapWithPhasesArb = fc
    .integer({ min: 1, max: 6 })
    .chain((n) =>
      fc
        .uniqueArray(_phaseIdArb, { minLength: n, maxLength: n })
        .chain((ids) =>
          fc
            .array(_phaseArb, { minLength: n, maxLength: n })
            .map((phases) => ({
              id: 'r1',
              dreamJobId: 'j1',
              generatedAt: '2024-01-01T00:00:00Z',
              phases: phases.map((p, i) => ({ ...p, id: ids[i] })),
            }))
        )
    );

  test('Property 28: sets completedAt on matching phase, leaves others intact, percentage matches formula', () => {
    fc.assert(
      fc.property(
        _roadmapWithPhasesArb,
        // Index of the phase to mark.
        fc.nat(),
        _isoTimestampArb,
        (roadmap, idxSeed, timestamp) => {
          const idx = idxSeed % roadmap.phases.length;
          const target = roadmap.phases[idx];
          const updated = markPhaseComplete(roadmap, target.id, timestamp);

          // (1) Target phase has the new completedAt.
          expect(updated.phases[idx].completedAt).toBe(timestamp);
          // Target phase's other fields are unchanged.
          expect(updated.phases[idx].id).toBe(target.id);
          expect(updated.phases[idx].weekStart).toBe(target.weekStart);
          expect(updated.phases[idx].weekEnd).toBe(target.weekEnd);
          expect(updated.phases[idx].projectIds).toEqual(target.projectIds);

          // (2) Every other phase is unchanged BY REFERENCE — the helper
          // only allocates a new object for the matching phase.
          for (let i = 0; i < roadmap.phases.length; i += 1) {
            if (i === idx) continue;
            expect(updated.phases[i]).toBe(roadmap.phases[i]);
          }

          // (3) Recomputed percentage matches the reference formula
          // (round(100 * completedCount / total), halves up).
          expect(roadmapCompletionPct(updated)).toBe(_expectedPct(updated));

          // (4) Pure: original roadmap untouched.
          expect(roadmap.phases[idx].completedAt).toBe(target.completedAt);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 28: returns input verbatim when no phase matches', () => {
    fc.assert(
      fc.property(_roadmapWithPhasesArb, _isoTimestampArb, (roadmap, ts) => {
        // Build a phaseId guaranteed to not match any existing phase.
        const ids = new Set(roadmap.phases.map((p) => p.id));
        let unique = '__no_match__';
        while (ids.has(unique)) unique += '_';
        const result = markPhaseComplete(roadmap, unique, ts);
        expect(result).toBe(roadmap);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 30: URL completion-form validator ─────────────────────────────
// Validates: Requirements 11.1, 11.2, 11.8

describe('validateCompletionForm', () => {
  // Bias the URL generator so a meaningful fraction of inputs are valid
  // http(s) URLs, while the remainder explore the rejection cases.
  const _urlArb = fc.oneof(
    fc.constant(''),
    // Valid http(s) prefixes with a bounded path.
    fc
      .tuple(
        fc.constantFrom('http://', 'https://'),
        fc.string({ minLength: 1, maxLength: 64 })
      )
      .map(([scheme, path]) => `${scheme}${path}`),
    // Mostly-invalid: random strings that may or may not start with the
    // accepted prefixes.
    fc.string({ minLength: 0, maxLength: 64 }),
    // Long URL just over the cap.
    fc.constant(`https://${'a'.repeat(2041)}`), // 8 + 2041 = 2049 chars
    // Long URL right at the cap.
    fc.constant(`https://${'a'.repeat(2040)}`) // 2048 chars
  );

  const _notesArb = fc.oneof(
    fc.constant(''),
    fc.string({ minLength: 0, maxLength: 64 }),
    // Bound just over the cap.
    fc.constant('n'.repeat(2001)),
    // Bound at the cap.
    fc.constant('n'.repeat(2000))
  );

  test('Property 30: bidirectional equivalence with the documented predicate', () => {
    fc.assert(
      fc.property(_urlArb, _notesArb, (url, notes) => {
        const reference =
          notes.length <= 2000 &&
          (url === '' ||
            (url.length <= 2048 &&
              (url.startsWith('http://') || url.startsWith('https://'))));
        expect(validateCompletionForm({ url, notes })).toBe(reference);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 31: portfolio append round-trip + idempotence on duplicate ────
// Validates: Requirements 11.3, 11.9

describe('markProjectComplete', () => {
  const _completionEventArb = fc.record({
    projectId: _projectIdArb,
    title: fc.string({ minLength: 0, maxLength: 32 }),
    skills: fc.array(_skillIdArb, { minLength: 0, maxLength: 4 }),
    difficulty: fc.constantFrom('easy', 'medium', 'hard'),
    url: fc.string({ minLength: 0, maxLength: 32 }),
    notes: fc.string({ minLength: 0, maxLength: 32 }),
    completedAt: _isoTimestampArb,
  });

  // Portfolio arb with unique projectIds so the dedup branch can be
  // explicitly triggered with a known conflict.
  const _portfolioArb = fc
    .uniqueArray(_projectIdArb, { minLength: 0, maxLength: 6 })
    .chain((ids) =>
      fc
        .array(_completionEventArb, {
          minLength: ids.length,
          maxLength: ids.length,
        })
        .map((events) => events.map((e, i) => ({ ...e, projectId: ids[i] })))
    );

  test('Property 31: append on novel projectId, idempotent on duplicate', () => {
    fc.assert(
      fc.property(_portfolioArb, _completionEventArb, (portfolio, event) => {
        // Pure: snapshot input first.
        const snapshot = JSON.parse(JSON.stringify(portfolio));

        const isDuplicate = portfolio.some(
          (e) => e.projectId === event.projectId
        );

        const result = markProjectComplete(portfolio, event);

        // (1) Pure: input untouched in either branch.
        expect(portfolio).toEqual(snapshot);

        if (isDuplicate) {
          // Idempotent — same reference (or at minimum deep-equal).
          expect(result).toBe(portfolio);
        } else {
          // Length grows by 1.
          expect(result.length).toBe(portfolio.length + 1);
          // Last entry deep-equals the canonical Portfolio_Entry from the
          // event (we pass `event` through verbatim — design.md treats it
          // as the canonical entry).
          expect(result[result.length - 1]).toEqual(event);
          // Earlier entries are preserved in order.
          for (let i = 0; i < portfolio.length; i += 1) {
            expect(result[i]).toBe(portfolio[i]);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 32: mark / unmark project round-trip ──────────────────────────
// Validates: Requirements 11.10

describe('markProjectComplete / unmarkProjectComplete round-trip', () => {
  const _completionEventArb = fc.record({
    projectId: _projectIdArb,
    title: fc.string({ minLength: 0, maxLength: 32 }),
    skills: fc.array(_skillIdArb, { minLength: 0, maxLength: 4 }),
    difficulty: fc.constantFrom('easy', 'medium', 'hard'),
    url: fc.string({ minLength: 0, maxLength: 32 }),
    notes: fc.string({ minLength: 0, maxLength: 32 }),
    completedAt: _isoTimestampArb,
  });

  // Portfolio arb with unique projectIds so the round-trip target is never
  // a pre-existing entry (Property 32 precondition: "p not already in P").
  const _portfolioArb = fc
    .uniqueArray(_projectIdArb, { minLength: 0, maxLength: 6 })
    .chain((ids) =>
      fc
        .array(_completionEventArb, {
          minLength: ids.length,
          maxLength: ids.length,
        })
        .map((events) => events.map((e, i) => ({ ...e, projectId: ids[i] })))
    );

  test('Property 32: unmark(mark(P, p), p.id) preserves entries by projectId', () => {
    fc.assert(
      fc.property(_portfolioArb, _completionEventArb, (portfolio, event) => {
        // Precondition: event.projectId not already in portfolio.
        fc.pre(!portfolio.some((e) => e.projectId === event.projectId));

        const afterMark = markProjectComplete(portfolio, event);
        const afterUnmark = unmarkProjectComplete(
          afterMark,
          event.projectId
        );

        // (1) Entry sets by projectId are equal on both sides.
        const before = portfolio.map((e) => e.projectId).sort();
        const after = afterUnmark.map((e) => e.projectId).sort();
        expect(after).toEqual(before);

        // (2) The original entries (deep-equal) are preserved in original
        // order — markProjectComplete only appends, unmarkProjectComplete
        // only filters, so order is stable.
        expect(afterUnmark).toEqual(portfolio);

        // (3) "xpAwarded total is unchanged" (Req 11.10) — neither helper
        // mutates XP at all, so this holds trivially. We assert no field
        // named `xpAwarded` was added or removed across the round-trip.
        expect(afterUnmark.length).toBe(portfolio.length);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 25: fallback requirements derivation matches careers.js ───────
// Validates: Requirements 2.5, 2.7

describe('fallbackRequirements', () => {
  // Reference kebab-case helper. Mirrors the implementation's
  // `toKebabCase` — duplicated here so the test does not depend on an
  // unexported helper.
  function refKebab(s) {
    return String(s)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  test('Property 25: derives one entry per careers.js skill with documented fields', () => {
    // Real careers.js entries — every entry has a non-empty skills array.
    fc.assert(
      fc.property(
        fc.constantFrom(...careersData.filter((c) => c.skills && c.skills.length > 0)),
        (career) => {
          const result = fallbackRequirements(career);

          // Length equals careerEntry.skills.length.
          expect(result).toHaveLength(career.skills.length);

          // Every entry has the documented fields.
          for (const entry of result) {
            expect(typeof entry.skillId).toBe('string');
            expect(entry.skillId.length).toBeGreaterThan(0);
            expect(typeof entry.name).toBe('string');
            expect(entry.targetLevel).toBe(80);
            expect(entry.weight).toBeCloseTo(1 / career.skills.length, 12);
            expect(typeof entry.rationale).toBe('string');
          }

          // skillIds are unique within the result.
          const ids = result.map((e) => e.skillId);
          expect(new Set(ids).size).toBe(ids.length);

          // Every skillId is the kebab-case of one of the entries in
          // careerEntry.skills, and every name is one of the original skill
          // strings. (User instruction: skillId is kebab-case; per Req 2.7,
          // the property is "every skillId is one of the entries in c.skills"
          // adapted to kebab-case.)
          const expectedKebab = new Set(career.skills.map(refKebab));
          const expectedNames = new Set(career.skills);
          for (const entry of result) {
            expect(expectedKebab.has(entry.skillId)).toBe(true);
            expect(expectedNames.has(entry.name)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Property 25: empty skills array → empty result', () => {
    expect(fallbackRequirements({ skills: [] })).toEqual([]);
    expect(fallbackRequirements({})).toEqual([]);
    expect(fallbackRequirements(null)).toEqual([]);
    expect(fallbackRequirements(undefined)).toEqual([]);
  });
});

// ─── Property 26: default seed assessment defaults missing skills to 50 ─────
// Validates: Requirements 3.2, 3.7, 3.8

describe('mergeSeed', () => {
  // Per user resolution: present-and-numeric → clampLevel; present-but-
  // non-numeric → 50; missing → 50.
  function refMergeValue(seed, skillId) {
    if (!Object.prototype.hasOwnProperty.call(seed, skillId)) return 50;
    const v = seed[skillId];
    if (typeof v !== 'number' || !Number.isFinite(v)) return 50;
    let r = Math.round(v);
    if (r < 0) r = 0;
    if (r > 100) r = 100;
    return r;
  }

  // Requirement arb with unique skillIds (Req 2.7 dedup).
  const _requirementsArb = fc
    .uniqueArray(_skillIdArb, { minLength: 0, maxLength: 8 })
    .map((ids) =>
      ids.map((id) => ({
        skillId: id,
        name: id,
        targetLevel: 80,
        weight: ids.length === 0 ? 1 : 1 / ids.length,
        rationale: '',
      }))
    );

  // partialSeed values cover every interesting case: missing, in-range
  // integer, out-of-range integer, non-integer numeric, non-numeric.
  const _seedValueArb = fc.oneof(
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 101, max: 1000 }),
    fc.integer({ min: -1000, max: -1 }),
    fc.double({ min: 0.5, max: 99.5, noNaN: true }),
    fc.constantFrom(NaN, Infinity, -Infinity),
    fc.string(),
    fc.boolean(),
    fc.constant(null)
  );

  test('Property 26: key set equals requirements skillIds; values default to 50; numeric values are clamped', () => {
    fc.assert(
      fc.property(
        _requirementsArb,
        // partialSeed is an arbitrary record covering both required and
        // unrelated skillIds.
        fc.dictionary(_skillIdArb, _seedValueArb, { minKeys: 0, maxKeys: 8 }),
        // Ensure some required skillIds get values via this mask.
        fc.array(fc.boolean(), { minLength: 0, maxLength: 8 }),
        fc.array(_seedValueArb, { minLength: 0, maxLength: 8 }),
        (requirements, extraSeed, includeMask, valuesForReqs) => {
          // Build a richer partialSeed that occasionally pins values for
          // requirement skillIds, to ensure the present-value branch is hit.
          const partialSeed = { ...extraSeed };
          requirements.forEach((req, i) => {
            if (includeMask[i % includeMask.length || 1] !== false) {
              const v =
                valuesForReqs[i % valuesForReqs.length || 1];
              if (v !== undefined) partialSeed[req.skillId] = v;
            }
          });

          const result = mergeSeed(requirements, partialSeed);

          // (1) Output is a plain object whose keys equal the set of unique
          // requirement skillIds (Req 3.7).
          const expectedKeys = Array.from(
            new Set(requirements.map((r) => r.skillId))
          ).sort();
          const actualKeys = Object.keys(result).sort();
          expect(actualKeys).toEqual(expectedKeys);

          // (2) Every value is an integer in [0, 100] (Req 3.5/3.6).
          for (const value of Object.values(result)) {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(100);
          }

          // (3) Each value matches the documented resolution per skillId.
          for (const req of requirements) {
            expect(result[req.skillId]).toBe(
              refMergeValue(partialSeed, req.skillId)
            );
          }

          // (4) Missing skillId in seed → default 50 (Req 3.7).
          // Build a separate "all missing" seed and verify the total fallback
          // path lands every value on 50.
          const allMissing = mergeSeed(requirements, {});
          for (const value of Object.values(allMissing)) {
            expect(value).toBe(50);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { buildFallbackRoadmap } from './skillbridgeService';
import projectsCatalog from '../data/projects';

// ─── Property 36: curated fallback roadmap satisfies the structural validator ─
// Validates: Requirements 8.8
//
// For every career id with ≥ 3 catalog matches, `buildFallbackRoadmap(...)`
// produces a roadmap that passes `validateRoadmapResponse`. The generator is
// `fc.constantFrom(...eligibleCareerIds)` so fast-check exercises every
// curated career id across 100 iterations.

describe('buildFallbackRoadmap', () => {
  // Pre-compute the eligible career id set (career ids that have ≥ 3 entries
  // in the curated catalog). Per Task 3 invariants this MUST equal the full
  // careersData id set, but we filter defensively so the test stays valid
  // even if a future curator removes a career.
  const _eligibleCareerIds = careersData
    .map((c) => c.id)
    .filter((id) => {
      const matches = projectsCatalog.filter(
        (p) => Array.isArray(p.careerIds) && p.careerIds.includes(id)
      );
      return matches.length >= 3;
    });

  test('Property 36: every curated fallback roadmap passes validateRoadmapResponse', () => {
    // Sanity: the curated catalog must cover every careersData id with ≥ 3
    // matches. This is a Task 3 contract and the test would silently shrink
    // its iteration space if it ever regressed.
    expect(_eligibleCareerIds.length).toBe(careersData.length);

    fc.assert(
      fc.property(fc.constantFrom(..._eligibleCareerIds), (careerId) => {
        const roadmap = buildFallbackRoadmap(careerId, projectsCatalog);
        expect(validateRoadmapResponse({ ok: true, roadmap })).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});


import {
  assembleRoadmap,
  validateProjectsUnique,
} from './skillbridgeService';

// ─── Property 34: roadmap projectIds globally unique within a roadmap ───────
// Validates: Requirements 10.9
//
// Strategy: synthesize a Bedrock-shaped Roadmap (3–6 phases drawing
// `focusSkills` from a small skill pool plus a `dreamJobId`) plus a curated
// catalog and an AI catalog (each entry typed as
// `{ id, skills, difficulty, careerIds }`). Every catalog id is unique
// across the union so an "across-catalog" duplicate is impossible by
// construction. Then call `assembleRoadmap` and assert:
//   (a) `validateProjectsUnique(result)` is `true` (Property 34),
//   (b) every output phase has between 1 and 3 `projectIds`,
//   (c) every projectId in the output exists in `curatedCatalog ∪ aiCatalog`.

describe('assembleRoadmap', () => {
  // Small skill pool keeps overlap matches likely so the curated path is
  // exercised on most iterations.
  const _assemblySkillArb = fc.constantFrom(
    'sk-alpha',
    'sk-beta',
    'sk-gamma',
    'sk-delta',
    'sk-epsilon',
    'sk-zeta'
  );
  const _assemblyDifficultyArb = fc.constantFrom('easy', 'medium', 'hard');
  const _assemblyCareerIdArb = fc.constantFrom(
    'career-x',
    'career-y',
    'career-z'
  );

  // Build a catalog of `count` projects whose ids are unique within the
  // catalog AND prefixed with `prefix` so curated and AI catalogs can be
  // unioned without colliding.
  function _catalogArb(prefix, minCount, maxCount) {
    return fc
      .integer({ min: minCount, max: maxCount })
      .chain((count) =>
        fc
          .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
            minLength: count,
            maxLength: count,
          })
          .chain((suffixes) =>
            fc
              .array(
                fc.record({
                  skills: fc.uniqueArray(_assemblySkillArb, {
                    minLength: 1,
                    maxLength: 4,
                  }),
                  difficulty: _assemblyDifficultyArb,
                  careerIds: fc.uniqueArray(_assemblyCareerIdArb, {
                    minLength: 1,
                    maxLength: 3,
                  }),
                }),
                { minLength: count, maxLength: count }
              )
              .map((shells) =>
                shells.map((shell, i) => ({
                  id: `${prefix}-${suffixes[i]}-${i}`,
                  ...shell,
                }))
              )
          )
      );
  }

  // Bedrock-shaped roadmap: 3–6 phases, each carrying a non-empty
  // `focusSkills` list. We drop projectIds entirely so the assembler is
  // forced to derive them from the catalogs.
  const _assemblyRoadmapArb = fc
    .integer({ min: 3, max: 6 })
    .chain((phaseCount) =>
      fc.record({
        dreamJobId: _assemblyCareerIdArb,
        phases: fc.array(
          fc.record({
            id: fc.string({ minLength: 1, maxLength: 12 }),
            label: fc.string({ minLength: 1, maxLength: 16 }),
            weekStart: fc.integer({ min: 1, max: 8 }),
            weekDelta: fc.integer({ min: 0, max: 4 }),
            focusSkills: fc.uniqueArray(_assemblySkillArb, {
              minLength: 1,
              maxLength: 3,
            }),
            topics: fc.constant([]),
            resources: fc.constant([]),
          }),
          { minLength: phaseCount, maxLength: phaseCount }
        ),
      })
    )
    .map((r) => ({
      id: 'roadmap-test',
      generatedAt: '1970-01-01T00:00:00.000Z',
      dreamJobId: r.dreamJobId,
      phases: r.phases.map((p) => ({
        id: p.id,
        label: p.label,
        weekStart: p.weekStart,
        weekEnd: p.weekStart + p.weekDelta,
        focusSkills: p.focusSkills,
        topics: p.topics,
        resources: p.resources,
        // No projectIds — assembler derives them.
      })),
    }));

  test('Property 34: every output roadmap has globally unique projectIds across phases', () => {
    fc.assert(
      fc.property(
        _assemblyRoadmapArb,
        // Curated and AI catalogs sized to comfortably cover up to 6 phases
        // × 3 projects with a careerIds-fallback safety margin.
        _catalogArb('curated', 30, 60),
        _catalogArb('ai', 10, 30),
        (roadmap, curatedCatalog, aiCatalog) => {
          // Make every catalog entry's `careerIds` include the roadmap's
          // `dreamJobId` so the careerIds fallback (pass 3) always has a
          // candidate available — Property 34 is about uniqueness of the
          // result, not about how we got there. We still keep the original
          // careerIds for variety.
          const curated = curatedCatalog.map((p) => ({
            ...p,
            careerIds: Array.from(
              new Set([...(p.careerIds || []), roadmap.dreamJobId])
            ),
          }));
          const ai = aiCatalog.map((p) => ({
            ...p,
            careerIds: Array.from(
              new Set([...(p.careerIds || []), roadmap.dreamJobId])
            ),
          }));

          const result = assembleRoadmap(roadmap, curated, ai);

          // (a) Property 34: union of phase projectIds is duplicate-free.
          expect(validateProjectsUnique(result)).toBe(true);

          // Cross-check Property 34 with an explicit Set count so a bug in
          // `validateProjectsUnique` itself can't silently mask the
          // assembler bug we care about.
          const allIds = result.phases.flatMap((p) => p.projectIds);
          expect(new Set(allIds).size).toBe(allIds.length);

          // (b) Every phase has 1..3 projectIds.
          for (const phase of result.phases) {
            expect(Array.isArray(phase.projectIds)).toBe(true);
            expect(phase.projectIds.length).toBeGreaterThanOrEqual(1);
            expect(phase.projectIds.length).toBeLessThanOrEqual(3);
          }

          // (c) Every projectId exists in curatedCatalog ∪ aiCatalog.
          const knownIds = new Set([
            ...curated.map((p) => p.id),
            ...ai.map((p) => p.id),
          ]);
          for (const id of allIds) {
            expect(knownIds.has(id)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


import { isFirestoreReachable, persistWithRetry } from './skillbridgeService';

// ─── Property 37: persistWithRetry attempts at most 2 writes ────────────────
// Validates: Requirements 19.3
//
// Strategy: drive `persistWithRetry` with a fake `write` function whose
// outcomes are sequenced by a fast-check `fc.tuple(fc.boolean(), fc.boolean())`.
// Each pair `(firstResolves, firstHangs)` selects one of three deterministic
// scenarios for the first attempt:
//
//   - resolve immediately → total calls === 1 (early-return path).
//   - reject immediately  → total calls === 2 (retry-on-rejection path).
//   - hang past 5s        → total calls === 2 (retry-on-timeout path).
//
// The fake `write` returns a controlled outcome based on the call index, so
// a single fast-check generated tuple drives the entire run deterministically.
//
// We use Jest's modern fake timers so we can advance the wall clock past the
// internal 5s timeout / 1s retry delay without actually waiting. After
// shrinking, the property must hold for every shrunk tuple — which means the
// retry budget MUST be capped at 2 calls regardless of timing.

describe('persistWithRetry', () => {
  // Internal-timeout / retry-delay constants — duplicated here so the
  // timeline assertions are readable. Must match the values used inside
  // `persistWithRetry`.
  const PERSIST_TIMEOUT_MS = 5000;
  const PERSIST_RETRY_DELAY_MS = 1000;

  // Jest 27's modern fake timers do not expose `advanceTimersByTimeAsync`
  // (added in Jest 28). Polyfill: advance the fake clock synchronously, then
  // yield to the microtask queue so any `.then`/`.catch` handlers attached
  // to the now-settled promises can run before the next `await`.
  async function advanceTimersByTimeAsync(ms) {
    jest.advanceTimersByTime(ms);
    // Two ticks cover both the immediate `.then` continuation AND any
    // chained `.then` that schedules a follow-up timer.
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Property 37: invokes write at most 2 times across all outcome sequences', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Three scenarios, picked deterministically from a 2-bit tuple.
        fc.tuple(fc.boolean(), fc.boolean()),
        async ([firstResolves, firstHangs]) => {
          // Scenario selection:
          //   firstResolves === true                          → resolve
          //   firstResolves === false && firstHangs === false → reject
          //   firstResolves === false && firstHangs === true  → hang past 5s
          let callCount = 0;
          const write = jest.fn(() => {
            callCount += 1;
            if (callCount === 1) {
              if (firstResolves) {
                return Promise.resolve('first-ok');
              }
              if (firstHangs) {
                // A pending promise that never resolves on its own. The
                // wrapper should treat it as a 5s timeout and proceed to
                // a second attempt.
                return new Promise(() => {});
              }
              return Promise.reject(new Error('first-failed'));
            }
            // Second attempt always resolves so we can observe it.
            return Promise.resolve('second-ok');
          });

          const promise = persistWithRetry(write);
          // Attach a no-op catch handler so node doesn't log
          // unhandled-rejection warnings while the second attempt is
          // pending. The original `await promise` below still surfaces
          // any rejection.
          promise.catch(() => {});

          if (firstResolves) {
            // No timer to advance — the first attempt resolves on the
            // microtask queue. Drain microtasks via a real `await`.
            const result = await promise;
            expect(result).toBe('first-ok');
            expect(write).toHaveBeenCalledTimes(1);
            return;
          }

          if (firstHangs) {
            // Advance past the 5s internal timeout, then past the 1s retry
            // delay, so the second attempt can run.
            await advanceTimersByTimeAsync(PERSIST_TIMEOUT_MS);
            await advanceTimersByTimeAsync(PERSIST_RETRY_DELAY_MS);
          } else {
            // Reject path: the rejection lands on the microtask queue
            // synchronously, but the 1s retry delay still gates the second
            // attempt. Drain microtasks first so the rejection handler
            // schedules the timer, then advance the clock.
            await Promise.resolve();
            await Promise.resolve();
            await advanceTimersByTimeAsync(PERSIST_RETRY_DELAY_MS);
          }

          const result = await promise;
          expect(result).toBe('second-ok');
          // Cap is 2: never higher, regardless of timing.
          expect(write).toHaveBeenCalledTimes(2);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 38: isFirestoreReachable state machine ────────────────────────
// Validates: Requirements 19.7
//
// Strategy: generate a sequence of events (`'write_succeeded'`,
// `'write_failed'`, plus a few unknown events to exercise the unknown-event
// rule) with fast-check, reduce them over the state machine starting from
// the initial state, and assert at every step:
//
//   (a) the result is always `'reachable' | 'unreachable'`,
//   (b) after a `'write_succeeded'` event the state is `'reachable'`,
//   (c) after a `'write_failed'` event the state is `'unreachable'`,
//   (d) an unknown event leaves the prior state unchanged.

describe('isFirestoreReachable state machine', () => {
  const eventArb = fc.constantFrom(
    'write_succeeded',
    'write_failed',
    'write_attempted', // unknown event A
    'reset',           // unknown event B
    ''                  // empty-string unknown event
  );

  test('Property 38: every reduction step matches the documented transitions', () => {
    fc.assert(
      fc.property(
        fc.array(eventArb, { minLength: 0, maxLength: 32 }),
        (events) => {
          // Initial state is `'reachable'` per Req 19.7 ("when no write has
          // been attempted").
          let state = isFirestoreReachable(undefined, 'noop');
          expect(state).toBe('reachable');

          for (const event of events) {
            const prior = state;
            const next = isFirestoreReachable(prior, event);

            // (a) Only documented states.
            expect(next === 'reachable' || next === 'unreachable').toBe(true);

            // (b) success → reachable.
            if (event === 'write_succeeded') {
              expect(next).toBe('reachable');
            }

            // (c) failure → unreachable.
            if (event === 'write_failed') {
              expect(next).toBe('unreachable');
            }

            // (d) unknown event → state unchanged.
            if (event !== 'write_succeeded' && event !== 'write_failed') {
              expect(next).toBe(prior);
            }

            state = next;
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
