/**
 * ChallengeTypeModal — Lets the user choose between Quiz or Interview challenge.
 * Appears when the user clicks "Challenge" on a friend.
 */
import React from 'react';
import './ChallengeTypeModal.css';

function ChallengeTypeModal({ friend, onSelect, onClose }) {
  return (
    <div className="ctm-overlay" onClick={onClose}>
      <div className="ctm-panel" onClick={(e) => e.stopPropagation()}>
        <button className="ctm-close" onClick={onClose} aria-label="Close">✕</button>
        <h3 className="ctm-title">Challenge {friend?.displayName || 'Friend'}</h3>
        <p className="ctm-subtitle">Choose your battle type</p>

        <div className="ctm-options">
          <button className="ctm-option ctm-option--quiz" onClick={() => onSelect('quiz')}>
            <span className="ctm-option-icon">⚡</span>
            <div className="ctm-option-info">
              <strong>Quiz Battle</strong>
              <span>Answer trivia questions fastest to win</span>
            </div>
            <span className="ctm-option-arrow">→</span>
          </button>

          <button className="ctm-option ctm-option--interview" onClick={() => onSelect('interview')}>
            <span className="ctm-option-icon">🎤</span>
            <div className="ctm-option-info">
              <strong>Interview Duel</strong>
              <span>Compete in an AI mock interview</span>
            </div>
            <span className="ctm-option-arrow">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChallengeTypeModal;
