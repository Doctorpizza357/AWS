import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Rocket, Upload, FileText, X } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { generateCareerRecommendations, analyzeResume } from '../services/aiService';
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
  const fileInputRef = useRef(null);

  // Mode: 'choose' | 'quiz' | 'resume-uploading' | 'resume-followup'
  const [mode, setMode] = useState('choose');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    name: '',
    interests: [],
    skills: [],
    workstyle: '',
    motivation: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Resume-specific state
  const [resumeFile, setResumeFile] = useState(null);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);
  const [followUpAnswers, setFollowUpAnswers] = useState({});
  const [followUpStep, setFollowUpStep] = useState(0);
  const [extractedData, setExtractedData] = useState(null);

  // Determine current quiz steps based on mode
  const currentSteps = mode === 'resume-followup' ? followUpQuestions : quizSteps;
  const currentStepIndex = mode === 'resume-followup' ? followUpStep : step;
  const currentStep = currentSteps[currentStepIndex];
  const totalSteps = currentSteps.length;
  const progress = totalSteps > 0 ? ((currentStepIndex + 1) / totalSteps) * 100 : 0;

  const handleTextInput = (value) => {
    if (mode === 'resume-followup') {
      setFollowUpAnswers(prev => ({ ...prev, [currentStep.id]: value }));
    } else {
      setAnswers(prev => ({ ...prev, [currentStep.id]: value }));
    }
  };

  const handleMultiSelect = (option) => {
    const setter = mode === 'resume-followup' ? setFollowUpAnswers : setAnswers;
    const current = mode === 'resume-followup'
      ? (followUpAnswers[currentStep.id] || [])
      : answers[currentStep.id];

    setter(prev => {
      const arr = prev[currentStep.id] || [];
      if (arr.includes(option)) {
        return { ...prev, [currentStep.id]: arr.filter(i => i !== option) };
      }
      if (arr.length >= 4) return prev;
      return { ...prev, [currentStep.id]: [...arr, option] };
    });
  };

  const handleSingleSelect = (option) => {
    if (mode === 'resume-followup') {
      setFollowUpAnswers(prev => ({ ...prev, [currentStep.id]: option }));
    } else {
      setAnswers(prev => ({ ...prev, [currentStep.id]: option }));
    }
  };

  const canProceed = () => {
    if (!currentStep) return false;
    const answer = mode === 'resume-followup'
      ? (followUpAnswers[currentStep.id] || (currentStep.type === 'multi-select' ? [] : ''))
      : answers[currentStep.id];

    if (currentStep.type === 'text') return typeof answer === 'string' && answer.trim().length > 0;
    if (currentStep.type === 'multi-select') return Array.isArray(answer) && answer.length >= 2;
    if (currentStep.type === 'single-select') return typeof answer === 'string' && answer.length > 0;
    return false;
  };

  const buildProfileFromFollowUp = () => {
    // Merge extracted data with follow-up answers
    const merged = { ...extractedData };

    followUpQuestions.forEach(q => {
      const answer = followUpAnswers[q.id];
      if (!answer) return;

      // Map follow-up answers back to profile fields
      if (q.id.includes('name') || q.id === 'name') {
        merged.name = answer;
      } else if (q.id.includes('interest')) {
        merged.interests = Array.isArray(answer) ? answer : merged.interests;
      } else if (q.id.includes('skill')) {
        merged.skills = Array.isArray(answer) ? answer : merged.skills;
      } else if (q.id.includes('workstyle') || q.id.includes('work_style') || q.id.includes('environment')) {
        merged.workstyle = answer;
      } else if (q.id.includes('motivation') || q.id.includes('motivat')) {
        merged.motivation = answer;
      }
    });

    return {
      name: merged.name || '',
      interests: merged.interests || [],
      skills: merged.skills || [],
      preferences: {
        workstyle: merged.workstyle || 'Mixed (Variety of settings)',
        motivation: merged.motivation || 'Innovation and creating new things',
      },
    };
  };

  const handleFinish = async (profile) => {
    setLoading(true);
    setError('');
    try {
      const careers = await generateCareerRecommendations(profile);
      completeOnboarding(profile, careers);
      navigate('/dashboard');
    } catch (err) {
      console.error('Error generating recommendations:', err);
      setError('Something went wrong generating your recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    if (mode === 'resume-followup') {
      if (followUpStep < followUpQuestions.length - 1) {
        setFollowUpStep(followUpStep + 1);
      } else {
        const profile = buildProfileFromFollowUp();
        await handleFinish(profile);
      }
    } else {
      if (step < quizSteps.length - 1) {
        setStep(step + 1);
      } else {
        const profile = {
          name: answers.name,
          interests: answers.interests,
          skills: answers.skills,
          preferences: {
            workstyle: answers.workstyle,
            motivation: answers.motivation,
          },
        };
        await handleFinish(profile);
      }
    }
  };

  const handleBack = () => {
    if (mode === 'resume-followup') {
      if (followUpStep > 0) {
        setFollowUpStep(followUpStep - 1);
      } else {
        // Go back to choose mode
        setMode('choose');
        setFollowUpQuestions([]);
        setFollowUpAnswers({});
        setExtractedData(null);
        setResumeFile(null);
      }
    } else {
      if (step > 0) {
        setStep(step - 1);
      } else {
        setMode('choose');
      }
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') {
      setResumeFile(file);
      setError('');
    } else if (file) {
      setError('Please upload a PDF file.');
    }
  };

  const handleResumeUpload = async () => {
    if (!resumeFile) return;

    setMode('resume-uploading');
    setLoading(true);
    setError('');

    try {
      const analysis = await analyzeResume(resumeFile);

      if (analysis.status === 'complete') {
        // Resume has all the info we need — go straight to recommendations
        const profile = analysis.profile;
        await handleFinish(profile);
      } else if (analysis.status === 'incomplete') {
        // Need follow-up questions
        setExtractedData(analysis.extractedData || {});
        setFollowUpQuestions(analysis.followUpQuestions || []);
        setFollowUpAnswers({});
        setFollowUpStep(0);
        setMode('resume-followup');
      } else {
        throw new Error('Unexpected analysis response');
      }
    } catch (err) {
      console.error('Resume analysis failed:', err);
      setError(err.message || 'Failed to analyze resume. You can try again or take the quiz instead.');
      setMode('choose');
    } finally {
      setLoading(false);
    }
  };

  const removeFile = () => {
    setResumeFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── Choose Mode (initial screen) ─────────────────────────────────────────

  if (mode === 'choose') {
    return (
      <div className="onboarding">
        <div className="onboarding-container fade-in">
          <h2 className="quiz-question">How would you like to get started?</h2>
          <p className="choose-subtitle">
            We'll use your answers to recommend personalized STEM career paths.
          </p>

          <div className="choose-options">
            <button
              className="choose-card"
              onClick={() => setMode('quiz')}
            >
              <div className="choose-card-icon quiz-icon">
                <Rocket size={28} aria-hidden="true" />
              </div>
              <h3>Take the Quiz</h3>
              <p>Answer 5 quick questions about your interests, skills, and preferences.</p>
            </button>

            <button
              className="choose-card"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="choose-card-icon resume-icon">
                <Upload size={28} aria-hidden="true" />
              </div>
              <h3>Upload Your Resume</h3>
              <p>Upload a PDF resume and we'll analyze it with AI to build your profile instantly.</p>
            </button>
          </div>

          {resumeFile && (
            <div className="resume-file-preview">
              <FileText size={18} aria-hidden="true" />
              <span className="resume-filename">{resumeFile.name}</span>
              <button className="resume-remove-btn" onClick={removeFile} aria-label="Remove file">
                <X size={14} />
              </button>
              <button className="btn-next resume-analyze-btn" onClick={handleResumeUpload}>
                Analyze Resume <Rocket size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          {error && <p className="onboarding-error">{error}</p>}

          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
            aria-label="Upload resume PDF"
          />
        </div>
      </div>
    );
  }

  // ─── Resume Uploading (loading state) ─────────────────────────────────────

  if (mode === 'resume-uploading') {
    return (
      <div className="onboarding">
        <div className="onboarding-container fade-in">
          <div className="resume-analyzing">
            <div className="resume-analyzing-spinner"></div>
            <h2 className="quiz-question">Analyzing your resume...</h2>
            <p className="choose-subtitle">
              Our AI is reading through your experience to build your career profile.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Quiz Mode & Resume Follow-up Mode ────────────────────────────────────

  const currentAnswer = mode === 'resume-followup'
    ? (followUpAnswers[currentStep?.id] || (currentStep?.type === 'multi-select' ? [] : ''))
    : answers[currentStep?.id];

  return (
    <div className="onboarding">
      <div className="onboarding-container fade-in">
        <div className="quiz-progress">
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="progress-text">
            {mode === 'resume-followup' ? 'Follow-up ' : ''}Step {currentStepIndex + 1} of {totalSteps}
          </span>
        </div>

        {mode === 'resume-followup' && followUpStep === 0 && (
          <div className="resume-followup-banner">
            <FileText size={16} aria-hidden="true" />
            <span>We found some info from your resume but need a few more details.</span>
          </div>
        )}

        <div className="quiz-content" key={`${mode}-${currentStepIndex}`}>
          <h2 className="quiz-question">{currentStep?.question}</h2>

          {currentStep?.type === 'text' && (
            <input
              type="text"
              className="quiz-input"
              placeholder={currentStep.placeholder || 'Type your answer'}
              value={currentAnswer || ''}
              onChange={(e) => handleTextInput(e.target.value)}
              autoFocus
            />
          )}

          {currentStep?.type === 'multi-select' && (
            <div className="options-grid">
              {currentStep.options.map(option => (
                <button
                  key={option}
                  className={`option-btn ${(currentAnswer || []).includes(option) ? 'selected' : ''}`}
                  onClick={() => handleMultiSelect(option)}
                >
                  {option}
                  {(currentAnswer || []).includes(option) && <span className="check"><Check size={14} aria-hidden="true" /></span>}
                </button>
              ))}
              <p className="option-hint">Select 2-4 options</p>
            </div>
          )}

          {currentStep?.type === 'single-select' && (
            <div className="options-list">
              {currentStep.options.map(option => (
                <button
                  key={option}
                  className={`option-btn-single ${currentAnswer === option ? 'selected' : ''}`}
                  onClick={() => handleSingleSelect(option)}
                >
                  <span className="radio-dot"></span>
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="onboarding-error">{error}</p>}

        <div className="quiz-actions">
          <button className="btn-back" onClick={handleBack}>
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
          <button
            className="btn-next"
            onClick={handleNext}
            disabled={!canProceed() || loading}
          >
            {loading ? 'Analyzing...' : currentStepIndex === totalSteps - 1 ? (
              <>
                Discover My Paths <Rocket size={16} aria-hidden="true" />
              </>
            ) : (
              <>
                Next <ArrowRight size={16} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Onboarding;
