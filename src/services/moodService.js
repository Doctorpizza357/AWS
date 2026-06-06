/**
 * Mood/Sentiment Detection Service
 *
 * Tracks user behavior signals to infer emotional state and adjusts
 * the avatar's tone accordingly. Signals include:
 *   - Quick dismissals (frustration/disinterest)
 *   - Time spent on pages (engagement)
 *   - Repeated failures (interviews, assessments)
 *   - Successes and streaks (momentum)
 *   - Interaction frequency (engagement level)
 *
 * The mood is stored in localStorage and decays toward 'neutral' over time.
 */

const MOOD_STORAGE_KEY = 'avatar-user-mood';
const SIGNALS_STORAGE_KEY = 'avatar-mood-signals';
const MAX_SIGNAL_HISTORY = 50;

// ─── Mood States ─────────────────────────────────────────────────────────────

/**
 * Mood spectrum from negative to positive:
 *   frustrated → discouraged → neutral → engaged → thriving
 */
const MOODS = ['frustrated', 'discouraged', 'neutral', 'engaged', 'thriving'];

const MOOD_TONE_MAP = {
  frustrated: 'Be extra gentle and encouraging. The user seems frustrated. Acknowledge difficulty, validate their effort, and suggest a very small next step. Avoid being pushy.',
  discouraged: 'Be warm and patient. The user may be feeling discouraged. Focus on progress they have made, normalize struggle, and offer gentle encouragement.',
  neutral: 'Be friendly and direct. Give a helpful tip with a warm tone.',
  engaged: 'Be energetic and action-oriented. The user is engaged — push them toward their next milestone with confidence.',
  thriving: 'Be celebratory and ambitious. The user is on a roll — challenge them to aim higher and celebrate their momentum.',
};

// ─── Signal Types & Weights ──────────────────────────────────────────────────

const SIGNAL_WEIGHTS = {
  // Negative signals (push mood down)
  quick_dismiss: -2,        // Dismissed avatar in under 3 seconds
  interview_fail: -3,       // Interview score below 40%
  repeated_fail: -4,        // Multiple failures in a row
  rage_quit: -5,            // Left page very quickly after failure
  assessment_low: -2,       // Self-assessed very low on skills

  // Neutral signals
  page_visit: 0,            // Normal page load
  normal_dismiss: 0,        // Dismissed avatar after reading

  // Positive signals (push mood up)
  tell_me_more: +2,         // Clicked "tell me more" on avatar
  assessment_complete: +3,  // Finished an assessment
  interview_pass: +3,       // Interview score above 70%
  interview_great: +5,      // Interview score above 90%
  gap_closed: +4,           // Closed a skill gap
  streak_day: +2,           // Active consecutive day
  long_session: +1,         // Spent more than 5 min on a page
  xp_earned: +1,            // Earned XP from any source
  roadmap_progress: +3,     // Completed a roadmap phase
};

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Get the current mood state.
 * @returns {{ mood: string, score: number, lastUpdated: number }}
 */
export function getMoodState() {
  try {
    const raw = localStorage.getItem(MOOD_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Apply time decay: mood drifts toward neutral over time
      const hoursSinceUpdate = (Date.now() - (parsed.lastUpdated || 0)) / (1000 * 60 * 60);
      let decayedScore = parsed.score || 0;

      // Decay 1 point per 4 hours toward zero (neutral)
      if (hoursSinceUpdate > 4) {
        const decayAmount = Math.floor(hoursSinceUpdate / 4);
        if (decayedScore > 0) {
          decayedScore = Math.max(0, decayedScore - decayAmount);
        } else if (decayedScore < 0) {
          decayedScore = Math.min(0, decayedScore + decayAmount);
        }
      }

      const mood = scoreToMood(decayedScore);
      return { mood, score: decayedScore, lastUpdated: parsed.lastUpdated };
    }
  } catch (e) {
    // Non-critical
  }
  return { mood: 'neutral', score: 0, lastUpdated: Date.now() };
}

/**
 * Record a user behavior signal that adjusts mood.
 * @param {string} signalType - One of the SIGNAL_WEIGHTS keys
 * @param {object} [metadata] - Optional extra data for analytics
 */
export function recordSignal(signalType, metadata = {}) {
  const weight = SIGNAL_WEIGHTS[signalType];
  if (weight === undefined) return;

  const current = getMoodState();
  const newScore = clampScore(current.score + weight);
  const newMood = scoreToMood(newScore);

  // Persist mood
  try {
    localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify({
      mood: newMood,
      score: newScore,
      lastUpdated: Date.now(),
    }));
  } catch (e) {
    // Non-critical
  }

  // Persist signal to history (for pattern detection)
  try {
    const signals = getSignalHistory();
    signals.push({
      type: signalType,
      weight,
      timestamp: Date.now(),
      ...metadata,
    });
    // Keep only last N signals
    const trimmed = signals.slice(-MAX_SIGNAL_HISTORY);
    localStorage.setItem(SIGNALS_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // Non-critical
  }

  return { mood: newMood, score: newScore };
}

/**
 * Get the tone instruction for the current mood (used in avatar prompts).
 * @returns {string}
 */
export function getMoodToneInstruction() {
  const { mood } = getMoodState();
  return MOOD_TONE_MAP[mood] || MOOD_TONE_MAP.neutral;
}

/**
 * Get the current mood label.
 * @returns {string}
 */
export function getCurrentMood() {
  return getMoodState().mood;
}

/**
 * Detect patterns in recent signals for special handling.
 * Returns pattern flags.
 */
export function detectPatterns() {
  const signals = getSignalHistory();
  const recent = signals.filter((s) => Date.now() - s.timestamp < 30 * 60 * 1000); // last 30 min

  const patterns = {
    repeatedFailures: false,
    onARoll: false,
    quickDismisser: false,
    highlyEngaged: false,
  };

  // Check for repeated failures (3+ negative signals in a row)
  const recentNegative = recent.filter((s) => s.weight < 0);
  if (recentNegative.length >= 3) {
    patterns.repeatedFailures = true;
  }

  // Check for streak of successes (3+ positive signals in a row)
  const recentPositive = recent.filter((s) => s.weight > 0);
  if (recentPositive.length >= 3) {
    patterns.onARoll = true;
  }

  // Quick dismisser: 3+ quick_dismiss signals in recent history
  const quickDismisses = recent.filter((s) => s.type === 'quick_dismiss');
  if (quickDismisses.length >= 3) {
    patterns.quickDismisser = true;
  }

  // Highly engaged: 5+ tell_me_more or long_session signals
  const engagementSignals = recent.filter(
    (s) => s.type === 'tell_me_more' || s.type === 'long_session'
  );
  if (engagementSignals.length >= 3) {
    patterns.highlyEngaged = true;
  }

  return patterns;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSignalHistory() {
  try {
    const raw = localStorage.getItem(SIGNALS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function scoreToMood(score) {
  if (score <= -6) return 'frustrated';
  if (score <= -2) return 'discouraged';
  if (score <= 3) return 'neutral';
  if (score <= 8) return 'engaged';
  return 'thriving';
}

function clampScore(score) {
  return Math.max(-10, Math.min(12, score));
}

export { MOODS, MOOD_TONE_MAP, SIGNAL_WEIGHTS };
