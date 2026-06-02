/**
 * Navbar SkillBridge link visibility property test.
 *
 * Validates: Requirements 14.2
 * Properties: 39 (per design.md §"Property 39: Navbar SkillBridge link
 *               visibility"; the implementation-plan task text in
 *               `tasks.md` task 49.1 mislabels this as "Property 40",
 *               but design.md is the canonical source — Property 40 in
 *               design.md is reserved for the ReadOnlyPreview wrapper
 *               and is already covered by
 *               `src/components/skillbridge/ReadOnlyPreview.test.js`.)
 *
 * Per Req 14.2 (and Property 39 in `design.md`): a "SkillBridge" nav
 * link is rendered in `<Navbar>` if and only if
 * `user.isOnboarded === true`. Authentication state alone is not
 * sufficient — non-onboarded users (whether logged in or not) must not
 * see the link, since `/skillbridge` is gated behind onboarding (Req
 * 14.4) and exposing a dead link would leak that route to users who
 * cannot meaningfully use it.
 *
 * The test:
 *   1. Mocks `useUser` and `useAuth` so the rendered Navbar reads a
 *      fast-check-generated `(isOnboarded, isAuthenticated)` pair.
 *   2. Renders `<Navbar />` inside a `<MemoryRouter>` so the
 *      `react-router-dom` `<Link>` resolves without a real router.
 *   3. Looks up the rendered DOM with
 *      `container.querySelector('a[href="/skillbridge"]')` and asserts
 *      the link is present iff `isOnboarded === true`.
 *
 * `fc.assert(fc.property(...), { numRuns: 100 })` runs 100 iterations
 * over the boolean × boolean state space (which only has 4 distinct
 * combinations, but fast-check's iteration also covers shrinking and
 * regression seeding). The test does not need any extra coverage:
 * Property 39 is a pure visibility predicate over two booleans.
 */

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
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
  getDoc: jest.fn(() =>
    Promise.resolve({ exists: () => false, data: () => ({}) }),
  ),
  setDoc: jest.fn(() => Promise.resolve()),
}));

jest.mock('firebase/analytics', () => ({
  getAnalytics: jest.fn(() => ({})),
}));

// Static logo import — Jest doesn't bundle binary assets, so we stub it
// out. The Navbar only references the import as the `src` of an `<img>`
// tag, and the resolved value of the stub doesn't affect the property
// under test.
jest.mock('../assets/logo.png', () => 'logo.png', { virtual: true });

// `useUser` and `useAuth` are driven by the test below via these
// `jest.fn()` references. `act()` flushes Navbar's `useEffect` after
// each render, so we can just reset the implementation between
// iterations.
const mockUseUser = jest.fn();
const mockUseAuth = jest.fn();

jest.mock('../context/UserContext', () => ({
  __esModule: true,
  useUser: () => mockUseUser(),
  UserProvider: ({ children }) => children,
}));

jest.mock('../context/AuthContext', () => ({
  __esModule: true,
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }) => children,
}));

// Importing the SUT must come AFTER `jest.mock` so the mocks are wired in.
const Navbar = require('./Navbar').default;

// React 18 requires this flag to suppress the "act(...) testing
// environment" warning. CRA's Jest runner doesn't set it for us.
// eslint-disable-next-line no-undef
global.IS_REACT_ACT_ENVIRONMENT = true;

// ─── Test harness ──────────────────────────────────────────────────────────

/**
 * Build the `user` object returned by `useUser()`. The real
 * `UserContext` always populates `progress.{level,xp,xpToNext}` on
 * onboarded users (the XP bar reads them unconditionally inside the
 * `user.isOnboarded` branch of Navbar), so we mirror that shape here
 * to avoid spurious runtime errors that would mask the property.
 */
function buildUser(isOnboarded) {
  return {
    isOnboarded,
    profile: { name: '', interests: [], skills: [], preferences: {} },
    progress: {
      level: 1,
      xp: 0,
      xpToNext: 100,
      badges: [],
      completedScenarios: [],
      unlockedPaths: [],
      decisions: [],
    },
    recommendedCareers: [],
  };
}

/**
 * Renders `<Navbar />` once with the supplied `(isOnboarded,
 * isAuthenticated)` state and returns the rendered DOM container plus
 * an `unmount` function. The container is appended to `document.body`
 * because `createRoot` requires a root attached to a Document; we
 * remove it in cleanup so a 100-iteration property run does not leak
 * thousands of nodes.
 */
function renderNavbar({ isOnboarded, isAuthenticated }) {
  mockUseUser.mockReturnValue({ user: buildUser(isOnboarded) });
  mockUseAuth.mockReturnValue({
    user: isAuthenticated ? { uid: 'u-test', email: 't@example.com' } : null,
    logout: jest.fn(() => Promise.resolve()),
  });

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(Navbar),
      ),
    );
  });

  return {
    container,
    unmount() {
      act(() => { root.unmount(); });
      if (container.parentNode) container.parentNode.removeChild(container);
    },
  };
}

// ─── Property 39: Navbar SkillBridge link visibility ──────────────────────
// Validates: Requirements 14.2

describe('Navbar SkillBridge link visibility', () => {
  test(
    'Property 39: SkillBridge nav link is rendered iff user.isOnboarded === true',
    () => {
      fc.assert(
        fc.property(
          fc.boolean(),
          fc.boolean(),
          (isOnboarded, isAuthenticated) => {
            const harness = renderNavbar({ isOnboarded, isAuthenticated });
            try {
              // Two complementary lookups so a regression that drops
              // `to="/skillbridge"` OR drops the visible "SkillBridge"
              // text label is caught by at least one of them.
              const linkByHref = harness.container.querySelector(
                'a[href="/skillbridge"]',
              );
              const linkByText = Array.from(
                harness.container.querySelectorAll('a'),
              ).find((a) => a.textContent.trim() === 'SkillBridge');

              const renderedByHref = linkByHref !== null;
              const renderedByText = linkByText !== undefined;

              // The two queries must agree (otherwise we have a link
              // with the right href but wrong label, or vice versa).
              expect(renderedByHref).toBe(renderedByText);

              // Property 39: presence iff isOnboarded === true.
              expect(renderedByHref).toBe(isOnboarded === true);
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
