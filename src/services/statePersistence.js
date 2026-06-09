/**
 * StatePersistenceManager - Handles Firestore sync, offline queue,
 * sessionStorage write-ahead cache, and conflict resolution.
 */

const SESSION_KEY_PREFIX = 'campus_state_';
const QUEUE_KEY = 'campus_offline_queue';
const MAX_QUEUE_SIZE = 20;

class StatePersistenceManager {
  constructor(userId, firestore = null) {
    this._userId = userId;
    this._firestore = firestore;
    this._offlineQueue = this._loadQueue();
    this._isAuthenticated = !!userId;
  }

  get userId() {
    return this._userId;
  }

  /**
   * Save state to Firestore with timestamp on significant state changes.
   */
  async saveState(stateUpdate, trigger = 'manual') {
    if (!this._isAuthenticated) return false;

    const timestamped = {
      ...stateUpdate,
      timestamp: new Date().toISOString(),
      trigger,
    };

    // Write-ahead to sessionStorage
    this.writeToCache('currentState', timestamped);

    // Attempt Firestore write
    if (this._firestore) {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const docRef = doc(this._firestore, 'users', this._userId, 'gameState', 'current');
        await setDoc(docRef, timestamped, { merge: true });
        return true;
      } catch (err) {
        // Queue for retry
        this.queueUpdate(timestamped);
        return false;
      }
    }

    // No Firestore, queue it
    this.queueUpdate(timestamped);
    return false;
  }

  /**
   * Load state from Firestore (fallback to cache).
   */
  async loadState() {
    if (!this._isAuthenticated) return null;

    let remoteState = null;
    let localState = this.readFromCache('currentState');

    if (this._firestore) {
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const docRef = doc(this._firestore, 'users', this._userId, 'gameState', 'current');
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          remoteState = snapshot.data();
        }
      } catch {
        // Use local cache
      }
    }

    return this.resolveConflict(localState, remoteState);
  }

  /**
   * Resolve conflict: most recent timestamp wins.
   */
  resolveConflict(local, remote) {
    if (!local && !remote) return null;
    if (!local) return remote;
    if (!remote) return local;

    const localTime = new Date(local.timestamp).getTime();
    const remoteTime = new Date(remote.timestamp).getTime();

    return localTime >= remoteTime ? local : remote;
  }

  /**
   * Queue update for offline retry.
   */
  queueUpdate(stateUpdate) {
    this._offlineQueue.push(stateUpdate);

    // Enforce max queue size - evict oldest
    while (this._offlineQueue.length > MAX_QUEUE_SIZE) {
      this._offlineQueue.shift();
    }

    this._saveQueue();
  }

  getQueueSize() {
    return this._offlineQueue.length;
  }

  getQueue() {
    return [...this._offlineQueue];
  }

  /**
   * Flush queued updates when back online.
   */
  async flushQueue() {
    if (!this._firestore || this._offlineQueue.length === 0) return;

    const queue = [...this._offlineQueue];
    const failures = [];

    for (const update of queue) {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const docRef = doc(this._firestore, 'users', this._userId, 'gameState', 'current');
        await setDoc(docRef, update, { merge: true });
      } catch {
        failures.push(update);
      }
    }

    this._offlineQueue = failures;
    this._saveQueue();
  }

  /**
   * Write to sessionStorage (write-ahead cache).
   */
  writeToCache(key, data) {
    const fullKey = `${SESSION_KEY_PREFIX}${this._userId}_${key}`;
    try {
      sessionStorage.setItem(fullKey, JSON.stringify(data));
    } catch {
      // Quota exceeded - evict oldest
      this.evictOldest();
      try {
        sessionStorage.setItem(fullKey, JSON.stringify(data));
      } catch {
        // Cannot write even after eviction
      }
    }
  }

  /**
   * Read from sessionStorage.
   */
  readFromCache(key) {
    if (!this._isAuthenticated) return null;
    const fullKey = `${SESSION_KEY_PREFIX}${this._userId}_${key}`;
    try {
      const data = sessionStorage.getItem(fullKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  /**
   * Evict oldest cached entry to make space.
   */
  evictOldest() {
    const prefix = SESSION_KEY_PREFIX;
    let oldestKey = null;
    let oldestTime = Infinity;

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          if (data && data.timestamp) {
            const time = new Date(data.timestamp).getTime();
            if (time < oldestTime) {
              oldestTime = time;
              oldestKey = key;
            }
          }
        } catch {
          // If we can't parse it, it's a candidate for eviction
          if (!oldestKey) oldestKey = key;
        }
      }
    }

    if (oldestKey) {
      sessionStorage.removeItem(oldestKey);
    }
  }

  /**
   * Clear all campus state on logout.
   */
  clearOnLogout() {
    this._isAuthenticated = false;
    this._offlineQueue = [];

    // Clear all session storage for this user
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(SESSION_KEY_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));

    // Clear queue
    try {
      sessionStorage.removeItem(QUEUE_KEY);
    } catch {
      // Ignore
    }
  }

  _saveQueue() {
    try {
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify(this._offlineQueue));
    } catch {
      // Best effort
    }
  }

  _loadQueue() {
    try {
      const data = sessionStorage.getItem(QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }
}

export default StatePersistenceManager;
