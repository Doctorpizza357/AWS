import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';

import { useSkillBridge } from '../context/SkillBridgeContext';
import badges from '../data/badges';
import './Profile.css';
import DownloadProfileButton from '../components/DownloadProfileButton';
import { fetchSalaryData, fetchViabilityData } from '../services/marketDataService';
import { getIconComponent } from '../utils/iconMap';

function Profile() {
  const navigate = useNavigate();
  const { user, resetProgress, isHydrating } = useUser();
  const { user: authUser, logout } = useAuth();
  const { portfolio } = useSkillBridge();

  const sortedPortfolio = useMemo(() => {
    const list = Array.isArray(portfolio) ? portfolio : [];
    return [...list].sort(
      (a, b) => (b?.completedAt || '').localeCompare(a?.completedAt || '')
    );
  }, [portfolio]);

  const formatCompletedAt = (iso) => {
    if (typeof iso !== 'string' || iso.length === 0) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };

  useEffect(() => {
    if (!isHydrating && !user.isOnboarded) {
      navigate('/onboarding');
    }
  }, [isHydrating, user.isOnboarded, navigate]);

  if (isHydrating) {
    return null;
  }

  if (!user.isOnboarded) {
    return null;
  }

  const { profile, progress } = user;
  const earnedBadgeIds = progress.badges.map(b => b.id);
  const EarnedIcon = getIconComponent('check');

  // Build minimal data for the downloadable profile (client-side only)
  // Build topMatches with computed fit score and notes
  const computeTopMatches = () => {
    const recs = Array.isArray(user.recommendedCareers) ? user.recommendedCareers : [];
    if (!recs.length) return [];
    const maxScore = recs.reduce((m, r) => Math.max(m, r.matchScore || 0), 1);
    return recs.map(r => ({
      role: r.title || r.name || r.id,
      score: Math.round(((r.matchScore || 0) / (maxScore || 1)) * 100),
      note: `${r.field || ''} • ${r.salary || ''}`
    }));
  };

  const quizResults = {
    name: profile.name,
    strengths: profile.skills || [],
    topMatches: computeTopMatches(),
    summary: profile.summary || ''
  };

  const [marketInsights, setMarketInsights] = useState({ averageSalary: '', trends: [], salarySeries: [], viability: [] });

  const actionPlan = {
    skills: (profile.skills || []).map((s, i) => ({ name: s, level: Math.min(95, 60 + (progress.level || 1) * 5 + (i * 3)) })),
    nextSteps: []
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const primaryCareer = (user.recommendedCareers && user.recommendedCareers[0] && user.recommendedCareers[0].id) || (user.recommendedCareers && user.recommendedCareers[0] && user.recommendedCareers[0].title) || 'software-engineer';
        const salary = await fetchSalaryData(primaryCareer);
        const viability = await fetchViabilityData(primaryCareer);
        if (!mounted) return;
        setMarketInsights({
          averageSalary: salary.historical && salary.historical.length ? `$${salary.historical[salary.historical.length-1].median.toLocaleString()}` : '',
          trends: [(salary.predicted && salary.predicted.length) ? `Median salary projected to ${salary.predicted[salary.predicted.length-1].median}` : ''],
          salarySeries: salary.historical || [],
          viability: viability || []
        });
      } catch (err) {
        console.warn('Market insights fetch error', err.message);
      }
    })();
    return () => { mounted = false; };
  }, [user.recommendedCareers]);

  const handleReset = () => {
    if (window.confirm('Are you sure? This will reset all your progress.')) {
      resetProgress();
      navigate('/');
    }
  };

  const handleRetakeOnboarding = () => {
    navigate('/onboarding');
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <div className="profile-page">
      <div className="container">
        <div className="profile-header fade-in">
          <div className="profile-avatar">
            {authUser?.photoURL ? (
              <img src={authUser.photoURL} alt={authUser.displayName || 'User'} className="profile-picture" />
            ) : (
              profile.name.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1>{authUser?.displayName || profile.name}</h1>
            <p className="profile-level">Level {progress.level} Explorer</p>
          </div>
          <div className="profile-actions">
            <DownloadProfileButton
              quizResults={quizResults}
              marketInsights={marketInsights}
              actionPlan={actionPlan}
              progress={progress}
              badges={badges}
              portfolio={sortedPortfolio}
            />
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

        <section className="profile-section portfolio-section">
          <h2>Portfolio</h2>
          {sortedPortfolio.length === 0 ? (
            <p className="portfolio-empty">No projects completed yet</p>
          ) : (
            <ul className="portfolio-list">
              {sortedPortfolio.map((entry, idx) => {
                const skills = Array.isArray(entry?.skills) ? entry.skills : [];
                const key = `${entry?.projectId || 'project'}-${idx}`;
                return (
                  <li key={key} className="portfolio-item">
                    <div className="portfolio-item-header">
                      <h3 className="portfolio-item-title">
                        {entry?.title || entry?.projectId || 'Untitled project'}
                      </h3>
                      {entry?.difficulty && (
                        <span className={`portfolio-difficulty difficulty-${entry.difficulty}`}>
                          {entry.difficulty}
                        </span>
                      )}
                    </div>
                    <div className="portfolio-item-meta">
                      {skills.length > 0 && (
                        <span className="portfolio-skills">
                          {skills.join(', ')}
                        </span>
                      )}
                      {entry?.completedAt && (
                        <span className="portfolio-completed-at">
                          Completed {formatCompletedAt(entry.completedAt)}
                        </span>
                      )}
                    </div>
                    {entry?.url && (
                      <p className="portfolio-url">
                        <a href={entry.url} target="_blank" rel="noopener noreferrer">
                          {entry.url}
                        </a>
                      </p>
                    )}
                    {entry?.notes && (
                      <p className="portfolio-notes">{entry.notes}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

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
              const BadgeIcon = getIconComponent(badge.icon);
              return (
                <div key={badge.id} className={`badge-card ${earned ? 'earned' : 'locked'}`}>
                  <span className="badge-card-icon"><BadgeIcon size={28} aria-hidden="true" /></span>
                  <span className="badge-card-name">{badge.name}</span>
                  <span className="badge-card-desc">{badge.description}</span>
                  {earned && <span className="badge-earned-mark"><EarnedIcon size={14} aria-hidden="true" /></span>}
                </div>
              );
            })}
          </div>
        </section>

        <section className="profile-section danger-zone">
          <h2>Settings</h2>
          <div className="settings-actions">
            <button className="secondary-btn" onClick={handleRetakeOnboarding}>
              Retake Onboarding Quiz
            </button>
            <button className="reset-btn" onClick={handleReset}>
              Reset All Progress
            </button>
            <button className="nav-logout" onClick={handleLogout}>
              Sign Out
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Profile;
