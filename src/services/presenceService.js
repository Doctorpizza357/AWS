/**
 * Presence Service
 * Manages real-time user presence and position syncing in Firestore.
 * 
 * Each online user writes to `presence/{uid}` with:
 *   - displayName, photoURL, level, activeCareer
 *   - position (campus x/y for game rendering)
 *   - lastSeen (server timestamp)
 *   - online (boolean)
 * 
 * Position updates are throttled to avoid Firestore write rate limits.
 * Uses onSnapshot for real-time reads — other players appear to move smoothly
 * via client-side interpolation between position updates.
 */
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const PRESENCE_COLLECTION = 'presence';
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes — consider offline if no heartbeat
const POSITION_THROTTLE_MS = 200; // Throttle position writes to 5/sec max

/**
 * Start broadcasting presence for the current user.
 * Returns an unsubscribe function to stop broadcasting.
 */
export function startPresence(uid, userData = {}) {
  if (!uid) return () => {};

  const presenceRef = doc(db, PRESENCE_COLLECTION, uid);
  let heartbeatInterval = null;
  let isActive = true;

  const presenceData = {
    uid,
    displayName: userData.displayName || 'Anonymous',
    photoURL: userData.photoURL || '',
    level: userData.level || 1,
    activeCareer: userData.activeCareer || null,
    avatar: userData.avatar || {},
    position: userData.position || { x: 400, y: 300 },
    online: true,
    lastSeen: serverTimestamp(),
  };

  // Write initial presence
  setDoc(presenceRef, presenceData, { merge: true }).catch(console.error);

  // Heartbeat every 60 seconds to keep presence fresh
  heartbeatInterval = setInterval(() => {
    if (!isActive) return;
    setDoc(presenceRef, { lastSeen: serverTimestamp(), online: true }, { merge: true }).catch(console.error);
  }, 60000);

  // Handle tab visibility changes
  const handleVisibility = () => {
    if (document.hidden) {
      setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(console.error);
    } else {
      setDoc(presenceRef, { online: true, lastSeen: serverTimestamp() }, { merge: true }).catch(console.error);
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);

  // Handle page unload
  const handleUnload = () => {
    try {
      setDoc(presenceRef, { online: false, lastSeen: Timestamp.now() }, { merge: true });
    } catch (e) {}
  };
  window.addEventListener('beforeunload', handleUnload);

  // Return cleanup function
  return () => {
    isActive = false;
    clearInterval(heartbeatInterval);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('beforeunload', handleUnload);
    setDoc(presenceRef, { online: false, lastSeen: serverTimestamp() }, { merge: true }).catch(console.error);
  };
}

/**
 * Throttled position updater.
 * Call this as often as you like (e.g., every frame) — it batches and
 * only writes to Firestore at most once per POSITION_THROTTLE_MS.
 */
export function createPositionBroadcaster(uid) {
  if (!uid) return () => {};

  const presenceRef = doc(db, PRESENCE_COLLECTION, uid);
  let lastWrite = 0;
  let pendingPosition = null;
  let timeoutId = null;

  const flush = () => {
    if (!pendingPosition) return;
    const pos = pendingPosition;
    pendingPosition = null;
    lastWrite = Date.now();
    setDoc(presenceRef, { position: pos, lastSeen: serverTimestamp() }, { merge: true }).catch(console.error);
  };

  /**
   * Call this with the player's current position.
   * Writes are throttled to POSITION_THROTTLE_MS.
   */
  const broadcast = (position) => {
    pendingPosition = position;
    const elapsed = Date.now() - lastWrite;

    if (elapsed >= POSITION_THROTTLE_MS) {
      // Enough time has passed — write immediately
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      flush();
    } else if (!timeoutId) {
      // Schedule a write for when the throttle window expires
      timeoutId = setTimeout(() => {
        timeoutId = null;
        flush();
      }, POSITION_THROTTLE_MS - elapsed);
    }
  };

  /** Cleanup pending timers. */
  broadcast.dispose = () => {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    flush(); // Final write
  };

  return broadcast;
}

/**
 * Update presence metadata (level, career, name).
 */
export function updatePresenceData(uid, data) {
  if (!uid) return;
  const presenceRef = doc(db, PRESENCE_COLLECTION, uid);
  setDoc(presenceRef, { ...data, lastSeen: serverTimestamp() }, { merge: true }).catch(console.error);
}

/**
 * Subscribe to all online users' presence (real-time).
 * Calls `onChange(users[])` whenever any player's data changes.
 * Returns an unsubscribe function.
 */
export function subscribeToPresence(currentUid, onChange) {
  const presenceQuery = query(
    collection(db, PRESENCE_COLLECTION),
    where('online', '==', true)
  );

  const unsubscribe = onSnapshot(presenceQuery, (snapshot) => {
    const now = Date.now();
    const users = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Skip self (same uid in a different tab doesn't count as another player)
      if (data.uid === currentUid) return;

      // Filter out stale presence (lastSeen > 5 min ago)
      const lastSeen = data.lastSeen?.toMillis?.() || 0;
      if (now - lastSeen > STALE_THRESHOLD_MS) return;

      users.push({
        uid: docSnap.id,
        displayName: data.displayName || 'Anonymous',
        photoURL: data.photoURL || '',
        level: data.level || 1,
        activeCareer: data.activeCareer || null,
        avatar: data.avatar || {},
        position: data.position || { x: 0, y: 0 },
        lastSeen: data.lastSeen,
      });
    });

    onChange(users);
  }, (error) => {
    console.error('[Presence] Subscribe error:', error);
    onChange([]);
  });

  return unsubscribe;
}
