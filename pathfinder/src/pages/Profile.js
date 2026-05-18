import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import badges from '../data/badges';
import './Profile.css';

function Profile() {
  const navigate = useNavigate();
  const { user, resetProgress } = useUser();

  if (!user.isOnboarded) {
    navigate('/onboarding');
    return null;
  }

  const { profile, progress } = user;
  const earnedBadgeIds = progress.badges.map(b => b.id);

  const handleReset = () => {
    if (window.confirm('Are you sure? This will reset all your progress.')) {
      resetProgress();
      navigate('/');
    }
  };

  return (
    <div className="profile-page">
      <div className="container">
        <div className="profile-header fade-in">
          <div className="profile-avatar">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1>{profile.name}</h1>
            <p className="profile-level">Level {progress.level} Explorer</p>
          </div>
        </div>

        <div className="profile-grid">
          <section className="profile-section">
            <h2>Your Interests</h2>
            <div className="tag-list">
              {profile.interests.map(interest => (
                <span key={interest} className="profile-tag">{interest}</span>
              ))}
            </div>
          </section>

          <section className="profile-section">
            <h2>Your Skills</h2>
            <div className="tag-list">
              {profile.skills.map(skill => (
                <span key={skill} className="profile-tag skill">{skill}</span>
              ))}
            </div>
          </section>
        </div>

        <section className="profile-section">
          <h2>Progress Stats</h2>
          <div className="progress-stats">
            <div className="p-stat">
              <span className="p-stat-num">{progress.level}</span>
              <span className="p-stat-label">Level</span>
            </div>
            <div className="p-stat">
              <span className="p-stat-num">{progress.xp}/{progress.xpToNext}</span>
              <span className="p-stat-label">XP to Next</span>
            </div>
            <div className="p-stat">
              <span className="p-stat-num">{progress.completedScenarios.length}</span>
              <span className="p-stat-label">Scenarios</span>
            </div>
            <div className="p-stat">
              <span className="p-stat-num">{progress.decisions.length}</span>
              <span className="p-stat-label">Decisions</span>
            </div>
          </div>
        </section>

        <section className="profile-section">
          <h2>Badges Collection</h2>
          <div className="badges-collection">
            {badges.map(badge => {
              const earned = earnedBadgeIds.includes(badge.id);
              return (
                <div key={badge.id} className={`badge-card ${earned ? 'earned' : 'locked'}`}>
                  <span className="badge-card-icon">{badge.icon}</span>
                  <span className="badge-card-name">{badge.name}</span>
                  <span className="badge-card-desc">{badge.description}</span>
                  {earned && <span className="badge-earned-mark">✓</span>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="profile-section danger-zone">
          <h2>Settings</h2>
          <button className="reset-btn" onClick={handleReset}>
            Reset All Progress
          </button>
        </section>
      </div>
    </div>
  );
}

export default Profile;
