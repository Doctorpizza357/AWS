/**
 * LoadingScreen - Themed campus loading screen with progress indicator.
 */
import React from 'react';
import './LoadingScreen.css';

function LoadingScreen({ progress = 0, error = null, onRetry }) {
  if (error) {
    return (
      <div className="loading-screen loading-screen--error" role="alert">
        <div className="loading-screen__content">
          <div className="loading-screen__icon">⚠️</div>
          <h2 className="loading-screen__title">Failed to Load Campus</h2>
          <p className="loading-screen__message">{error}</p>
          <button className="loading-screen__retry" onClick={onRetry}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="loading-screen" role="status" aria-label="Loading campus world">
      <div className="loading-screen__content">
        <div className="loading-screen__campus-icon">🏫</div>
        <h2 className="loading-screen__title">Loading Campus World</h2>
        <div className="loading-screen__progress-container">
          <div
            className="loading-screen__progress-bar"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="loading-screen__progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="loading-screen__progress-text">{Math.round(progress)}%</span>
        </div>
        <p className="loading-screen__hint">
          {progress < 30 && 'Preparing your campus adventure...'}
          {progress >= 30 && progress < 60 && 'Building career zones...'}
          {progress >= 60 && progress < 90 && 'Placing NPC advisors...'}
          {progress >= 90 && 'Almost ready!'}
        </p>
      </div>
    </div>
  );
}

export default LoadingScreen;
