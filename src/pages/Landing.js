import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getIconComponent } from '../utils/iconMap';
import './Landing.css';

function Landing() {
  const navigate = useNavigate();
  const { user } = useUser();

  const handleStart = () => {
    if (user.isOnboarded) {
      navigate('/dashboard');
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
      title: 'Take the Quiz',
      description: 'Tell us about your interests, skills, and what excites you about STEM.',
      icon: 'feature-quiz',
    },
    {
      title: 'AI Matches You',
      description: 'Our AI analyzes your profile and recommends personalized career paths.',
      icon: 'feature-ai',
    },
    {
      title: 'Live the Day',
      description: 'Experience realistic scenarios and make decisions that shape your journey.',
      icon: 'feature-game',
    },
    {
      title: 'Level Up',
      description: 'Earn XP, unlock badges, and discover new career paths as you progress.',
      icon: 'feature-level',
    },
  ];

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="hero-content fade-in">
          <div className="hero-badge">Gamified Career Discovery</div>
          <h1 className="hero-title">
            Discover Your <span className="gradient-text">STEM Career</span> Through Adventure
          </h1>
          <p className="hero-subtitle">
            Don't just read about careers. Try them. Step into real day-to-day scenarios, make choices that shape your path, and see where your strengths and interests can take you.
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={handleStart}>
              {user.isOnboarded ? 'Continue Journey' : 'Start Your Adventure'}
            </button>
            <button className="btn-secondary" onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}>
              Learn More ↓
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-number">5+</span>
              <span className="stat-label">Career Paths</span>
            </div>
            <div className="stat">
              <span className="stat-number">15+</span>
              <span className="stat-label">Scenarios</span>
            </div>
            <div className="stat">
              <span className="stat-number">50+</span>
              <span className="stat-label">Decisions</span>
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
        <h2 className="section-title">How It Works</h2>
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
        <h2>Ready to Find Your Path?</h2>
        <p>Join thousands of students discovering their STEM future.</p>
        <button className="btn-primary" onClick={handleStart}>
          Begin Exploration →
        </button>
      </section>
    </div>
  );
}

export default Landing;
