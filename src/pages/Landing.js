import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUser } from '../context/UserContext';
import { useAvatar } from '../context/AvatarContext';
import { getIconComponent } from '../utils/iconMap';
import './Landing.css';

function Landing() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { triggerCheckpoint } = useAvatar();
  const { t } = useTranslation();
  const InfinityIcon = getIconComponent('infinity');

  useEffect(() => {
    // Detect inactivity: if user has progress but hasn't visited in a while
    const lastVisit = localStorage.getItem('avatar-last-visit');
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    localStorage.setItem('avatar-last-visit', String(now));

    const isInactive = lastVisit && (now - Number(lastVisit)) > ONE_DAY * 3;
    const hasProgress = user?.progress?.xp > 0 || user?.progress?.level > 1;

    if (isInactive && hasProgress) {
      triggerCheckpoint('inactivity', {
        eventId: `inactivity-${Date.now()}`,
        userName: user?.profile?.name || user?.name || undefined,
        xpLevel: user?.progress?.level,
        currentXp: user?.progress?.xp,
      });
    } else {
      triggerCheckpoint('landing', {
        userName: user?.profile?.name || user?.name || undefined,
        xpLevel: user?.progress?.level,
        currentXp: user?.progress?.xp,
      });
    }
  }, []); // eslint-disable-line

  const handleStart = () => {
    if (user.isOnboarded) {
      navigate('/campus');
    } else {
      navigate('/onboarding');
    }
  };

  const floatingCards = [
    { label: 'Software Engineer', icon: 'career-software', delay: '0s' },
    { label: 'Biomedical Engineer', icon: 'career-biomedical', delay: '0.5s' },
    { label: 'Aerospace Engineer', icon: 'career-aerospace', delay: '1s' },
    { label: 'Data Scientist', icon: 'career-data', delay: '1.5s' },
    { label: 'Environmental Scientist', icon: 'career-environmental', delay: '2s' },
  ];

  const featureCards = [
    {
      title: t('landing.features.quiz.title'),
      description: t('landing.features.quiz.desc'),
      icon: 'feature-quiz',
    },
    {
      title: t('landing.features.ai.title'),
      description: t('landing.features.ai.desc'),
      icon: 'feature-ai',
    },
    {
      title: t('landing.features.game.title'),
      description: t('landing.features.game.desc'),
      icon: 'feature-game',
    },
    {
      title: t('landing.features.level.title'),
      description: t('landing.features.level.desc'),
      icon: 'feature-level',
    },
  ];

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="hero-content fade-in">
          <div className="hero-badge">{t('landing.badge')}</div>
          <h1 className="hero-title">
            {t('landing.title', '').split('<1>')[0]}
            <span className="gradient-text">{t('landing.title', '').match(/<1>(.*?)<\/1>/)?.[1] || 'STEM Career'}</span>
            {t('landing.title', '').split('</1>')[1] || ' Through Adventure'}
          </h1>
          <p className="hero-subtitle">
            {t('landing.subtitle')}
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={handleStart}>
              {user.isOnboarded ? t('landing.continueJourney') : t('landing.startAdventure')}
            </button>
            <button className="btn-secondary" onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}>
              {t('common.learnMore')}
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">10+</span>
              <span className="stat-label">{t('landing.careerPaths')}</span>
            </div>
            <div className="stat">
              <span className="stat-number"><InfinityIcon size={24} aria-hidden="true" /></span>
              <span className="stat-label">{t('landing.scenarios')}</span>
            </div>
            <div className="stat">
              <span className="stat-number"><InfinityIcon size={24} aria-hidden="true" /></span>
              <span className="stat-label">{t('landing.decisions')}</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-cards">
            {floatingCards.map((card) => {
              const Icon = getIconComponent(card.icon);
              return (
                <div key={card.label} className="float-card" style={{ '--delay': card.delay }}>
                  <Icon size={18} aria-hidden="true" />
                  {card.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <section id="features" className="features-section">
        <h2 className="section-title">{t('landing.howItWorks')}</h2>
        <div className="features-grid">
          {featureCards.map((feature) => {
            const Icon = getIconComponent(feature.icon);
            return (
              <div className="feature-card" key={feature.title}>
                <span className="feature-icon"><Icon size={32} aria-hidden="true" /></span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cta-section">
        <h2>{t('landing.readyToFind')}</h2>
        <p>{t('landing.joinThousands')}</p>
        <button className="btn-primary" onClick={handleStart}>
          {t('landing.beginExploration')}
        </button>
      </section>
    </div>
  );
}

export default Landing;
