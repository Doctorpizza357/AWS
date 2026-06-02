// Text-to-Speech service using Edge TTS (server-side neural voices)
// Works in all browsers — audio is generated server-side and streamed as MP3.

const API_BASE = process.env.REACT_APP_API_URL || '';

let currentAudio = null;

/**
 * Speak the given text using Edge TTS neural voices via the backend.
 * Returns a promise that resolves when playback starts.
 * Call stopSpeaking() to interrupt.
 *
 * @param {string} text - Text to speak
 * @param {string} [voice] - Voice name (default: en-US-GuyNeural)
 * @returns {Promise<HTMLAudioElement>}
 */
export async function speakText(text, voice) {
  // Stop any currently playing audio first
  stopSpeaking();

  const response = await fetch(`${API_BASE}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    throw new Error(`TTS request failed: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const audio = new Audio(url);
  currentAudio = audio;

  // Clean up object URL when done
  audio.addEventListener('ended', () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  });
  audio.addEventListener('error', () => {
    URL.revokeObjectURL(url);
    if (currentAudio === audio) currentAudio = null;
  });

  await audio.play();
  return audio;
}

/**
 * Stop any currently playing TTS audio.
 */
export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
}

/**
 * Check if TTS audio is currently playing.
 */
export function isSpeaking() {
  return currentAudio !== null && !currentAudio.paused;
}
