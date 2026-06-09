/**
 * EventBus - Singleton pub/sub for cross-layer communication
 * between the PixiJS Game Engine Layer and React Overlay Layer.
 */

export const GameEvents = {
  // Game → React
  BUILDING_ENTERED: 'building:entered',
  BUILDING_PROXIMITY: 'building:proximity',
  NPC_INTERACTION: 'npc:interaction',
  ZONE_CHANGED: 'zone:changed',
  AVATAR_MOVED: 'avatar:moved',
  FRAME_DROP: 'performance:frameDrop',
  GAME_READY: 'game:ready',
  GAME_PAUSED: 'game:paused',
  GAME_RESUMED: 'game:resumed',

  // React → Game
  PAUSE_GAME: 'game:pause',
  RESUME_GAME: 'game:resume',
  TELEPORT_AVATAR: 'avatar:teleport',
  UPDATE_APPEARANCE: 'avatar:appearance',
  DESTROY_GAME: 'game:destroy',

  // Quest events
  QUEST_COMPLETED: 'quest:completed',
  QUEST_ACTIVATED: 'quest:activated',
  QUEST_TASK_COMPLETED: 'quest:taskCompleted',
  XP_AWARDED: 'xp:awarded',
  LEVEL_UP: 'level:up',

  // NPC events
  NPC_DIALOGUE_OPEN: 'npc:dialogueOpen',
  NPC_DIALOGUE_CLOSE: 'npc:dialogueClose',
  NPC_QUEST_AVAILABLE: 'npc:questAvailable',

  // State events
  STATE_SAVED: 'state:saved',
  STATE_LOADED: 'state:loaded',
};

class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  static getInstance() {
    if (!EventBus._instance) {
      EventBus._instance = new EventBus();
    }
    return EventBus._instance;
  }

  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(handler);
    return this;
  }

  off(event, handler) {
    if (!this._listeners.has(event)) return this;
    const handlers = this._listeners.get(event).filter(h => h !== handler);
    if (handlers.length === 0) {
      this._listeners.delete(event);
    } else {
      this._listeners.set(event, handlers);
    }
    return this;
  }

  emit(event, payload) {
    if (!this._listeners.has(event)) return this;
    const handlers = [...this._listeners.get(event)];
    handlers.forEach(handler => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`EventBus error in handler for "${event}":`, err);
      }
    });
    return this;
  }

  once(event, handler) {
    const wrapper = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    this.on(event, wrapper);
    return this;
  }

  removeAllListeners(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners = new Map();
    }
    return this;
  }
}

export default EventBus;
