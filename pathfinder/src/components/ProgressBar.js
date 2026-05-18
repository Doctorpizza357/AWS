import React from 'react';
import './ProgressBar.css';

function ProgressBar({ current, total, label, color }) {
  const percentage = Math.min((current / total) * 100, 100);

  return (
    <div className="progress-container">
      {label && <span className="progress-label">{label}</span>}
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${percentage}%`, background: color || 'var(--gradient-1)' }}
        ></div>
      </div>
      <span className="progress-text">{current}/{total}</span>
    </div>
  );
}

export default ProgressBar;
