/**
 * wizardSteps
 *
 * Pure navigation/gating helpers for the SkillBridge wizard shell
 * (`SkillBridgeWizard`). This module is the single property-based-testable
 * surface introduced by the `skillbridge-flow-and-proxy-fixes` spec: it
 * contains NO React, NO I/O, NO clock, and NO randomness — only pure
 * functions of their arguments.
 *
 * The gating predicates mirror the visibility predicates the current
 * single-page `src/pages/SkillBridge.js` layout uses:
 *
 *   const showAssessment =
 *     typeof dreamJobId === 'string' && dreamJobId.length > 0;
 *   const showRoadmap =
 *     showAssessment && skillAssessment !== null && skillAssessment !== undefined;
 *
 * so a Step is reachable in the wizard if and only if its corresponding
 * section would have been visible in the single-page layout (Req 4.6).
 *
 * Validates: Requirements 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.1, 4.2,
 * 4.3, 4.4, 4.5, 4.6
 */

/**
 * The four ordered Step identifiers, in the sequence the wizard advances
 * through them (Req 1.2, 3.1, 3.4). Frozen so the ordered constant cannot
 * be mutated by a consumer.
 *
 * @type {ReadonlyArray<string>}
 */
export const STEPS = Object.freeze([
  'DreamJob',
  'Assessment',
  'Gap',
  'Roadmap',
]);

// Last valid index into STEPS (3 for the four-step sequence). Computed from
// STEPS.length so the bounds stay correct if the sequence ever changes.
const LAST_INDEX = STEPS.length - 1;

/**
 * Coerce an arbitrary value to an integer step index clamped into the
 * valid range `[0, STEPS.length - 1]` (i.e. `[0, 3]`) (Req 1.2).
 *
 * Coercion rules:
 *   - Non-numeric / non-finite inputs (`undefined`, `null`, `NaN`,
 *     `Infinity`, strings, objects, …) clamp to `0`.
 *   - Finite numbers are truncated toward zero (`Math.trunc`) and then
 *     clamped into range.
 *
 * The function is idempotent: `clampStepIndex(clampStepIndex(n))` always
 * equals `clampStepIndex(n)`, because the output is already an integer in
 * range and re-applying the rules leaves it unchanged.
 *
 * @param {unknown} n - any value
 * @returns {number} an integer `i` with `0 <= i <= STEPS.length - 1`
 */
export function clampStepIndex(n) {
  const num = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(num)) {
    return 0;
  }
  const truncated = Math.trunc(num);
  if (truncated < 0) {
    return 0;
  }
  if (truncated > LAST_INDEX) {
    return LAST_INDEX;
  }
  return truncated;
}

/**
 * Is `dreamJobId` a non-empty string? Mirrors the single-page layout's
 * `showAssessment` predicate exactly.
 *
 * @param {unknown} dreamJobId
 * @returns {boolean}
 */
function hasDreamJob(dreamJobId) {
  return typeof dreamJobId === 'string' && dreamJobId.length > 0;
}

/**
 * Is the Step at `targetIndex` reachable given the current gate state?
 * (Req 4.1, 4.2, 4.3, 4.4, 4.6)
 *
 *   DreamJob   (0): always reachable.
 *   Assessment (1): `dreamJobId` is a non-empty string.
 *   Gap        (2): `dreamJobId` is a non-empty string.
 *   Roadmap    (3): `dreamJobId` is a non-empty string AND
 *                   `skillAssessment` is neither null nor undefined.
 *
 * This is exactly the `(showAssessment, showRoadmap)` predicate pair used
 * by the current single-page layout, so a Step is reachable here iff its
 * section would be visible there (Req 4.6).
 *
 * @param {number} targetIndex - the Step index to test for reachability
 * @param {{ dreamJobId?: unknown, skillAssessment?: unknown }} state
 * @returns {boolean}
 */
export function stepReachable(targetIndex, state) {
  const { dreamJobId, skillAssessment } = state || {};

  if (targetIndex === 0) {
    return true;
  }

  if (targetIndex === 1 || targetIndex === 2) {
    return hasDreamJob(dreamJobId);
  }

  if (targetIndex === 3) {
    return (
      hasDreamJob(dreamJobId) &&
      skillAssessment !== null &&
      skillAssessment !== undefined
    );
  }

  return false;
}

/**
 * Can the user advance FROM `fromIndex`? True iff a next Step exists and
 * that next Step is reachable. Drives the enabled/disabled state of the
 * "Next" control (Req 2.1, 2.4, 4.5).
 *
 *   canAdvance(i, s) === i < STEPS.length - 1 && stepReachable(i + 1, s)
 *
 * @param {number} fromIndex
 * @param {{ dreamJobId?: unknown, skillAssessment?: unknown }} state
 * @returns {boolean}
 */
export function canAdvance(fromIndex, state) {
  return fromIndex < LAST_INDEX && stepReachable(fromIndex + 1, state);
}

/**
 * Is there a previous Step to go back to? Drives the "Back" control
 * (Req 2.2, 2.3).
 *
 *   canGoBack(i) === clampStepIndex(i) > 0
 *
 * @param {number} fromIndex
 * @returns {boolean}
 */
export function canGoBack(fromIndex) {
  return clampStepIndex(fromIndex) > 0;
}

/**
 * Pure forward transition. Advances by exactly one Step when permitted,
 * otherwise it is a no-op that returns the (clamped) current index
 * (Req 2.5, 4.1, 4.2).
 *
 *   advanceIndex(i, s) === canAdvance(i, s) ? i + 1 : clampStepIndex(i)
 *
 * @param {number} fromIndex
 * @param {{ dreamJobId?: unknown, skillAssessment?: unknown }} state
 * @returns {number}
 */
export function advanceIndex(fromIndex, state) {
  return canAdvance(fromIndex, state)
    ? fromIndex + 1
    : clampStepIndex(fromIndex);
}

/**
 * Pure backward transition. Decreases the (clamped) current index by
 * exactly one, never going below the first Step (Req 2.6, 2.3).
 *
 *   retreatIndex(i) === Math.max(0, clampStepIndex(i) - 1)
 *
 * @param {number} fromIndex
 * @returns {number}
 */
export function retreatIndex(fromIndex) {
  return Math.max(0, clampStepIndex(fromIndex) - 1);
}
