import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import careers from '../data/careers';
import { getIconComponent } from '../utils/iconMap';
import './CareerPath.css';

function CareerPath() {
  const { careerId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();

  const career = careers.find(c => c.id === careerId);
  const CareerIcon = career ? getIconComponent(career.icon) : null;
  const SalaryIcon = getIconComponent('career-salary');
  const GrowthIcon = getIconComponent('career-growth');
  const EducationIcon = getIconComponent('career-education');
  const CheckIcon = getIconComponent('check');
  const LockIcon = getIconComponent('lock');
  const BackIcon = getIconComponent('arrow-left');
  const NextIcon = getIconComponent('arrow-right');

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
            <BackIcon size={16} aria-hidden="true" /> Back to Dashboard
          </button>
          <div className="career-hero">
            <span className="career-hero-icon"><CareerIcon size={42} aria-hidden="true" /></span>
            <div>
              <h1>{career.title}</h1>
              <p className="career-hero-field">{career.field}</p>
            </div>
          </div>
          <p className="career-hero-desc">{career.description}</p>

          <div className="career-info-grid">
            <div className="info-item">
              <span className="info-label"><SalaryIcon size={14} aria-hidden="true" /> Salary Range</span>
              <span className="info-value">{career.salary}</span>
            </div>
            <div className="info-item">
              <span className="info-label"><GrowthIcon size={14} aria-hidden="true" /> Job Growth</span>
              <span className="info-value">{career.growth}</span>
            </div>
            <div className="info-item">
              <span className="info-label"><EducationIcon size={14} aria-hidden="true" /> Education</span>
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
                    {isCompleted ? <CheckIcon size={14} aria-hidden="true" /> : isLocked ? <LockIcon size={14} aria-hidden="true" /> : (index + 1)}
                  </div>
                  <div className="node-content">
                    <h3>{scenario.title}</h3>
                    <p>{scenario.description}</p>
                    {!isLocked && (
                      <button
                        className="scenario-btn"
                        onClick={() => navigate(`/simulation/${career.id}/${scenario.id}`)}
                      >
                        {isCompleted ? 'Replay Scenario' : 'Start Scenario'} <NextIcon size={14} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

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
