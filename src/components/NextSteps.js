import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useSkillBridge } from '../context/SkillBridgeContext';
import { useInterview } from '../context/InterviewContext';
import { getIconComponent } from '../utils/iconMap';
import './NextSteps.css';

/**
 * NextSteps — a smart "what to do next" section on the Dashboard.
 * Pulls data from UserContext, SkillBridgeContext, and InterviewContext
 * to generate contextual action cards that guide the user through
 * the platform as a cohesive journey rather than separate features.
 */
function NextSteps() {
  const navigate = useNavigate();
  const { user } = useUser();
  const skillBridge = useSkillBridge();
  const interview = useInterview();

  const steps = [];

  const { activeCareerGoal, recommendedCareers } = user;
  const topCareer = activeCareerGoal || (recommendedCareers.length > 0 ? recommendedCareers[0] : null);

  // 1. No active career goal set → suggest picking one
  if (!activeCareerGoal && recommendedCareers.length > 0) {
    steps.push({
      id: 'set-goal',
      icon: 'zap',
      title: 'Set Your Career Goal',
      description: `You have ${recommendedCareers.length} recommended paths. Pick one as your active goal to unlock personalized guidance across all features.`,
      action: () => navigate('/profile'),
      actionLabel: 'Choose Goal',
      priority: 1,
      color: 'purple',
    });
  }

  // 2. SkillBridge — no dream job selected yet
  if (!skillBridge.dreamJobId && topCareer) {
    steps.push({
      id: 'start-skillbridge',
      icon: 'feature-quiz',
      title: 'Analyze Your Skill Gaps',
      description: `See exactly which skills you need for ${topCareer.title || 'your goal'} and get a personalized learning roadmap.`,
      action: () => navigate('/skillbridge'),
      actionLabel: 'Start SkillBridge',
      priority: 2,
      color: 'cyan',
    });
  }

  // 3. SkillBridge — has gaps, roadmap not started
  if (skillBridge.dreamJobId && skillBridge.skillGaps.length > 0 && !skillBridge.currentRoadmap) {
    const topGap = skillBridge.skillGaps[0];
    steps.push({
      id: 'generate-roadmap',
      icon: 'badge-quick-thinker',
      title: 'Generate Your Learning Roadmap',
      description: `You have ${skillBridge.skillGaps.length} skill gaps identified${topGap ? ` (biggest: ${topGap.skillId})` : ''}. Generate a structured plan to close them.`,
      action: () => navigate('/skillbridge'),
      actionLabel: 'Build Roadmap',
      priority: 2,
      color: 'cyan',
    });
  }

  // 4. SkillBridge — roadmap in progress
  if (skillBridge.currentRoadmap && skillBridge.roadmapCompletionPct < 100) {
    steps.push({
      id: 'continue-roadmap',
      icon: 'play',
      title: `Continue Your Roadmap (${skillBridge.roadmapCompletionPct}% done)`,
      description: 'Keep working through your learning phases to close your skill gaps.',
      action: () => navigate('/skillbridge'),
      actionLabel: 'Continue Learning',
      priority: 3,
      color: 'green',
    });
  }

  // 5. Interview — no sessions yet
  if (interview.sessions.length === 0) {
    steps.push({
      id: 'first-interview',
      icon: 'mic',
      title: 'Practice Your First Mock Interview',
      description: topCareer
        ? `Get AI-powered feedback on your answers for ${topCareer.title} roles.`
        : 'Practice with AI-generated questions and get feedback on speech, body language, and content.',
      action: () => navigate('/interview/mock'),
      actionLabel: 'Start Interview',
      priority: 4,
      color: 'orange',
    });
  }

  // 6. Interview — has sessions, suggest improvement
  if (interview.sessions.length > 0 && interview.sessions.length < 5) {
    const lastSession = interview.sessions[0];
    const avgScore = lastSession?.results?.reduce((sum, r) => sum + (r.score || 0), 0) / (lastSession?.results?.length || 1);
    if (avgScore < 75) {
      steps.push({
        id: 'improve-interview',
        icon: 'mic',
        title: 'Improve Your Interview Score',
        description: `Your last session scored ${Math.round(avgScore || 0)}. Practice more to build confidence.`,
        action: () => navigate('/interview/mock'),
        actionLabel: 'Practice Again',
        priority: 5,
        color: 'orange',
      });
    }
  }

  // 7. Resume — not uploaded yet
  if (!user.resume) {
    steps.push({
      id: 'upload-resume',
      icon: 'user',
      title: 'Upload Your Resume',
      description: 'Get AI-powered analysis and optimization suggestions tailored to your career goal.',
      action: () => navigate('/interview/resume'),
      actionLabel: 'Upload Resume',
      priority: 6,
      color: 'blue',
    });
  }

  // 8. Market Intelligence — suggest checking demand
  if (topCareer && interview.sessions.length > 0 && steps.length < 4) {
    steps.push({
      id: 'check-market',
      icon: 'badge-level-10',
      title: `Check ${topCareer.title || 'Career'} Market Demand`,
      description: 'See salary trends, job openings, and growth projections for your target role.',
      action: () => navigate('/market-intelligence'),
      actionLabel: 'View Market Data',
      priority: 7,
      color: 'green',
    });
  }

  // Sort by priority and limit to top 3
  steps.sort((a, b) => a.priority - b.priority);
  const visibleSteps = steps.slice(0, 3);

  if (visibleSteps.length === 0) return null;

  return (
    <section className="next-steps-section" aria-labelledby="next-steps-heading">
      <div className="next-steps-header">
        <h2 id="next-steps-heading" className="section-heading">
          {(() => { const Icon = getIconComponent('zap'); return <Icon size={20} className="next-steps-heading-icon" />; })()}
          Your Next Steps
        </h2>
        <p className="section-desc">Personalized actions to advance your career journey</p>
      </div>
      <div className="next-steps-grid">
        {visibleSteps.map((step) => {
          const StepIcon = getIconComponent(step.icon);
          return (
            <button
              key={step.id}
              className={`next-step-card next-step-card--${step.color}`}
              onClick={step.action}
              type="button"
            >
              <div className="next-step-icon-wrap">
                <StepIcon size={22} aria-hidden="true" />
              </div>
              <div className="next-step-content">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
              <span className="next-step-action">{step.actionLabel} →</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default NextSteps;
