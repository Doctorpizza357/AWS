import React from 'react';
import { useNavigate } from 'react-router-dom';
import './CareerCard.css';

function CareerCard({ career, matchScore, locked }) {
  const navigate = useNavigate();

  return (
    <div
      className={`career-card ${locked ? 'locked' : ''}`}
      style={{ '--card-color': career.color }}
      onClick={() => !locked && navigate(`/career/${career.id}`)}
      role="button"
      tabIndex={0}
      aria-label={`Explore ${career.title} career path`}
    >
      <div className="career-card-header">
        <span className="career-icon">{career.icon}</span>
        {matchScore !== undefined && (
          <span className="match-badge">
            {Math.round(matchScore * 100)}% Match
          </span>
        )}
        {locked && <span className="lock-badge">🔒</span>}
      </div>

      <h3 className="career-title">{career.title}</h3>
      <p className="career-field">{career.field}</p>
      <p className="career-description">{career.description}</p>

      <div className="career-meta">
        <div className="meta-item">
          <span className="meta-label">Salary</span>
          <span className="meta-value">{career.salary}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Growth</span>
          <span className="meta-value">{career.growth}</span>
        </div>
      </div>

      <div className="career-skills">
        {career.skills.slice(0, 3).map(skill => (
          <span key={skill} className="skill-tag">{skill}</span>
        ))}
      </div>

      {!locked && (
        <button className="explore-btn">
          Explore This Path →
        </button>
      )}
    </div>
  );
}

export default CareerCard;
