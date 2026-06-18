/**
 * ChallengeResults
 * Side-by-side comparison of both players' interview performance.
 * Shows after both participants complete their answer.
 */
import React from 'react';
import './ChallengeResults.css';

function StatBar({ label, leftValue, rightValue, leftName, rightName }) {
  const max = Math.max(leftValue || 0, rightValue || 0, 1);
  const leftPct = Math.round(((leftValue || 0) / 100) * 100);
  const rightPct = Math.round(((rightValue || 0) / 100) * 100);
  const leftWins = (leftValue || 0) > (rightValue || 0);
  const rightWins = (rightValue || 0) > (leftValue || 0);
  const tie = leftValue === rightValue;

  return (
    <div className="cr-stat">
      <div className="cr-stat-label">{label}</div>
      <div className="cr-stat-bars">
        <div className="cr-stat-left">
          <span className={`cr-stat-value ${leftWins ? 'winner' : ''}`}>{leftValue ?? '-'}</span>
          <div className="cr-bar-track cr-bar-left">
            <div className="cr-bar-fill cr-fill-left" style={{ width: `${leftPct}%` }} />
          </div>
        </div>
        <div className="cr-stat-right">
          <div className="cr-bar-track cr-bar-right">
            <div className="cr-bar-fill cr-fill-right" style={{ width: `${rightPct}%` }} />
          </div>
          <span className={`cr-stat-value ${rightWins ? 'winner' : ''}`}>{rightValue ?? '-'}</span>
        </div>
      </div>
    </div>
  );
}

function ChallengeResults({ challengeData, currentRole, onClose }) {
  if (!challengeData) return null;

  const myResults = currentRole === 'challenger' ? challengeData.challengerResults : challengeData.opponentResults;
  const theirResults = currentRole === 'challenger' ? challengeData.opponentResults : challengeData.challengerResults;
  const myName = currentRole === 'challenger' ? challengeData.challengerName : challengeData.opponentName;
  const theirName = currentRole === 'challenger' ? challengeData.opponentName : challengeData.challengerName;

  // Wait for both results
  if (!myResults || !theirResults) {
    return (
      <div className="challenge-results">
        <div className="cr-waiting">
          <div className="cr-waiting-spinner" />
          <h3>Waiting for opponent to finish...</h3>
          <p>{theirName} is still recording their answer.</p>
        </div>
      </div>
    );
  }

  // Determine overall winner
  const myTotal = (myResults.score || 0) + (myResults.bodyOverall || 0) + (myResults.confidence || 0);
  const theirTotal = (theirResults.score || 0) + (theirResults.bodyOverall || 0) + (theirResults.confidence || 0);
  const iWin = myTotal > theirTotal;
  const tie = myTotal === theirTotal;

  return (
    <div className="challenge-results">
      <div className="cr-header">
        <h2 className="cr-title">Challenge Complete</h2>
        <div className={`cr-verdict ${iWin ? 'win' : tie ? 'tie' : 'lose'}`}>
          {tie ? 'TIE' : iWin ? 'YOU WIN' : `${theirName.split(' ')[0]} WINS`}
        </div>
      </div>

      {/* Player names */}
      <div className="cr-players">
        <div className="cr-player cr-player-left">
          <span className="cr-player-name">{myName}</span>
          <span className="cr-player-label">You</span>
        </div>
        <span className="cr-vs">VS</span>
        <div className="cr-player cr-player-right">
          <span className="cr-player-name">{theirName}</span>
          <span className="cr-player-label">Opponent</span>
        </div>
      </div>

      {/* Stat comparison bars */}
      <div className="cr-stats">
        <StatBar
          label="AI Score"
          leftValue={myResults.score}
          rightValue={theirResults.score}
        />
        <StatBar
          label="Body Language"
          leftValue={myResults.bodyOverall}
          rightValue={theirResults.bodyOverall}
        />
        <StatBar
          label="Speech Confidence"
          leftValue={myResults.confidence}
          rightValue={theirResults.confidence}
        />
        <StatBar
          label="Words Per Minute"
          leftValue={myResults.wpm}
          rightValue={theirResults.wpm}
        />
        <StatBar
          label="Filler Words"
          leftValue={myResults.fillerCount}
          rightValue={theirResults.fillerCount}
        />
      </div>

      {/* Score totals */}
      <div className="cr-totals">
        <div className={`cr-total-card ${iWin ? 'winner' : ''}`}>
          <span className="cr-total-value">{Math.round(myTotal / 3)}</span>
          <span className="cr-total-label">Your Avg</span>
        </div>
        <div className={`cr-total-card ${!iWin && !tie ? 'winner' : ''}`}>
          <span className="cr-total-value">{Math.round(theirTotal / 3)}</span>
          <span className="cr-total-label">Their Avg</span>
        </div>
      </div>

      {onClose && (
        <button className="cr-close-btn" onClick={onClose}>
          Back to Campus
        </button>
      )}
    </div>
  );
}

export default ChallengeResults;
