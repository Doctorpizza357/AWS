/**
 * AssetManager - Handles progressive loading, caching, retry logic, and memory management.
 */

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const MAX_MEMORY_MB = 300;
const MAX_HTTP_REQUESTS = 10;

class AssetManager {
  constructor(cacheStrategy = 'indexeddb') {
    this._cacheStrategy = cacheStrategy;
    this._loadedAssets = new Map();
    this._loadingPromises = new Map();
    this._loadedChunks = new Set();
    this._retryCount = new Map();
    this._db = null;
    this._initCache();
  }

  async _initCache() {
    if (this._cacheStrategy === 'indexeddb' && typeof indexedDB !== 'undefined') {
      try {
        const request = indexedDB.open('AssetCache', 1);
        request.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('assets')) {
            db.createObjectStore('assets', { keyPath: 'key' });
          }
        };
        this._db = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        });
      } catch {
        this._db = null;
      }
    }
  }

  async loadSpriteSheet(url) {
    return this.loadWithRetry(url);
  }

  async loadChunk(chunkId, priority = 0) {
    if (this._loadedChunks.has(chunkId)) return;
    this._loadedChunks.add(chunkId);
  }

  async preloadZone(zoneId) {
    // Mark zone as preloaded
    this._loadedChunks.add(`zone_${zoneId}`);
  }

  async getCached(key) {
    // Check memory cache first
    if (this._loadedAssets.has(key)) {
      return this._loadedAssets.get(key);
    }

    // Check IndexedDB
    if (this._db) {
      try {
        const tx = this._db.transaction('assets', 'readonly');
        const store = tx.objectStore('assets');
        const result = await new Promise((resolve, reject) => {
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (result && (!result.ttl || Date.now() < result.ttl)) {
          this._loadedAssets.set(key, result.data);
          return result.data;
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  async setCached(key, data, ttl = null) {
    this._loadedAssets.set(key, data);

    if (this._db) {
      try {
        const tx = this._db.transaction('assets', 'readwrite');
        const store = tx.objectStore('assets');
        store.put({
          key,
          data,
          ttl: ttl ? Date.now() + ttl : null,
          timestamp: Date.now(),
        });
      } catch {
        // Silently fail cache write
      }
    }
  }

  async clearCache() {
    this._loadedAssets.clear();
    this._loadedChunks.clear();
    if (this._db) {
      try {
        const tx = this._db.transaction('assets', 'readwrite');
        const store = tx.objectStore('assets');
        store.clear();
      } catch {
        // Silently fail
      }
    }
  }

  async loadWithRetry(url, maxRetries = MAX_RETRIES, delay = RETRY_DELAY_MS) {
    // Check cache first
    const cached = await this.getCached(url);
    if (cached) return cached;

    // If already loading, return the existing promise
    if (this._loadingPromises.has(url)) {
      return this._loadingPromises.get(url);
    }

    const loadPromise = this._attemptLoad(url, maxRetries, delay);
    this._loadingPromises.set(url, loadPromise);

    try {
      const result = await loadPromise;
      this._loadingPromises.delete(url);
      return result;
    } catch (err) {
      this._loadingPromises.delete(url);
      throw err;
    }
  }

  async _attemptLoad(url, maxRetries, delay) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.blob();
        await this.setCached(url, data);
        this._retryCount.delete(url);
        return data;
      } catch (err) {
        lastError = err;
        this._retryCount.set(url, attempt);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }

  getLoadPriority(playerPosition, chunkPosition) {
    const dx = playerPosition.x - chunkPosition.x;
    const dy = playerPosition.y - chunkPosition.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  getLoadedChunks() {
    return [...this._loadedChunks];
  }

  getEstimatedMemoryUsage() {
    let total = 0;
    for (const [, data] of this._loadedAssets) {
      if (data && data.size) {
        total += data.size;
      } else {
        total += 1024; // Estimate 1KB per unknown asset
      }
    }
    return total;
  }

  evictLeastRecentlyUsed() {
    if (this._loadedAssets.size === 0) return;
    // Simple LRU: remove the first (oldest) entry
    const firstKey = this._loadedAssets.keys().next().value;
    this._loadedAssets.delete(firstKey);
  }

  shouldEvict() {
    return this.getEstimatedMemoryUsage() > MAX_MEMORY_MB * 1024 * 1024;
  }

  getRetryCount(url) {
    return this._retryCount.get(url) || 0;
  }
}

export default AssetManager;
