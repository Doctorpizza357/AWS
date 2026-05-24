import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { generateScenario } from '../services/aiService';
import careers from '../data/careers';
import { getIconComponent } from '../utils/iconMap';
import './Simulation.css';

function Simulation() {
  const { careerId, scenarioId } = useParams();
  const navigate = useNavigate();
  const { user, addXP, earnBadge, completeScenario, addDecision } = useUser();

  const [scenarioData, setScenarioData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showOutcome, setShowOutcome] = useState(false);
  const [awardedXp, setAwardedXp] = useState(null);
  const [startTime] = useState(Date.now());
  const hasCompletedRef = useRef(false);

  const career = careers.find(c => c.id === careerId);
  const scenario = career?.scenarios.find(s => s.id === scenarioId);
  const CareerIcon = career ? getIconComponent(career.icon) : null;
  const BackIcon = getIconComponent('arrow-left');
  const TargetIcon = getIconComponent('decision-point');
  const OutcomeIcon = getIconComponent('outcome-book');
  const CompleteIcon = getIconComponent('check');

  useEffect(() => {
    if (career && scenario) {
      hasCompletedRef.current = false;
      setSelectedOption(null);
      setShowOutcome(false);
      setAwardedXp(null);
      loadScenario();
    }
  }, [careerId, scenarioId]);

  const loadScenario = async () => {
    setLoading(true);
    try {
      const data = await generateScenario(career, scenario, user.profile);
      setScenarioData(data);
    } catch (error) {
      console.error('Failed to load scenario:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChoice = (option) => {
    setSelectedOption(option);
    setShowOutcome(true);
  };

  const handleComplete = () => {
    if (hasCompletedRef.current || !selectedOption) {
      navigate(`/career/${careerId}`);
      return;
    }

    hasCompletedRef.current = true;

    const alreadyCompleted = user.progress.completedScenarios.includes(scenarioId);
    const xpToAward = alreadyCompleted ? 0 : selectedOption.xp;

    if (xpToAward > 0) {
      addXP(xpToAward);
    }

    setAwardedXp(xpToAward);

    if (!alreadyCompleted) {
      addDecision({
        careerId: career.id,
        careerTitle: career.title,
        scenarioId: scenario.id,
        scenarioTitle: scenario.title,
        choice: selectedOption.text,
        xp: xpToAward,
        traits: selectedOption.traits,
        timestamp: Date.now(),
      });
    }

    completeScenario(scenarioId);

    // Check for badges
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed < 120) {
      earnBadge({ id: 'quick-thinker', name: 'Quick Thinker', icon: 'badge-quick-thinker', description: 'Completed a scenario in under 2 minutes' });
    }

    if (selectedOption.traits.includes('collaborative') || selectedOption.traits.includes('helpful')) {
      const collabCount = user.progress.decisions.filter(d =>
        d.traits && (d.traits.includes('collaborative') || d.traits.includes('helpful'))
      ).length + (alreadyCompleted ? 0 : 1);
      if (collabCount >= 5) {
        earnBadge({ id: 'team-player', name: 'Team Player', icon: 'badge-team-player', description: 'Choose collaborative options 5 times' });
      }
    }

    // Check first-step badge
    if (user.progress.completedScenarios.length === 0) {
      earnBadge({ id: 'first-step', name: 'First Step', icon: 'badge-first-step', description: 'Complete your first scenario' });
    }

    // Check deep-diver badge
    const careerScenarioIds = career.scenarios.map(s => s.id);
    const allCompleted = careerScenarioIds.every(id =>
      [...user.progress.completedScenarios, scenarioId].includes(id)
    );
    if (allCompleted) {
      earnBadge({ id: 'deep-diver', name: 'Deep Diver', icon: 'badge-deep-diver', description: 'Complete all scenarios in one career' });
    }

    navigate(`/career/${careerId}`);
  };

  if (!career || !scenario) {
    return (
      <div className="simulation">
        <div className="container">
          <h2>Scenario not found</h2>
          <button className="btn-primary" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="simulation">
        <div className="container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <h2>Generating your scenario...</h2>
            <p>Our AI is crafting a realistic experience for you</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="simulation">
      <div className="container">
        <div className="sim-header fade-in">
          <button className="back-btn" onClick={() => navigate(`/career/${careerId}`)}>
            <BackIcon size={16} aria-hidden="true" /> Back to {career.title}
          </button>
          <div className="sim-title-row">
            <span className="sim-icon"><CareerIcon size={38} aria-hidden="true" /></span>
            <div>
              <h1>{scenario.title}</h1>
              <p className="sim-career">{career.title} • Scenario</p>
            </div>
          </div>
        </div>

        <div className="sim-content fade-in">
          {scenarioData && (
            <>
              <div className="narrative-box">
                <p className="narrative-text">{scenarioData.narrative}</p>
              </div>

              <div className="challenge-box">
                <h3><TargetIcon size={16} aria-hidden="true" /> Decision Point</h3>
                <p>{scenarioData.challenge}</p>
              </div>

              {!showOutcome ? (
                <div className="options-section">
                  <h3>What do you do?</h3>
                  <div className="sim-options">
                    {scenarioData.options.map(option => (
                      <button
                        key={option.id}
                        className="sim-option-btn"
                        onClick={() => handleChoice(option)}
                      >
                        <span className="option-letter">{option.id.toUpperCase()}</span>
                        <span className="option-text">{option.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="outcome-section fade-in">
                  <div className="outcome-box">
                    <h3><OutcomeIcon size={16} aria-hidden="true" /> Outcome</h3>
                    <p className="outcome-choice">
                      <strong>Your choice:</strong> {selectedOption.text}
                    </p>
                    <p className="outcome-result">{selectedOption.outcome}</p>
                    <p className="outcome-correct-answer">
                      <strong>Correct answer:</strong> {scenarioData.options.find(option => option.correct)?.text || selectedOption.text}
                    </p>
                    <div className="outcome-rewards">
                      <span className="reward-xp">+{awardedXp ?? selectedOption.xp} XP on completion</span>
                      <div className="reward-traits">
                        {selectedOption.traits.map(trait => (
                          <span key={trait} className="trait-tag">{trait}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button className="btn-primary complete-btn" onClick={handleComplete}>
                    Complete Scenario <CompleteIcon size={16} aria-hidden="true" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Simulation;
