/**
 * Friend Service
 * Manages friend requests and friendships via Firestore.
 * 
 * Collections:
 *   - friendRequests/{id}: { from, to, status, createdAt }
 *     status: 'pending' | 'accepted' | 'rejected'
 *   - users/{uid}/friends/{friendUid}: { since, displayName, photoURL }
 * 
 * Flow:
 *   1. User A sends request → creates friendRequests doc (status: pending)
 *   2. User B sees pending request → accepts or rejects
 *   3. On accept → write to both users' friends subcollection, update request status
 */
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const FRIEND_REQUESTS_COLLECTION = 'friendRequests';

/**
 * Send a friend request from one user to another.
 * Prevents duplicate pending requests.
 */
export async function sendFriendRequest(fromUid, toUid, fromData = {}) {
  if (!fromUid || !toUid || fromUid === toUid) {
    throw new Error('Invalid friend request');
  }

  // Check if already friends
  const friendRef = doc(db, 'users', fromUid, 'friends', toUid);
  const friendSnap = await getDoc(friendRef);
  if (friendSnap.exists()) {
    throw new Error('Already friends');
  }

  // Check if a pending request already exists (either direction)
  const existingQuery = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('from', '==', fromUid),
    where('to', '==', toUid),
    where('status', '==', 'pending')
  );
  const existingSnap = await getDocs(existingQuery);
  if (!existingSnap.empty) {
    throw new Error('Request already pending');
  }

  // Check reverse direction too
  const reverseQuery = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('from', '==', toUid),
    where('to', '==', fromUid),
    where('status', '==', 'pending')
  );
  const reverseSnap = await getDocs(reverseQuery);
  if (!reverseSnap.empty) {
    // Auto-accept: they already want to be friends with us
    const reverseDoc = reverseSnap.docs[0];
    await acceptFriendRequest(reverseDoc.id, toUid, fromUid);
    return { autoAccepted: true };
  }

  // Create the friend request
  await addDoc(collection(db, FRIEND_REQUESTS_COLLECTION), {
    from: fromUid,
    to: toUid,
    fromDisplayName: fromData.displayName || 'Anonymous',
    fromPhotoURL: fromData.photoURL || '',
    fromLevel: fromData.level || 1,
    status: 'pending',
    createdAt: serverTimestamp(),
  });

  return { autoAccepted: false };
}

/**
 * Accept a friend request.
 * Creates friend entries for both users.
 */
export async function acceptFriendRequest(requestId, fromUid, toUid) {
  const requestRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId);

  // Update request status
  await updateDoc(requestRef, { status: 'accepted' });

  // Get both users' profiles for the friend record
  const [fromDoc, toDoc] = await Promise.all([
    getDoc(doc(db, 'users', fromUid)),
    getDoc(doc(db, 'users', toUid)),
  ]);

  const fromData = fromDoc.data() || {};
  const toData = toDoc.data() || {};

  // Write to both users' friends subcollection
  await Promise.all([
    setDoc(doc(db, 'users', fromUid, 'friends', toUid), {
      uid: toUid,
      displayName: toData.displayName || toData.profile?.name || 'Anonymous',
      photoURL: toData.photoURL || '',
      level: toData.progress?.level || 1,
      since: serverTimestamp(),
    }),
    setDoc(doc(db, 'users', toUid, 'friends', fromUid), {
      uid: fromUid,
      displayName: fromData.displayName || fromData.profile?.name || 'Anonymous',
      photoURL: fromData.photoURL || '',
      level: fromData.progress?.level || 1,
      since: serverTimestamp(),
    }),
  ]);
}

/**
 * Reject a friend request.
 */
export async function rejectFriendRequest(requestId) {
  const requestRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId);
  await updateDoc(requestRef, { status: 'rejected' });
}

/**
 * Remove a friend from both users' lists.
 */
export async function removeFriend(currentUid, friendUid) {
  await Promise.all([
    deleteDoc(doc(db, 'users', currentUid, 'friends', friendUid)),
    deleteDoc(doc(db, 'users', friendUid, 'friends', currentUid)),
  ]);
}

/**
 * Get the current user's friend list (one-time read).
 */
export async function getFriends(uid) {
  const friendsRef = collection(db, 'users', uid, 'friends');
  const snap = await getDocs(friendsRef);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

/**
 * Subscribe to incoming pending friend requests for the current user.
 * Returns an unsubscribe function.
 */
export function subscribeToFriendRequests(uid, onChange) {
  const q = query(
    collection(db, FRIEND_REQUESTS_COLLECTION),
    where('to', '==', uid),
    where('status', '==', 'pending')
  );

  return onSnapshot(q, (snapshot) => {
    const requests = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    onChange(requests);
  }, (error) => {
    console.error('[Friends] Subscribe error:', error);
    onChange([]);
  });
}

/**
 * Subscribe to the current user's friend list (real-time).
 * Returns an unsubscribe function.
 */
export function subscribeToFriends(uid, onChange) {
  const friendsRef = collection(db, 'users', uid, 'friends');

  return onSnapshot(friendsRef, (snapshot) => {
    const friends = snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));
    onChange(friends);
  }, (error) => {
    console.error('[Friends] Friends list subscribe error:', error);
    onChange([]);
  });
}
