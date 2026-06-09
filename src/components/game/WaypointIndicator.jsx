import React from 'react';
import './WaypointIndicator.css';

function WaypointIndicator({ waypoint, playerPosition, onClear }) {
  if (!waypoint || !playerPosition) return null;

  const dx = waypoint.position.x - playerPosition.x;
  const dy = waypoint.position.y - playerPosition.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);

  if (distance < 80) {
    return (
      <div className="waypoint-indicator waypoint-indicator--arrived">
        <span>📍 You've arrived at {waypoint.label}!</span>
        <button onClick={onClear}>Clear</button>
      </div>
    );
  }

  return (
    <div className="waypoint-indicator">
      <div className="waypoint-indicator__arrow" style={{ transform: `rotate(${angle}deg)` }}>
        ➤
      </div>
      <div className="waypoint-indicator__info">
        <span className="waypoint-indicator__name">{waypoint.label}</span>
        <span className="waypoint-indicator__dist">{Math.round(distance / 32)}m away</span>
      </div>
      <button className="waypoint-indicator__clear" onClick={onClear}>✕</button>
    </div>
  );
}

export default WaypointIndicator;
