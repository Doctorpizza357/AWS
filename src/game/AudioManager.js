/**
 * AudioManager - Manages ambient audio, SFX, crossfading, and browser autoplay handling.
 */

const STORAGE_KEY = 'campus_audio_prefs';
const DEFAULT_VOLUME = 50;
const CROSSFADE_DURATION = 1500;

class AudioManager {
  constructor() {
    this._volume = DEFAULT_VOLUME;
    this._muted = false;
    this._audioContext = null;
    this._currentAmbient = null;
    this._currentZone = null;
    this._autoplayBlocked = false;
    this._initialized = false;
    this._ambientSources = {};
    this._sfxBuffers = {};

    this.loadPreferences();
  }

  async initialize() {
    if (this._initialized) return;
    try {
      this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (this._audioContext.state === 'suspended') {
        this._autoplayBlocked = true;
      }
      this._initialized = true;
    } catch {
      // Audio not supported, continue silently
      this._initialized = false;
    }
  }

  async playAmbient(zoneId) {
    if (!this._initialized || this._muted || !this._audioContext) return;
    if (this._currentZone === zoneId) return;
    this._currentZone = zoneId;
    // In a real implementation, this would load and play zone-specific audio
    // For now, we track the state
  }

  async crossfadeToZone(zoneId, duration = CROSSFADE_DURATION) {
    if (!this._initialized || this._muted) return;
    if (this._currentZone === zoneId) return;

    // Crossfade logic would go here
    this._currentZone = zoneId;
  }

  stopAmbient() {
    this._currentZone = null;
    if (this._currentAmbient) {
      try {
        this._currentAmbient.stop();
      } catch {
        // Ignore
      }
      this._currentAmbient = null;
    }
  }

  playSFX(type) {
    if (!this._initialized || this._muted) return;
    // SFX types: 'building_enter', 'npc_open', 'npc_close'
    // In production, these would play actual sound files
  }

  playReward(type) {
    if (!this._initialized || this._muted) return;
    // Reward types: 'quest_complete', 'level_up'
  }

  setVolume(value) {
    this._volume = Math.max(0, Math.min(100, value));
    this.savePreferences();
  }

  getVolume() {
    return this._volume;
  }

  setMuted(muted) {
    this._muted = muted;
    if (muted) {
      this.stopAmbient();
    }
    this.savePreferences();
  }

  isMuted() {
    return this._muted;
  }

  isAutoplayBlocked() {
    return this._autoplayBlocked;
  }

  async handleFirstInteraction() {
    if (!this._audioContext) return;
    if (this._audioContext.state === 'suspended') {
      try {
        await this._audioContext.resume();
        this._autoplayBlocked = false;
      } catch {
        // Continue silently
      }
    }
  }

  requestUnmute() {
    return this._autoplayBlocked;
  }

  savePreferences() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        volume: this._volume,
        muted: this._muted,
      }));
    } catch {
      // localStorage unavailable
    }
  }

  loadPreferences() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const prefs = JSON.parse(saved);
        if (typeof prefs.volume === 'number') {
          this._volume = Math.max(0, Math.min(100, prefs.volume));
        }
        if (typeof prefs.muted === 'boolean') {
          this._muted = prefs.muted;
        }
      }
    } catch {
      // Use defaults
    }
  }

  destroy() {
    this.stopAmbient();
    if (this._audioContext) {
      this._audioContext.close().catch(() => {});
      this._audioContext = null;
    }
    this._initialized = false;
  }
}

export default AudioManager;
