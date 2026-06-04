import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { arrayUnion, deleteField, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { useUser } from './UserContext';
import { db } from '../services/firebase';
import careersData from '../data/careers';
import projectsCatalog from '../data/projects';
import skillTraitMap from '../data/skillTraitMap';
import skillResources from '../data/skillResources';
import {
  clampLevel,
  computeSkillGapList,
  projectWeightedCompletionPct,
  allGapsClosed as computeAllGapsClosed,
  isFirestoreReachable as reachabilityReducer,
  readLocalStorageQueue,
  clearLocalStorageQueue,
  persistAssessment,
  persistRoadmap,
  persistPortfolio,
  persistRequirementsCache,
  persistWithRetry,
  writeLocalStorageQueue,
  fetchRequirements,
  fetchSeedAssessment,
  fetchRoadmap,
  fallbackRequirements,
  mergeSeed,
  validateAssessment,
  validateCompletionForm,
  computeProfileHash,
  buildFallbackRoadmap,
  assembleRoadmap,
  backfillRoadmapTopicsResources,
  validateProjectsUnique,
  isPhaseCompletable,
  markPhaseComplete as pureMarkPhaseComplete,
  unmarkPhaseComplete as pureUnmarkPhaseComplete,
  markProjectComplete as pureMarkProjectComplete,
  unmarkProjectComplete as pureUnmarkProjectComplete,
  applyTraitGains,
  xpForDifficulty,
} from '../services/skillbridgeService';

// Firestore read timeout for the initial hydration (Req 21.4).
const HYDRATION_READ_TIMEOUT_MS = 10000;

// Banner ids reused across hydration outcomes.
const OFFLINE_HYDRATION_BANNER = Object.freeze({
  id: 'offline-hydration',
  kind: 'warning',
  message: "Working offline — couldn't reach the server",
});
const PENDING_SYNC_FAILED_BANNER = Object.freeze({
  id: 'pending-sync-failed',
  kind: 'warning',
  message: 'Some recent changes could not be synced — they will retry',
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

// Append `banner` to `banners` only if no entry with the same id is already
// present. Banner persistence is the consumer's job — this provider just
// dedups so a re-running effect never stacks duplicates.
function appendBannerOnce(banners, banner) {
  const list = Array.isArray(banners) ? banners : [];
  if (list.some((b) => b && b.id === banner.id)) return list;
  return list.concat([banner]);
}

/**
 * SkillBridgeContext
 *
 * In-memory source of truth for the SkillBridge subsystem during a single
 * session. Mirrors the `SkillBridgeState` interface documented in
 * `design.md`. Hydration from Firestore + the localStorage pending-write
 * queue is handled by the `useEffect` below (task 27); the AI-driven async
 * actions (`selectDreamJob`, `loadRequirements`, …) are still stubs and get
 * filled in by tasks 28-32.
 *
 * Validates: Requirements 18.1, 18.2, 18.3, 19.1, 19.2, 19.5, 19.7, 19.8,
 *   21.4, 21.6
 */

export const SkillBridgeContext = createContext(null);

/**
 * Initial in-memory state, matching the `SkillBridgeState` interface in
 * `design.md`. `inFlight` is intentionally NOT held here: AbortControllers
 * change frequently and shouldn't trigger consumer re-renders, so they live
 * in a `useRef` instead (see `inFlightRef`).
 */
const INITIAL_STATE = Object.freeze({
  // Hydration / connectivity
  isHydrating: true,
  isFirestoreReachable: 'reachable',
  hasUnsavedChanges: false,

  // Dream job + requirements
  dreamJobId: null,
  requirements: [],
  requirementsSource: null,
  // Per-careerId cache populated by `loadRequirements` (Req 2.4). Stored as
  // a plain `{ [careerId]: Skill_Requirement[] }` map so the cache-hit
  // branch can short-circuit without a Firestore round-trip.
  requirementsCache: {},

  // Assessment
  skillAssessment: null,
  assessmentSeeded: false,
  pendingSkillEdits: {},

  // Roadmap
  currentRoadmap: null,
  archivedRoadmaps: [],
  roadmapSource: null,
  expandedPhaseIds: [], // Set serialized as array for state stability

  // Portfolio
  portfolio: [],

  // UI / async (banners + toasts only — AbortControllers live in a ref)
  banners: [],
  toasts: [],
  roadmapLoading: false,

  // Cross-action dedup (Req 5.7, Property 19): keyed by `scenarioId` → `optionId`
  appliedScenarioGains: {},
});

export function SkillBridgeProvider({ children }) {
  const { user: authUser } = useAuth();
  const userCtx = useUser();
  const [state, setState] = useState(INITIAL_STATE);

  // AbortControllers don't belong in state — they get reassigned constantly
  // and consumers shouldn't re-render when one is created/torn down.
  const inFlightRef = useRef({});

  // Mirror the latest `state` in a ref so async actions can read fresh
  // values without re-binding on every state change. `useCallback` deps for
  // each action stay minimal (the actions read through the ref) which
  // matters because consumers like `Simulation.js` capture the action
  // identity in their own effect deps.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Same trick for the resolved uid so async actions don't re-bind every
  // time the auth user object reference changes.
  const uidRef = useRef(null);

  // ---------------------------------------------------------------------------
  // Reachability dispatcher — task 27 hookup point for tasks 28-32
  // ---------------------------------------------------------------------------

  /**
   * Centralizes the Firestore reachability state-machine dispatch so async
   * actions added in tasks 28-32 don't have to re-implement the
   * `isFirestoreReachable` reducer call (Req 19.7, Property 38).
   *
   * Validates: Requirement 19.7
   */
  const recordWriteOutcome = useCallback((success) => {
    const event = success ? 'write_succeeded' : 'write_failed';
    setState((prev) => {
      const next = reachabilityReducer(prev.isFirestoreReachable, event);
      if (next === prev.isFirestoreReachable) return prev;
      return { ...prev, isFirestoreReachable: next };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Synchronous, pure-now actions
  // ---------------------------------------------------------------------------

  /**
   * Stage an in-memory edit to a skill level. No Firestore round-trip; the
   * write happens later in `saveAssessment`. Must complete in <200ms (Req
   * 4.1, 18.1).
   *
   * Validates: Requirements 4.1, 4.3, 18.1
   */
  const updateSkillLevel = useCallback((skillId, level) => {
    if (typeof skillId !== 'string' || skillId.length === 0) return;
    const clamped = clampLevel(level);
    setState((prev) => ({
      ...prev,
      pendingSkillEdits: {
        ...prev.pendingSkillEdits,
        [skillId]: clamped,
      },
      hasUnsavedChanges: true,
    }));
  }, []);

  /**
   * Toggle whether a phase card is expanded. Backed by an array of phase ids
   * in state so the value is plain-serializable; we treat it as a Set for
   * membership semantics.
   *
   * Validates: Requirement 9.3
   */
  const togglePhaseExpansion = useCallback((phaseId) => {
    if (typeof phaseId !== 'string' || phaseId.length === 0) return;
    setState((prev) => {
      const set = new Set(prev.expandedPhaseIds);
      if (set.has(phaseId)) set.delete(phaseId);
      else set.add(phaseId);
      return { ...prev, expandedPhaseIds: Array.from(set) };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Async action stubs — implemented in tasks 27-32
  // ---------------------------------------------------------------------------

  /**
   * Validate `careerId` against the static `careers.js` catalog (Req 1.6),
   * persist the new `dreamJobId` to Firestore (Req 1.2), and surface
   * inline-error / fallback banners on failure paths.
   *
   * Behavior:
   *   1. Look up `careerId` in `careersData`. On miss → push a non-blocking
   *      `unknown-career` error banner and return without touching state
   *      (Req 1.6).
   *   2. If the matched career has an empty `skills` array, push a
   *      `no-skill-requirements` error banner so the consumer can block
   *      roadmap generation (Req 2.8). The `dreamJobId` is still committed
   *      so the picker UI knows which row was chosen.
   *   3. Update in-memory `state.dreamJobId` immediately (Req 18.3).
   *   4. When `uid` is set, persist `dreamJobId` via
   *      `persistWithRetry(setDoc(..., { merge: true }))`. On rejection,
   *      mirror to the localStorage queue (Req 19.4) and surface a
   *      retry-banner so the user knows hydration will replay it.
   *   5. Reachability state-machine is bumped via `recordWriteOutcome`
   *      regardless of which path won (Req 19.7).
   *
   * Validates: Requirements 1.1, 1.2, 1.6, 2.8, 18.3, 19.4, 19.7
   *
   * @param {string} careerId
   * @returns {Promise<void>}
   */
  const selectDreamJob = useCallback(async (careerId) => {
    const match = Array.isArray(careersData)
      ? careersData.find((c) => c && c.id === careerId)
      : null;

    if (!match) {
      // Unknown career id — refuse the selection (Req 1.6).
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'unknown-career',
          kind: 'error',
          message: 'Unknown career',
        }),
      }));
      return;
    }

    // Commit the selection to in-memory state. Do this *before* the
    // Firestore round-trip so the UI updates within Req 18 budgets.
    setState((prev) => {
      let banners = prev.banners;
      if (!Array.isArray(match.skills) || match.skills.length === 0) {
        // Career has no static skills — block roadmap generation downstream
        // by surfacing the documented inline error (Req 2.8). The
        // `dreamJobId` is still committed so the picker can render the
        // selection back to the user.
        banners = appendBannerOnce(banners, {
          id: 'no-skill-requirements',
          kind: 'error',
          message: 'No skill requirements available for this career',
        });
      }
      return {
        ...prev,
        dreamJobId: careerId,
        banners,
      };
    });

    const currentUid = uidRef.current;
    if (!currentUid) {
      // Unauthenticated → skip Firestore. Hydration on a future login will
      // pick up whatever the client committed locally.
      return;
    }

    try {
      await persistWithRetry(() =>
        setDoc(
          doc(db, 'users', currentUid),
          { skillbridge: { dreamJobId: careerId } },
          { merge: true },
        ),
      );
      recordWriteOutcome(true);
    } catch (_err) {
      // Mirror to the localStorage queue so the next hydration replays the
      // write (Req 19.4, Req 19.8) and surface a retry-banner.
      writeLocalStorageQueue(currentUid, { dreamJobId: careerId });
      recordWriteOutcome(false);
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'dreamjob-save-failed',
          kind: 'warning',
          message: "Couldn't save your dream job — will retry",
        }),
      }));
    }
  }, [recordWriteOutcome]);

  /**
   * Swap the user's dream job. Requires explicit confirmation when a
   * `currentRoadmap` already exists because the swap archives that roadmap
   * (Reqs 1.3, 1.4). When no current roadmap exists, the archive step is
   * skipped (Req 1.5) and the call is delegated to `selectDreamJob`
   * (Req 1.6).
   *
   * Contract:
   *   - `confirmed !== true` → push the `change-dreamjob-confirm` banner
   *     and return without modifying state (Req 1.3).
   *   - `confirmed === true` and `currentRoadmap` is non-null → archive it
   *     by appending `{ ...currentRoadmap, archivedAt }` to
   *     `archivedRoadmaps`, clear `currentRoadmap` and `roadmapSource`
   *     (Reqs 1.4, 1.7), and mirror the change to Firestore via
   *     `arrayUnion` + `deleteField()`.
   *   - `confirmed === true` and `currentRoadmap` is null → skip the
   *     archive step (Req 1.5).
   *   - In every confirmed path, delegate to `selectDreamJob(newCareerId)`
   *     (Req 1.6) for the actual swap.
   *
   * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7
   *
   * @param {string} newCareerId
   * @param {boolean} confirmed
   * @returns {Promise<void>}
   */
  const changeDreamJob = useCallback(async (newCareerId, confirmed) => {
    if (confirmed !== true) {
      // Block the swap on a confirmation prompt (Req 1.3). The UI should
      // observe this banner and re-issue the call with `confirmed = true`.
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'change-dreamjob-confirm',
          kind: 'warning',
          message: 'Confirm to archive your current roadmap and switch dream jobs',
        }),
      }));
      return;
    }

    // Snapshot the roadmap *before* mutating local state so the persisted
    // `archivedAt` value matches the in-memory archive entry exactly.
    const existingRoadmap = stateRef.current.currentRoadmap;

    if (existingRoadmap) {
      const archivedEntry = {
        ...existingRoadmap,
        archivedAt: new Date().toISOString(),
      };

      // Local state: append to `archivedRoadmaps`, clear `currentRoadmap`
      // and `roadmapSource` (Reqs 1.4, 1.7).
      setState((prev) => ({
        ...prev,
        archivedRoadmaps: Array.isArray(prev.archivedRoadmaps)
          ? prev.archivedRoadmaps.concat([archivedEntry])
          : [archivedEntry],
        currentRoadmap: null,
        roadmapSource: null,
      }));

      const currentUid = uidRef.current;
      if (currentUid) {
        try {
          await persistWithRetry(() =>
            setDoc(
              doc(db, 'users', currentUid),
              {
                skillbridge: {
                  // `deleteField()` removes the key from the document so
                  // a subsequent hydration sees `currentRoadmap === null`
                  // (Req 1.7) instead of inheriting the previous shape.
                  currentRoadmap: deleteField(),
                  archivedRoadmaps: arrayUnion(archivedEntry),
                },
              },
              { merge: true },
            ),
          );
          recordWriteOutcome(true);
        } catch (_err) {
          // Mirror the archive snapshot to localStorage so the next
          // hydration replays it (Req 19.4).
          writeLocalStorageQueue(currentUid, {
            archivedRoadmaps: [archivedEntry],
            currentRoadmap: null,
          });
          recordWriteOutcome(false);
          setState((prev) => ({
            ...prev,
            banners: appendBannerOnce(prev.banners, {
              id: 'archive-roadmap-failed',
              kind: 'warning',
              message: "Couldn't archive your roadmap — will retry",
            }),
          }));
        }
      }
    }
    // Either way (archive succeeded, archive skipped, or no current
    // roadmap) → delegate to `selectDreamJob` for the actual swap (Req 1.6).
    await selectDreamJob(newCareerId);
  }, [recordWriteOutcome, selectDreamJob]);

  /**
   * Loads the active Skill_Requirements for the current `dreamJobId`
   * (Reqs 2.1, 2.4, 2.5, 2.7).
   *
   * Cache hit (`requirementsCache[dreamJobId]` is a non-empty array) →
   * project the cached entries onto `state.requirements` with
   * `requirementsSource = 'cache'` and return without an AI round-trip.
   *
   * Cache miss → call `fetchRequirements(careerId, careerEntry, signal)`.
   * The service helper never throws — it always resolves to a
   * Skill_Requirement[] (the AI-validated payload on success, or
   * `fallbackRequirements(careerEntry)` on any failure). Distinguish the
   * two outcomes by deep-comparing the result against the deterministic
   * fallback shape (Req 2.5):
   *   - Equal      → `requirementsSource = 'fallback'`, push the
   *     `using-offline-requirements` warning banner, do not persist.
   *   - Different  → `requirementsSource = 'ai'`, persist to
   *     `requirementsCache.{careerId}` (Req 2.4) via `persistWithRetry`
   *     and update the in-memory cache map for the rest of the session.
   *
   * In both branches the result is deduped by `skillId` (Req 2.7) — first
   * occurrence wins — before being committed to state.
   *
   * AbortControllers are tracked under `inFlightRef.current.requirements`;
   * a re-entrant call aborts any in-flight request before issuing a new
   * one (Req 21.5).
   *
   * Validates: Requirements 2.1, 2.4, 2.5, 2.7
   *
   * @returns {Promise<void>}
   */
  const loadRequirements = useCallback(async () => {
    const snapshot = stateRef.current;
    const dreamJobId = snapshot.dreamJobId;
    if (typeof dreamJobId !== 'string' || dreamJobId.length === 0) return;

    const careerEntry = Array.isArray(careersData)
      ? careersData.find((c) => c && c.id === dreamJobId)
      : null;
    if (!careerEntry) return;

    // Cache hit — short-circuit before allocating an AbortController so
    // re-entrant calls during the steady state are essentially free.
    const cache = isPlainObject(snapshot.requirementsCache)
      ? snapshot.requirementsCache
      : {};
    const cached = cache[dreamJobId];
    if (Array.isArray(cached) && cached.length > 0) {
      setState((prev) => ({
        ...prev,
        requirements: cached,
        requirementsSource: 'cache',
      }));
      return;
    }

    // Abort any in-flight requirements call before starting a new one.
    const previous = inFlightRef.current.requirements;
    if (previous && typeof previous.abort === 'function') {
      try { previous.abort(); } catch (_) { /* best-effort */ }
    }
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    inFlightRef.current.requirements = controller;

    let result;
    try {
      result = await fetchRequirements(
        dreamJobId,
        careerEntry,
        controller ? controller.signal : undefined,
      );
    } catch (_err) {
      // `fetchRequirements` is documented as never-throwing, but guard
      // against future regressions by mirroring the fallback shape here.
      result = fallbackRequirements(careerEntry);
    } finally {
      if (inFlightRef.current.requirements === controller) {
        inFlightRef.current.requirements = null;
      }
    }

    // Distinguish AI vs fallback by comparing against the deterministic
    // local fallback (Req 2.5). The service helper is contractually
    // required to return the exact same shape on the offline path, so a
    // value-equal comparison via JSON.stringify is sufficient.
    const fallback = fallbackRequirements(careerEntry);
    const isFallback =
      JSON.stringify(result) === JSON.stringify(fallback);

    // Dedup by skillId (Req 2.7) — first occurrence wins.
    const seen = new Set();
    const deduped = [];
    for (const req of Array.isArray(result) ? result : []) {
      if (!isPlainObject(req)) continue;
      const skillId = req.skillId;
      if (typeof skillId !== 'string' || skillId.length === 0) continue;
      if (seen.has(skillId)) continue;
      seen.add(skillId);
      deduped.push(req);
    }

    setState((prev) => ({
      ...prev,
      requirements: deduped,
      requirementsSource: isFallback ? 'fallback' : 'ai',
      requirementsCache: {
        ...(isPlainObject(prev.requirementsCache)
          ? prev.requirementsCache
          : {}),
        [dreamJobId]: deduped,
      },
      banners: isFallback
        ? appendBannerOnce(prev.banners, {
            id: 'using-offline-requirements',
            kind: 'warning',
            message: 'Using offline requirements',
          })
        : prev.banners,
    }));

    // Persist only AI-sourced requirements so we don't pollute the cache
    // with deterministic fallbacks that can be regenerated locally.
    if (!isFallback) {
      const currentUid = uidRef.current;
      if (currentUid) {
        try {
          await persistWithRetry(() =>
            persistRequirementsCache(currentUid, dreamJobId, deduped),
          );
          recordWriteOutcome(true);
        } catch (_err) {
          writeLocalStorageQueue(currentUid, {
            requirementsCache: { [dreamJobId]: deduped },
          });
          recordWriteOutcome(false);
        }
      }
    }
  }, [recordWriteOutcome]);

  /**
   * Seeds the user's initial Skill_Assessment from a parsed résumé when
   * available, falling back to the default level `50` for every active
   * Skill_Requirement (Reqs 3.1, 3.2, 3.7, 3.8).
   *
   * Behavior:
   *   1. When `skillAssessment` already exists, return without reseeding —
   *      Req 3.3 requires the user to confirm before persistence and that
   *      confirmation is handled by `saveAssessment` (task 30).
   *   2. When `requirements` is empty, return — there is nothing to seed.
   *   3. When a parsed `resumeText` is available on the user profile,
   *      call `fetchSeedAssessment(profile, requirements, resumeText,
   *      signal)`. The service helper never throws — it returns the
   *      validated `levels` map on success or `mergeSeed(requirements, {})`
   *      on any failure (Req 3.8). Either way, we run the result through
   *      `mergeSeed(requirements, levels)` to backfill any skillId the AI
   *      omitted (Req 3.7).
   *   4. When no résumé is available, default every requirement to `50`
   *      via `mergeSeed(requirements, {})` (Req 3.2).
   *   5. Stage the seeded levels into `pendingSkillEdits` (NOT directly
   *      into `skillAssessment`) so the user must click "Confirm
   *      assessment" before the values are persisted (Req 3.3). Set
   *      `assessmentSeeded = true` so the seeding is not re-run on the
   *      next render.
   *   6. On any unexpected failure (defensive guard), default every
   *      requirement to `50` and surface the
   *      `using-default-starting-levels` warning banner (Req 3.8).
   *
   * AbortControllers are tracked under `inFlightRef.current.seedAssessment`;
   * a re-entrant call aborts any in-flight request before issuing a new
   * one (Req 21.5).
   *
   * Validates: Requirements 3.1, 3.2, 3.3, 3.7, 3.8
   *
   * @returns {Promise<void>}
   */
  const seedAssessment = useCallback(async () => {
    const snapshot = stateRef.current;

    // Already have a saved assessment — don't reseed (Req 3.3 places the
    // confirm step on the persistence path, not the seeding path).
    if (snapshot.skillAssessment) return;
    if (!Array.isArray(snapshot.requirements) || snapshot.requirements.length === 0) {
      return;
    }

    const profile =
      userCtx && isPlainObject(userCtx.user) && isPlainObject(userCtx.user.profile)
        ? userCtx.user.profile
        : null;
    const resumeText =
      profile && typeof profile.resumeText === 'string' ? profile.resumeText : '';

    // Abort any in-flight seed-assessment call before starting a new one.
    const previous = inFlightRef.current.seedAssessment;
    if (previous && typeof previous.abort === 'function') {
      try { previous.abort(); } catch (_) { /* best-effort */ }
    }
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    inFlightRef.current.seedAssessment = controller;

    let levels;
    let usedFallbackBanner = false;
    try {
      if (resumeText.length > 0) {
        // `fetchSeedAssessment` is documented as never-throwing — on any
        // failure it returns `mergeSeed(requirements, {})` directly. The
        // banner contract on Req 3.8, however, applies to the failure
        // path. We cannot tell the two apart from the return value alone,
        // so the banner is only surfaced on the catch path below.
        levels = await fetchSeedAssessment(
          profile,
          snapshot.requirements,
          resumeText,
          controller ? controller.signal : undefined,
        );
      } else {
        // No résumé → default every requirement to `50` (Req 3.2). No
        // banner: this is the documented happy path.
        levels = mergeSeed(snapshot.requirements, {});
      }
    } catch (_err) {
      // Defensive — `fetchSeedAssessment` is contractually never-throwing,
      // but guard against future regressions per Req 3.8.
      levels = mergeSeed(snapshot.requirements, {});
      usedFallbackBanner = true;
    } finally {
      if (inFlightRef.current.seedAssessment === controller) {
        inFlightRef.current.seedAssessment = null;
      }
    }

    // Backfill any skillId the AI omitted with `50` (Req 3.7).
    const merged = mergeSeed(snapshot.requirements, levels);

    setState((prev) => ({
      ...prev,
      // Stage into `pendingSkillEdits` — the user clicks "Confirm
      // assessment" to persist (Req 3.3). The save path is in task 30.
      pendingSkillEdits: { ...prev.pendingSkillEdits, ...merged },
      assessmentSeeded: true,
      hasUnsavedChanges: true,
      banners: usedFallbackBanner
        ? appendBannerOnce(prev.banners, {
            id: 'using-default-starting-levels',
            kind: 'warning',
            message: 'Using default starting levels',
          })
        : prev.banners,
    }));
  }, [userCtx]);
  /**
   * Persist the user's confirmed Skill_Assessment.
   *
   * Behavior:
   *   1. When `dreamJobId` is null/empty → block save and surface the
   *      `select-dream-job-first` inline error banner (Req 21.2).
   *   2. Merge `pendingSkillEdits` into the existing
   *      `skillAssessment.skills` map and re-clamp every value via
   *      `clampLevel` to defend against any caller bypassing
   *      `updateSkillLevel` (Reqs 4.3, 18.1).
   *   3. Run `validateAssessment` on the merged candidate (Req 3.6). On
   *      `null` → push the `invalid-assessment` error banner and return
   *      without modifying state.
   *   4. Optimistically commit `skillAssessment = candidate`,
   *      `pendingSkillEdits = {}`, `hasUnsavedChanges = false` (Req 4.2).
   *   5. When authenticated, call
   *      `persistWithRetry(() => persistAssessment(uid, candidate))`. On
   *      success → push the `assessment-saved` toast (Req 4.5) with an
   *      `expiresAt` ~3s in the future and schedule a setTimeout to strip
   *      the toast. On failure → mirror to the localStorage queue
   *      (Req 19.4) and surface the `save-assessment-failed` warning. The
   *      reachability state-machine is bumped via `recordWriteOutcome` on
   *      both paths (Req 19.7).
   *
   * Validates: Requirements 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 18.1, 21.2
   *
   * @returns {Promise<void>}
   */
  const saveAssessment = useCallback(async () => {
    const snapshot = stateRef.current;

    // Req 21.2 — block save when no dream job has been selected.
    if (
      typeof snapshot.dreamJobId !== 'string' ||
      snapshot.dreamJobId.length === 0
    ) {
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'select-dream-job-first',
          kind: 'error',
          message: 'Select a dream job first',
        }),
      }));
      return;
    }

    // Build the merged skills map. Every active Skill_Requirement
    // contributes one entry so an untouched slider (which displays the
    // documented default of 50 — Req 3.2) is persisted at that default
    // instead of being silently dropped from the saved assessment.
    // Resolution order per skillId:
    //   1. `pendingSkillEdits[skillId]` — staged user edit, if any.
    //   2. `skillAssessment.skills[skillId]` — previously saved level.
    //   3. `50` — documented default for an untouched skill (Req 3.2).
    // Every value is re-clamped via `clampLevel` so this path can never
    // persist an out-of-range level, even if a caller bypassed
    // `updateSkillLevel` (Reqs 4.3, 18.1).
    const existingSkills = isPlainObject(snapshot.skillAssessment?.skills)
      ? snapshot.skillAssessment.skills
      : {};
    const pending = isPlainObject(snapshot.pendingSkillEdits)
      ? snapshot.pendingSkillEdits
      : {};
    const requirements = Array.isArray(snapshot.requirements)
      ? snapshot.requirements
      : [];

    const mergedSkills = {};
    const seenSkillIds = new Set();

    for (const req of requirements) {
      if (!isPlainObject(req)) continue;
      const skillId = req.skillId;
      if (typeof skillId !== 'string' || skillId.length === 0) continue;
      if (seenSkillIds.has(skillId)) continue;
      seenSkillIds.add(skillId);

      let level;
      if (Object.prototype.hasOwnProperty.call(pending, skillId)) {
        level = pending[skillId];
      } else if (Object.prototype.hasOwnProperty.call(existingSkills, skillId)) {
        level = existingSkills[skillId];
      } else {
        level = 50;
      }
      mergedSkills[skillId] = clampLevel(level);
    }

    // Carry forward any previously-saved skill that no longer appears in
    // the active Skill_Requirements set (e.g. the user swapped dream
    // jobs). Dropping them silently would erase historical data.
    for (const [skillId, level] of Object.entries(existingSkills)) {
      if (seenSkillIds.has(skillId)) continue;
      seenSkillIds.add(skillId);
      mergedSkills[skillId] = clampLevel(level);
    }

    // Pick up any staged edit whose `skillId` is not in the requirements
    // list (defensive — `updateSkillLevel` accepts any string id).
    for (const [skillId, level] of Object.entries(pending)) {
      if (seenSkillIds.has(skillId)) continue;
      seenSkillIds.add(skillId);
      mergedSkills[skillId] = clampLevel(level);
    }

    const candidate = {
      skills: mergedSkills,
      updatedAt: new Date().toISOString(),
    };

    // Req 3.6 — refuse the save if any skill level violates the invariant.
    if (validateAssessment(candidate) === null) {
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'invalid-assessment',
          kind: 'error',
          message:
            'Some skill levels were invalid — fix them and try again',
        }),
      }));
      return;
    }

    // Optimistically commit. The localStorage queue (filled in the
    // failure branch below) replays the write on the next hydration so
    // there is no need to roll back here.
    setState((prev) => ({
      ...prev,
      skillAssessment: candidate,
      pendingSkillEdits: {},
      hasUnsavedChanges: false,
    }));

    // Req 4.5 — surface the "Assessment saved" toast immediately so the
    // user gets feedback as soon as the local commit lands. The toast is
    // independent of the Firestore write outcome: persistence runs in
    // the background and the localStorage queue / retry-banner cover the
    // failure path. Gating the toast behind the network round-trip
    // would make a slow / offline save look like nothing happened.
    const expiresAt = Date.now() + 3000;
    setState((prev) => ({
      ...prev,
      toasts: Array.isArray(prev.toasts)
        ? prev.toasts
            .filter((t) => t && t.id !== 'assessment-saved')
            .concat([
              {
                id: 'assessment-saved',
                kind: 'success',
                message: 'Assessment saved',
                expiresAt,
              },
            ])
        : [
            {
              id: 'assessment-saved',
              kind: 'success',
              message: 'Assessment saved',
              expiresAt,
            },
          ],
    }));
    setTimeout(() => {
      setState((prev) => ({
        ...prev,
        toasts: Array.isArray(prev.toasts)
          ? prev.toasts.filter((t) => t && t.id !== 'assessment-saved')
          : [],
      }));
    }, 3000);

    const currentUid = uidRef.current;
    if (!currentUid) {
      // Unauthenticated — nothing to persist. Hydration on a future
      // login will pick up whatever the client committed locally.
      return;
    }

    try {
      await persistWithRetry(() => persistAssessment(currentUid, candidate));
      recordWriteOutcome(true);
    } catch (_err) {
      // Mirror the assessment to the localStorage queue so the next
      // hydration replays the write (Req 19.4, Req 19.8).
      writeLocalStorageQueue(currentUid, { skillAssessment: candidate });
      recordWriteOutcome(false);
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'save-assessment-failed',
          kind: 'warning',
          message: "Couldn't save assessment — will retry",
        }),
      }));
    }
  }, [recordWriteOutcome]);
  /**
   * Generate (or reuse) the roadmap for the current `(dreamJobId,
   * skillAssessment)` profile (Reqs 8.1, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11,
   * 17.1, 20.1).
   *
   * Behavior:
   *   1. **Prereq check (Req 8.10).** When `skillAssessment` is null OR
   *      `dreamJobId` is missing/empty/unknown → push the
   *      `roadmap-prereqs-missing` error banner and return without touching
   *      state.
   *   2. **Profile-hash cache short-circuit (Req 8.7).** Compute
   *      `profileHash = computeProfileHash(skillAssessment, dreamJobId)`.
   *      When `currentRoadmap?.hash === profileHash` AND
   *      `opts?.force !== true`, set `roadmapSource = 'cache'` and return —
   *      no AI call, no Firestore write. This is the path Property 35
   *      asserts.
   *   3. **AI fetch.** Otherwise, abort any in-flight roadmap call,
   *      allocate a fresh `AbortController`, and call
   *      `fetchRoadmap({ dreamJobId, requirements, assessment, profile },
   *      signal)`.
   *      - **Success.** Run `assembleRoadmap(roadmap, projectsCatalog,
   *        [])` to derive concrete `projectIds` per phase (the AI catalog
   *        is empty for now — task 53 wires real AI projects), then run
   *        `validateProjectsUnique(assembled)`. If either step throws or
   *        the uniqueness check fails, fall through to the failure branch.
   *        On success, attach `hash = profileHash`, set
   *        `roadmapSource = 'ai'`, persist to Firestore, and award the
   *        `skillbridge-roadmap-started` badge (Req 20.1, idempotent via
   *        `earnBadge`).
   *      - **Failure with cache hit (Req 8.9).** When
   *        `currentRoadmap !== null` we keep the existing roadmap, set
   *        `roadmapSource = 'cache'`, and surface the `using-cached-roadmap`
   *        warning banner.
   *      - **Failure without cache (Req 8.8).** Build the deterministic
   *        starter roadmap via `buildFallbackRoadmap(dreamJobId,
   *        projectsCatalog)`. Attach `hash = profileHash`, set
   *        `roadmapSource = 'fallback-curated'`, and surface the
   *        `roadmap-engine-unreachable` error banner. Persist optimistically
   *        so a refresh keeps the curated fallback in place. If
   *        `buildFallbackRoadmap` itself throws (catalog has < 3 matching
   *        projects), surface a more user-friendly banner and leave
   *        `currentRoadmap` untouched.
   *
   * AbortControllers are tracked under `inFlightRef.current.roadmap`; a
   * re-entrant call aborts any in-flight request before issuing a new one
   * (Req 21.5).
   *
   * Validates: Requirements 8.1, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 17.1, 20.1
   *
   * @param {{ force?: boolean }} [opts]
   * @returns {Promise<void>}
   */
  const generateRoadmap = useCallback(async (opts) => {
    const snapshot = stateRef.current;
    const dreamJobId = snapshot.dreamJobId;
    const skillAssessment = snapshot.skillAssessment;
    const requirements = Array.isArray(snapshot.requirements)
      ? snapshot.requirements
      : [];

    // ── Step 1: prereq check (Req 8.10) ────────────────────────────────────
    const careerEntry = Array.isArray(careersData)
      ? careersData.find((c) => c && c.id === dreamJobId)
      : null;
    if (
      typeof dreamJobId !== 'string' ||
      dreamJobId.length === 0 ||
      !careerEntry ||
      !skillAssessment
    ) {
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'roadmap-prereqs-missing',
          kind: 'error',
          message: 'Confirm your assessment and select a dream job first',
        }),
      }));
      return;
    }

    // ── Step 2: profile-hash cache short-circuit (Req 8.7) ─────────────────
    let profileHash;
    try {
      profileHash = computeProfileHash(skillAssessment, dreamJobId);
    } catch (_err) {
      // Defensive — `computeProfileHash` only throws on null/empty inputs
      // which the prereq check above already rules out, but guard anyway
      // so a future regression can't take down the page.
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'roadmap-prereqs-missing',
          kind: 'error',
          message: 'Confirm your assessment and select a dream job first',
        }),
      }));
      return;
    }

    const cachedRoadmap = snapshot.currentRoadmap;
    const force = Boolean(opts && opts.force);
    if (
      isPlainObject(cachedRoadmap) &&
      cachedRoadmap.hash === profileHash &&
      !force
    ) {
      // Cache hit — no AI call, no Firestore write (Req 8.7, Property 35).
      console.log('[SkillBridge:generateRoadmap] CACHE HIT — skipping AI call. hash:', profileHash);
      setState((prev) => {
        if (prev.roadmapSource === 'cache') return prev;
        return { ...prev, roadmapSource: 'cache' };
      });
      return;
    }
    console.log('[SkillBridge:generateRoadmap] Cache miss or force=true. profileHash:', profileHash, 'cachedHash:', cachedRoadmap?.hash, 'force:', force);

    // ── Step 3: AI fetch ───────────────────────────────────────────────────
    setState((prev) => ({ ...prev, roadmapLoading: true }));

    const previous = inFlightRef.current.roadmap;
    if (previous && typeof previous.abort === 'function') {
      try { previous.abort(); } catch (_) { /* best-effort */ }
    }
    const controller =
      typeof AbortController === 'function' ? new AbortController() : null;
    inFlightRef.current.roadmap = controller;

    const profile =
      userCtx && isPlainObject(userCtx.user) && isPlainObject(userCtx.user.profile)
        ? userCtx.user.profile
        : null;

    let aiRoadmap = null;
    let aiFailed = false;
    try {
      aiRoadmap = await fetchRoadmap(
        {
          dreamJobId,
          requirements,
          assessment: skillAssessment,
          profile,
        },
        controller ? controller.signal : undefined,
      );
    } catch (_err) {
      aiFailed = true;
    } finally {
      if (inFlightRef.current.roadmap === controller) {
        inFlightRef.current.roadmap = null;
      }
    }

    // Try to assemble + validate. Treat any failure as an AI failure so
    // the cache/curated fallback paths take over (Reqs 8.8, 8.9).
    let assembled = null;
    if (!aiFailed && aiRoadmap) {
      try {
        console.log('[SkillBridge:generateRoadmap] AI roadmap received:', JSON.stringify(aiRoadmap, null, 2));
        console.log('[SkillBridge:generateRoadmap] projectsCatalog count:', projectsCatalog?.length);
        const candidate = assembleRoadmap(aiRoadmap, projectsCatalog, []);
        console.log('[SkillBridge:generateRoadmap] assembleRoadmap succeeded:', JSON.stringify(candidate.phases?.map(p => ({ projectIds: p.projectIds, focusSkills: p.focusSkills })), null, 2));
        if (validateProjectsUnique(candidate)) {
          assembled = candidate;
          console.log('[SkillBridge:generateRoadmap] validateProjectsUnique PASSED');
        } else {
          aiFailed = true;
          console.warn('[SkillBridge:generateRoadmap] validateProjectsUnique FAILED — falling back');
        }
      } catch (_err) {
        aiFailed = true;
        console.error('[SkillBridge:generateRoadmap] assembleRoadmap threw:', _err.message);
      }
    } else {
      console.warn('[SkillBridge:generateRoadmap] AI fetch failed or returned null. aiFailed:', aiFailed, 'aiRoadmap:', aiRoadmap);
    }

    // ── Step 3a: success path ──────────────────────────────────────────────
    if (!aiFailed && assembled) {
      const finalRoadmap = { ...assembled, hash: profileHash };
      setState((prev) => ({
        ...prev,
        currentRoadmap: finalRoadmap,
        roadmapSource: 'ai',
        roadmapLoading: false,
      }));

      // Award the "Roadmap Started" badge (Req 20.1). `earnBadge` is
      // idempotent at the UserContext level, so a repeat call is a no-op.
      if (userCtx && typeof userCtx.earnBadge === 'function') {
        try {
          userCtx.earnBadge({
            id: 'skillbridge-roadmap-started',
            name: 'Roadmap Started',
            icon: 'badge-roadmap',
            description: 'Generated your first SkillBridge roadmap',
          });
        } catch (_err) { /* best-effort — never block on badge errors */ }
      }

      const currentUid = uidRef.current;
      if (currentUid) {
        try {
          await persistWithRetry(() => persistRoadmap(currentUid, finalRoadmap));
          recordWriteOutcome(true);
        } catch (_err) {
          writeLocalStorageQueue(currentUid, { currentRoadmap: finalRoadmap });
          recordWriteOutcome(false);
          setState((prev) => ({
            ...prev,
            banners: appendBannerOnce(prev.banners, {
              id: 'save-roadmap-failed',
              kind: 'warning',
              message: "Couldn't save your roadmap — will retry",
            }),
          }));
        }
      }
      return;
    }

    // ── Step 3b: failure with cache hit (Req 8.9) ──────────────────────────
    if (isPlainObject(cachedRoadmap)) {
      setState((prev) => ({
        ...prev,
        roadmapSource: 'cache',
        roadmapLoading: false,
        banners: appendBannerOnce(prev.banners, {
          id: 'using-cached-roadmap',
          kind: 'warning',
          message: 'Using cached roadmap',
        }),
      }));
      return;
    }

    // ── Step 3c: failure without cache → curated fallback (Req 8.8) ────────
    let fallbackRoadmap;
    try {
      fallbackRoadmap = buildFallbackRoadmap(dreamJobId, projectsCatalog);
    } catch (_err) {
      // Curated catalog can't satisfy this career — surface a friendlier
      // banner instead of leaving the user without any roadmap at all.
      setState((prev) => ({
        ...prev,
        roadmapLoading: false,
        banners: appendBannerOnce(prev.banners, {
          id: 'roadmap-engine-unreachable',
          kind: 'error',
          message: "Couldn't reach the AI roadmap engine",
        }),
      }));
      return;
    }

    const finalFallback = { ...fallbackRoadmap, hash: profileHash };
    setState((prev) => ({
      ...prev,
      currentRoadmap: finalFallback,
      roadmapSource: 'fallback-curated',
      roadmapLoading: false,
      banners: appendBannerOnce(prev.banners, {
        id: 'roadmap-engine-unreachable',
        kind: 'error',
        message: "Couldn't reach the AI roadmap engine",
      }),
    }));

    const currentUid = uidRef.current;
    if (currentUid) {
      try {
        await persistWithRetry(() => persistRoadmap(currentUid, finalFallback));
        recordWriteOutcome(true);
      } catch (_err) {
        writeLocalStorageQueue(currentUid, { currentRoadmap: finalFallback });
        recordWriteOutcome(false);
      }
    }
  }, [recordWriteOutcome, userCtx]);

  /**
   * Mark a phase complete when every assigned project has a portfolio
   * entry (Reqs 9.6, 9.7, 9.8).
   *
   * Behavior:
   *   1. Look up the phase by id on `currentRoadmap.phases`. Missing → noop.
   *   2. `isPhaseCompletable(phase, portfolio)` must be true; otherwise
   *      surface the `phase-not-completable` warning banner and return.
   *   3. Use the pure helper `markPhaseComplete(currentRoadmap, phaseId,
   *      isoTimestamp)` to derive a new roadmap with `completedAt` set on
   *      the matching phase only.
   *   4. Optimistically commit the new roadmap to state, then persist via
   *      `persistWithRetry(() => persistRoadmap(uid, newRoadmap))`. On
   *      rejection, mirror to the localStorage queue (Req 19.4) and
   *      surface a retry banner. Reachability dispatch on every path.
   *
   * Validates: Requirements 9.6, 9.7, 9.8
   *
   * @param {string} phaseId
   * @returns {Promise<void>}
   */
  const markPhaseComplete = useCallback(async (phaseId) => {
    if (typeof phaseId !== 'string' || phaseId.length === 0) return;
    const snapshot = stateRef.current;
    const roadmap = snapshot.currentRoadmap;
    if (!isPlainObject(roadmap) || !Array.isArray(roadmap.phases)) return;

    const phase = roadmap.phases.find(
      (p) => isPlainObject(p) && p.id === phaseId,
    );
    if (!phase) return;

    if (!isPhaseCompletable(phase, snapshot.portfolio)) {
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'phase-not-completable',
          kind: 'warning',
          message: 'Complete every project in this phase first',
        }),
      }));
      return;
    }

    const newRoadmap = pureMarkPhaseComplete(
      roadmap,
      phaseId,
      new Date().toISOString(),
    );

    setState((prev) => ({
      ...prev,
      currentRoadmap: newRoadmap,
    }));

    const currentUid = uidRef.current;
    if (!currentUid) return;

    try {
      await persistWithRetry(() => persistRoadmap(currentUid, newRoadmap));
      recordWriteOutcome(true);
    } catch (_err) {
      writeLocalStorageQueue(currentUid, { currentRoadmap: newRoadmap });
      recordWriteOutcome(false);
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'save-roadmap-failed',
          kind: 'warning',
          message: "Couldn't save your roadmap — will retry",
        }),
      }));
    }
  }, [recordWriteOutcome]);
  /**
   * Unmark a previously-completed phase, clearing its `completedAt` so the
   * phase is no longer a milestone (Group B; Reqs 4.1, 4.4, 4.5, 4.7, 4.8).
   *
   * Mirrors `markPhaseComplete` exactly, with two deliberate differences:
   *   - There is NO `isPhaseCompletable` gate. Unmark is allowed whenever the
   *     phase is complete, regardless of project-completion state (Req 4 /
   *     design Group B).
   *   - The pure helper clears `completedAt` instead of setting it.
   *
   * Behavior:
   *   1. Guard: `phaseId` must be a non-empty string; `currentRoadmap` a plain
   *      object with an array `phases`; a phase with that id must exist. Any
   *      failure → no-op: no state change, no Firestore write, no localStorage
   *      write (Req 4.6).
   *   2. `newRoadmap = pureUnmarkPhaseComplete(currentRoadmap, phaseId)`.
   *   3. Optimistically commit `{ currentRoadmap: newRoadmap }`, leaving
   *      Portfolio, XP, and badges untouched (Req 4.7).
   *   4. No uid → in-memory only, no Firestore write (Req 4.8). Return.
   *   5. uid present → `persistWithRetry(() => persistRoadmap(uid, newRoadmap))`
   *      + `recordWriteOutcome(true)`. On rejection: mirror to the localStorage
   *      retry queue, `recordWriteOutcome(false)`, surface the existing
   *      `save-roadmap-failed` retry banner, and DO NOT revert the in-memory
   *      change (Req 4.4, 4.5).
   *
   * Validates: Requirements 4.1, 4.4, 4.5, 4.7, 4.8
   *
   * @param {string} phaseId
   * @returns {Promise<void>}
   */
  const unmarkPhaseComplete = useCallback(async (phaseId) => {
    if (typeof phaseId !== 'string' || phaseId.length === 0) return;
    const snapshot = stateRef.current;
    const roadmap = snapshot.currentRoadmap;
    if (!isPlainObject(roadmap) || !Array.isArray(roadmap.phases)) return;

    const phase = roadmap.phases.find(
      (p) => isPlainObject(p) && p.id === phaseId,
    );
    if (!phase) return;

    const newRoadmap = pureUnmarkPhaseComplete(roadmap, phaseId);

    setState((prev) => ({
      ...prev,
      currentRoadmap: newRoadmap,
    }));

    const currentUid = uidRef.current;
    if (!currentUid) return;

    try {
      await persistWithRetry(() => persistRoadmap(currentUid, newRoadmap));
      recordWriteOutcome(true);
    } catch (_err) {
      writeLocalStorageQueue(currentUid, { currentRoadmap: newRoadmap });
      recordWriteOutcome(false);
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'save-roadmap-failed',
          kind: 'warning',
          message: "Couldn't save your roadmap — will retry",
        }),
      }));
    }
  }, [recordWriteOutcome]);
  /**
   * Mark a Project complete with optional URL/notes evidence.
   *
   * Pre-checks (each surfaces an inline-error banner and returns without
   * touching state):
   *   1. **Project must be in the current roadmap (Req 21.3).** The
   *      `projectId` must appear in some `currentRoadmap.phases[*].projectIds`.
   *   2. **No duplicate portfolio entry (Req 11.9).** Reject if the
   *      portfolio already contains an entry with this `projectId`.
   *   3. **URL/notes shape (Reqs 11.1, 11.2, 11.8).** `validateCompletionForm`
   *      must return true.
   *
   * Happy path:
   *   4. Look up project metadata from `projectsCatalog`. If absent (e.g.
   *      AI-only project), fall back to the project entry inside the
   *      roadmap phase to populate `title`, `skills`, `difficulty`.
   *   5. Build the canonical `Portfolio_Entry`:
   *      `{ projectId, title, skills, difficulty, url, notes, completedAt }`.
   *   6. Try `addXP(xpForDifficulty(difficulty))`. If it throws → push
   *      the `addxp-failed` inline error and abort the portfolio append
   *      (Req 20.6).
   *   7. Otherwise call the pure `markProjectComplete` to derive the new
   *      portfolio (idempotent on duplicate, although the dup check above
   *      already guards). Optimistically commit.
   *   8. `persistWithRetry(persistPortfolio(uid, newPortfolio))`. On
   *      rejection, mirror to the localStorage queue (Req 19.4) and
   *      surface a retry banner. Reachability dispatch on every path.
   *   9. Award `skillbridge-first-project` when this is the user's first
   *      portfolio entry (Reqs 11.7, 20.2). Award
   *      `skillbridge-portfolio-builder` when count transitions 4 → 5
   *      (Reqs 12.6, 20.3). `earnBadge` is itself idempotent (Req 20.7),
   *      so re-firing across renders is safe.
   *
   * Validates: Requirements 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9,
   *   12.6, 20.2, 20.3, 20.6, 20.7, 21.3
   *
   * @param {string} projectId
   * @param {{url?: string, notes?: string}} [evidence]
   * @returns {Promise<void>}
   */
  const markProjectComplete = useCallback(async (projectId, evidence) => {
    if (typeof projectId !== 'string' || projectId.length === 0) return;

    const snapshot = stateRef.current;
    const roadmap = snapshot.currentRoadmap;
    const portfolio = Array.isArray(snapshot.portfolio) ? snapshot.portfolio : [];

    // ── Pre-check 1: project must be in the current roadmap (Req 21.3) ────
    const phases =
      isPlainObject(roadmap) && Array.isArray(roadmap.phases) ? roadmap.phases : [];
    let phaseHit = null;
    for (const phase of phases) {
      if (
        isPlainObject(phase) &&
        Array.isArray(phase.projectIds) &&
        phase.projectIds.includes(projectId)
      ) {
        phaseHit = phase;
        break;
      }
    }
    if (!phaseHit) {
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'project-not-in-roadmap',
          kind: 'error',
          message: 'This project is not part of your current roadmap',
        }),
      }));
      return;
    }

    // ── Pre-check 2: no duplicate portfolio entry (Req 11.9) ──────────────
    if (
      portfolio.some(
        (e) => isPlainObject(e) && e.projectId === projectId,
      )
    ) {
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'project-already-completed',
          kind: 'warning',
          message: 'Project already completed',
        }),
      }));
      return;
    }

    // ── Pre-check 3: URL/notes shape (Reqs 11.1, 11.2, 11.8) ──────────────
    if (!validateCompletionForm(evidence)) {
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'completion-form-invalid',
          kind: 'error',
          message: 'Enter a valid http or https URL',
        }),
      }));
      return;
    }

    // ── Step 4: project metadata lookup ───────────────────────────────────
    const catalogEntry = Array.isArray(projectsCatalog)
      ? projectsCatalog.find((p) => isPlainObject(p) && p.id === projectId)
      : null;
    // The roadmap currently only persists `projectIds`; fall back to a
    // minimal record when the project isn't in the curated catalog so the
    // portfolio entry still renders sensibly.
    const meta = catalogEntry || { id: projectId };
    const title = typeof meta.title === 'string' ? meta.title : projectId;
    const skills = Array.isArray(meta.skills) ? meta.skills : [];
    const difficulty =
      meta.difficulty === 'easy' ||
      meta.difficulty === 'medium' ||
      meta.difficulty === 'hard'
        ? meta.difficulty
        : 'easy';

    const url =
      isPlainObject(evidence) && typeof evidence.url === 'string' ? evidence.url : '';
    const notes =
      isPlainObject(evidence) && typeof evidence.notes === 'string'
        ? evidence.notes
        : '';

    const completionEvent = {
      projectId,
      title,
      skills,
      difficulty,
      url,
      notes,
      completedAt: new Date().toISOString(),
    };

    // ── Step 6: award XP first; on failure, abort the append (Req 20.6) ───
    let xpAmount;
    try {
      xpAmount = xpForDifficulty(difficulty);
    } catch (_err) {
      // Unknown difficulty — defensive; skip the XP award but still
      // consider this a successful completion since the spec only blocks
      // on `addXP` failures, not on metadata oddities.
      xpAmount = null;
    }

    if (xpAmount != null && userCtx && typeof userCtx.addXP === 'function') {
      try {
        const result = userCtx.addXP(xpAmount);
        // `addXP` is synchronous in the current UserContext implementation,
        // but the spec also covers a future Promise-returning version
        // (Req 20.6: "throw or rejection"). Await here to surface either.
        if (result && typeof result.then === 'function') {
          await result;
        }
      } catch (_err) {
        setState((prev) => ({
          ...prev,
          banners: appendBannerOnce(prev.banners, {
            id: 'addxp-failed',
            kind: 'error',
            message: 'Unable to award XP, try again',
          }),
        }));
        return;
      }
    }

    // ── Step 7: derive the new portfolio + commit optimistically ──────────
    const newPortfolio = pureMarkProjectComplete(portfolio, completionEvent);
    setState((prev) => ({
      ...prev,
      portfolio: newPortfolio,
    }));

    // ── Step 9: award badges before persistence so the badge dedup at the
    // UserContext level (Req 20.7, Property 42) takes effect even if the
    // Firestore write is delayed.
    if (userCtx && typeof userCtx.earnBadge === 'function') {
      // First-ever project (count was 0 before this append) — Req 11.7, 20.2.
      if (portfolio.length === 0) {
        try {
          userCtx.earnBadge({
            id: 'skillbridge-first-project',
            name: 'First Project',
            icon: 'badge-project',
            description: 'Completed your first SkillBridge project',
          });
        } catch (_err) { /* best-effort */ }
      }
      // Count transitioned 4 → 5 — Req 12.6, 20.3.
      if (portfolio.length === 4) {
        try {
          userCtx.earnBadge({
            id: 'skillbridge-portfolio-builder',
            name: 'Portfolio Builder',
            icon: 'badge-portfolio',
            description: 'Logged 5 completed projects to your portfolio',
          });
        } catch (_err) { /* best-effort */ }
      }
    }

    // ── Step 8: persist ──────────────────────────────────────────────────
    const currentUid = uidRef.current;
    if (!currentUid) return;
    try {
      await persistWithRetry(() => persistPortfolio(currentUid, newPortfolio));
      recordWriteOutcome(true);
    } catch (_err) {
      writeLocalStorageQueue(currentUid, { portfolio: newPortfolio });
      recordWriteOutcome(false);
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'save-portfolio-failed',
          kind: 'warning',
          message: "Couldn't save your portfolio — will retry",
        }),
      }));
    }
  }, [recordWriteOutcome, userCtx]);

  /**
   * Remove the portfolio entry whose `projectId === projectId` (Req 11.10).
   * XP is intentionally retained — only the portfolio list is mutated.
   *
   * Validates: Requirement 11.10
   *
   * @param {string} projectId
   * @returns {Promise<void>}
   */
  const unmarkProjectComplete = useCallback(async (projectId) => {
    if (typeof projectId !== 'string' || projectId.length === 0) return;
    const snapshot = stateRef.current;
    const portfolio = Array.isArray(snapshot.portfolio) ? snapshot.portfolio : [];
    const newPortfolio = pureUnmarkProjectComplete(portfolio, projectId);
    if (newPortfolio === portfolio) return; // no-op when nothing matched

    setState((prev) => ({
      ...prev,
      portfolio: newPortfolio,
    }));

    const currentUid = uidRef.current;
    if (!currentUid) return;
    try {
      await persistWithRetry(() => persistPortfolio(currentUid, newPortfolio));
      recordWriteOutcome(true);
    } catch (_err) {
      writeLocalStorageQueue(currentUid, { portfolio: newPortfolio });
      recordWriteOutcome(false);
      setState((prev) => ({
        ...prev,
        banners: appendBannerOnce(prev.banners, {
          id: 'save-portfolio-failed',
          kind: 'warning',
          message: "Couldn't save your portfolio — will retry",
        }),
      }));
    }
  }, [recordWriteOutcome]);

  /**
   * Apply an Inferred_Skill_Gain triggered by a Simulation completion.
   *
   * Behavior:
   *   1. **Bail when no assessment exists (Req 5.6).** The dedup map is
   *      also left untouched so a later `seedAssessment` call doesn't
   *      retroactively award gains for past simulation runs.
   *   2. **Dedup on `(scenarioId, optionId)` (Req 5.7, Property 19).** If
   *      `appliedScenarioGains[scenarioId] === optionId`, return
   *      immediately. The check is keyed by both the scenario and the
   *      chosen option so a user who replays the same scenario but picks
   *      a different option *can* trigger a fresh gain.
   *   3. Compute `activeSkillIds = Set(requirements.map(r => r.skillId))`.
   *   4. Call the pure `applyTraitGains(skillAssessment, traits, rewardXp,
   *      skillTraitMap, activeSkillIds)` to derive the new assessment.
   *      Stamp `updatedAt` to the current ISO-8601 timestamp (Req 5.4).
   *   5. Optimistically commit `skillAssessment` and update the dedup
   *      map.
   *   6. Persist via `persistWithRetry(persistAssessment)`. On failure
   *      mirror to the localStorage queue (Req 19.4) and surface a
   *      retry banner. Reachability dispatch on every path.
   *
   * Validates: Requirements 5.4, 5.6, 5.7, 20.7
   *
   * @param {string[]} traits
   * @param {number} rewardXp
   * @param {string} scenarioId
   * @param {string} optionId
   * @returns {Promise<void>}
   */
  const applyInferredGain = useCallback(
    async (traits, rewardXp, scenarioId, optionId) => {
      const snapshot = stateRef.current;

      // Step 1: bail when no assessment exists (Req 5.6).
      if (!isPlainObject(snapshot.skillAssessment)) return;

      // Step 2: dedup keyed by (scenarioId, optionId) — Req 5.7, Property 19.
      const dedupMap = isPlainObject(snapshot.appliedScenarioGains)
        ? snapshot.appliedScenarioGains
        : {};
      if (
        typeof scenarioId === 'string' &&
        typeof optionId === 'string' &&
        dedupMap[scenarioId] === optionId
      ) {
        return;
      }

      // Step 3: build the active-skillIds set from current requirements.
      const requirements = Array.isArray(snapshot.requirements)
        ? snapshot.requirements
        : [];
      const activeSkillIds = new Set();
      for (const r of requirements) {
        if (isPlainObject(r) && typeof r.skillId === 'string') {
          activeSkillIds.add(r.skillId);
        }
      }

      // Step 4: pure trait-gain derivation, then stamp updatedAt (Req 5.4).
      const newAssessment = applyTraitGains(
        snapshot.skillAssessment,
        traits,
        rewardXp,
        skillTraitMap,
        activeSkillIds,
      );
      const stamped = {
        ...newAssessment,
        updatedAt: new Date().toISOString(),
      };

      // Step 5: optimistic commit. Always update the dedup map even when
      // the gain math was a no-op (e.g. rewardXp <= 3) so a re-completion
      // doesn't keep recomputing the same trait set.
      setState((prev) => {
        const nextDedup = isPlainObject(prev.appliedScenarioGains)
          ? { ...prev.appliedScenarioGains }
          : {};
        if (typeof scenarioId === 'string' && typeof optionId === 'string') {
          nextDedup[scenarioId] = optionId;
        }
        return {
          ...prev,
          skillAssessment: stamped,
          appliedScenarioGains: nextDedup,
        };
      });

      // Step 6: persist.
      const currentUid = uidRef.current;
      if (!currentUid) return;
      try {
        await persistWithRetry(() => persistAssessment(currentUid, stamped));
        recordWriteOutcome(true);
      } catch (_err) {
        writeLocalStorageQueue(currentUid, { skillAssessment: stamped });
        recordWriteOutcome(false);
        setState((prev) => ({
          ...prev,
          banners: appendBannerOnce(prev.banners, {
            id: 'save-assessment-failed',
            kind: 'warning',
            message: "Couldn't save assessment — will retry",
          }),
        }));
      }
    },
    [recordWriteOutcome],
  );

  /**
   * Retry an originating request whose AbortController was tracked under
   * `inFlightRef.current[requestKey]`. Maps the key to the corresponding
   * action and re-issues it. The 'projects' key has no top-level retry
   * handle of its own — projects feed roadmap assembly, so re-running
   * `generateRoadmap` covers that case.
   *
   * Validates: Requirements 21.5, 21.7
   *
   * @param {'requirements'|'seedAssessment'|'roadmap'|'projects'} requestKey
   * @returns {Promise<void>}
   */
  const retryFailedRequest = useCallback(
    async (requestKey) => {
      switch (requestKey) {
        case 'requirements':
          return loadRequirements();
        case 'seedAssessment':
          return seedAssessment();
        case 'roadmap':
        case 'projects':
          return generateRoadmap({ force: true });
        default:
          return undefined;
      }
    },
    [loadRequirements, seedAssessment, generateRoadmap],
  );

  // ---------------------------------------------------------------------------
  // Hydration (Reqs 19.1, 19.2, 19.5, 19.7, 19.8, 21.4, 21.6)
  // ---------------------------------------------------------------------------
  //
  // Effect runs whenever `authUser?.uid` resolves or changes:
  //   1. Read `users/{uid}.skillbridge` once. Wrap in a 10s timeout — if the
  //      read loses the race, push the "Working offline" banner (Req 21.4)
  //      and proceed with whatever local state we already have.
  //   2. On success, project the document into in-memory state.
  //   3. Read the localStorage pending-write queue (Req 19.8). If non-null,
  //      replay each documented field through `persistWithRetry`. On full
  //      success, clear the queue (Req 19.6); on partial/total failure
  //      leave the queue in place and surface the pending-sync banner.
  //   4. Drop `isHydrating` to false.
  //
  // The `cancelled` flag short-circuits state updates if the uid changes
  // mid-flight or the component unmounts.
  const uid = authUser && typeof authUser.uid === 'string' ? authUser.uid : null;
  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      // Unauthenticated → there's nothing to read. Stay in the initial
      // hydrating-but-empty state; ProtectedRoute / Req 19.1 redirects the
      // user to /login.
      return undefined;
    }

    let cancelled = false;
    setState((prev) =>
      prev.isHydrating ? prev : { ...prev, isHydrating: true },
    );

    (async () => {
      // ── Step 1+2: read users/{uid} with a 10s timeout race ──────────────
      let snapshot = null;
      let readTimedOut = false;
      try {
        const readPromise = getDoc(doc(db, 'users', uid));
        const timeoutPromise = new Promise((resolve) => {
          setTimeout(() => resolve('__timeout__'), HYDRATION_READ_TIMEOUT_MS);
        });
        const result = await Promise.race([readPromise, timeoutPromise]);
        if (result === '__timeout__') {
          readTimedOut = true;
        } else {
          snapshot = result;
        }
      } catch (_err) {
        // Network failure / Firestore rejection — treated identically to a
        // timeout: keep the local fallback and surface the offline banner.
        readTimedOut = true;
      }

      if (cancelled) return;

      // Project the Firestore document onto our in-memory state shape.
      let hydrationPatch = null;
      if (snapshot && typeof snapshot.exists === 'function' && snapshot.exists()) {
        const data = snapshot.data() || {};
        const sb = isPlainObject(data.skillbridge) ? data.skillbridge : {};
        const skillAssessment = isPlainObject(sb.skillAssessment)
          ? sb.skillAssessment
          : null;
        hydrationPatch = {
          // Group C (Req 8.8): a persisted/cache roadmap whose phases carry
          // empty `topics`/`resources` arrays is repaired via
          // `backfillRoadmapTopicsResources` before it is committed to state
          // and rendered, so the load/cache path matches the AI and
          // curated/fallback build paths. `null` stays `null`.
          currentRoadmap: isPlainObject(sb.currentRoadmap)
            ? backfillRoadmapTopicsResources(sb.currentRoadmap, skillResources)
            : null,
          archivedRoadmaps: Array.isArray(sb.archivedRoadmaps)
            ? sb.archivedRoadmaps
            : [],
          skillAssessment,
          portfolio: Array.isArray(sb.portfolio) ? sb.portfolio : [],
          dreamJobId:
            typeof sb.dreamJobId === 'string' && sb.dreamJobId.length > 0
              ? sb.dreamJobId
              : null,
          requirements: Array.isArray(sb.requirements) ? sb.requirements : [],
          requirementsSource:
            typeof sb.requirementsSource === 'string' ? sb.requirementsSource : null,
          requirementsCache: isPlainObject(sb.requirementsCache)
            ? sb.requirementsCache
            : {},
          assessmentSeeded: skillAssessment !== null,
        };
      }

      if (cancelled) return;
      setState((prev) => {
        let next = prev;
        if (hydrationPatch) {
          next = { ...next, ...hydrationPatch };
        }
        if (readTimedOut) {
          next = {
            ...next,
            banners: appendBannerOnce(next.banners, OFFLINE_HYDRATION_BANNER),
          };
        }
        return next;
      });

      // ── Step 3: flush the pending localStorage queue (Req 19.8) ─────────
      const queued = readLocalStorageQueue(uid);
      if (queued && isPlainObject(queued)) {
        let flushOk = true;
        let flushAttempted = false;

        if (Object.prototype.hasOwnProperty.call(queued, 'skillAssessment')) {
          flushAttempted = true;
          try {
            await persistWithRetry(() => persistAssessment(uid, queued.skillAssessment));
          } catch (_) {
            flushOk = false;
          }
        }
        if (Object.prototype.hasOwnProperty.call(queued, 'currentRoadmap')) {
          flushAttempted = true;
          try {
            await persistWithRetry(() => persistRoadmap(uid, queued.currentRoadmap));
          } catch (_) {
            flushOk = false;
          }
        }
        if (Object.prototype.hasOwnProperty.call(queued, 'portfolio')) {
          flushAttempted = true;
          try {
            await persistWithRetry(() => persistPortfolio(uid, queued.portfolio));
          } catch (_) {
            flushOk = false;
          }
        }
        if (
          isPlainObject(queued.requirementsCache) &&
          Object.keys(queued.requirementsCache).length > 0
        ) {
          flushAttempted = true;
          for (const [careerId, reqs] of Object.entries(queued.requirementsCache)) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await persistWithRetry(() =>
                persistRequirementsCache(uid, careerId, reqs),
              );
            } catch (_) {
              flushOk = false;
            }
          }
        }

        if (cancelled) return;

        if (flushAttempted) {
          if (flushOk) {
            clearLocalStorageQueue(uid);
            setState((prev) => ({
              ...prev,
              isFirestoreReachable: reachabilityReducer(
                prev.isFirestoreReachable,
                'write_succeeded',
              ),
            }));
          } else {
            setState((prev) => ({
              ...prev,
              isFirestoreReachable: reachabilityReducer(
                prev.isFirestoreReachable,
                'write_failed',
              ),
              banners: appendBannerOnce(prev.banners, PENDING_SYNC_FAILED_BANNER),
            }));
          }
        }
      }

      if (cancelled) return;
      // ── Step 4: hydration done ──────────────────────────────────────────
      setState((prev) => ({ ...prev, isHydrating: false }));
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  // ---------------------------------------------------------------------------
  // Kick off `loadRequirements` once hydration finishes and a dream job is
  // already on file. The cache hit path inside `loadRequirements` (added by
  // tasks 28-29) keeps this from costing an AI round-trip in the steady
  // state.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (state.isHydrating) return;
    if (typeof state.dreamJobId !== 'string' || state.dreamJobId.length === 0) return;
    // Stub today; real implementation lands in tasks 28-29. Wrapped so a
    // synchronous throw in a future revision can't take down the effect.
    try {
      const result = loadRequirements();
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          // Failures are surfaced through banners/toasts inside the action
          // itself (Req 21). The kick-off effect just fires-and-forgets.
        });
      }
    } catch (_) {
      // Same rationale as above.
    }
  }, [state.isHydrating, state.dreamJobId, loadRequirements]);

  // ---------------------------------------------------------------------------
  // Unsaved-changes navigation guard (Req 4.6)
  // ---------------------------------------------------------------------------
  //
  // While `hasUnsavedChanges === true`, register a `beforeunload` listener
  // so the browser surfaces its standard "Leave site?" confirmation prompt
  // when the user closes the tab, refreshes, or navigates to an off-app
  // URL. Modern browsers ignore custom messages and only check whether
  // `event.returnValue` was set, so we set it to an empty string.
  //
  // The in-app route-change guard required by Req 4.6 cannot live here:
  // we are inside a context provider, not a route component. The
  // page-level guard belongs in `src/pages/SkillBridge.js` (task 47),
  // where react-router-dom v6.4+'s `useBlocker` can prompt before route
  // transitions.
  // TODO(task 47): wire `useBlocker` in `src/pages/SkillBridge.js` to
  // cover in-app route transitions; this effect only handles the browser
  // unload/refresh/external-nav cases.
  useEffect(() => {
    if (!state.hasUnsavedChanges) return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = (event) => {
      event.preventDefault();
      // Required for Chrome / Edge / Safari to actually show the prompt.
      event.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [state.hasUnsavedChanges]);

  // ---------------------------------------------------------------------------
  // Derived values (re-memoized only when their inputs change so consumers
  // don't pay for needless recomputation — Req 18.1, 18.2)
  // ---------------------------------------------------------------------------
  //
  // Req 18 timing budgets (200ms slider → radar/bar, 1s on roadmap / inferred
  // gain → Dashboard widget) are satisfied by the existing memos: every state
  // mutation that touches `requirements`, `skillAssessment`, or
  // `currentRoadmap` flips the relevant memo, which in turn re-renders every
  // consumer of `useSkillBridge()` synchronously inside React's commit phase.
  // No additional propagation work (debounce, pub/sub, etc.) is needed here.

  const skillGaps = useMemo(
    () => computeSkillGapList(state.requirements, state.skillAssessment),
    [state.requirements, state.skillAssessment],
  );

  // Group D (skillbridge-roadmap-improvements): completion is now
  // project-weighted (by each Assigned_Project's `estHours`) rather than
  // phase-count based. The exposed field keeps its name and `[0,100]` integer
  // contract so both display surfaces (RoadmapView header, DashboardSummaryCard)
  // read the same single value. `state.portfolio` is a dependency so the
  // percentage recomputes within 1s whenever the portfolio or roadmap changes
  // (Req 9.7, 12.4, 12.7).
  const roadmapCompletionPct = useMemo(
    () => projectWeightedCompletionPct(state.currentRoadmap, state.portfolio, projectsCatalog),
    [state.currentRoadmap, state.portfolio],
  );

  const allGapsClosed = useMemo(
    () => computeAllGapsClosed(skillGaps),
    [skillGaps],
  );

  // ---------------------------------------------------------------------------
  // Gap-closer badge watcher (Reqs 6.5, 20.4, 20.7)
  // ---------------------------------------------------------------------------
  //
  // Whenever `allGapsClosed` flips false → true, fire the gap-closer badge
  // exactly once per transition. `earnBadge` itself is idempotent at the
  // UserContext level (Req 20.7, Property 42), but the `useRef` here keeps
  // us from spamming `earnBadge` on every render while the user holds at
  // an all-closed state.
  const prevAllGapsClosedRef = useRef(false);
  useEffect(() => {
    if (allGapsClosed && !prevAllGapsClosedRef.current) {
      if (userCtx && typeof userCtx.earnBadge === 'function') {
        try {
          userCtx.earnBadge({
            id: 'skillbridge-gap-closer',
            name: 'Gap Closer',
            icon: 'badge-gap-closer',
            description: 'Closed every skill gap for your dream job',
          });
        } catch (_err) { /* best-effort */ }
      }
    }
    prevAllGapsClosedRef.current = allGapsClosed;
  }, [allGapsClosed, userCtx]);

  // ---------------------------------------------------------------------------
  // Provider value
  // ---------------------------------------------------------------------------
  // Wrapped in `useMemo` so consumers don't re-render on every parent render.
  // The `inFlight` field surfaces the ref's current map for read-only
  // inspection by debug/UI code; mutation goes through the actions only.
  const value = useMemo(
    () => ({
      // State (raw)
      isHydrating: state.isHydrating,
      isFirestoreReachable: state.isFirestoreReachable,
      hasUnsavedChanges: state.hasUnsavedChanges,
      dreamJobId: state.dreamJobId,
      requirements: state.requirements,
      requirementsSource: state.requirementsSource,
      requirementsCache: state.requirementsCache,
      skillAssessment: state.skillAssessment,
      assessmentSeeded: state.assessmentSeeded,
      pendingSkillEdits: state.pendingSkillEdits,
      currentRoadmap: state.currentRoadmap,
      archivedRoadmaps: state.archivedRoadmaps,
      roadmapSource: state.roadmapSource,
      portfolio: state.portfolio,
      expandedPhaseIds: state.expandedPhaseIds,
      banners: state.banners,
      toasts: state.toasts,
      roadmapLoading: state.roadmapLoading,
      appliedScenarioGains: state.appliedScenarioGains,
      // AbortControllers map (live ref, intentionally not reactive)
      inFlight: inFlightRef.current,

      // Derived
      skillGaps,
      roadmapCompletionPct,
      allGapsClosed,

      // Actions
      selectDreamJob,
      changeDreamJob,
      loadRequirements,
      seedAssessment,
      updateSkillLevel,
      saveAssessment,
      generateRoadmap,
      togglePhaseExpansion,
      markPhaseComplete,
      unmarkPhaseComplete,
      markProjectComplete,
      unmarkProjectComplete,
      applyInferredGain,
      retryFailedRequest,

      // Internal escape hatches used by tasks 27-32. Kept on the value so
      // tests and follow-up tasks can write state without re-exporting.
      _setState: setState,
      _inFlightRef: inFlightRef,
      _authUser: authUser,
      _userCtx: userCtx,
      _recordWriteOutcome: recordWriteOutcome,
    }),
    [
      state,
      skillGaps,
      roadmapCompletionPct,
      allGapsClosed,
      selectDreamJob,
      changeDreamJob,
      loadRequirements,
      seedAssessment,
      updateSkillLevel,
      saveAssessment,
      generateRoadmap,
      togglePhaseExpansion,
      markPhaseComplete,
      unmarkPhaseComplete,
      markProjectComplete,
      unmarkProjectComplete,
      applyInferredGain,
      retryFailedRequest,
      authUser,
      userCtx,
      recordWriteOutcome,
    ],
  );

  return (
    <SkillBridgeContext.Provider value={value}>
      {children}
    </SkillBridgeContext.Provider>
  );
}

export function useSkillBridge() {
  const ctx = useContext(SkillBridgeContext);
  if (ctx === null || ctx === undefined) {
    throw new Error('useSkillBridge must be used within a SkillBridgeProvider');
  }
  return ctx;
}
