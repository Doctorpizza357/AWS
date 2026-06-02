/**
 * SkillBridgeContext hydrate-and-sync integration test (Task 55).
 *
 * Validates: Requirements 19.1, 19.2, 19.5
 *
 * Spinning up the real Firestore emulator inside the CRA Jest harness is
 * heavy, so per the task notes we mock the `firebase/firestore` module
 * instead. The mock simulates a Firestore document round-trip:
 *
 *   - `getDoc` resolves with a snapshot whose `exists()` is `true` and
 *     `data()` returns a synthetic `users/{uid}` document carrying every
 *     SkillBridge subkey the provider hydrates (`dreamJobId`,
 *     `currentRoadmap`, `skillAssessment`, `portfolio`, `requirements`,
 *     `requirementsCache`, `archivedRoadmaps`).
 *   - `setDoc` is a `jest.fn()` whose calls are inspected at the end of
 *     the test to assert the hydration → load → action → persist
 *     round-trip.
 *
 * The provider is then mounted with an authenticated `useAuth` and the
 * test asserts:
 *   1. `isHydrating` flips from `true` to `false` once the document read
 *      resolves (Req 19.1).
 *   2. The hydrated state matches the synthetic document (Req 19.2,
 *      19.5).
 *   3. Calling `selectDreamJob('software-engineer')` triggers a
 *      `setDoc(..., { skillbridge: { dreamJobId: ... } }, { merge: true })`
 *      write — completing the persist half of the round-trip
 *      (Req 19.2, 19.5).
 *
 * This is a smoke integration test, not a property test, so one
 * iteration is sufficient.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

// ─── Captured mock state (must be set up before the SUT loads) ─────────────
//
// We expose two module-level holders so the `jest.mock` factory below can
// reference them via the standard `mock`-prefixed pattern. The factory is
// hoisted to the top of the file by Jest, so the holders need to be safe
// to read before any `require` runs.

// Synthetic SkillBridge document seeded into Firestore for this test.
const TEST_UID = 'test-uid';
const SEED_DREAM_JOB_ID = 'data-scientist';
const SEED_CURRENT_ROADMAP = {
  id: 'roadmap-seed-1',
  dreamJobId: SEED_DREAM_JOB_ID,
  generatedAt: '2024-02-01T00:00:00.000Z',
  hash: 'seed-hash',
  phases: [
    {
      id: 'phase-1',
      label: 'Foundations',
      weekStart: 1,
      weekEnd: 2,
      focusSkills: ['statistics'],
      topics: ['Probability'],
      resources: [],
      projectIds: ['ds-eda-titanic'],
    },
  ],
};
const SEED_SKILL_ASSESSMENT = {
  skills: { statistics: 40, python: 55 },
  updatedAt: '2024-02-01T00:00:00.000Z',
};
const SEED_PORTFOLIO = [
  {
    projectId: 'ds-eda-titanic',
    title: 'Titanic EDA',
    skills: ['statistics'],
    difficulty: 'easy',
    completedAt: '2024-02-02T00:00:00.000Z',
    url: 'https://example.com/titanic',
    notes: 'Initial pass',
  },
];
const SEED_REQUIREMENTS = [
  {
    skillId: 'statistics',
    name: 'Statistics',
    targetLevel: 80,
    weight: 0.5,
    rationale: 'Core for data science',
  },
  {
    skillId: 'python',
    name: 'Python',
    targetLevel: 80,
    weight: 0.5,
    rationale: 'Core toolchain',
  },
];
const SEED_REQUIREMENTS_CACHE = {
  [SEED_DREAM_JOB_ID]: SEED_REQUIREMENTS,
};
const SEED_ARCHIVED_ROADMAPS = [
  {
    id: 'roadmap-archive-1',
    dreamJobId: 'software-engineer',
    archivedAt: '2024-01-10T00:00:00.000Z',
    phases: [],
  },
];

const SEED_DOCUMENT = {
  skillbridge: {
    dreamJobId: SEED_DREAM_JOB_ID,
    currentRoadmap: SEED_CURRENT_ROADMAP,
    skillAssessment: SEED_SKILL_ASSESSMENT,
    portfolio: SEED_PORTFOLIO,
    requirements: SEED_REQUIREMENTS,
    requirementsCache: SEED_REQUIREMENTS_CACHE,
    archivedRoadmaps: SEED_ARCHIVED_ROADMAPS,
  },
};

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

jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
}));

// `firebase/firestore` mock simulating the hydrate → persist round-trip:
//   - `getDoc` returns a snapshot wrapping `SEED_DOCUMENT`. Its `exists()`
//     returns `true` so the provider's hydration effect projects every
//     SkillBridge subkey onto state.
//   - `setDoc` records every call (its first argument is the doc ref, its
//     second the merge payload, its third the options bag) so the test
//     can verify the persist half of the round-trip.
//   - `doc(db, 'users', uid)` returns a tagged object so the test can
//     assert which document a given `setDoc` call targeted.
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn((_db, collection, id) => ({ __ref: `${collection}/${id}` })),
  getDoc: jest.fn(() =>
    Promise.resolve({
      exists: () => true,
      data: () => ({
        skillbridge: {
          dreamJobId: 'data-scientist',
          currentRoadmap: {
            id: 'roadmap-seed-1',
            dreamJobId: 'data-scientist',
            generatedAt: '2024-02-01T00:00:00.000Z',
            hash: 'seed-hash',
            phases: [
              {
                id: 'phase-1',
                label: 'Foundations',
                weekStart: 1,
                weekEnd: 2,
                focusSkills: ['statistics'],
                topics: ['Probability'],
                resources: [],
                projectIds: ['ds-eda-titanic'],
              },
            ],
          },
          skillAssessment: {
            skills: { statistics: 40, python: 55 },
            updatedAt: '2024-02-01T00:00:00.000Z',
          },
          portfolio: [
            {
              projectId: 'ds-eda-titanic',
              title: 'Titanic EDA',
              skills: ['statistics'],
              difficulty: 'easy',
              completedAt: '2024-02-02T00:00:00.000Z',
              url: 'https://example.com/titanic',
              notes: 'Initial pass',
            },
          ],
          requirements: [
            {
              skillId: 'statistics',
              name: 'Statistics',
              targetLevel: 80,
              weight: 0.5,
              rationale: 'Core for data science',
            },
            {
              skillId: 'python',
              name: 'Python',
              targetLevel: 80,
              weight: 0.5,
              rationale: 'Core toolchain',
            },
          ],
          requirementsCache: {
            'data-scientist': [
              {
                skillId: 'statistics',
                name: 'Statistics',
                targetLevel: 80,
                weight: 0.5,
                rationale: 'Core for data science',
              },
              {
                skillId: 'python',
                name: 'Python',
                targetLevel: 80,
                weight: 0.5,
                rationale: 'Core toolchain',
              },
            ],
          },
          archivedRoadmaps: [
            {
              id: 'roadmap-archive-1',
              dreamJobId: 'software-engineer',
              archivedAt: '2024-01-10T00:00:00.000Z',
              phases: [],
            },
          ],
        },
      }),
    }),
  ),
  setDoc: jest.fn(() => Promise.resolve()),
  arrayUnion: jest.fn((...args) => ({ __arrayUnion: args })),
  deleteField: jest.fn(() => ({ __deleteField: true })),
}));

// `useAuth` returns an authenticated user so the provider's hydration
// effect proceeds (the unauthenticated path short-circuits and never
// reads from Firestore — Req 19.1).
jest.mock('./AuthContext', () => ({
  __esModule: true,
  useAuth: () => ({ user: { uid: 'test-uid' } }),
  AuthProvider: ({ children }) => children,
}));

// `useUser` returns a minimal shape that satisfies the provider's
// `useUser()` calls. None of the actions exercised by this test cross
// into `earnBadge` / `addXP`, but providing the shape keeps the provider
// from crashing when those references are dereferenced defensively.
jest.mock('./UserContext', () => ({
  __esModule: true,
  useUser: () => ({
    user: { profile: {}, progress: { badges: [] } },
    earnBadge: () => {},
    addXP: () => {},
  }),
  UserProvider: ({ children }) => children,
}));

// Importing the SUT must come AFTER `jest.mock` so the mocks are wired in.
const { SkillBridgeProvider, SkillBridgeContext } = require('./SkillBridgeContext');
const firestoreMock = require('firebase/firestore');

// React 18 requires this flag to suppress the "act(...) testing
// environment" warning when calling `act` outside of a recognized test
// runner harness. CRA's Jest runner doesn't set it for us when we
// hand-roll the harness.
// eslint-disable-next-line no-undef
global.IS_REACT_ACT_ENVIRONMENT = true;

// ─── Test harness ──────────────────────────────────────────────────────────

/**
 * Renders `<SkillBridgeProvider>` into a detached DOM container and
 * captures the latest context value via a spy consumer.
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
    unmount() {
      act(() => { root.unmount(); });
      if (container.parentNode) container.parentNode.removeChild(container);
    },
  };
}

/**
 * Spins the microtask + macrotask queue until `predicate(harness.value)`
 * returns `true` or the deadline elapses. The hydration effect chains a
 * `getDoc` → `setState(hydrationPatch)` → optional localStorage flush →
 * `setState({ isHydrating: false })` sequence, so a single
 * `await act(...)` is not always enough to drive the whole pipeline. The
 * polling loop keeps the test resilient to any future intermediate await
 * the hydration effect grows.
 */
async function waitFor(harness, predicate, { timeoutMs = 2000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate(harness.value)) return;
    if (Date.now() > deadline) {
      throw new Error('waitFor: predicate did not become true in time');
    }
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('SkillBridgeContext hydrate-and-sync round-trip', () => {
  beforeEach(() => {
    // CRA's Jest config sets `resetMocks: true`, which strips the
    // `jest.mock(...)` factory implementations between tests. Re-install
    // the firestore mock impls so the hydration effect actually receives
    // the seeded snapshot.
    firestoreMock.getFirestore.mockImplementation(() => ({}));
    firestoreMock.doc.mockImplementation((_db, collection, id) => ({
      __ref: `${collection}/${id}`,
    }));
    firestoreMock.getDoc.mockImplementation(() =>
      Promise.resolve({
        exists: () => true,
        data: () => SEED_DOCUMENT,
      }),
    );
    firestoreMock.setDoc.mockImplementation(() => Promise.resolve());
    firestoreMock.arrayUnion.mockImplementation((...args) => ({
      __arrayUnion: args,
    }));
    firestoreMock.deleteField.mockImplementation(() => ({
      __deleteField: true,
    }));

    // Defensive: clear any localStorage queue a prior test might have
    // written. The hydration effect attempts to flush this queue and
    // would issue extra `setDoc` calls if it weren't empty, which would
    // pollute the persist-call assertions below.
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem('skillbridge_pending_test-uid'); } catch (_) { /* best-effort */ }
    }
  });

  test(
    'hydration loads the seed document and selectDreamJob persists via setDoc',
    async () => {
      const harness = renderProvider();
      try {
        // Initial render: the provider starts in `isHydrating: true`.
        // The hydration effect kicks off on mount, so by the time React
        // renders the spy the value should already be the initial state.
        expect(harness.value).not.toBeNull();
        expect(harness.value.isHydrating).toBe(true);

        // ── Wait for hydration to finish ───────────────────────────────
        // The provider's hydration effect resolves the `getDoc` mock,
        // projects the snapshot onto state, then drops `isHydrating` to
        // `false` (Req 19.1).
        await waitFor(harness, (v) => v && v.isHydrating === false);

        // ── Assertion 1: getDoc was issued against users/test-uid ──────
        // The provider's hydration effect issues `getDoc(doc(db, 'users',
        // uid))`. We assert via the `doc` mock's call log because it
        // carries the constructor-arg shape (collection + id) directly,
        // independently of how `getDoc` later wraps its argument.
        expect(firestoreMock.getDoc).toHaveBeenCalled();
        const docCallForHydration = firestoreMock.doc.mock.calls.find(
          (call) => call && call[1] === 'users' && call[2] === TEST_UID,
        );
        expect(docCallForHydration).toBeDefined();

        // ── Assertion 2: hydrated state matches the synthetic document
        //                (Req 19.2, 19.5) ──────────────────────────────
        const value = harness.value;
        expect(value.dreamJobId).toBe(SEED_DREAM_JOB_ID);
        expect(value.currentRoadmap).toEqual(SEED_CURRENT_ROADMAP);
        expect(value.skillAssessment).toEqual(SEED_SKILL_ASSESSMENT);
        expect(value.portfolio).toEqual(SEED_PORTFOLIO);
        expect(value.requirements).toEqual(SEED_REQUIREMENTS);
        expect(value.requirementsCache).toEqual(SEED_REQUIREMENTS_CACHE);
        expect(value.archivedRoadmaps).toEqual(SEED_ARCHIVED_ROADMAPS);
        // `assessmentSeeded` is derived during hydration: a non-null
        // `skillAssessment` means the user already confirmed an
        // assessment, so the seeding flow is not re-run.
        expect(value.assessmentSeeded).toBe(true);

        // ── Snapshot setDoc calls made during hydration ────────────────
        // The hydration path is read-only when the localStorage queue is
        // empty, so no `setDoc` should have been issued yet. If the
        // post-hydration `loadRequirements` kickoff effect runs, it
        // hits the `requirementsCache` short-circuit (cached) and
        // doesn't write either.
        const setDocCallsBeforeAction = firestoreMock.setDoc.mock.calls.slice();
        expect(setDocCallsBeforeAction).toHaveLength(0);

        // ── Action: selectDreamJob('software-engineer') ────────────────
        // Trigger a state-mutating action that the design contract says
        // MUST persist via `setDoc(..., { merge: true })`.
        await act(async () => {
          await harness.value.selectDreamJob('software-engineer');
        });

        // The action awaits `persistWithRetry`, which schedules its
        // retries on `setTimeout`. The first attempt's `setDoc` resolves
        // synchronously in our mock so we don't need to flush the
        // retry timer; one extra microtask drain is enough.
        await waitFor(
          harness,
          (v) => v && v.dreamJobId === 'software-engineer',
        );

        // ── Assertion 3: setDoc was called with the right payload ─────
        // Property under test (Req 19.2, 19.5): the action triggers a
        // Firestore write whose payload mirrors the in-memory mutation.
        // The hydration path issued no writes, so the only `setDoc`
        // call should be the dream-job persist.
        const setDocCalls = firestoreMock.setDoc.mock.calls;
        expect(setDocCalls.length).toBeGreaterThanOrEqual(1);

        // Find the call that targets the `dreamJobId` write — there's
        // only one, but we filter defensively in case future hydration
        // flushes add unrelated writes.
        const dreamJobCall = setDocCalls.find(
          (call) =>
            call &&
            call[1] &&
            call[1].skillbridge &&
            Object.prototype.hasOwnProperty.call(
              call[1].skillbridge,
              'dreamJobId',
            ),
        );
        expect(dreamJobCall).toBeDefined();
        // Doc ref targets users/test-uid.
        expect(dreamJobCall[0]).toEqual({ __ref: `users/${TEST_UID}` });
        // Payload mirrors the in-memory mutation under the
        // `skillbridge.dreamJobId` subkey.
        expect(dreamJobCall[1]).toEqual({
          skillbridge: { dreamJobId: 'software-engineer' },
        });
        // Merge mode is required so unrelated SkillBridge subkeys aren't
        // clobbered by a partial write (Req 19.2).
        expect(dreamJobCall[2]).toEqual({ merge: true });
      } finally {
        harness.unmount();
      }
    },
    10000,
  );
});
