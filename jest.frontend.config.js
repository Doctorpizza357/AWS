// jest.frontend.config.js  (repo root)
// Standalone Jest config that runs the relocated FRONTEND tests directly
// (not through react-scripts). Leaves CRA's start/build/test untouched.
module.exports = {
  rootDir: '.',
  // Discover only the relocated FRONTEND tests (Req 12.3). Server tests live
  // under tests/server and are run by node --test, so exclude them here.
  roots: ['<rootDir>/tests/src'],
  testMatch: ['**/*.test.js'],
  testEnvironment: 'jsdom', // Req 12.2
  // CRA's preset sets resetMocks: true; reproduce it so the hydration test's
  // beforeEach mock re-install behaves identically (Req 12.6).
  resetMocks: true,
  // Polyfill the Fetch API the same way CRA does (via whatwg-fetch). Runs
  // before the test framework is set up, so `fetch`/`Headers`/`Request`/
  // `Response` exist on the jsdom global when the real skillbridgeService ->
  // firebase.js -> @firebase/auth chain references global `fetch` at import
  // time (Req 12.6).
  setupFiles: ['<rootDir>/tests/jest.setup.frontend.js'],
  // Transform JSX/ESM via babel-jest using the same preset CRA uses, scoped
  // INLINE so no root babel.config.js is introduced (Req 12.7).
  transform: {
    '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-react-app'] }],
  },
  moduleNameMapper: {
    // Stub CSS imports (components do `import './X.css'`) — Req 12.4.
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    // Stub binary asset imports (Navbar logo .png) — Req 12.4.
    '\\.(png|jpe?g|gif|svg|webp)$': '<rootDir>/tests/__mocks__/fileMock.js',
  },
  // jsdom URL keeps window.location stable for any history-touching code.
  testEnvironmentOptions: { url: 'http://localhost/' },
};
