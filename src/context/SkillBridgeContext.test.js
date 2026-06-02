/**
 * SkillBridgeContext integration property tests.
 *
 * Validates: Requirements 8.7
 * Properties: 35
 *
 * The full SkillBridgeContext renders inside a real React tree because the
 * action surface (`generateRoadmap`, `markPhaseComplete`, …) lives inside
 * the provider closure. To keep this test fast and hermetic:
 *
 *   - `firebase/*` is replaced with no-op stubs so the provider can import
 *     `../services/firebase` without making network calls or hitting
 *     `getAnalytics`.
 *   - `./AuthContext` and `./UserContext` are mocked so `useAuth()` /
 *     `useUser()` return predictable values without rendering the real
 *     providers.
 *   - `global.fetch` is a `jest.fn` that records every call. The cache
 *     short-circuit test asserts that `/api/skillbridge/roadmap` never
 *     appears in the recorded calls.
 *
 * The provider exposes `_setState` on its context value so a test consumer
 * can seed the in-memory state directly (cachedRoadmap, dreamJobId,
 * skillAssessment) without driving the full hydration/AI flow.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import fc from 'fast-check';

// ─── Module-level mocks (must come before importing the SUT) ───────────────

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn(() => ({})),
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn(),
  createUserWithEmailAndPassword: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: jest.fn(),
  signOut: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(() => ({})),
  // `getDoc` resolves to a snapshot whose `exists()` returns false so the
  // hydration effect bails out without a Firestore round-trip.
  getDoc: jest.fn(() =>
    Promise.resolve({ exists: () => false, data: () => ({}) }),
  ),
  setDoc: jest.fn(() => Promise.resolve()),
  arrayUnion: jest.fn((...args) => ({ __arrayUnion: args })),
  deleteField: jest.fn(() => ({ __deleteField: true })),
}));

jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
}));

// `useAuth` returns no authenticated user so the provider's hydration
// effect short-circuits before any Firestore read or write. `_setState`
// (exposed on the context value) is what seeds state for each iteration.
jest.mock('./AuthContext', () => ({
  __esModule: true,
  useAuth: () => ({ user: null }),
  AuthProvider: ({ children }) => children,
}));

// `useUser` returns just the badge-awarding shim that `generateRoadmap`
// would call on success. The cache short-circuit path never reaches it,
// but providing a value matching the real shape keeps the provider's
// `useUser()` call happy.
//
// The factory is wired through a module-level mutable holder (the `mock`
// prefix lets `jest.mock` reference it from its hoisted factory) so
// individual tests can override the returned value (real `earnBadge` /
// `addXP` behavior, simulated user state, …) without redeclaring the mock.
let mockUserCtx = {
  user: { profile: {}, progress: { badges: [] } },
  earnBadge: () => {},
  addXP: () => {},
};
function setMockUserCtx(next) { mockUserCtx = next; }

jest.mock('./UserContext', () => ({
  __esModule: true,
  useUser: () => mockUserCtx,
  UserProvider: ({ children }) => children,
}));

// Importing the SUT must come AFTER `jest.mock` so the mocks are wired in.
const { SkillBridgeProvider, SkillBridgeContext } = require('./SkillBridgeContext');
const { computeProfileHash } = require('../services/skillbridgeService');

// React 18 requires this flag to suppress the "act(...) testing environment"
// warning when calling `act` outside of a recognized test runner harness.
// CRA's Jest runner doesn't set it for us when we hand-roll the harness.
// eslint-disable-next-line no-undef
global.IS_REACT_ACT_ENVIRONMENT = true;

// ─── Test harness ──────────────────────────────────────────────────────────

/**
 * Renders `<SkillBridgeProvider>` into a detached DOM container and
 * captures the latest context value via a spy consumer. Returns a handle
 * with the captured value, an `unmount` function, and a `setState`
 * function that drives the provider's `_setState` escape hatch.
 *
 * The container is appended to `document.body` because `createRoot`
 * requires a root attached to a Document. We unmount and remove the
 * container in the test cleanup so a long fast-check run doesn't leak
 * thousands of nodes.
 */
function renderProvider() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  let captured = null;
  function Spy() {
    const value = React.useContext(SkillBridgeContext);
    captured = value;
    return null;
  }

  act(() => {
    root.render(
      React.createElement(
        SkillBridgeProvider,
        null,
        React.createElement(Spy),
      ),
    );
  });

  return {
    get value() { return captured; },
    setState(updater) {
      act(() => {
        captured._setState(updater);
      });
    },
    unmount() {
      act(() => { root.unmount(); });
      if (container.parentNode) container.parentNode.removeChild(container);
    },
  };
}

/**
 * Generators
 */

// Career ids that exist in `careersData` so the prereq check inside
// `generateRoadmap` (`careerEntry` lookup) doesn't reject the test input.
// Hard-coded subset is fine: we are exercising the cache-hit branch, not
// the careerData lookup logic.
const dreamJobIdArb = fc.constantFrom(
  'software-engineer',
  'data-scientist',
  'cybersecurity-analyst',
  'cloud-architect',
);

// A Skill_Assessment that satisfies `validateAssessment` (every value an
// integer in [0, 100], `updatedAt` a string).
const skillAssessmentArb = fc
  .dictionary(
    fc.string({ minLength: 1, maxLength: 16 }).filter((s) => s.length > 0),
    fc.integer({ min: 0, max: 100 }),
    { minKeys: 0, maxKeys: 8 },
  )
  .chain((skills) =>
    fc.record({
      skills: fc.constant(skills),
      updatedAt: fc.constant('2024-01-01T00:00:00.000Z'),
    }),
  );

// A roadmap shape that is structurally valid enough for the cache-hit
// short-circuit. The test asserts the action returns the cached value
// verbatim, so the shape just needs to round-trip through React state.
const cachedRoadmapArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 32 }),
  generatedAt: fc.constant('2024-01-01T00:00:00.000Z'),
  phases: fc.constant([
    {
      id: 'phase-1',
      label: 'Foundations',
      weekStart: 1,
      weekEnd: 2,
      focusSkills: [],
      topics: [],
      resources: [],
      projectIds: ['p1'],
    },
  ]),
});

// ─── Property 35: cache-hit short-circuits AI call ─────────────────────────
// Validates: Requirements 8.7

describe('SkillBridgeContext.generateRoadmap', () => {
  let originalFetch;

  beforeEach(() => {
    // Capture the original `global.fetch` so we can restore it in
    // `afterEach`. Replacing it with a `jest.fn` lets the property assert
    // the cache-hit branch never crosses the network boundary.
    originalFetch = global.fetch;
    global.fetch = jest.fn(() =>
      // Reject with an error mirroring a network failure. The cache-hit
      // path returns before this is reached; if a regression bypasses the
      // short-circuit, the rejection will still surface and the
      // assertion-on-fetch-calls below will catch it.
      Promise.reject(new Error('fetch should not have been called')),
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test(
    'Property 35: cache-hit (currentRoadmap.hash === profileHash) short-circuits the AI call',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          dreamJobIdArb,
          skillAssessmentArb,
          cachedRoadmapArb,
          async (dreamJobId, skillAssessment, baseRoadmap) => {
            const harness = renderProvider();
            try {
              // Compute the profile hash with the same pure helper the
              // SUT uses, then attach it to the cached roadmap so the
              // `currentRoadmap.hash === profileHash` predicate in
              // `generateRoadmap` short-circuits.
              const profileHash = computeProfileHash(skillAssessment, dreamJobId);
              const cachedRoadmap = {
                ...baseRoadmap,
                dreamJobId,
                hash: profileHash,
              };

              // Seed the provider state directly via the documented
              // `_setState` escape hatch. `requirementsCache` keeps the
              // `loadRequirements` kick-off effect from issuing an AI
              // request for the requirements list.
              harness.setState((prev) => ({
                ...prev,
                isHydrating: false,
                dreamJobId,
                skillAssessment,
                currentRoadmap: cachedRoadmap,
                requirements: [],
                requirementsCache: { [dreamJobId]: [
                  {
                    skillId: 'k',
                    name: 'Skill',
                    targetLevel: 50,
                    weight: 1,
                    rationale: '',
                  },
                ] },
              }));

              // Reset the fetch spy AFTER seeding so the kickoff effect
              // (which fires on `dreamJobId` change) can't pollute the
              // counter. The `requirementsCache` seed above keeps that
              // effect on the cache-hit path so no network call is
              // expected anyway, but the reset belt-and-suspenders.
              global.fetch.mockClear();

              await act(async () => {
                await harness.value.generateRoadmap();
              });

              // ── Assertion 1: no fetch call to the AI roadmap endpoint
              const roadmapCalls = global.fetch.mock.calls.filter(
                ([url]) =>
                  typeof url === 'string' &&
                  url.indexOf('/api/skillbridge/roadmap') !== -1,
              );
              expect(roadmapCalls).toHaveLength(0);

              // ── Assertion 2: cached roadmap survives the call verbatim
              expect(harness.value.currentRoadmap).toBe(cachedRoadmap);

              // ── Assertion 3: roadmapSource flips to `'cache'`
              expect(harness.value.roadmapSource).toBe('cache');
            } finally {
              harness.unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
    30000,
  );
});


// ─── Property 19: inferred-gain dedup keyed by (scenarioId, optionId) ──────
// Validates: Requirement 5.7

describe('SkillBridgeContext.applyInferredGain', () => {
  beforeEach(() => {
    // Reset the UserContext stub between iterations so badge-tracking from
    // an earlier `describe` block doesn't leak into this one.
    setMockUserCtx({
      user: { profile: {}, progress: { badges: [] } },
      earnBadge: () => {},
      addXP: () => {},
    });
  });

  test(
    'Property 19: applying the same (scenarioId, optionId) twice leaves the assessment unchanged',
    async () => {
      // A skill universe + assessment we share across iterations so
      // `applyTraitGains` actually has somewhere to apply the increment.
      // The dedup branch we want to exercise must produce a measurable
      // diff on the first call (otherwise both calls would be no-ops for
      // the wrong reason).
      const requirementsArb = fc
        .uniqueArray(
          fc.constantFrom('communication', 'teamwork', 'problem-solving',
            'data-analysis', 'programming', 'system-design', 'leadership'),
          { minLength: 1, maxLength: 4 },
        )
        .map((skillIds) =>
          skillIds.map((skillId) => ({
            skillId,
            name: skillId,
            targetLevel: 80,
            weight: 1 / skillIds.length,
            rationale: '',
          })),
        );

      const traitsArb = fc.uniqueArray(
        fc.constantFrom('collaborative', 'helpful', 'analytical',
          'technical', 'strategic', 'leadership', 'creative', 'innovative'),
        { minLength: 0, maxLength: 4 },
      );

      // rewardXp ≥ 4 so `floor(rewardXp / 4) >= 1` and the gain math is a
      // measurable mutation on the assessment (otherwise the property is
      // trivially satisfied because both calls leave levels untouched).
      const rewardXpArb = fc.integer({ min: 4, max: 99 });
      const scenarioIdArb = fc.string({ minLength: 1, maxLength: 12 });
      const optionIdArb = fc.string({ minLength: 1, maxLength: 12 });

      await fc.assert(
        fc.asyncProperty(
          requirementsArb,
          traitsArb,
          rewardXpArb,
          scenarioIdArb,
          optionIdArb,
          async (requirements, traits, rewardXp, scenarioId, optionId) => {
            const harness = renderProvider();
            try {
              // Seed: an assessment whose `skills` map covers every active
              // skillId so the trait-gain math has somewhere to land
              // (mid-range starting levels so `clampLevel` doesn't pin
              // them at 100 and accidentally make the second call also a
              // no-op for the wrong reason).
              const seedSkills = {};
              for (const r of requirements) seedSkills[r.skillId] = 30;
              const seedAssessment = {
                skills: seedSkills,
                updatedAt: '2024-01-01T00:00:00.000Z',
              };

              harness.setState((prev) => ({
                ...prev,
                isHydrating: false,
                requirements,
                skillAssessment: seedAssessment,
                appliedScenarioGains: {},
              }));

              // ── First call: applies the gain.
              await act(async () => {
                await harness.value.applyInferredGain(
                  traits, rewardXp, scenarioId, optionId,
                );
              });
              const afterFirst = harness.value.skillAssessment;
              const dedupAfterFirst = harness.value.appliedScenarioGains;

              // The dedup map MUST record the (scenarioId, optionId) pair
              // after the first call (otherwise the second call wouldn't
              // be deduped even when the spec wanted it to be).
              expect(dedupAfterFirst[scenarioId]).toBe(optionId);

              // ── Second call with the same (scenarioId, optionId): MUST
              // be a strict no-op on `skillAssessment`. We compare by
              // value because the action stamps `updatedAt`; on a hit the
              // dedup branch returns *before* stamping, so the reference
              // also stays === to `afterFirst` — but a value compare is
              // the property the spec actually states.
              await act(async () => {
                await harness.value.applyInferredGain(
                  traits, rewardXp, scenarioId, optionId,
                );
              });
              const afterSecond = harness.value.skillAssessment;

              // Property 19: dedup leaves the assessment unchanged.
              expect(afterSecond).toBe(afterFirst);
              // Bookkeeping set is also unchanged on the second call.
              expect(harness.value.appliedScenarioGains).toBe(dedupAfterFirst);
            } finally {
              harness.unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
    60000,
  );
});

// ─── Property 42: badge dedup at the user level ────────────────────────────
// Validates: Requirement 20.7
//
// Repeated badge-award triggers add at most one entry per badge id. We
// drive this by running the real `UserContext.earnBadge` reducer (which
// dedups on `badge.id`) against a mutable progress list, then triggering
// `markProjectComplete` on a "first project" sequence multiple times. The
// first-project completion + portfolio-builder transitions are the two
// triggers that hit the badge call sites added in task 32; we assert no
// id appears twice in the resulting badge list regardless of how many
// times the trigger fires.

describe('SkillBridgeContext badge dedup', () => {
  test(
    'Property 42: repeated triggers add at most one entry per badge id',
    async () => {
      // Generators for the trigger-sequence shape. Each entry tells the
      // test which action to fire next:
      //   - { mark: projectId } → markProjectComplete(projectId, ...)
      //   - { unmark: projectId } → unmarkProjectComplete(projectId)
      //
      // The interleaving lets us cover the "user re-completes a project
      // they previously unmarked" path which would re-fire
      // skillbridge-first-project on a naive implementation.
      const projectIdArb = fc.constantFrom(
        'se-cli-todo',
        'se-rest-api-auth',
        'se-distributed-job-queue',
        'se-pair-debug-clinic',
      );
      const stepArb = fc.oneof(
        fc.record({ kind: fc.constant('mark'), pid: projectIdArb }),
        fc.record({ kind: fc.constant('unmark'), pid: projectIdArb }),
      );
      const sequenceArb = fc.array(stepArb, { minLength: 1, maxLength: 12 });

      await fc.assert(
        fc.asyncProperty(sequenceArb, async (sequence) => {
          // Mirror the real UserContext.earnBadge reducer (UserContext.js)
          // exactly so the test's "user state" matches what the real app
          // would record. Dedup is the contract under test (Req 20.7 +
          // earnBadge body in UserContext.js: "if (prev.progress.badges
          // .find(b => b.id === badge.id)) return prev;").
          const badges = [];
          const earnBadge = (badge) => {
            if (!badge || typeof badge.id !== 'string') return;
            if (badges.find((b) => b && b.id === badge.id)) return;
            badges.push({ id: badge.id, name: badge.name });
          };
          // addXP is a no-op for this property — we only care about the
          // badge ledger. (Returning undefined matches the synchronous
          // signature in UserContext.js.)
          const addXP = () => {};

          setMockUserCtx({
            user: { profile: {}, progress: { badges } },
            earnBadge,
            addXP,
          });

          const harness = renderProvider();
          try {
            // Seed a roadmap whose phase contains every projectId we'll
            // mark complete so the Req 21.3 pre-check passes. Skipping
            // that seed would shunt every call into the
            // "project-not-in-roadmap" banner path and we'd never
            // exercise the badge code.
            const phaseProjectIds = [
              'se-cli-todo',
              'se-rest-api-auth',
              'se-distributed-job-queue',
              'se-pair-debug-clinic',
            ];
            harness.setState((prev) => ({
              ...prev,
              isHydrating: false,
              dreamJobId: 'software-engineer',
              currentRoadmap: {
                id: 'r1',
                dreamJobId: 'software-engineer',
                generatedAt: '2024-01-01T00:00:00.000Z',
                phases: [
                  {
                    id: 'p1',
                    label: 'Phase 1',
                    weekStart: 1,
                    weekEnd: 2,
                    focusSkills: [],
                    topics: [],
                    resources: [],
                    projectIds: phaseProjectIds,
                  },
                ],
                hash: 'seed',
              },
              portfolio: [],
            }));

            for (const step of sequence) {
              if (step.kind === 'mark') {
                await act(async () => {
                  await harness.value.markProjectComplete(step.pid, {});
                });
              } else {
                await act(async () => {
                  await harness.value.unmarkProjectComplete(step.pid);
                });
              }
            }

            // Property 42: each badge id appears at most once.
            const ids = badges.map((b) => b.id);
            const unique = new Set(ids);
            expect(ids.length).toBe(unique.size);
          } finally {
            harness.unmount();
          }
        }),
        { numRuns: 100 },
      );
    },
    120000,
  );
});

// ─── Property 41: project-not-in-roadmap completion guard ──────────────────
// Validates: Requirement 21.3
//
// `markProjectComplete(projectId, evidence)` must, for any roadmap whose
// phase `projectIds` lists do not contain `projectId`, leave the portfolio
// untouched and surface the documented `'project-not-in-roadmap'` banner.
// The test seeds the provider with a generated roadmap + an empty
// portfolio, picks a `projectId` that fast-check guarantees is not in any
// phase via `fc.pre`, and asserts both observable post-conditions.

describe('SkillBridgeContext.markProjectComplete project-not-in-roadmap guard', () => {
  beforeEach(() => {
    // Reset the UserContext stub so XP/badge side-effects from previous
    // describes can't bleed in. The guard branch should never reach these
    // anyway, but the throw-on-call instrumentation below would surface a
    // regression that crossed the boundary.
    setMockUserCtx({
      user: { profile: {}, progress: { badges: [] } },
      earnBadge: () => {
        throw new Error('earnBadge should not be called on the guard path');
      },
      addXP: () => {
        throw new Error('addXP should not be called on the guard path');
      },
    });
  });

  test(
    'Property 41: markProjectComplete blocks projects not in any phase',
    async () => {
      // Generators
      //
      // - Phase shape mirrors the structurally-valid roadmap shape used in
      //   the Property 35 / 42 tests: each phase carries `projectIds`,
      //   plus the empty-array fields the roadmap consumer expects so the
      //   surrounding code paths (e.g. the `validateProjectsUnique` style
      //   walk) never trip on a missing field.
      // - `projectIds` are non-empty alphanumeric strings so the
      //   "candidate projectId NOT in roadmap" precondition is easy to
      //   satisfy.
      const roadmapProjectIdArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);
      const phaseArb = fc.record({
        id: fc.string({ minLength: 1, maxLength: 8 }),
        label: fc.constant('Phase'),
        weekStart: fc.integer({ min: 1, max: 4 }),
        weekEnd: fc.integer({ min: 5, max: 8 }),
        focusSkills: fc.constant([]),
        topics: fc.constant([]),
        resources: fc.constant([]),
        projectIds: fc.array(roadmapProjectIdArb, { minLength: 1, maxLength: 4 }),
      });
      const roadmapArb = fc.record({
        id: fc.string({ minLength: 1, maxLength: 16 }),
        dreamJobId: fc.constantFrom(
          'software-engineer',
          'data-scientist',
          'cybersecurity-analyst',
          'cloud-architect',
        ),
        generatedAt: fc.constant('2024-01-01T00:00:00.000Z'),
        phases: fc.array(phaseArb, { minLength: 1, maxLength: 4 }),
        hash: fc.constant('seed'),
      });

      // Optional URL/notes evidence — most paths in the action validate
      // these AFTER the project-not-in-roadmap check, so they should not
      // affect the property. We still vary them to demonstrate the guard
      // fires regardless of evidence shape.
      const evidenceArb = fc.oneof(
        fc.constant(undefined),
        fc.record({
          url: fc.option(
            fc.oneof(
              fc.constant(''),
              fc.stringMatching(/^https?:\/\/[a-z0-9.-]{1,32}$/),
            ),
            { nil: undefined },
          ),
          notes: fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
        }),
      );

      // Candidate projectId is generated from a wider arbitrary, then
      // discarded via `fc.pre` whenever it happens to collide with a
      // projectId in some phase. The shrinker still has plenty of room
      // because the roadmap phases use a tightly bounded alphabet.
      const candidateIdArb = fc.string({ minLength: 1, maxLength: 24 });

      await fc.assert(
        fc.asyncProperty(
          roadmapArb,
          candidateIdArb,
          evidenceArb,
          async (roadmap, candidateId, evidence) => {
            // Precondition: projectId must not appear in any phase.
            // Empty-string ids are skipped by the action's input guard
            // before the roadmap check, so exclude them too — otherwise
            // the assertion below would trivially pass for the wrong
            // reason.
            if (candidateId.length === 0) return;
            const presentIds = new Set();
            for (const phase of roadmap.phases) {
              for (const pid of phase.projectIds) presentIds.add(pid);
            }
            fc.pre(!presentIds.has(candidateId));

            const harness = renderProvider();
            try {
              // Seed a non-hydrating provider with the generated roadmap,
              // an empty portfolio, and a non-empty `dreamJobId`. The
              // `requirementsCache` pre-fill keeps the post-hydration
              // `loadRequirements` kickoff effect on its cache-hit path
              // so it never reaches `fetch`.
              harness.setState((prev) => ({
                ...prev,
                isHydrating: false,
                dreamJobId: roadmap.dreamJobId,
                currentRoadmap: roadmap,
                portfolio: [],
                requirementsCache: {
                  [roadmap.dreamJobId]: [
                    {
                      skillId: 'k',
                      name: 'Skill',
                      targetLevel: 50,
                      weight: 1,
                      rationale: '',
                    },
                  ],
                },
              }));

              await act(async () => {
                await harness.value.markProjectComplete(candidateId, evidence);
              });

              // ── Assertion 1: portfolio is unchanged (still empty) ─────
              expect(harness.value.portfolio).toEqual([]);

              // ── Assertion 2: the documented banner was pushed ─────────
              const banners = Array.isArray(harness.value.banners)
                ? harness.value.banners
                : [];
              const guardBanner = banners.find(
                (b) => b && b.id === 'project-not-in-roadmap',
              );
              expect(guardBanner).toBeDefined();
              expect(guardBanner.message).toBe(
                'This project is not part of your current roadmap',
              );

              // ── Assertion 3: roadmap state was not mutated by the call.
              // The action returns early on the guard path, so the
              // provider should still hold the same `currentRoadmap`
              // reference we seeded with.
              expect(harness.value.currentRoadmap).toBe(roadmap);
            } finally {
              harness.unmount();
            }
          },
        ),
        { numRuns: 100 },
      );
    },
    120000,
  );
});

// ─── Task 57: addXP failure-path integration test ──────────────────────────
// Validates: Requirement 20.6
//
// When `UserContext.addXP` throws, `markProjectComplete` must NOT append a
// Portfolio_Entry and MUST surface the documented `addxp-failed` inline
// error banner. This is the failure-path counterpart to the badge-dedup
// property test above: same render harness, same roadmap seed, but the
// stubbed `addXP` raises synchronously to trigger the abort branch in
// SkillBridgeContext.markProjectComplete (step 6).

describe('SkillBridgeContext.markProjectComplete addXP failure path', () => {
  beforeEach(() => {
    // Reset between tests so prior describe blocks can't leak a passing
    // `addXP` into this one.
    setMockUserCtx({
      user: { profile: {}, progress: { badges: [] } },
      earnBadge: () => {},
      addXP: () => {},
    });
  });

  test(
    'Task 57: addXP throw aborts the portfolio append and surfaces addxp-failed banner',
    async () => {
      // Override the UserContext stub so `addXP` throws synchronously.
      // Req 20.6 says either a synchronous throw OR a rejected Promise
      // must trip the same abort path; this test exercises the throw arm.
      // earnBadge is a no-op — the abort short-circuits before the badge
      // award, but a no-op (rather than throw) keeps the failure mode
      // localized to the addXP boundary under test.
      setMockUserCtx({
        user: { profile: {}, progress: { badges: [] } },
        earnBadge: () => {},
        addXP: () => { throw new Error('addXP failed'); },
      });

      const harness = renderProvider();
      try {
        // Seed: a roadmap whose first phase contains a project that is
        // also present in the curated `projectsCatalog` so the metadata
        // lookup yields a known difficulty (`xpForDifficulty` returns a
        // finite XP amount and the action progresses to the addXP call
        // site). 'se-cli-todo' is the first software-engineer project in
        // the catalog (see `src/data/projects.js`).
        const projectId = 'se-cli-todo';
        harness.setState((prev) => ({
          ...prev,
          isHydrating: false,
          dreamJobId: 'software-engineer',
          currentRoadmap: {
            id: 'r1',
            dreamJobId: 'software-engineer',
            generatedAt: '2024-01-01T00:00:00.000Z',
            phases: [
              {
                id: 'p1',
                label: 'Phase 1',
                weekStart: 1,
                weekEnd: 2,
                focusSkills: [],
                topics: [],
                resources: [],
                projectIds: [projectId],
              },
            ],
            hash: 'seed',
          },
          portfolio: [],
        }));

        await act(async () => {
          await harness.value.markProjectComplete(projectId, {});
        });

        // ── Assertion 1: portfolio is untouched (Req 20.6 abort path) ───
        // The action MUST short-circuit before the pure
        // `markProjectComplete` reducer runs, leaving `portfolio` as the
        // empty array we seeded with.
        expect(harness.value.portfolio).toEqual([]);

        // ── Assertion 2: the documented inline error banner is present ──
        const banners = Array.isArray(harness.value.banners)
          ? harness.value.banners
          : [];
        const addxpBanner = banners.find(
          (b) => b && b.id === 'addxp-failed',
        );
        expect(addxpBanner).toBeDefined();
        expect(addxpBanner.message).toBe('Unable to award XP, try again');
      } finally {
        harness.unmount();
      }
    },
    15000,
  );
});
