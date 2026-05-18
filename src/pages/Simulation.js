import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { generateScenario } from '../services/aiService';
import careers from '../data/careers';
import './Simulation.css';

function Simulation() {
  const { careerId, scenarioId } = useParams();
  const navigate = useNavigate();
  const { user, addXP, earnBadge, completeScenario, addDecision } = useUser();

  const [scenarioData, setScenarioData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showOutcome, setShowOutcome] = useState(false);
  const [startTime] = useState(Date.now());

  const career = careers.find(c => c.id === careerId);
  const scenario = career?.scenarios.find(s => s.id === scenarioId);

  useEffect(() => {
    if (career && scenario) {
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

    // Award XP
    addXP(option.xp);

    // Record decision
    addDecision({
      careerId: career.id,
      careerTitle: career.title,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      choice: option.text,
      xp: option.xp,
      traits: option.traits,
      timestamp: Date.now(),
    });

    // Check for badges
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed < 120) {
      earnBadge({ id: 'quick-thinker', name: 'Quick Thinker', icon: '💡', description: 'Completed a scenario in under 2 minutes' });
    }

    if (option.traits.includes('collaborative') || option.traits.includes('helpful')) {
      const collabCount = user.progress.decisions.filter(d =>
        d.traits && (d.traits.includes('collaborative') || d.traits.includes('helpful'))
      ).length;
      if (collabCount >= 4) {
        earnBadge({ id: 'team-player', name: 'Team Player', icon: '🤝', description: 'Choose collaborative options 5 times' });
      }
    }
  };

  const handleComplete = () => {
    completeScenario(scenarioId);

    // Check first-step badge
    if (user.progress.completedScenarios.length === 0) {
      earnBadge({ id: 'first-step', name: 'First Step', icon: '👣', description: 'Complete your first scenario' });
    }

    // Check deep-diver badge
    const careerScenarioIds = career.scenarios.map(s => s.id);
    const allCompleted = careerScenarioIds.every(id =>
      [...user.progress.completedScenarios, scenarioId].includes(id)
    );
    if (allCompleted) {
      earnBadge({ id: 'deep-diver', name: 'Deep Diver', icon: '🤿', description: 'Complete all scenarios in one career' });
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
            ← Back to {career.title}
          </button>
          <div className="sim-title-row">
            <span className="sim-icon">{career.icon}</span>
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
                <h3>🎯 Decision Point</h3>
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
                        <span className="option-xp">+{option.xp} XP</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="outcome-section fade-in">
                  <div className="outcome-box">
                    <h3>📖 Outcome</h3>
                    <p className="outcome-choice">
                      <strong>Your choice:</strong> {selectedOption.text}
                    </p>
                    <p className="outcome-result">{selectedOption.outcome}</p>
                    <div className="outcome-rewards">
                      <span className="reward-xp">+{selectedOption.xp} XP earned</span>
                      <div className="reward-traits">
                        {selectedOption.traits.map(trait => (
                          <span key={trait} className="trait-tag">{trait}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button className="btn-primary complete-btn" onClick={handleComplete}>
                    Complete Scenario ✓
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
