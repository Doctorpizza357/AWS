import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useAuth } from '../context/AuthContext';
import badges from '../data/badges';
import './Profile.css';
import DownloadProfileButton from '../components/DownloadProfileButton';
import { fetchSalaryData, fetchViabilityData } from '../services/marketDataService';

function Profile() {
  const navigate = useNavigate();
  const { user, resetProgress, isHydrating } = useUser();
  const { user: authUser } = useAuth();

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
          <div className="settings-actions">
            <button className="secondary-btn" onClick={handleRetakeOnboarding}>
              Retake Onboarding Quiz
            </button>
            <button className="reset-btn" onClick={handleReset}>
              Reset All Progress
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Profile;
