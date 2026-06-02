// Integration tests for the four `/api/skillbridge/*` fetchers exported by
// `skillbridgeService.js`:
//
//   fetchRequirements    — 15s internal timeout, swallows failures
//                          (Reqs 2.1, 2.5, 21.5)
//   fetchSeedAssessment  — 10s internal timeout, swallows failures
//                          (Reqs 3.1, 3.8, 21.5)
//   fetchRoadmap         — 30s internal timeout, propagates failures
//                          (Reqs 8.1, 21.5)
//   fetchProjects        — 10s internal timeout, propagates failures
//                          (Reqs 10.3, 10.4, 10.8, 21.5)
//
// Validates: Requirements 21.5, 8.1, 10.8
//
// The tests mock `global.fetch` with a `jest.fn` that returns a Promise which
// resolves only when the request's `AbortSignal` aborts (and otherwise hangs
// forever). With Jest's modern fake timers we can:
//
//   1. Trigger the *internal* timeout by advancing the fake clock past the
//      documented per-fetcher cutoff. `composeAbortSignal` aborts the request
//      controller, our mock rejects, and the fetcher's catch block surfaces
//      either the fallback (requirements / seed assessment) or a thrown error
//      (roadmap / projects).
//
//   2. Trigger the *external* abort path by passing a pre-aborted
//      `AbortSignal` from the caller. `composeAbortSignal` immediately
//      forwards the abort to the internal controller, our mock rejects
//      synchronously through the microtask queue, and the fetcher resolves /
//      rejects without ever ticking the clock.

import {
  fetchRequirements,
  fetchSeedAssessment,
  fetchRoadmap,
  fetchProjects,
} from './skillbridgeService';

// Minimal valid careerEntry so `fallbackRequirements` returns a non-empty list.
const careerEntry = { skills: ['Skill A'] };
const requirements = [{ skillId: 'skill-a' }];

// ─── Helpers ────────────────────────────────────────────────────────────────

// Jest 27's modern fake timers do not expose `advanceTimersByTimeAsync`, so we
// polyfill: advance the fake clock synchronously, then yield to the microtask
// queue twice so the `.then`/`.catch`/`.finally` continuations attached to the
// now-rejected fetch promise can run before the next `await`.
async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function advanceTimersByTimeAsync(ms) {
  jest.advanceTimersByTime(ms);
  await flushMicrotasks();
}

// Builds an `AbortError` consistent with what a real `fetch` would throw when
// its signal aborts. `composeAbortSignal` does not inspect the rejection
// itself, so the exact subclass does not matter; we only need *some* error
// to flow through the catch path.
function makeAbortError() {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

// `jest.fn()` whose returned Promise hangs until the supplied `AbortSignal`
// aborts. If no signal is supplied, the Promise hangs forever (the fetcher
// always supplies one through `composeAbortSignal`, so this branch only
// guards against accidental misuse).
function makeHangingFetch() {
  return jest.fn((_url, options) => {
    return new Promise((_resolve, reject) => {
      const signal = options && options.signal;
      if (!signal) return; // hang forever
      if (signal.aborted) {
        // Reject on the next microtask so the rejection always flows through
        // the same code path regardless of when the abort occurred.
        Promise.resolve().then(() => reject(makeAbortError()));
        return;
      }
      signal.addEventListener('abort', () => reject(makeAbortError()));
    });
  });
}

// ─── Test setup ─────────────────────────────────────────────────────────────

let originalFetch;
let hangingFetch;

beforeEach(() => {
  jest.useFakeTimers();
  originalFetch = global.fetch;
  hangingFetch = makeHangingFetch();
  global.fetch = hangingFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  // Drain any leftover timers (e.g. the internal cleanup() should have done
  // this already, but be defensive in case a test bails early) before
  // restoring real timers.
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ─── fetchRequirements (15s timeout, swallows failures) ─────────────────────

describe('fetchRequirements', () => {
  // Validates: Requirements 21.5, 2.1, 2.5
  test('honors 15s internal timeout and resolves to fallback requirements', async () => {
    const promise = fetchRequirements('career-1', careerEntry);

    // Confirm the mock was hit and is still pending before the timeout fires.
    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(hangingFetch.mock.calls[0][0]).toBe('/api/skillbridge/requirements');

    // Advance just past the 15s cutoff (with a small delta to make the
    // intent obvious) — the internal `setTimeout` should fire, abort the
    // request controller, and trigger the catch → fallback path.
    await advanceTimersByTimeAsync(15001);

    const result = await promise;

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        skillId: 'skill-a',
        name: 'Skill A',
        targetLevel: 80,
        weight: 1,
      }),
    );
  });

  // Validates: Requirements 21.5
  test('caller-supplied pre-aborted AbortSignal short-circuits to fallback', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = fetchRequirements('career-1', careerEntry, controller.signal);

    // No need to advance timers — the pre-aborted external signal is
    // forwarded synchronously to the internal controller, so the mocked
    // fetch rejects on the next microtask without consuming the 15s budget.
    await flushMicrotasks();
    const result = await promise;

    expect(result).toEqual([
      expect.objectContaining({ skillId: 'skill-a', name: 'Skill A' }),
    ]);
    // The fetcher must observe the external abort by routing it through
    // its internal controller; we assert fetch was invoked at most once
    // (i.e. no retry loop).
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── fetchSeedAssessment (10s timeout, swallows failures) ───────────────────

describe('fetchSeedAssessment', () => {
  // Validates: Requirements 21.5, 3.1, 3.8
  test('honors 10s internal timeout and resolves to merged seed (every level 50)', async () => {
    const promise = fetchSeedAssessment({}, requirements, 'resume text');

    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(hangingFetch.mock.calls[0][0]).toBe('/api/skillbridge/seed-assessment');

    await advanceTimersByTimeAsync(10001);

    const result = await promise;

    // `mergeSeed(requirements, {})` defaults every active skillId to 50.
    expect(result).toEqual({ 'skill-a': 50 });
  });

  // Validates: Requirements 21.5
  test('caller-supplied pre-aborted AbortSignal short-circuits to merged seed', async () => {
    const controller = new AbortController();
    controller.abort();

    const promise = fetchSeedAssessment({}, requirements, '', controller.signal);

    await flushMicrotasks();
    const result = await promise;

    expect(result).toEqual({ 'skill-a': 50 });
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── fetchRoadmap (30s timeout, propagates failures) ────────────────────────

describe('fetchRoadmap', () => {
  const payload = {
    dreamJobId: 'astronaut',
    requirements: [],
    assessment: { skills: {} },
    profile: {},
  };

  // Validates: Requirements 21.5, 8.1
  test('honors 30s internal timeout and rejects', async () => {
    const promise = fetchRoadmap(payload);

    // Attach a catch handler now so the rejection that lands while we
    // advance the fake clock is not seen by Jest as unhandled.
    const settled = promise.catch((err) => err);

    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(hangingFetch.mock.calls[0][0]).toBe('/api/skillbridge/roadmap');

    await advanceTimersByTimeAsync(30001);

    const err = await settled;
    expect(err).toBeInstanceOf(Error);
  });

  // Validates: Requirements 21.5
  test('caller-supplied pre-aborted AbortSignal short-circuits to a rejection', async () => {
    const controller = new AbortController();
    controller.abort();

    const settled = fetchRoadmap(payload, controller.signal).catch((err) => err);

    await flushMicrotasks();
    const err = await settled;

    expect(err).toBeInstanceOf(Error);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });
});

// ─── fetchProjects (10s timeout, propagates failures) ───────────────────────

describe('fetchProjects', () => {
  const payload = {
    careerId: 'astronaut',
    focusSkills: [],
    count: 1,
    excludeIds: [],
  };

  // Validates: Requirements 21.5, 10.8
  test('honors 10s internal timeout and rejects', async () => {
    const promise = fetchProjects(payload);
    const settled = promise.catch((err) => err);

    expect(hangingFetch).toHaveBeenCalledTimes(1);
    expect(hangingFetch.mock.calls[0][0]).toBe('/api/skillbridge/projects');

    await advanceTimersByTimeAsync(10001);

    const err = await settled;
    expect(err).toBeInstanceOf(Error);
  });

  // Validates: Requirements 21.5
  test('caller-supplied pre-aborted AbortSignal short-circuits to a rejection', async () => {
    const controller = new AbortController();
    controller.abort();

    const settled = fetchProjects(payload, controller.signal).catch((err) => err);

    await flushMicrotasks();
    const err = await settled;

    expect(err).toBeInstanceOf(Error);
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });
});
