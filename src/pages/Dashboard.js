import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import CareerCard from '../components/CareerCard';
import DashboardSummaryCard from '../components/skillbridge/DashboardSummaryCard';
import NextSteps from '../components/NextSteps';
import careers from '../data/careers';
import { getIconComponent } from '../utils/iconMap';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { user, isHydrating } = useUser();

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

  const handleChangeGoal = () => {
    const target = document.getElementById('recommended-paths');
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const { profile, progress, recommendedCareers } = user;
  const LevelIcon = getIconComponent('stat-level');
  const ScenarioIcon = getIconComponent('stat-scenarios');
  const BadgeCountIcon = getIconComponent('stat-badges');
  const DecisionIcon = getIconComponent('stat-decisions');
  const GoalIcon = getIconComponent('zap');

  return (
    <div className="dashboard">
      <div className="container">
        <header className="dashboard-header fade-in">
          <div className="welcome-section">
            <h1>Welcome back, {profile.name}!</h1>
            <p className="welcome-sub">Continue exploring your STEM career paths</p>
          </div>
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-icon"><LevelIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">Level {progress.level}</span>
                <span className="stat-lbl">Current Level</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><ScenarioIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">{progress.completedScenarios.length}</span>
                <span className="stat-lbl">Scenarios Done</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><BadgeCountIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">{progress.badges.length}</span>
                <span className="stat-lbl">Badges Earned</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><DecisionIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">{progress.decisions.length}</span>
                <span className="stat-lbl">Decisions Made</span>
              </div>
            </div>
          </div>
        </header>

        {user.activeCareerGoal && (
          <div className="career-goal-banner">
            <span className="career-goal-banner-icon"><GoalIcon size={20} aria-hidden="true" /></span>
            <div className="career-goal-banner-text">
              <strong>Active Goal: {user.activeCareerGoal.title}</strong>
              <span>All features are tailored to this career path</span>
            </div>
              <button className="career-goal-banner-change" onClick={handleChangeGoal}>Change</button>
          </div>
        )}

        <NextSteps />

        <section
          className="skillbridge-summary-section"
          aria-labelledby="skillbridge-summary-heading"
        >
          <h2
            id="skillbridge-summary-heading"
            className="section-heading sr-only"
          >
            SkillBridge progress
          </h2>
          <DashboardSummaryCard />
        </section>

        <section className="careers-section" id="recommended-paths">
          <h2 className="section-heading">Your Recommended Paths</h2>
          <p className="section-desc">Based on your interests and skills, these careers are a great match for you.</p>
          <div className="careers-grid">
            {recommendedCareers.map((career, index) => (
              <CareerCard
                key={career.id}
                career={career}
                matchScore={career.matchScore ? career.matchScore / career.tags.length : undefined}
              />
            ))}
          </div>
        </section>

        <section className="careers-section all-careers-section">
          <h2 className="section-heading">Explore All Career Paths</h2>
          <p className="section-desc">Browse every path available in the scenario builder, including the newest generated careers.</p>
          <div className="careers-grid">
            {careers.map((career) => (
              <CareerCard
                key={career.id}
                career={career}
                locked={false}
              />
            ))}
          </div>
        </section>

        {progress.badges.length > 0 && (
          <section className="badges-section">
            <h2 className="section-heading">Your Badges</h2>
            <div className="badges-grid">
              {progress.badges.map(badge => {
                const BadgeIcon = getIconComponent(badge.icon);
                return (
                  <div key={badge.id} className="badge-item">
                    <span className="badge-icon"><BadgeIcon size={18} aria-hidden="true" /></span>
                    <span className="badge-name">{badge.name}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {progress.decisions.length > 0 && (
          <section className="history-section">
            <h2 className="section-heading">Recent Decisions</h2>
            <div className="decisions-list">
              {progress.decisions.slice(-5).reverse().map((decision, i) => (
                <div key={i} className="decision-item slide-in" style={{ animationDelay: `${i * 0.1}s` }}>
                  <span className="decision-career">{decision.careerTitle}</span>
                  <span className="decision-text">{decision.choice}</span>
                  <span className="decision-xp">+{decision.xp} XP</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
