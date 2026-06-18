/**
 * Challenge Service
 * Manages interview challenges between friends via Firestore.
 * 
 * Collection: challenges/{challengeId}
 * {
 *   challenger: uid,
 *   opponent: uid,
 *   challengerName: string,
 *   opponentName: string,
 *   status: 'pending' | 'accepted' | 'active' | 'completed',
 *   type: 'technical' | 'behavioral' | 'mixed',
 *   questions: [],
 *   createdAt: timestamp,
 *   
 *   // Live pose data (updated during recording)
 *   challengerPose: { keypoints, visible, timestamp },
 *   opponentPose: { keypoints, visible, timestamp },
 *   
 *   // Results (filled after completion)
 *   challengerResults: { score, speechStats, bodyResults },
 *   opponentResults: { score, speechStats, bodyResults },
 * }
 */
import {
  doc,
  setDoc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const CHALLENGES_COLLECTION = 'challenges';

// Throttle pose writes to ~100ms (10fps) to stay within Firestore limits
const POSE_THROTTLE_MS = 100;

/**
 * Create a new challenge invite.
 */
export async function createChallenge(challengerUid, opponentUid, challengerName, opponentName, type = 'technical', questions = []) {
  const docRef = await addDoc(collection(db, CHALLENGES_COLLECTION), {
    challenger: challengerUid,
    opponent: opponentUid,
    challengerName: challengerName || 'Anonymous',
    opponentName: opponentName || 'Anonymous',
    status: 'pending',
    type,
    questions,
    createdAt: serverTimestamp(),
    challengerPose: null,
    opponentPose: null,
    challengerResults: null,
    opponentResults: null,
    challengerRecording: false,
    opponentRecording: false,
  });
  return docRef.id;
}

/**
 * Accept a challenge.
 */
export async function acceptChallenge(challengeId) {
  await updateDoc(doc(db, CHALLENGES_COLLECTION, challengeId), {
    status: 'active',
  });
}

/**
 * Decline a challenge (opponent rejects). Deletes the doc so it disappears.
 */
export async function declineChallenge(challengeId) {
  await deleteDoc(doc(db, CHALLENGES_COLLECTION, challengeId));
}

/**
 * Cancel a challenge (challenger withdraws). Deletes the doc.
 */
export async function cancelChallenge(challengeId) {
  await deleteDoc(doc(db, CHALLENGES_COLLECTION, challengeId));
}

/**
 * Set recording state for a participant.
 */
export async function setRecordingState(challengeId, role, isRecording) {
  const field = role === 'challenger' ? 'challengerRecording' : 'opponentRecording';
  await updateDoc(doc(db, CHALLENGES_COLLECTION, challengeId), {
    [field]: isRecording,
  });
}

/**
 * Submit results for a participant.
 */
export async function submitResults(challengeId, role, results) {
  const field = role === 'challenger' ? 'challengerResults' : 'opponentResults';
  const update = { [field]: results };

  // Check if both have submitted
  const snap = await getDoc(doc(db, CHALLENGES_COLLECTION, challengeId));
  const data = snap.data();
  const otherField = role === 'challenger' ? 'opponentResults' : 'challengerResults';
  if (data?.[otherField]) {
    update.status = 'completed';
  }

  await updateDoc(doc(db, CHALLENGES_COLLECTION, challengeId), update);
}

/**
 * Create a throttled pose broadcaster for a challenge.
 * Writes the user's pose frame to Firestore at ~10fps.
 */
export function createPoseBroadcaster(challengeId, role) {
  const challengeRef = doc(db, CHALLENGES_COLLECTION, challengeId);
  const field = role === 'challenger' ? 'challengerPose' : 'opponentPose';

  let lastWrite = 0;
  let pendingPose = null;
  let timeoutId = null;

  const flush = () => {
    if (!pendingPose) return;
    const pose = pendingPose;
    pendingPose = null;
    lastWrite = Date.now();

    // Only send minimal keypoint data to stay within Firestore doc size limits
    const minimalPose = {
      keypoints: (pose.keypoints || []).map(kp => ({
        name: kp.name,
        x: Math.round(kp.x),
        y: Math.round(kp.y),
        score: Math.round((kp.score || 0) * 100) / 100,
      })),
      visible: pose.visible || false,
      width: pose.width || 640,
      height: pose.height || 480,
      timestamp: Date.now(),
    };

    updateDoc(challengeRef, { [field]: minimalPose }).catch(() => {});
  };

  const broadcast = (poseFrame) => {
    pendingPose = poseFrame;
    const elapsed = Date.now() - lastWrite;

    if (elapsed >= POSE_THROTTLE_MS) {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
      flush();
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        timeoutId = null;
        flush();
      }, POSE_THROTTLE_MS - elapsed);
    }
  };

  broadcast.dispose = () => {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    // Clear pose on disconnect
    updateDoc(challengeRef, { [field]: null }).catch(() => {});
  };

  return broadcast;
}

/**
 * Subscribe to a challenge document (real-time updates).
 * Used to receive the opponent's pose frames and status changes.
 */
export function subscribeToChallenge(challengeId, onChange) {
  return onSnapshot(doc(db, CHALLENGES_COLLECTION, challengeId), (snap) => {
    if (snap.exists()) {
      onChange({ id: snap.id, ...snap.data() });
    } else {
      onChange(null);
    }
  }, (error) => {
    console.error('[Challenge] Subscribe error:', error);
    onChange(null);
  });
}

/**
 * Subscribe to pending challenges for the current user (incoming invites).
 */
export function subscribeToPendingChallenges(uid, onChange) {
  const q = query(
    collection(db, CHALLENGES_COLLECTION),
    where('opponent', '==', uid),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snapshot) => {
    const challenges = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    onChange(challenges);
  }, (error) => {
    console.error('[Challenge] Pending subscribe error:', error);
    onChange([]);
  });
}

/**
 * Subscribe to active challenges the user is part of.
 */
export function subscribeToActiveChallenges(uid, onChange) {
  // We need to check both challenger and opponent fields.
  // Firestore doesn't support OR queries across fields, so we use two listeners.
  let challengerResults = [];
  let opponentResults = [];
  let called = false;

  const merge = () => {
    const all = [...challengerResults, ...opponentResults];
    // Deduplicate by id
    const unique = Array.from(new Map(all.map(c => [c.id, c])).values());
    onChange(unique);
  };

  const unsub1 = onSnapshot(
    query(collection(db, CHALLENGES_COLLECTION), where('challenger', '==', uid), where('status', '==', 'active')),
    (snap) => { challengerResults = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge(); },
    () => { challengerResults = []; merge(); }
  );

  const unsub2 = onSnapshot(
    query(collection(db, CHALLENGES_COLLECTION), where('opponent', '==', uid), where('status', '==', 'active')),
    (snap) => { opponentResults = snap.docs.map(d => ({ id: d.id, ...d.data() })); merge(); },
    () => { opponentResults = []; merge(); }
  );

  return () => { unsub1(); unsub2(); };
}


/**
 * Subscribe to challenges the user sent that are still pending.
 */
export function subscribeToSentChallenges(uid, onChange) {
  const q = query(
    collection(db, CHALLENGES_COLLECTION),
    where('challenger', '==', uid),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snapshot) => {
    const challenges = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    onChange(challenges);
  }, (error) => {
    console.error('[Challenge] Sent subscribe error:', error);
    onChange([]);
  });
}
