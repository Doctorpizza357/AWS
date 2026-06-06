import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { useAvatar } from '../context/AvatarContext';
import { useInterview } from '../context/InterviewContext';
import CareerCard from '../components/CareerCard';
import DashboardSummaryCard from '../components/skillbridge/DashboardSummaryCard';
import RoleModelPreview from '../components/RoleModelPreview';
import NextSteps from '../components/NextSteps';
import careers from '../data/careers';
import { getIconComponent } from '../utils/iconMap';
import './Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const { user, isHydrating } = useUser();
  const { triggerCheckpoint } = useAvatar();
  const { sessions } = useInterview();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isHydrating && !user.isOnboarded) {
      navigate('/onboarding');
    }
  }, [isHydrating, user.isOnboarded, navigate]);

  // ── Avatar: streak detection on Dashboard ──
  useEffect(() => {
    if (isHydrating || !user.isOnboarded) return;

    // Check for consecutive-day streak via localStorage
    const STREAK_KEY = 'avatar-streak-days';
    const LAST_DAY_KEY = 'avatar-last-active-day';
    const today = new Date().toDateString();
    const lastDay = localStorage.getItem(LAST_DAY_KEY);

    let streak = parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
    if (lastDay === today) {
      // Already counted today
    } else {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      if (lastDay === yesterday) {
        streak += 1;
      } else {
        streak = 1; // reset
      }
      localStorage.setItem(STREAK_KEY, String(streak));
      localStorage.setItem(LAST_DAY_KEY, today);
    }

    // Compute interview metrics
    const interviewCount = Array.isArray(sessions) ? sessions.length : 0;
    const avgInterviewScore = interviewCount > 0
      ? Math.round(
          sessions.reduce((sum, s) => {
            const scores = (s.results || []).map((r) => r.score).filter(Number.isFinite);
            return sum + (scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0);
          }, 0) / interviewCount
        )
      : undefined;

    if (streak >= 3) {
      triggerCheckpoint('streak', {
        eventId: `streak-${streak}`,
        userName: user?.profile?.name || undefined,
        xpLevel: user?.progress?.level,
        currentXp: user?.progress?.xp,
        interviewCount,
        avgInterviewScore,
        dreamJob: user?.activeCareerGoal?.title || undefined,
      });
    }
  }, [isHydrating]); // eslint-disable-line

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
            <h1>{t('dashboard.welcomeBack', { name: profile.name })}</h1>
            <p className="welcome-sub">{t('dashboard.continueExploring')}</p>
          </div>
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-icon"><LevelIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">Level {progress.level}</span>
                <span className="stat-lbl">{t('dashboard.currentLevel')}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><ScenarioIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">{progress.completedScenarios.length}</span>
                <span className="stat-lbl">{t('dashboard.scenariosDone')}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><BadgeCountIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">{progress.badges.length}</span>
                <span className="stat-lbl">{t('dashboard.badgesEarned')}</span>
              </div>
            </div>
            <div className="stat-card">
              <span className="stat-icon"><DecisionIcon size={22} aria-hidden="true" /></span>
              <div>
                <span className="stat-val">{progress.decisions.length}</span>
                <span className="stat-lbl">{t('dashboard.decisionsMade')}</span>
              </div>
            </div>
          </div>
        </header>

        {user.activeCareerGoal && (
          <div className="career-goal-banner">
            <span className="career-goal-banner-icon"><GoalIcon size={20} aria-hidden="true" /></span>
            <div className="career-goal-banner-text">
              <strong>{t('dashboard.activeGoal', { title: user.activeCareerGoal.title })}</strong>
              <span>{t('dashboard.goalTailored')}</span>
            </div>
              <button className="career-goal-banner-change" onClick={handleChangeGoal}>{t('common.change')}</button>
          </div>
        )}

        <NextSteps onChooseGoal={handleChangeGoal} />

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

        <RoleModelPreview />

        <section className="careers-section" id="recommended-paths">
          <h2 className="section-heading">{t('dashboard.recommendedPaths')}</h2>
          <p className="section-desc">{t('dashboard.recommendedDesc')}</p>
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
          <h2 className="section-heading">{t('dashboard.exploreAll')}</h2>
          <p className="section-desc">{t('dashboard.exploreAllDesc')}</p>
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
            <h2 className="section-heading">{t('dashboard.yourBadges')}</h2>
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
            <h2 className="section-heading">{t('dashboard.recentDecisions')}</h2>
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
