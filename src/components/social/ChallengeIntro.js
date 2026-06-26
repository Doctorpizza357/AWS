/**
 * ChallengeIntro — Prodigy-style battle intro animation.
 * Both challengers slide in from opposite sides with their profiles,
 * a "VS" badge pulses in the center, then the challenge begins.
 */
import React, { useState, useEffect } from 'react';
import './ChallengeIntro.css';

function ChallengeIntro({ challenger, opponent, challengeType, onComplete }) {
  const [phase, setPhase] = useState('enter'); // enter → clash → ready → done

  useEffect(() => {
    // Phase timeline: enter (0ms) → clash (1200ms) → ready (2800ms) → done (4500ms)
    const t1 = setTimeout(() => setPhase('clash'), 1200);
    const t2 = setTimeout(() => setPhase('ready'), 2800);
    const t3 = setTimeout(() => {
      setPhase('done');
      if (onComplete) onComplete();
    }, 4500);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  const typeLabel = challengeType === 'quiz' ? '⚡ Quiz Battle' : '🎤 Interview Duel';

  return (
    <div className={`challenge-intro challenge-intro--${phase}`}>
      {/* Background effects */}
      <div className="ci-bg-flash" />
      <div className="ci-bg-particles" />

      {/* Challenger (left side) */}
      <div className="ci-player ci-player--left">
        <div className="ci-player-card">
          <div className="ci-avatar">
            {challenger.photoURL ? (
              <img src={challenger.photoURL} alt="" className="ci-avatar-img" />
            ) : (
              <div className="ci-avatar-placeholder">
                {(challenger.displayName || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="ci-player-info">
            <span className="ci-player-name">{challenger.displayName || 'Challenger'}</span>
            <span className="ci-player-level">Lv.{challenger.level || 1}</span>
          </div>
        </div>
      </div>

      {/* VS Badge */}
      <div className="ci-vs-container">
        <div className="ci-vs-badge">VS</div>
        <span className="ci-type-label">{typeLabel}</span>
      </div>

      {/* Opponent (right side) */}
      <div className="ci-player ci-player--right">
        <div className="ci-player-card">
          <div className="ci-avatar">
            {opponent.photoURL ? (
              <img src={opponent.photoURL} alt="" className="ci-avatar-img" />
            ) : (
              <div className="ci-avatar-placeholder">
                {(opponent.displayName || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="ci-player-info">
            <span className="ci-player-name">{opponent.displayName || 'Opponent'}</span>
            <span className="ci-player-level">Lv.{opponent.level || 1}</span>
          </div>
        </div>
      </div>

      {/* Ready text */}
      {phase === 'ready' && (
        <div className="ci-ready-text">GET READY!</div>
      )}
    </div>
  );
}

export default ChallengeIntro;
