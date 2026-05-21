import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
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

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="hero-content fade-in">
          <div className="hero-badge">Gamified Career Discovery</div>
          <h1 className="hero-title">
            Discover Your <span className="gradient-text">STEM Career</span> Through Adventure
          </h1>
          <p className="hero-subtitle">
            Don't just read about careers — live them. Experience realistic day-in-the-life
            scenarios, make decisions that shape your path, and discover where your
            skills and passions lead.
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
            <div className="float-card" style={{ '--delay': '0s' }}>💻 Software Engineer</div>
            <div className="float-card" style={{ '--delay': '0.5s' }}>🧬 Biomedical Engineer</div>
            <div className="float-card" style={{ '--delay': '1s' }}>🚀 Aerospace Engineer</div>
            <div className="float-card" style={{ '--delay': '1.5s' }}>📊 Data Scientist</div>
            <div className="float-card" style={{ '--delay': '2s' }}>🌍 Environmental Scientist</div>
          </div>
        </div>
      </div>

      <section id="features" className="features-section">
        <h2 className="section-title">How It Works</h2>
        <div className="features-grid">
          <div className="feature-card">
            <span className="feature-icon">📝</span>
            <h3>Take the Quiz</h3>
            <p>Tell us about your interests, skills, and what excites you about STEM.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🤖</span>
            <h3>AI Matches You</h3>
            <p>Our AI analyzes your profile and recommends personalized career paths.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🎮</span>
            <h3>Live the Day</h3>
            <p>Experience realistic scenarios and make decisions that shape your journey.</p>
          </div>
          <div className="feature-card">
            <span className="feature-icon">🏆</span>
            <h3>Level Up</h3>
            <p>Earn XP, unlock badges, and discover new career paths as you progress.</p>
          </div>
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
