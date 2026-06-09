/**
 * ModalCareerSimulation - Self-contained career simulation for the campus modal.
 * Shows career info, scenario list, and runs simulations inline without React Router.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useUser } from '../../context/UserContext';
import { useSkillBridge } from '../../context/SkillBridgeContext';
import { generateScenario } from '../../services/aiService';
import careers from '../../data/careers';
import './ModalCareerSimulation.css';

// Map building IDs to career IDs
const BUILDING_TO_CAREER = {
  'software-engineering': 'software-engineer',
  'data-science': 'data-scientist',
  'cybersecurity': 'cybersecurity-analyst',
  'mechanical-engineering': 'mechanical-engineer',
  'electrical-engineering': 'electrical-engineer',
  'environmental-science': 'environmental-scientist',
  'biomedical-engineering': 'biomedical-engineer',
  'healthcare-tech': 'healthcare-technologist',
  'ux-design': 'ux-designer',
};

function ModalCareerSimulation({ buildingId }) {
  const careerId = BUILDING_TO_CAREER[buildingId];
  const career = careers.find(c => c.id === careerId);
  const { user, addXP, earnBadge, completeScenario, addDecision } = useUser();
  const { applyInferredGain } = useSkillBridge();

  const [view, setView] = useState('overview'); // 'overview' | 'simulation'
  const [activeScenario, setActiveScenario] = useState(null);
  const [scenarioData, setScenarioData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [showOutcome, setShowOutcome] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const hasCompletedRef = useRef(false);

  if (!career) {
    return (
      <div className="modal-sim__empty">
        <h2>Career not found</h2>
        <p>This career path is not available yet.</p>
      </div>
    );
  }

  const completedScenarios = user.progress.completedScenarios || [];

  const startScenario = async (scenario) => {
    setActiveScenario(scenario);
    setView('simulation');
    setLoading(true);
    setSelectedOption(null);
    setShowOutcome(false);
    setStartTime(Date.now());
    hasCompletedRef.current = false;

    try {
      const data = await generateScenario(career, scenario, user.profile);
      setScenarioData(data);
    } catch (err) {
      console.error('Failed to load scenario:', err);
      setScenarioData(null);
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
      setView('overview');
      return;
    }
    hasCompletedRef.current = true;

    const alreadyCompleted = completedScenarios.includes(activeScenario.id);
    const xpToAward = alreadyCompleted ? 0 : selectedOption.xp;

    if (xpToAward > 0) addXP(xpToAward);

    if (!alreadyCompleted) {
      addDecision({
        careerId: career.id,
        careerTitle: career.title,
        scenarioId: activeScenario.id,
        scenarioTitle: activeScenario.title,
        choice: selectedOption.text,
        xp: xpToAward,
        traits: selectedOption.traits,
        timestamp: Date.now(),
      });
    }

    completeScenario(activeScenario.id);

    if (applyInferredGain) {
      applyInferredGain(
        selectedOption.traits,
        selectedOption.rewardXp ?? selectedOption.xp,
        activeScenario.id,
        selectedOption.id,
      );
    }

    // Badges
    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed < 120) {
      earnBadge({ id: 'quick-thinker', name: 'Quick Thinker', icon: 'badge-quick-thinker', description: 'Completed a scenario in under 2 minutes' });
    }
    if (completedScenarios.length === 0) {
      earnBadge({ id: 'first-step', name: 'First Step', icon: 'badge-first-step', description: 'Complete your first scenario' });
    }

    setView('overview');
  };

  // Overview - career info + scenario list
  if (view === 'overview') {
    return (
      <div className="modal-sim">
        <div className="modal-sim__hero" style={{ '--career-color': career.color }}>
          <h2 className="modal-sim__title">{career.title}</h2>
          <p className="modal-sim__field">{career.field}</p>
          <p className="modal-sim__desc">{career.description}</p>
          <div className="modal-sim__stats">
            <span>💰 {career.salary}</span>
            <span>📈 {career.growth}</span>
          </div>
        </div>

        <div className="modal-sim__scenarios">
          <h3>Scenarios</h3>
          <div className="modal-sim__scenario-list">
            {career.scenarios.map(scenario => {
              const isCompleted = completedScenarios.includes(scenario.id);
              return (
                <button
                  key={scenario.id}
                  className={`modal-sim__scenario ${isCompleted ? 'completed' : ''}`}
                  onClick={() => startScenario(scenario)}
                >
                  <span className="modal-sim__scenario-status">
                    {isCompleted ? '✓' : '▶'}
                  </span>
                  <div className="modal-sim__scenario-info">
                    <strong>{scenario.title}</strong>
                    <span>{scenario.description}</span>
                  </div>
                  <span className="modal-sim__scenario-xp">
                    {isCompleted ? 'Replay' : '+XP'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Simulation view
  return (
    <div className="modal-sim">
      <button className="modal-sub-back" onClick={() => setView('overview')}>
        ← Back to {career.title}
      </button>

      {loading ? (
        <div className="modal-sim__loading">
          <div className="modal-sim__spinner" />
          <p>Generating your scenario...</p>
          <span style={{ color: '#666', fontSize: 12 }}>AI is crafting a realistic experience</span>
        </div>
      ) : scenarioData ? (
        <div className="modal-sim__play">
          <h3 className="modal-sim__play-title">{activeScenario.title}</h3>

          <div className="modal-sim__narrative">
            <p>{scenarioData.narrative}</p>
          </div>

          <div className="modal-sim__challenge">
            <h4>🎯 Decision Point</h4>
            <p>{scenarioData.challenge}</p>
          </div>

          {!showOutcome ? (
            <div className="modal-sim__options">
              <h4>What do you do?</h4>
              {scenarioData.options.map(option => (
                <button
                  key={option.id}
                  className="modal-sim__option"
                  onClick={() => handleChoice(option)}
                >
                  <span className="modal-sim__option-letter">{option.id.toUpperCase()}</span>
                  <span>{option.text}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="modal-sim__outcome">
              <h4>📖 Outcome</h4>
              <p><strong>Your choice:</strong> {selectedOption.text}</p>
              <p className="modal-sim__outcome-text">{selectedOption.outcome}</p>
              <div className="modal-sim__rewards">
                <span className="modal-sim__xp-badge">+{selectedOption.xp} XP</span>
                {selectedOption.traits.map(t => (
                  <span key={t} className="modal-sim__trait">{t}</span>
                ))}
              </div>
              <button className="modal-sim__complete-btn" onClick={handleComplete}>
                Complete Scenario ✓
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="modal-sim__loading">
          <p>Failed to load scenario. Try again.</p>
          <button onClick={() => startScenario(activeScenario)}>Retry</button>
        </div>
      )}
    </div>
  );
}

export default ModalCareerSimulation;
