/**
 * ChallengePanel
 * UI for sending/receiving interview challenges and displaying active challenges.
 * Now supports both Quiz and Interview challenge types.
 * Integrates into the CampusPlayers social panel or can be used standalone.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocial } from '../../context/SocialContext';
import {
  createChallenge,
  acceptChallenge,
  declineChallenge,
  cancelChallenge,
  subscribeToPendingChallenges,
  subscribeToActiveChallenges,
  subscribeToSentChallenges,
} from '../../services/challengeService';
import { generateInterviewQuestions } from '../../services/interviewService';
import { TRIVIA_QUESTIONS } from '../game/KnowledgeOrbs';
import ChallengeTypeModal from './ChallengeTypeModal';
import './ChallengePanel.css';

function ChallengePanel({ onJoinChallenge }) {
  const { user: authUser } = useAuth();
  const { onlineFriends, friends } = useSocial();

  const [pendingChallenges, setPendingChallenges] = useState([]);
  const [activeChallenges, setActiveChallenges] = useState([]);
  const [sentChallenges, setSentChallenges] = useState([]);
  const [sending, setSending] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [challengeTarget, setChallengeTarget] = useState(null); // friend to show type modal for

  const pendingSubRef = useRef(null);
  const activeSubRef = useRef(null);
  const sentSubRef = useRef(null);

  useEffect(() => {
    if (!authUser?.uid) return;

    pendingSubRef.current = subscribeToPendingChallenges(authUser.uid, setPendingChallenges);
    activeSubRef.current = subscribeToActiveChallenges(authUser.uid, setActiveChallenges);
    sentSubRef.current = subscribeToSentChallenges(authUser.uid, setSentChallenges);

    return () => {
      pendingSubRef.current?.();
      activeSubRef.current?.();
      sentSubRef.current?.();
    };
  }, [authUser?.uid]);

  const clearMessages = () => setTimeout(() => { setError(''); setSuccess(''); }, 4000);

  // Open the challenge type modal for a friend
  const handleChallenge = (friend) => {
    setChallengeTarget(friend);
  };

  // Send the challenge with the selected type
  const handleSendChallenge = async (type) => {
    const friend = challengeTarget;
    if (!authUser?.uid || !friend) return;
    setChallengeTarget(null);
    setSending(friend.uid);
    setError('');

    try {
      let questions = [];

      if (type === 'quiz') {
        // Pick 5 random trivia questions for quiz battle
        const shuffled = [...TRIVIA_QUESTIONS].sort(() => Math.random() - 0.5);
        questions = shuffled.slice(0, 5).map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
          correct: q.correct,
          xp: q.xp,
        }));
      } else {
        // Generate 1 interview question for interview duel
        const allQuestions = await generateInterviewQuestions(
          'General STEM technical interview',
          'technical',
          'mid'
        );
        questions = allQuestions?.length > 0 ? [allQuestions[0]] : [];
      }

      await createChallenge(
        authUser.uid,
        friend.uid,
        authUser.displayName || 'Anonymous',
        friend.displayName || 'Anonymous',
        type,
        questions
      );

      setSuccess(`${type === 'quiz' ? 'Quiz' : 'Interview'} challenge sent to ${friend.displayName}!`);
      clearMessages();
    } catch (err) {
      setError(err.message || 'Failed to send challenge');
      clearMessages();
    }
    setSending(null);
  };

  const handleAccept = async (challenge) => {
    try {
      await acceptChallenge(challenge.id);
      setSuccess('Challenge accepted! Starting...');
      clearMessages();
      if (onJoinChallenge) {
        const role = challenge.opponent === authUser?.uid ? 'opponent' : 'challenger';
        onJoinChallenge(challenge.id, role, challenge);
      }
    } catch (err) {
      setError(err.message || 'Failed to accept');
      clearMessages();
    }
  };

  const handleDecline = async (challenge) => {
    try {
      await declineChallenge(challenge.id);
    } catch (err) {
      setError(err.message);
      clearMessages();
    }
  };

  const handleCancel = async (challenge) => {
    try {
      await cancelChallenge(challenge.id);
      setSuccess('Challenge cancelled.');
      clearMessages();
    } catch (err) {
      setError(err.message);
      clearMessages();
    }
  };

  const handleJoinActive = (challenge) => {
    if (!onJoinChallenge || !authUser?.uid) return;
    const role = challenge.challenger === authUser.uid ? 'challenger' : 'opponent';
    onJoinChallenge(challenge.id, role, challenge);
  };

  if (!authUser) return null;

  return (
    <div className="challenge-panel">
      {error && <div className="ch-message ch-error">{error}</div>}
      {success && <div className="ch-message ch-success">{success}</div>}

      {/* Active Challenges */}
      {activeChallenges.length > 0 && (
        <div className="ch-section">
          <h4 className="ch-section-title">Active Challenges</h4>
          {activeChallenges.map(ch => {
            const opponentName = ch.challenger === authUser.uid ? ch.opponentName : ch.challengerName;
            return (
              <div key={ch.id} className="ch-active-card">
                <span className="ch-active-name">vs {opponentName}</span>
                <div className="ch-pending-actions">
                  <button className="ch-join-btn" onClick={() => handleJoinActive(ch)}>
                    Join
                  </button>
                  <button className="ch-decline-btn" onClick={() => handleCancel(ch)} title="Leave challenge">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Incoming Challenges */}
      {pendingChallenges.length > 0 && (
        <div className="ch-section">
          <h4 className="ch-section-title">Incoming Challenges</h4>
          {pendingChallenges.map(ch => (
            <div key={ch.id} className="ch-pending-card">
              <div className="ch-pending-info">
                <span className="ch-pending-name">{ch.challengerName}</span>
                <span className="ch-pending-type">{ch.type === 'quiz' ? '⚡ Quiz Battle' : '🎤 Interview Duel'}</span>
              </div>
              <div className="ch-pending-actions">
                <button className="ch-accept-btn" onClick={() => handleAccept(ch)}>Accept</button>
                <button className="ch-decline-btn" onClick={() => handleDecline(ch)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sent Challenges (waiting for opponent to accept) */}
      {sentChallenges.length > 0 && (
        <div className="ch-section">
          <h4 className="ch-section-title">Sent Challenges</h4>
          {sentChallenges.map(ch => (
            <div key={ch.id} className="ch-active-card">
              <div className="ch-pending-info">
                <span className="ch-pending-name">to {ch.opponentName}</span>
                <span className="ch-pending-type">Waiting for response...</span>
              </div>
              <button className="ch-decline-btn" onClick={() => handleCancel(ch)} title="Cancel challenge">✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Challenge a Friend */}
      <div className="ch-section">
        <h4 className="ch-section-title">Challenge a Friend</h4>
        {onlineFriends.length === 0 ? (
          <p className="ch-empty">No friends online to challenge right now.</p>
        ) : (
          <div className="ch-friend-list">
            {onlineFriends.map(friend => (
              <div key={friend.uid} className="ch-friend-row">
                <div className="ch-friend-info">
                  <span className="ch-friend-name">{friend.displayName}</span>
                  <span className="ch-friend-level">Lv.{friend.level}</span>
                </div>
                <button
                  className="ch-challenge-btn"
                  onClick={() => handleChallenge(friend)}
                  disabled={sending === friend.uid}
                >
                  {sending === friend.uid ? '...' : 'Challenge'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Challenge Type Selection Modal */}
      {challengeTarget && (
        <ChallengeTypeModal
          friend={challengeTarget}
          onSelect={handleSendChallenge}
          onClose={() => setChallengeTarget(null)}
        />
      )}
    </div>
  );
}

export default ChallengePanel;
