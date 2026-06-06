// Avatar Message Service
// Handles message selection for checkpoint avatars.
// Picks messages from the correct checkpoint set, supports SkillBridge
// wizard-step matching with fallback to general tips, and provides
// hardcoded default messages when data is unavailable.

// ─── Default Fallback Messages ─────────────────────────────────────────────────

const DEFAULT_MESSAGES = {
  landing:
    'Welcome to STEM PathfindR! Explore careers, build skills, and practice interviews.',
  skillbridge:
    'Keep building your skills — every step counts toward your dream career.',
  'mock-interview':
    "You've got this! Take a breath and show them what you know.",
};

// ─── Message Selection ─────────────────────────────────────────────────────────

/**
 * Select a message for the given checkpoint.
 *
 * @param {string} checkpointId - The checkpoint to select a message for ("landing", "skillbridge", "mock-interview")
 * @param {Array} messages - The full checkpointMessages array (each entry: { checkpointId, messages: [...] })
 * @param {object} [options={}] - Additional options
 * @param {string} [options.wizardStep] - Current SkillBridge wizard step for contextual tip selection
 * @returns {string} The selected message text (always returns a string)
 */
function selectMessage(checkpointId, messages, options = {}) {
  // Guard: if messages is not a valid array, return default
  if (!Array.isArray(messages) || messages.length === 0) {
    return getDefaultMessage(checkpointId);
  }

  // Find the checkpoint entry
  const checkpoint = messages.find((cp) => cp.checkpointId === checkpointId);

  // Guard: if checkpoint not found or has no messages, return default
  if (!checkpoint || !Array.isArray(checkpoint.messages) || checkpoint.messages.length === 0) {
    return getDefaultMessage(checkpointId);
  }

  const pool = checkpoint.messages;

  // SkillBridge special handling: prefer step-specific messages
  if (checkpointId === 'skillbridge' && options.wizardStep) {
    const stepMessages = pool.filter(
      (msg) => msg.wizardStep === options.wizardStep
    );

    if (stepMessages.length > 0) {
      // Pick randomly from step-specific messages
      return pickRandom(stepMessages).text;
    }

    // Fall back to general tips (messages without a wizardStep)
    const generalMessages = pool.filter((msg) => !msg.wizardStep);
    if (generalMessages.length > 0) {
      return pickRandom(generalMessages).text;
    }
  }

  // Default path: pick randomly from the full checkpoint message pool
  return pickRandom(pool).text;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick a random item from an array.
 * @param {Array} arr - Non-empty array
 * @returns {*} A randomly selected element
 */
function pickRandom(arr) {
  const index = Math.floor(Math.random() * arr.length);
  return arr[index];
}

/**
 * Get the hardcoded default message for a checkpoint.
 * Returns a generic fallback if the checkpoint ID is unknown.
 * @param {string} checkpointId
 * @returns {string}
 */
function getDefaultMessage(checkpointId) {
  return (
    DEFAULT_MESSAGES[checkpointId] ||
    'Welcome! Let us help you on your STEM journey.'
  );
}

module.exports = {
  selectMessage,
  getDefaultMessage,
  DEFAULT_MESSAGES,
};
