import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { avatarCharacters, checkpointMessages } from '../data/avatarData';
import { validateAvatarPool, validateCheckpointMessages } from '../data/avatarValidation';
import {
  selectNextAvatar,
  getRotationHistory,
  saveRotationHistory,
  getSessionHistory,
  addToSessionHistory,
} from '../services/avatarRotationService';
import { selectMessage } from '../services/avatarMessageService';
import { sendAssistantMessage } from '../services/aiService';
import { getMoodToneInstruction, recordSignal, detectPatterns } from '../services/moodService';

// ─── Constants ─────────────────────────────────────────────────────────────────

const DISMISSAL_KEY_PREFIX = 'avatar-dismissed-';
const AVATAR_HISTORY_KEY = 'avatar-message-history';
const MAX_HISTORY_SIZE = 5;

// ─── Context ───────────────────────────────────────────────────────────────────

const AvatarContext = createContext(null);

// ─── Session Storage Helpers ───────────────────────────────────────────────────

function isSessionStorageAvailable() {
  try {
    const testKey = '__avatar_ctx_test__';
    sessionStorage.setItem(testKey, '1');
    sessionStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

function isDismissedForCheckpoint(checkpointId) {
  if (!isSessionStorageAvailable()) return false;
  try {
    return sessionStorage.getItem(DISMISSAL_KEY_PREFIX + checkpointId) === 'true';
  } catch (e) {
    return false;
  }
}

function persistDismissal(checkpointId) {
  if (!isSessionStorageAvailable()) return;
  try {
    sessionStorage.setItem(DISMISSAL_KEY_PREFIX + checkpointId, 'true');
  } catch (e) {
    // Silently fail
  }
}

// ─── Conversation Memory ──────────────────────────────────────────────────────

function getMessageHistory() {
  try {
    const raw = localStorage.getItem(AVATAR_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function appendToHistory(message) {
  try {
    const history = getMessageHistory();
    history.push(message);
    // Keep only the last N messages
    const trimmed = history.slice(-MAX_HISTORY_SIZE);
    localStorage.setItem(AVATAR_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    // Non-critical
  }
}

// ─── Validate Pool at Module Load ─────────────────────────────────────────────

const validatedPool = validateAvatarPool(avatarCharacters);
const messagesValid = validateCheckpointMessages(checkpointMessages);

if (validatedPool.length === 0) {
  console.error('[AvatarContext] No valid avatars in pool — avatar system will not render');
}

if (!messagesValid) {
  console.warn('[AvatarContext] Some checkpoint message configurations are invalid');
}

// ─── Avatar Persona Definitions ───────────────────────────────────────────────

const AVATAR_PERSONAS = {
  'avatar-priya': 'You are Priya — analytical, data-driven, and precise. You give structured advice with clear next steps.',
  'avatar-jamal': 'You are Jamal — encouraging, energetic, and motivating. You hype people up and celebrate their progress.',
  'avatar-mei': 'You are Mei — structured, methodical, and organized. You break things into clear steps and timelines.',
  'avatar-carlos': 'You are Carlos — creative, bold, and action-oriented. You push people to take the next leap.',
  'avatar-amara': 'You are Amara — wise, patient, and empathetic. You connect learning to long-term growth.',
  'avatar-alex': 'You are Alex — practical, systems-thinking, and collaborative. You focus on what moves the needle.',
  'avatar-hiroshi': 'You are Hiroshi — disciplined, focused, and encouraging of mastery through daily practice.',
  'avatar-fatima': 'You are Fatima — strategic, forward-looking, and resourceful. You help people see the bigger picture.',
  'avatar-kai': 'You are Kai — curious, experimental, and optimistic. You encourage exploration and learning by doing.',
};

// ─── AI Prompt Builder ─────────────────────────────────────────────────────────

const CHECKPOINT_PROMPTS = {
  landing:
    'Give a short, encouraging welcome tip for someone exploring STEM careers.',
  skillbridge:
    'Give a short, actionable tip for someone working on {wizardStep} in their STEM skill development.',
  'mock-interview':
    'Give a short, motivating tip for someone practicing mock interviews.',
  'assessment-complete':
    'The user just finished their skill self-assessment. Give a short tip about what to do next.',
  'interview-complete':
    'The user just finished a mock interview. Give a short, encouraging tip based on their performance.',
  'gap-closed':
    'The user just closed a skill gap! Celebrate briefly and suggest what to focus on next.',
  'streak':
    'The user has been consistent. Acknowledge their streak and encourage them to keep going.',
  'inactivity':
    'The user hasn\'t been active in a while. Welcome them back warmly and suggest a quick action to re-engage.',
};

function buildAvatarPrompt(checkpointId, options = {}, avatarId = null) {
  let template = CHECKPOINT_PROMPTS[checkpointId] || CHECKPOINT_PROMPTS.landing;

  // Inject wizard step context for SkillBridge
  if (options.wizardStep) {
    const stepLabel = options.wizardStep.replace(/-/g, ' ');
    template = template.replace('{wizardStep}', stepLabel);
  } else {
    template = template.replace('{wizardStep}', 'skill building');
  }

  // ── Real user metrics ──
  const metricsLines = [];

  if (options.dreamJob) {
    metricsLines.push(`Dream job: ${options.dreamJob}`);
  }
  if (options.skillGaps && options.skillGaps.length > 0) {
    const gapSummary = options.skillGaps
      .slice(0, 3)
      .map((g) => `${g.name} (${g.gap}% gap)`)
      .join(', ');
    metricsLines.push(`Top skill gaps: ${gapSummary}`);
  }
  if (typeof options.interviewCount === 'number' && options.interviewCount > 0) {
    metricsLines.push(`Interviews completed: ${options.interviewCount}`);
  }
  if (typeof options.avgInterviewScore === 'number') {
    metricsLines.push(`Average interview score: ${options.avgInterviewScore}%`);
  }
  if (typeof options.roadmapProgress === 'number') {
    metricsLines.push(`Roadmap progress: ${options.roadmapProgress}%`);
  }
  if (typeof options.xpLevel === 'number') {
    metricsLines.push(`Current level: ${options.xpLevel}`);
  }
  if (typeof options.currentXp === 'number') {
    metricsLines.push(`XP: ${options.currentXp}`);
  }

  if (metricsLines.length > 0) {
    template += '\n\nUser context:\n' + metricsLines.join('\n');
  }

  // ── User name ──
  if (options.userName) {
    template += `\nAddress them as ${options.userName}.`;
  }

  // ── Avatar persona ──
  const persona = avatarId && AVATAR_PERSONAS[avatarId]
    ? AVATAR_PERSONAS[avatarId]
    : '';
  if (persona) {
    template = persona + '\n\n' + template;
  }

  // ── Mood/sentiment tone ──
  const moodTone = getMoodToneInstruction();
  const patterns = detectPatterns();
  template += `\n\nTONE INSTRUCTION: ${moodTone}`;
  if (patterns.repeatedFailures) {
    template += ' The user has experienced multiple setbacks recently — be extra compassionate.';
  }
  if (patterns.onARoll) {
    template += ' The user is on a winning streak — match their energy and push them forward.';
  }
  if (patterns.quickDismisser) {
    template += ' The user has been dismissing tips quickly — keep it ultra-brief and punchy.';
  }

  // ── Conversation memory ──
  const history = getMessageHistory();
  if (history.length > 0) {
    template += '\n\nPrevious tips you gave this user (do NOT repeat these):\n';
    template += history.map((h) => `- "${h}"`).join('\n');
  }

  // ── Deep link instruction ──
  template += '\n\nIMPORTANT: If appropriate, end your message with exactly ONE actionable suggestion in this format: [action text](path) where path is one of: /skillbridge, /interview/mock, /dashboard, /interview/resume, /interview/technical. Only include this if it fits naturally.';

  template += '\n\nKeep your response under 35 words total. Be warm and direct — no filler.';
  return template;
}

// ─── Provider Component ────────────────────────────────────────────────────────

export function AvatarProvider({ children }) {
  const [currentAvatar, setCurrentAvatar] = useState(null);
  const [currentMessage, setCurrentMessage] = useState(null);
  const [actionLink, setActionLink] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [checkpointId, setCheckpointId] = useState(null);

  // Track the previous trigger element for focus restoration
  const triggerElementRef = useRef(null);
  // Track when the card was shown (for quick-dismiss detection)
  const shownAtRef = useRef(null);

  /**
   * Parse action links from AI response.
   * Format: "Some message [Click here](/skillbridge)"
   * Returns { text, link } or null
   */
  function parseActionLink(message) {
    if (!message) return null;
    const match = message.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (match) {
      return { text: match[1], path: match[2] };
    }
    return null;
  }

  /**
   * Strip the markdown link syntax from the display message
   */
  function stripLinkFromMessage(message) {
    if (!message) return message;
    return message.replace(/\s*\[([^\]]+)\]\([^)]+\)/, '').trim();
  }

  const triggerCheckpoint = useCallback((cpId, options = {}) => {
    // Graceful degradation: if pool is empty, do not render
    if (validatedPool.length === 0) {
      return;
    }

    // For event-based triggers, use a compound key so dismissals are per-event
    const dismissKey = options.eventId ? `${cpId}-${options.eventId}` : cpId;

    // Check if this checkpoint was already dismissed in this session
    if (isDismissedForCheckpoint(dismissKey)) {
      return;
    }

    // Select avatar using rotation service
    const rotationHistory = getRotationHistory();
    const sessionHistory = getSessionHistory();
    const lastShownId = sessionHistory.length > 0 ? sessionHistory[0] : null;

    const selectedAvatar = selectNextAvatar(validatedPool, rotationHistory, lastShownId);

    if (!selectedAvatar) {
      return;
    }

    // Update rotation history
    const updatedHistory = [...rotationHistory, selectedAvatar.id];
    if (updatedHistory.length >= validatedPool.length) {
      saveRotationHistory([]);
    } else {
      saveRotationHistory(updatedHistory);
    }

    // Record in session history (for no-consecutive-repeat)
    addToSessionHistory(selectedAvatar.id);

    // Store reference to active element for focus restoration on dismiss
    triggerElementRef.current = document.activeElement;

    // Show the card immediately with a loading state, then fetch AI tip
    setCurrentAvatar(selectedAvatar);
    setCheckpointId(dismissKey);
    setIsVisible(true);
    setIsLoading(true);
    setCurrentMessage(null);
    setActionLink(null);
    shownAtRef.current = Date.now();

    // Attempt AI-generated tip; fall back to static message on failure
    const prompt = buildAvatarPrompt(cpId, options, selectedAvatar.id);
    sendAssistantMessage(prompt)
      .then((result) => {
        if (result && result.ok && result.assistant) {
          const rawMessage = result.assistant;
          const link = parseActionLink(rawMessage);
          const cleanMessage = stripLinkFromMessage(rawMessage);
          setCurrentMessage(cleanMessage);
          setActionLink(link);
          // Save to conversation memory
          appendToHistory(cleanMessage);
        } else {
          const fallback = selectMessage(cpId, checkpointMessages, options);
          setCurrentMessage(fallback);
          setActionLink(null);
        }
      })
      .catch(() => {
        const fallback = selectMessage(cpId, checkpointMessages, options);
        setCurrentMessage(fallback);
        setActionLink(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const dismiss = useCallback(() => {
    setIsVisible(false);

    // Record mood signal based on how quickly the card was dismissed
    if (shownAtRef.current) {
      const viewDuration = Date.now() - shownAtRef.current;
      if (viewDuration < 3000) {
        // Dismissed in under 3 seconds — quick dismiss signal
        recordSignal('quick_dismiss');
      } else {
        recordSignal('normal_dismiss');
      }
      shownAtRef.current = null;
    }

    // Persist dismissal to sessionStorage for the current checkpoint
    if (checkpointId) {
      persistDismissal(checkpointId);
    }

    // Restore focus to the element that was active before the card appeared
    if (triggerElementRef.current && typeof triggerElementRef.current.focus === 'function') {
      triggerElementRef.current.focus();
    }
  }, [checkpointId]);

  const contextValue = useMemo(
    () => ({
      state: {
        currentAvatar,
        currentMessage,
        actionLink,
        isVisible,
        isLoading,
        checkpointId,
      },
      triggerCheckpoint,
      dismiss,
    }),
    [currentAvatar, currentMessage, actionLink, isVisible, isLoading, checkpointId, triggerCheckpoint, dismiss]
  );

  return (
    <AvatarContext.Provider value={contextValue}>
      {children}
    </AvatarContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useAvatar() {
  const context = useContext(AvatarContext);
  if (!context) {
    throw new Error('useAvatar must be used within an AvatarProvider');
  }
  return context;
}

export default AvatarContext;
