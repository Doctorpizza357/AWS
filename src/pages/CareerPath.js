import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import careers from '../data/careers';
import './CareerPath.css';

function CareerPath() {
  const { careerId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const career = careers.find(c => c.id === careerId);

  if (!career) {
    return (
      <div className="career-path">
        <div className="container">
          <h2>Career not found</h2>
          <button className="btn-primary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const completedScenarios = user.progress.completedScenarios;

  return (
    <div className="career-path">
      <div className="container">
        <div className="career-header fade-in" style={{ '--career-color': career.color }}>
          <button className="back-btn" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
          <div className="career-hero">
            <span className="career-hero-icon">{career.icon}</span>
            <div>
              <h1>{career.title}</h1>
              <p className="career-hero-field">{career.field}</p>
            </div>
          </div>
          <p className="career-hero-desc">{career.description}</p>

          <div className="career-info-grid">
            <div className="info-item">
              <span className="info-label">💰 Salary Range</span>
              <span className="info-value">{career.salary}</span>
            </div>
            <div className="info-item">
              <span className="info-label">📈 Job Growth</span>
              <span className="info-value">{career.growth}</span>
            </div>
            <div className="info-item">
              <span className="info-label">🎓 Education</span>
              <span className="info-value">{career.education}</span>
            </div>
          </div>
        </div>

        <section className="scenarios-section">
          <h2>Day-in-the-Life Scenarios</h2>
          <p className="section-sub">Experience what it's really like to work as a {career.title}</p>

          <div className="scenarios-timeline">
            {career.scenarios.map((scenario, index) => {
              const isCompleted = completedScenarios.includes(scenario.id);
              const isLocked = index > 0 && !completedScenarios.includes(career.scenarios[index - 1].id);

              return (
                <div
                  key={scenario.id}
                  className={`scenario-node ${isCompleted ? 'completed' : ''} ${isLocked ? 'locked' : ''}`}
                >
                  <div className="node-connector"></div>
                  <div className="node-dot">
                    {isCompleted ? '✓' : isLocked ? '🔒' : (index + 1)}
                  </div>
                  <div className="node-content">
                    <h3>{scenario.title}</h3>
                    <p>{scenario.description}</p>
                    {!isLocked && (
                      <button
                        className="scenario-btn"
                        onClick={() => navigate(`/simulation/${career.id}/${scenario.id}`)}
                      >
                        {isCompleted ? 'Replay Scenario' : 'Start Scenario'} →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {career.videoUrl && (
          <section className="video-section">
            <h2>See It In Action</h2>
            <p className="section-sub">Watch real professionals talk about their career</p>
            <div className="video-container">
              <iframe
                src={career.videoUrl}
                title={`${career.title} career video`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </section>
        )}

        <section className="skills-section">
          <h2>Key Skills</h2>
          <div className="skills-list">
            {career.skills.map(skill => (
              <div key={skill} className="skill-item">
                <span className="skill-dot" style={{ background: career.color }}></span>
                {skill}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default CareerPath;
