/**
 * Social Context
 * Provides real-time presence (other online players) and friend management
 * to the entire application. Automatically starts/stops presence broadcasting
 * when the user logs in/out.
 */
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useUser } from './UserContext';
import { startPresence, subscribeToPresence, createPositionBroadcaster, updatePresenceData } from '../services/presenceService';
import {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  removeFriend,
  subscribeToFriendRequests,
  subscribeToFriends,
} from '../services/friendService';

const SocialContext = createContext();

export function SocialProvider({ children }) {
  const { user: authUser } = useAuth();
  const { user: userData } = useUser();

  const [onlinePlayers, setOnlinePlayers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);

  const presenceCleanupRef = useRef(null);
  const presenceSubRef = useRef(null);
  const friendReqSubRef = useRef(null);
  const friendsSubRef = useRef(null);
  const positionBroadcasterRef = useRef(null);

  // Start presence and subscriptions when user is authenticated
  useEffect(() => {
    if (!authUser?.uid) {
      // Cleanup everything if user logs out
      presenceCleanupRef.current?.();
      presenceSubRef.current?.();
      friendReqSubRef.current?.();
      friendsSubRef.current?.();
      setOnlinePlayers([]);
      setFriends([]);
      setPendingRequests([]);
      return;
    }

    const uid = authUser.uid;

    // Start broadcasting presence
    presenceCleanupRef.current = startPresence(uid, {
      displayName: authUser.displayName || userData?.profile?.name || 'Anonymous',
      photoURL: authUser.photoURL || '',
      level: userData?.progress?.level || 1,
      activeCareer: userData?.activeCareerGoal?.title || null,
      avatar: JSON.parse(localStorage.getItem('campus_avatar') || '{}'),
    });

    // Create throttled position broadcaster for real-time movement
    positionBroadcasterRef.current = createPositionBroadcaster(uid);

    // Subscribe to other online players
    presenceSubRef.current = subscribeToPresence(uid, setOnlinePlayers);

    // Subscribe to incoming friend requests
    friendReqSubRef.current = subscribeToFriendRequests(uid, setPendingRequests);

    // Subscribe to friend list
    friendsSubRef.current = subscribeToFriends(uid, setFriends);

    return () => {
      presenceCleanupRef.current?.();
      presenceSubRef.current?.();
      friendReqSubRef.current?.();
      friendsSubRef.current?.();
      if (positionBroadcasterRef.current?.dispose) positionBroadcasterRef.current.dispose();
    };
  }, [authUser?.uid]); // eslint-disable-line

  // Update presence data when user profile changes
  useEffect(() => {
    if (!authUser?.uid) return;
    updatePresenceData(authUser.uid, {
      displayName: authUser.displayName || userData?.profile?.name || 'Anonymous',
      photoURL: authUser.photoURL || '',
      level: userData?.progress?.level || 1,
      activeCareer: userData?.activeCareerGoal?.title || null,
    });
  }, [authUser?.uid, authUser?.displayName, authUser?.photoURL, userData?.progress?.level, userData?.activeCareerGoal?.title, userData?.profile?.name]);

  // Actions
  const sendRequest = useCallback(async (toUid) => {
    if (!authUser?.uid) throw new Error('Must be logged in');
    return sendFriendRequest(authUser.uid, toUid, {
      displayName: authUser.displayName || userData?.profile?.name || 'Anonymous',
      photoURL: authUser.photoURL || '',
      level: userData?.progress?.level || 1,
    });
  }, [authUser, userData]);

  const acceptRequest = useCallback(async (requestId, fromUid) => {
    if (!authUser?.uid) throw new Error('Must be logged in');
    return acceptFriendRequest(requestId, fromUid, authUser.uid);
  }, [authUser?.uid]);

  const rejectRequest = useCallback(async (requestId) => {
    return rejectFriendRequest(requestId);
  }, []);

  const unfriend = useCallback(async (friendUid) => {
    if (!authUser?.uid) throw new Error('Must be logged in');
    return removeFriend(authUser.uid, friendUid);
  }, [authUser?.uid]);

  const updateMyPosition = useCallback((position) => {
    if (positionBroadcasterRef.current) {
      positionBroadcasterRef.current(position);
    }
  }, []);

  // Derived state
  const onlineFriends = onlinePlayers.filter((p) =>
    friends.some((f) => f.uid === p.uid)
  );

  const isFriend = useCallback((uid) => {
    return friends.some((f) => f.uid === uid);
  }, [friends]);

  const hasPendingRequest = useCallback((uid) => {
    return pendingRequests.some((r) => r.from === uid);
  }, [pendingRequests]);

  return (
    <SocialContext.Provider value={{
      onlinePlayers,
      onlineFriends,
      friends,
      pendingRequests,
      sendRequest,
      acceptRequest,
      rejectRequest,
      unfriend,
      updateMyPosition,
      isFriend,
      hasPendingRequest,
    }}>
      {children}
    </SocialContext.Provider>
  );
}

export function useSocial() {
  const context = useContext(SocialContext);
  if (!context) {
    throw new Error('useSocial must be used within a SocialProvider');
  }
  return context;
}
