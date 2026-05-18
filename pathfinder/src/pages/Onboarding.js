import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { generateCareerRecommendations } from '../services/aiService';
import './Onboarding.css';

const quizSteps = [
  {
    id: 'name',
    question: "What's your name, future pathfinder?",
    type: 'text',
    placeholder: 'Enter your name',
  },
  {
    id: 'interests',
    question: 'What topics excite you the most?',
    type: 'multi-select',
    options: [
      'Coding & Programming', 'Mathematics', 'Biology & Life Sciences',
      'Physics & Space', 'Chemistry', 'Environmental Science',
      'Robotics & Hardware', 'Data & Analytics', 'Design & UX',
      'Healthcare & Medicine', 'AI & Machine Learning', 'Sustainability',
    ],
  },
  {
    id: 'skills',
    question: 'Which skills do you feel strongest in?',
    type: 'multi-select',
    options: [
      'Problem Solving', 'Creative Thinking', 'Teamwork',
      'Writing & Communication', 'Math & Numbers', 'Research',
      'Leadership', 'Attention to Detail', 'Critical Thinking',
      'Hands-on Building', 'Public Speaking', 'Organization',
    ],
  },
  {
    id: 'workstyle',
    question: 'What work environment appeals to you?',
    type: 'single-select',
    options: [
      'Office / Remote (Computer-based work)',
      'Laboratory (Research & experiments)',
      'Field Work (Outdoors & travel)',
      'Mixed (Variety of settings)',
    ],
  },
  {
    id: 'motivation',
    question: 'What motivates you most in a career?',
    type: 'single-select',
    options: [
      'Making a positive impact on society',
      'Solving complex technical challenges',
      'Financial stability and growth',
      'Innovation and creating new things',
    ],
  },
];

function Onboarding() {
  const navigate = useNavigate();
  const { completeOnboarding } = useUser();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    name: '',
    interests: [],
    skills: [],
    workstyle: '',
    motivation: '',
  });
  const [loading, setLoading] = useState(false);

  const currentStep = quizSteps[step];
  const progress = ((step + 1) / quizSteps.length) * 100;

  const handleTextInput = (value) => {
    setAnswers(prev => ({ ...prev, [currentStep.id]: value }));
  };

  const handleMultiSelect = (option) => {
    setAnswers(prev => {
      const current = prev[currentStep.id];
      if (current.includes(option)) {
        return { ...prev, [currentStep.id]: current.filter(i => i !== option) };
      }
      if (current.length >= 4) return prev;
      return { ...prev, [currentStep.id]: [...current, option] };
    });
  };

  const handleSingleSelect = (option) => {
    setAnswers(prev => ({ ...prev, [currentStep.id]: option }));
  };

  const canProceed = () => {
    const answer = answers[currentStep.id];
    if (currentStep.type === 'text') return answer.trim().length > 0;
    if (currentStep.type === 'multi-select') return answer.length >= 2;
    if (currentStep.type === 'single-select') return answer.length > 0;
    return false;
  };

  const handleNext = async () => {
    if (step < quizSteps.length - 1) {
      setStep(step + 1);
    } else {
      setLoading(true);
      try {
        const profile = {
          name: answers.name,
          interests: answers.interests,
          skills: answers.skills,
          preferences: {
            workstyle: answers.workstyle,
            motivation: answers.motivation,
          },
        };
        const careers = await generateCareerRecommendations(profile);
        completeOnboarding(profile, careers);
        navigate('/dashboard');
      } catch (error) {
        console.error('Error generating recommendations:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding-container fade-in">
        <div className="quiz-progress">
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="progress-text">Step {step + 1} of {quizSteps.length}</span>
        </div>

        <div className="quiz-content" key={step}>
          <h2 className="quiz-question">{currentStep.question}</h2>

          {currentStep.type === 'text' && (
            <input
              type="text"
              className="quiz-input"
              placeholder={currentStep.placeholder}
              value={answers[currentStep.id]}
              onChange={(e) => handleTextInput(e.target.value)}
              autoFocus
            />
          )}

          {currentStep.type === 'multi-select' && (
            <div className="options-grid">
              {currentStep.options.map(option => (
                <button
                  key={option}
                  className={`option-btn ${answers[currentStep.id].includes(option) ? 'selected' : ''}`}
                  onClick={() => handleMultiSelect(option)}
                >
                  {option}
                  {answers[currentStep.id].includes(option) && <span className="check">✓</span>}
                </button>
              ))}
              <p className="option-hint">Select 2-4 options</p>
            </div>
          )}

          {currentStep.type === 'single-select' && (
            <div className="options-list">
              {currentStep.options.map(option => (
                <button
                  key={option}
                  className={`option-btn-single ${answers[currentStep.id] === option ? 'selected' : ''}`}
                  onClick={() => handleSingleSelect(option)}
                >
                  <span className="radio-dot"></span>
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="quiz-actions">
          {step > 0 && (
            <button className="btn-back" onClick={() => setStep(step - 1)}>
              ← Back
            </button>
          )}
          <button
            className="btn-next"
            onClick={handleNext}
            disabled={!canProceed() || loading}
          >
            {loading ? 'Analyzing...' : step === quizSteps.length - 1 ? 'Discover My Paths 🚀' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
