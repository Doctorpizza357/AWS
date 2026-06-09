/**
 * Tutorial - 3-step onboarding tutorial for the campus world.
 * Steps: movement controls, building interaction, quest tracker usage.
 */
import React, { useState } from 'react';
import './Tutorial.css';

const TUTORIAL_STEPS = [
  {
    id: 'movement',
    title: 'Movement Controls',
    description: 'Use arrow keys or WASD to move your avatar around campus. On mobile, use the on-screen controls.',
    action: 'Try moving your character!',
    icon: '🎮',
  },
  {
    id: 'building',
    title: 'Building Interaction',
    description: 'Walk near a building and press E or tap the interaction button to enter. Each building contains career features.',
    action: 'Approach a building to see the prompt.',
    icon: '🏢',
  },
  {
    id: 'quests',
    title: 'Quest Tracker',
    description: 'Quests appear in the top-left corner. Complete tasks to earn XP, level up, and unlock new items.',
    action: 'Check your first quest in the HUD!',
    icon: '📋',
  },
];

function Tutorial({ onComplete, onSkip }) {
  const [currentStep, setCurrentStep] = useState(0);

  const step = TUTORIAL_STEPS[currentStep];
  const isLastStep = currentStep === TUTORIAL_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete && onComplete();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  return (
    <div className="tutorial" role="dialog" aria-label="Campus tutorial">
      <div className="tutorial__overlay" />
      <div className="tutorial__panel">
        {/* Skip button */}
        <button
          className="tutorial__skip"
          onClick={onSkip}
          aria-label="Skip tutorial"
        >
          Skip Tutorial
        </button>

        {/* Step indicator */}
        <div className="tutorial__steps" aria-label={`Step ${currentStep + 1} of ${TUTORIAL_STEPS.length}`}>
          {TUTORIAL_STEPS.map((_, idx) => (
            <div
              key={idx}
              className={`tutorial__step-dot ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'complete' : ''}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="tutorial__content">
          <div className="tutorial__icon" aria-hidden="true">{step.icon}</div>
          <h3 className="tutorial__title">{step.title}</h3>
          <p className="tutorial__description">{step.description}</p>
          <p className="tutorial__action">{step.action}</p>
        </div>

        {/* Target highlight indicator */}
        <div className="tutorial__highlight" aria-hidden="true" />

        {/* Navigation */}
        <button
          className="tutorial__next"
          onClick={handleNext}
        >
          {isLastStep ? 'Start Exploring! 🎉' : 'Next →'}
        </button>
      </div>
    </div>
  );
}

export { TUTORIAL_STEPS };
export default Tutorial;
