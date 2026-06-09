/**
 * TransitionBridge - Manages smooth transitions between game world and React features.
 * Handles building entry/exit, transition queuing, and fallback loading.
 */
import EventBus, { GameEvents } from './EventBus';

const ENTER_TIMEOUT_MS = 5000;
const EXIT_DURATION_MS = 1000;

class TransitionBridge {
  constructor(gameEngine, eventBus = EventBus.getInstance()) {
    this._engine = gameEngine;
    this._eventBus = eventBus;
    this._isTransitioning = false;
    this._queue = [];
    this._savedPosition = null;
    this._currentBuildingId = null;
    this._transitionCallbacks = {
      onEnter: null,
      onExit: null,
      onFallback: null,
    };
  }

  setCallbacks(callbacks) {
    this._transitionCallbacks = { ...this._transitionCallbacks, ...callbacks };
  }

  get savedPosition() {
    return this._savedPosition;
  }

  get currentBuildingId() {
    return this._currentBuildingId;
  }

  isTransitioning() {
    return this._isTransitioning;
  }

  async enterBuilding(buildingId, playerPosition) {
    if (this._isTransitioning) {
      this.queueTransition({ type: 'enter', buildingId, playerPosition });
      return;
    }

    this._isTransitioning = true;
    this._savedPosition = playerPosition ? { ...playerPosition } : null;
    this._currentBuildingId = buildingId;

    try {
      // Pause game engine
      if (this._engine) {
        this._engine.pause();
      }

      // Notify React to show overlay
      this._eventBus.emit(GameEvents.BUILDING_ENTERED, { buildingId, savedPosition: this._savedPosition });

      if (this._transitionCallbacks.onEnter) {
        await this._transitionCallbacks.onEnter(buildingId);
      }
    } catch (err) {
      // Fallback: render as full-screen React overlay
      if (this._transitionCallbacks.onFallback) {
        this._transitionCallbacks.onFallback(buildingId);
      }
    } finally {
      this._isTransitioning = false;
      this._processQueue();
    }
  }

  async enterBuildingWithFallback(buildingId, playerPosition, timeoutMs = ENTER_TIMEOUT_MS) {
    if (this._isTransitioning) {
      this.queueTransition({ type: 'enter', buildingId, playerPosition });
      return;
    }

    this._isTransitioning = true;
    this._savedPosition = playerPosition ? { ...playerPosition } : null;
    this._currentBuildingId = buildingId;

    try {
      if (this._engine) {
        this._engine.pause();
      }

      // Race against timeout
      const loadPromise = new Promise((resolve) => {
        this._eventBus.emit(GameEvents.BUILDING_ENTERED, { buildingId, savedPosition: this._savedPosition });
        if (this._transitionCallbacks.onEnter) {
          this._transitionCallbacks.onEnter(buildingId).then(resolve);
        } else {
          resolve();
        }
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Load timeout')), timeoutMs);
      });

      await Promise.race([loadPromise, timeoutPromise]);
    } catch {
      // Fallback to full-screen React overlay
      if (this._transitionCallbacks.onFallback) {
        this._transitionCallbacks.onFallback(buildingId);
      }
    } finally {
      this._isTransitioning = false;
      this._processQueue();
    }
  }

  async exitBuilding() {
    if (this._isTransitioning) {
      this.queueTransition({ type: 'exit' });
      return this._savedPosition;
    }

    this._isTransitioning = true;
    const restoredPosition = this._savedPosition;

    try {
      if (this._transitionCallbacks.onExit) {
        await this._transitionCallbacks.onExit();
      }

      // Resume game engine
      if (this._engine) {
        this._engine.resume();
      }

      this._currentBuildingId = null;
    } finally {
      this._isTransitioning = false;
      this._processQueue();
    }

    return restoredPosition;
  }

  queueTransition(transition) {
    this._queue.push(transition);
  }

  getQueueLength() {
    return this._queue.length;
  }

  async _processQueue() {
    if (this._queue.length === 0 || this._isTransitioning) return;

    const next = this._queue.shift();
    if (next.type === 'enter') {
      await this.enterBuilding(next.buildingId, next.playerPosition);
    } else if (next.type === 'exit') {
      await this.exitBuilding();
    }
  }
}

export default TransitionBridge;
