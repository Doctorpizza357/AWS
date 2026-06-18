/**
 * GameEngine - Manages the PixiJS Application lifecycle, game loop, and canvas mounting.
 * Handles pause/resume, FPS monitoring, and responsive scaling.
 */
import * as PIXI from 'pixi.js';
import EventBus, { GameEvents } from './EventBus';

class GameEngine {
  constructor(containerRef, options = {}) {
    this._containerRef = containerRef;
    this._options = options;
    this._app = null;
    this._isPaused = false;
    this._isInitialized = false;
    this._isDestroyed = false;
    this._fpsHistory = [];
    this._fpsDropEmitted = false;
    this._reducedGraphics = false;
    this._eventBus = EventBus.getInstance();

    // Bind event handlers
    this._handlePause = this._handlePause.bind(this);
    this._handleResume = this._handleResume.bind(this);
    this._handleDestroy = this._handleDestroy.bind(this);
    this._fpsMonitorCallback = this._fpsMonitorCallback.bind(this);
  }

  get app() {
    return this._app;
  }

  get stage() {
    return this._app ? this._app.stage : null;
  }

  get isPaused() {
    return this._isPaused;
  }

  get isInitialized() {
    return this._isInitialized;
  }

  get isDestroyed() {
    return this._isDestroyed;
  }

  get fps() {
    if (!this._app || !this._app.ticker) return 0;
    return this._app.ticker.FPS;
  }

  get memoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
    }
    return 0;
  }

  get reducedGraphics() {
    return this._reducedGraphics;
  }

  async initialize() {
    if (this._isInitialized || this._isDestroyed) return;

    const container = this._containerRef;
    if (!container || typeof container.appendChild !== 'function') return;

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;

    // Clamp width to supported range
    width = Math.max(320, Math.min(2560, width));

    this._app = new PIXI.Application({
      width,
      height,
      backgroundColor: 0x87CEEB,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      ...this._options,
    });

    container.appendChild(this._app.view);

    // Subscribe to EventBus commands
    this._eventBus.on(GameEvents.PAUSE_GAME, this._handlePause);
    this._eventBus.on(GameEvents.RESUME_GAME, this._handleResume);
    this._eventBus.on(GameEvents.DESTROY_GAME, this._handleDestroy);

    this._isInitialized = true;
    this._eventBus.emit(GameEvents.GAME_READY, { timestamp: Date.now() });

    // Handle window resize — resize the renderer to match the container
    this._handleResize = () => {
      if (!this._app || this._isDestroyed) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      this._app.renderer.resize(w, h);
      // Notify world to update camera bounds
      this._eventBus.emit('VIEWPORT_RESIZE', { width: w, height: h });
    };
    window.addEventListener('resize', this._handleResize);
  }

  start() {
    if (!this._isInitialized || this._isDestroyed) return;
    this._app.ticker.start();
    this._app.ticker.add(this._fpsMonitorCallback, this);
    this._isPaused = false;
  }

  pause() {
    if (!this._isInitialized || this._isPaused || this._isDestroyed) return;
    this._app.ticker.stop();
    this._isPaused = true;
    this._fpsHistory = [];
    this._eventBus.emit(GameEvents.GAME_PAUSED, { timestamp: Date.now() });
  }

  resume() {
    if (!this._isInitialized || !this._isPaused || this._isDestroyed) return;
    this._app.ticker.start();
    this._isPaused = false;
    this._eventBus.emit(GameEvents.GAME_RESUMED, { timestamp: Date.now() });
  }

  destroy() {
    if (this._isDestroyed) return;
    this._isDestroyed = true;
    this._isInitialized = false;

    window.removeEventListener('resize', this._handleResize);

    this._eventBus.off(GameEvents.PAUSE_GAME, this._handlePause);
    this._eventBus.off(GameEvents.RESUME_GAME, this._handleResume);
    this._eventBus.off(GameEvents.DESTROY_GAME, this._handleDestroy);

    if (this._app) {
      this._app.ticker.remove(this._fpsMonitorCallback, this);
      this._app.destroy(true, { children: true, texture: true, baseTexture: true });
      this._app = null;
    }

    this._fpsHistory = [];
  }

  setReducedGraphics(enabled) {
    this._reducedGraphics = enabled;
  }

  addToStage(displayObject) {
    if (this._app && this._app.stage) {
      this._app.stage.addChild(displayObject);
    }
  }

  addTickerCallback(callback) {
    if (this._app) {
      this._app.ticker.add(callback);
    }
  }

  removeTickerCallback(callback) {
    if (this._app) {
      this._app.ticker.remove(callback);
    }
  }

  _handlePause() {
    this.pause();
  }

  _handleResume() {
    this.resume();
  }

  _handleDestroy() {
    this.destroy();
  }

  _fpsMonitorCallback() {
    if (this._isPaused || !this._app) return;

    const currentFPS = this._app.ticker.FPS;
    const now = Date.now();

    this._fpsHistory.push({ timestamp: now, fps: currentFPS });

    // Keep only entries within last 3 seconds
    const cutoff = now - 3000;
    this._fpsHistory = this._fpsHistory.filter(e => e.timestamp >= cutoff);

    // Need at least 3 seconds of data
    if (this._fpsHistory.length >= 4) {
      const timeSpan = this._fpsHistory[this._fpsHistory.length - 1].timestamp - this._fpsHistory[0].timestamp;
      if (timeSpan >= 3000) {
        const avg = this._fpsHistory.reduce((sum, e) => sum + e.fps, 0) / this._fpsHistory.length;
        if (avg < 20 && !this._fpsDropEmitted) {
          this._fpsDropEmitted = true;
          this._eventBus.emit(GameEvents.FRAME_DROP, { averageFps: avg, timestamp: now });
        } else if (avg >= 20) {
          this._fpsDropEmitted = false;
        }
      }
    }
  }
}

export default GameEngine;
