/**
 * NotificationToast
 * Displays pop-up notifications for social events: friend requests, challenges, etc.
 * Renders as a stack of toasts in the top-right corner.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSocial } from '../../context/SocialContext';
import { useAuth } from '../../context/AuthContext';
import { subscribeToPendingChallenges, subscribeToActiveChallenges, acceptChallenge } from '../../services/challengeService';
import './NotificationToast.css';

const TOAST_DURATION = 8000; // 8 seconds

function NotificationToast({ onJoinChallenge }) {
  const { user: authUser } = useAuth();
  const { pendingRequests, acceptRequest } = useSocial();
  const [toasts, setToasts] = useState([]);
  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [activeChallenges, setActiveChallenges] = useState([]);
  const seenRef = useRef(new Set());
  const challengeSubRef = useRef(null);
  const activeSubRef = useRef(null);

  // Subscribe to pending challenges (incoming invites)
  useEffect(() => {
    if (!authUser?.uid) return;
    challengeSubRef.current = subscribeToPendingChallenges(authUser.uid, setPendingChallenges);
    activeSubRef.current = subscribeToActiveChallenges(authUser.uid, setActiveChallenges);
    return () => { challengeSubRef.current?.(); activeSubRef.current?.(); };
  }, [authUser?.uid]);

  // Generate toasts from new friend requests
  useEffect(() => {
    pendingRequests.forEach(req => {
      if (seenRef.current.has(`fr-${req.id}`)) return;
      seenRef.current.add(`fr-${req.id}`);
      addToast({
        id: `fr-${req.id}`,
        type: 'friend-request',
        title: 'Friend Request',
        message: `${req.fromDisplayName} wants to be friends`,
        data: req,
      });
    });
  }, [pendingRequests]);

  // Generate toasts from new challenges
  useEffect(() => {
    pendingChallenges.forEach(ch => {
      if (seenRef.current.has(`ch-${ch.id}`)) return;
      seenRef.current.add(`ch-${ch.id}`);
      addToast({
        id: `ch-${ch.id}`,
        type: 'challenge',
        title: 'Interview Challenge',
        message: `${ch.challengerName} challenged you to a ${ch.type} interview`,
        data: ch,
      });
    });
  }, [pendingChallenges]);

  // Auto-join challenger when their challenge is accepted (transitions to active)
  useEffect(() => {
    if (!authUser?.uid || !onJoinChallenge) return;
    activeChallenges.forEach(ch => {
      // Only auto-join if I'm the challenger (I sent it) and haven't already joined
      if (ch.challenger !== authUser.uid) return;
      const key = `autojoin-${ch.id}`;
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      // Show a toast and auto-navigate
      addToast({
        id: `accepted-${ch.id}`,
        type: 'challenge-accepted',
        title: 'Challenge Accepted',
        message: `${ch.opponentName} accepted your challenge! Joining...`,
        data: ch,
      });
      // Auto-navigate after a brief delay so the user sees the toast
      setTimeout(() => {
        onJoinChallenge(ch.id, 'challenger', ch);
      }, 1000);
    });
  }, [activeChallenges, authUser?.uid, onJoinChallenge]);

  const addToast = useCallback((toast) => {
    setToasts(prev => [...prev, { ...toast, createdAt: Date.now() }]);
    // Auto-dismiss after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, TOAST_DURATION);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const handleAcceptFriend = useCallback(async (toast) => {
    try {
      await acceptRequest(toast.data.id, toast.data.from);
      dismissToast(toast.id);
    } catch (e) {}
  }, [acceptRequest, dismissToast]);

  const handleAcceptChallenge = useCallback(async (toast) => {
    try {
      await acceptChallenge(toast.data.id);
      dismissToast(toast.id);
      if (onJoinChallenge) {
        onJoinChallenge(toast.data.id, 'opponent', toast.data);
      }
    } catch (e) {}
  }, [dismissToast, onJoinChallenge]);

  if (toasts.length === 0) return null;

  return (
    <div className="notification-toast-container">
      {toasts.slice(-3).map(toast => (
        <div key={toast.id} className={`notification-toast nt-${toast.type}`}>
          <div className="nt-content">
            <div className="nt-title">{toast.title}</div>
            <div className="nt-message">{toast.message}</div>
          </div>
          <div className="nt-actions">
            {toast.type === 'friend-request' && (
              <button className="nt-accept" onClick={() => handleAcceptFriend(toast)}>Accept</button>
            )}
            {toast.type === 'challenge' && (
              <button className="nt-accept" onClick={() => handleAcceptChallenge(toast)}>Accept</button>
            )}
            <button className="nt-dismiss" onClick={() => dismissToast(toast.id)}>Dismiss</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default NotificationToast;
