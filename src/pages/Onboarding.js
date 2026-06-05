import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Rocket, Upload, FileText, X, Linkedin, Link } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { generateCareerRecommendations, analyzeResume, extractTextFromPDF, analyzeLinkedIn } from '../services/aiService';
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
  const { completeOnboarding, saveResume } = useUser();
  const fileInputRef = useRef(null);
  const highlightTimerRef = useRef(null);

  // Mode: 'choose' | 'quiz' | 'resume-uploading' | 'resume-followup' | 'linkedin' | 'linkedin-analyzing'
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
  const [resumeHighlights, setResumeHighlights] = useState([]);
  const [revealedHighlights, setRevealedHighlights] = useState([]);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);
  const [followUpAnswers, setFollowUpAnswers] = useState({});
  const [followUpStep, setFollowUpStep] = useState(0);
  const [extractedData, setExtractedData] = useState(null);

  // LinkedIn-specific state
  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [linkedInText, setLinkedInText] = useState('');
  const [linkedInUrlError, setLinkedInUrlError] = useState('');

  const extractResumeHighlights = (text) => {
    const source = String(text || '').toLowerCase();
    const keywordGroups = [
      { label: 'Python', terms: ['python', 'pandas', 'numpy', 'scikit', 'jupyter'] },
      { label: 'JavaScript', terms: ['javascript', 'js', 'react', 'node.js', 'nodejs', 'next.js', 'nextjs', 'typescript'] },
      { label: 'AWS', terms: ['aws', 'cloud', 'lambda', 's3', 'ec2', 'bedrock', 'serverless', 'devops'] },
      { label: 'SQL', terms: ['sql', 'database', 'databases', 'postgres', 'mysql', 'query', 'data warehouse'] },
      { label: 'Machine Learning', terms: ['machine learning', 'ml', 'ai', 'artificial intelligence', 'model', 'predictive'] },
      { label: 'Data Analysis', terms: ['data analysis', 'analytics', 'analysis', 'dashboard', 'reporting', 'insights'] },
      { label: 'Problem Solving', terms: ['problem solving', 'problem-solving', 'debug', 'troubleshoot', 'investigate', 'root cause'] },
      { label: 'Leadership', terms: ['leadership', 'led', 'lead', 'manage', 'management', 'mentored', 'ownership'] },
      { label: 'Teamwork', terms: ['teamwork', 'team', 'collaborate', 'collaboration', 'cross-functional', 'partnered'] },
      { label: 'Communication', terms: ['communication', 'communicate', 'presented', 'presentation', 'stakeholder', 'client'] },
      { label: 'Research', terms: ['research', 'literature review', 'experiment', 'experimented', 'survey', 'analysis'] },
      { label: 'Project Management', terms: ['project management', 'project manager', 'roadmap', 'timeline', 'planning', 'agile', 'scrum'] },
      { label: 'Git', terms: ['git', 'github', 'gitlab', 'version control', 'commit', 'pull request'] },
      { label: 'Linux', terms: ['linux', 'bash', 'shell', 'terminal', 'command line'] },
      { label: 'Docker', terms: ['docker', 'container', 'kubernetes', 'k8s', 'orchestration'] },
      { label: 'Cybersecurity', terms: ['cybersecurity', 'security', 'encryption', 'authentication', 'authorization', 'threat'] },
      { label: 'Public Speaking', terms: ['public speaking', 'spoken', 'presented', 'speaker', 'conference', 'talk'] },
      { label: 'Critical Thinking', terms: ['critical thinking', 'critical analysis', 'reasoning', 'evaluation'] },
      { label: 'Hands-on Building', terms: ['hands-on', 'building', 'prototype', 'hardware', 'assembled', 'fabrication'] },
      { label: 'Mathematics', terms: ['mathematics', 'math', 'algebra', 'calculus', 'statistics', 'quantitative'] },
      { label: 'Biology', terms: ['biology', 'bio', 'life sciences', 'biomedical', 'healthcare', 'medical'] },
      { label: 'Engineering', terms: ['engineering', 'engineer', 'systems', 'mechanical', 'electrical', 'software'] },
      { label: 'Design', terms: ['design', 'ux', 'ui', 'user experience', 'user interface', 'figma', 'prototyping'] },
      { label: 'Attention to Detail', terms: ['attention to detail', 'detail-oriented', 'accuracy', 'quality assurance', 'qa'] },
      { label: 'Testing', terms: ['testing', 'test', 'unit test', 'integration test', 'automation'] },
    ];

    const detected = [];
    keywordGroups.forEach(({ label, terms }) => {
      const matched = terms.some((term) => source.includes(term));
      if (matched && !detected.includes(label)) {
        detected.push(label);
      }
    });

    return detected.slice(0, 12);
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const clearHighlightAnimation = () => {
    if (highlightTimerRef.current) {
      clearInterval(highlightTimerRef.current);
      highlightTimerRef.current = null;
    }
  };

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
    } else if (mode === 'linkedin') {
      setMode('choose');
      setLinkedInUrl('');
      setLinkedInText('');
      setLinkedInUrlError('');
      setError('');
    } else {
      if (step > 0) {
        setStep(step - 1);
      } else {
        setMode('choose');
      }
    }
  };

  const validateLinkedInUrl = (url) => {
    if (!url) return true; // URL is optional
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes('linkedin.com');
    } catch {
      return false;
    }
  };

  const handleLinkedInSubmit = async () => {
    if (!linkedInText.trim() || linkedInText.trim().length < 30) {
      setError('Please paste at least a few sentences from your LinkedIn profile.');
      return;
    }

    if (linkedInUrl && !validateLinkedInUrl(linkedInUrl)) {
      setLinkedInUrlError('Please enter a valid LinkedIn URL (e.g. linkedin.com/in/yourname)');
      return;
    }

    setLinkedInUrlError('');
    setMode('linkedin-analyzing');
    setLoading(true);
    setError('');

    try {
      const highlights = extractResumeHighlights(linkedInText);
      setResumeHighlights(highlights);
      setRevealedHighlights([]);
      clearHighlightAnimation();

      await wait(Math.min(5000, 2000 + highlights.length * 420));

      const analysis = await analyzeLinkedIn(linkedInText, linkedInUrl);

      if (analysis.status === 'complete') {
        await handleFinish(analysis.profile);
      } else if (analysis.status === 'incomplete') {
        setExtractedData(analysis.extractedData || {});
        setFollowUpQuestions(analysis.followUpQuestions || []);
        setFollowUpAnswers({});
        setFollowUpStep(0);
        setMode('resume-followup');
      } else {
        throw new Error('Unexpected analysis response');
      }
    } catch (err) {
      console.error('LinkedIn analysis failed:', err);
      setError(err.message || 'Failed to analyze LinkedIn profile. You can try again or take the quiz instead.');
      setMode('linkedin');
    } finally {
      setLoading(false);
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
    setResumeHighlights([]);
    setRevealedHighlights([]);
    clearHighlightAnimation();

    try {
      const resumeText = await extractTextFromPDF(resumeFile);
      const highlights = extractResumeHighlights(resumeText);
      setResumeHighlights(highlights);
      setRevealedHighlights([]);
      saveResume({
        fileName: resumeFile.name,
        text: resumeText,
        source: 'onboarding',
      });

      // Keep the loading screen alive long enough for the personalized orbit to become visible.
      await wait(Math.min(6500, 2600 + highlights.length * 520));

      const analysis = await analyzeResume(resumeFile);
      saveResume({
        fileName: resumeFile.name,
        text: resumeText,
        source: 'onboarding',
        analysis,
      });

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
    setResumeHighlights([]);
    setRevealedHighlights([]);
    clearHighlightAnimation();
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (mode !== 'resume-uploading' && mode !== 'linkedin-analyzing') {
      clearHighlightAnimation();
      return;
    }

    if (!resumeHighlights.length) return;

    setRevealedHighlights([resumeHighlights[0]]);
    let index = 1;
    clearHighlightAnimation();
    highlightTimerRef.current = setInterval(() => {
      setRevealedHighlights((current) => {
        if (index >= resumeHighlights.length) {
          clearHighlightAnimation();
          return current;
        }

        const nextValue = resumeHighlights[index];
        index += 1;
        if (current.includes(nextValue)) return current;
        return [...current, nextValue];
      });

      if (index >= resumeHighlights.length) {
        clearHighlightAnimation();
      }
    }, 420);

    return () => clearHighlightAnimation();
  }, [mode, resumeHighlights]);

  // ─── Choose Mode (initial screen) ─────────────────────────────────────────

  if (mode === 'choose') {
    return (
      <div className="onboarding">
        <div className="onboarding-container fade-in">
          <h2 className="quiz-question">How would you like to get started?</h2>
          <p className="choose-subtitle">
            We'll use your answers to recommend personalized STEM career paths.
          </p>

          <div className="choose-options choose-options--three">
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

            <button
              className="choose-card"
              onClick={() => { setMode('linkedin'); setError(''); }}
            >
              <div className="choose-card-icon linkedin-icon">
                <Linkedin size={28} aria-hidden="true" />
              </div>
              <h3>Use LinkedIn</h3>
              <p>Paste your LinkedIn profile summary and experience to auto-build your profile.</p>
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

  // ─── LinkedIn Form ─────────────────────────────────────────────────────────

  if (mode === 'linkedin') {
    const canSubmitLinkedIn = linkedInText.trim().length >= 30;
    return (
      <div className="onboarding">
        <div className="onboarding-container fade-in">
          <div className="linkedin-header">
            <div className="choose-card-icon linkedin-icon linkedin-icon--sm">
              <Linkedin size={22} aria-hidden="true" />
            </div>
            <div>
              <h2 className="quiz-question" style={{ marginBottom: 4 }}>Import from LinkedIn</h2>
              <p className="choose-subtitle" style={{ marginBottom: 0 }}>
                Paste your profile info and we'll build your career profile automatically.
              </p>
            </div>
          </div>

          <div className="linkedin-form">
            <div className="linkedin-field">
              <label className="linkedin-label" htmlFor="linkedin-url">
                <Link size={14} aria-hidden="true" /> Profile URL <span className="linkedin-optional">(optional)</span>
              </label>
              <input
                id="linkedin-url"
                type="url"
                className={`quiz-input linkedin-url-input${linkedInUrlError ? ' linkedin-input--error' : ''}`}
                placeholder="https://linkedin.com/in/yourname"
                value={linkedInUrl}
                onChange={(e) => { setLinkedInUrl(e.target.value); setLinkedInUrlError(''); }}
              />
              {linkedInUrlError && <p className="linkedin-field-error">{linkedInUrlError}</p>}
            </div>

            <div className="linkedin-field">
              <label className="linkedin-label" htmlFor="linkedin-text">
                <FileText size={14} aria-hidden="true" /> Profile Text <span className="linkedin-required">*</span>
              </label>
              <p className="linkedin-hint">
                Go to your LinkedIn profile → copy your <strong>About</strong> section and <strong>Experience</strong> entries, then paste them here.
              </p>
              <textarea
                id="linkedin-text"
                className="linkedin-textarea"
                placeholder="Paste your LinkedIn About section, experience, and skills here…"
                value={linkedInText}
                onChange={(e) => setLinkedInText(e.target.value)}
                rows={9}
                autoFocus
              />
              <p className="linkedin-char-count">
                {linkedInText.length > 0 ? `${linkedInText.length} characters` : 'Minimum 30 characters required'}
              </p>
            </div>
          </div>

          {error && <p className="onboarding-error">{error}</p>}

          <div className="quiz-actions">
            <button className="btn-back" onClick={handleBack}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <button
              className="btn-next"
              onClick={handleLinkedInSubmit}
              disabled={!canSubmitLinkedIn || loading}
            >
              Analyze Profile <Rocket size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── LinkedIn Analyzing (loading state) ───────────────────────────────────

  if (mode === 'linkedin-analyzing') {
    return (
      <div className="onboarding">
        <div className="onboarding-container fade-in">
          <div className="resume-analyzing">
            <div className="resume-analyzing-orbit" aria-hidden="true">
              <div className="resume-analyzing-core">
                <div className="resume-analyzing-spinner" />
                <Linkedin size={18} aria-hidden="true" />
              </div>
              {revealHighlightsToBubbles(revealedHighlights)}
            </div>
            <div className="resume-highlight-caption">Reading your experience and skills from LinkedIn</div>
            <h2 className="quiz-question">Analyzing your profile...</h2>
            <p className="choose-subtitle">
              Our AI is mapping your LinkedIn experience to STEM career paths.
            </p>
          </div>
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
            <div className="resume-analyzing-orbit" aria-hidden="true">
              <div className="resume-analyzing-core">
                <div className="resume-analyzing-spinner" />
                <FileText size={18} aria-hidden="true" />
              </div>
              {revealHighlightsToBubbles(revealedHighlights)}
            </div>
            <div className="resume-highlight-caption">Scanning for skills and strengths from your resume</div>
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

function revealHighlightsToBubbles(items) {
  return (items || []).map((item, index) => {
    const angle = Math.round((index * 137.508) % 360);
    const radius = '138px';
    return (
      <div
        key={`${item}-${index}`}
        className={`resume-orbit-item resume-orbit-item-${(index % 6) + 1}`}
        style={{ '--angle': angle, '--radius': radius, '--orbit-delay': '0s' }}
      >
        <span className="resume-orbit-pill">{item}</span>
      </div>
    );
  });
}

export default Onboarding;
