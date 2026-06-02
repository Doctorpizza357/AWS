import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getIconComponent } from '../utils/iconMap';
import './CareerCard.css';

function CareerCard({ career, matchScore, locked }) {
  const navigate = useNavigate();
  const { user, setActiveCareerGoal } = useUser();
  const CareerIcon = getIconComponent(career.icon);
  const LockIcon = getIconComponent('lock');

  const isActiveGoal = user.activeCareerGoal?.id === career.id;

  const handleSetGoal = (e) => {
    e.stopPropagation();
    setActiveCareerGoal(career);
  };

  return (
    <div
      className={`career-card ${locked ? 'locked' : ''} ${isActiveGoal ? 'is-goal' : ''}`}
      style={{ '--card-color': career.color }}
      onClick={() => !locked && navigate(`/career/${career.id}`)}
      role="button"
      tabIndex={0}
      aria-label={`Explore ${career.title} career path`}
    >
      <div className="career-card-header">
        <span className="career-icon"><CareerIcon size={32} aria-hidden="true" /></span>
        {matchScore !== undefined && (
          <span className="match-badge">
            {Math.round(matchScore * 100)}% Match
          </span>
        )}
        {isActiveGoal && <span className="goal-badge">Active Goal</span>}
        {locked && <span className="lock-badge"><LockIcon size={18} aria-hidden="true" /></span>}
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

      <div className="career-card-actions">
        {!locked && (
          <button className="explore-btn">
            Explore This Path →
          </button>
        )}
        {!locked && !isActiveGoal && (
          <button className="set-goal-btn" onClick={handleSetGoal} title="Set as your active career goal">
            Set as Goal
          </button>
        )}
      </div>
    </div>
  );
}

export default CareerCard;
