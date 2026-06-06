// Avatar Rotation Service
// Handles avatar selection logic and rotation history persistence.
// Uses localStorage for cross-session rotation tracking and sessionStorage
// for within-session last-shown tracking.

const ROTATION_HISTORY_KEY = 'avatar-rotation-history';
const LAST_SHOWN_KEY = 'avatar-last-shown';

// ─── Storage Helpers ───────────────────────────────────────────────────────────

/**
 * Check if localStorage is available and functional.
 */
function isLocalStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if sessionStorage is available and functional.
 */
function isSessionStorageAvailable() {
  try {
    const testKey = '__storage_test__';
    sessionStorage.setItem(testKey, '1');
    sessionStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Rotation History (localStorage) ───────────────────────────────────────────

/**
 * Retrieve the list of previously shown avatar IDs from localStorage.
 * Returns an empty array if localStorage is unavailable or data is invalid.
 */
function getRotationHistory() {
  if (!isLocalStorageAvailable()) {
    return [];
  }
  try {
    const stored = localStorage.getItem(ROTATION_HISTORY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * Save the rotation history to localStorage.
 * Silently fails if localStorage is unavailable.
 */
function saveRotationHistory(history) {
  if (!isLocalStorageAvailable()) {
    return;
  }
  try {
    localStorage.setItem(ROTATION_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    // Silently fail — fallback to session-only tracking
  }
}

/**
 * Clear the rotation history from localStorage (starts a new cycle).
 * Silently fails if localStorage is unavailable.
 */
function clearRotationHistory() {
  if (!isLocalStorageAvailable()) {
    return;
  }
  try {
    localStorage.removeItem(ROTATION_HISTORY_KEY);
  } catch (e) {
    // Silently fail
  }
}

// ─── Session History (sessionStorage) ──────────────────────────────────────────

/**
 * Retrieve the session history (list of avatar IDs shown this session).
 * Uses the last-shown key to track the most recently displayed avatar.
 * Returns an array with the last shown ID, or empty if none.
 */
function getSessionHistory() {
  if (!isSessionStorageAvailable()) {
    return [];
  }
  try {
    const lastShown = sessionStorage.getItem(LAST_SHOWN_KEY);
    return lastShown ? [lastShown] : [];
  } catch (e) {
    return [];
  }
}

/**
 * Add an avatar ID to the session history (records it as last shown).
 * Silently fails if sessionStorage is unavailable.
 */
function addToSessionHistory(avatarId) {
  if (!isSessionStorageAvailable()) {
    return;
  }
  try {
    sessionStorage.setItem(LAST_SHOWN_KEY, avatarId);
  } catch (e) {
    // Silently fail
  }
}

// ─── Selection Logic ───────────────────────────────────────────────────────────

/**
 * Select the next avatar from the pool using the rotation strategy.
 *
 * Algorithm:
 * 1. Filter pool to exclude IDs present in rotationHistory.
 * 2. If eligible set is empty, reset cycle (use full pool).
 * 3. From eligible set, exclude lastShownId (no-consecutive-repeat).
 * 4. If only one avatar remains and it equals lastShownId, allow it (edge case).
 * 5. Pseudo-randomly select from remaining eligible set.
 *
 * @param {Array} pool - Array of AvatarCharacter objects
 * @param {Array} rotationHistory - Array of avatar IDs already shown in current cycle
 * @param {string|null} lastShownId - ID of the avatar shown at the immediately preceding checkpoint
 * @returns {object} The selected AvatarCharacter object
 */
function selectNextAvatar(pool, rotationHistory, lastShownId) {
  if (!pool || pool.length === 0) {
    return null;
  }

  // Single avatar in pool — always return it
  if (pool.length === 1) {
    return pool[0];
  }

  const historySet = new Set(rotationHistory || []);

  // Step 1: Exclude IDs present in rotation history
  let eligible = pool.filter((avatar) => !historySet.has(avatar.id));

  // Step 2: If eligible set is empty, start a new cycle with the full pool
  if (eligible.length === 0) {
    eligible = [...pool];
  }

  // Step 3: Exclude lastShownId (no-consecutive-repeat rule)
  if (lastShownId && eligible.length > 1) {
    const withoutLast = eligible.filter((avatar) => avatar.id !== lastShownId);
    if (withoutLast.length > 0) {
      eligible = withoutLast;
    }
    // Step 4: If only one avatar remains and it equals lastShownId, allow it
    // (this naturally happens when withoutLast is empty, we keep eligible as-is)
  }

  // Step 5: Pseudo-random selection from remaining eligible set
  const index = Math.floor(Math.random() * eligible.length);
  return eligible[index];
}

module.exports = {
  selectNextAvatar,
  getRotationHistory,
  saveRotationHistory,
  clearRotationHistory,
  getSessionHistory,
  addToSessionHistory,
};
