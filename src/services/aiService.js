export async function analyzeLinkedIn(profileText, profileUrl) {
  const response = await fetch('/api/linkedin/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ profileText, profileUrl: profileUrl || '' }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (json && json.message) || `LinkedIn analysis returned ${response.status}`;
    throw new Error(message);
  }

  return json.analysis;
}

export async function analyzeResume(file) {
  const formData = new FormData();
  formData.append('resume', file);

  const response = await fetch('/api/resume/analyze', {
    method: 'POST',
    body: formData,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (json && json.message) || `Resume analysis returned ${response.status}`;
    throw new Error(message);
  }

  return json.analysis;
}

export async function extractTextFromPDF(file) {
  const formData = new FormData();
  formData.append('resume', file);

  const response = await fetch('/api/interview/extract-pdf', {
    method: 'POST',
    body: formData,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (json && json.message) || `PDF extraction returned ${response.status}`;
    throw new Error(message);
  }

  return json.text;
}

export async function generateScenario(career, scenario, userProfile) {
  try {
    const response = await fetch('/api/scenarios/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        career,
        scenario,
        userProfile: userProfile || {},
        variation: `${career?.id || 'career'}:${scenario?.id || 'scenario'}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      }),
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const message = (json && json.message) || `Scenario endpoint returned ${response.status}`;
      throw new Error(message);
    }

    const generatedScenario = normalizeScenario(json?.scenario || json);

    if (!generatedScenario || typeof generatedScenario !== 'object') {
      throw new Error('Scenario endpoint returned no structured scenario');
    }

    return generatedScenario;
  } catch (error) {
    console.warn('Scenario backend failed, using fallback:', error);
    return normalizeScenario(getFallbackScenario(career, scenario));
  }
}

import careers from '../data/careers';

export async function generateCareerRecommendations(profile) {
  // Returns career IDs based on profile matching
  const { interests, skills } = profile;
  const allTags = [...interests, ...skills].map(t => t.toLowerCase());

  // Simple matching algorithm (AI would enhance this)
  const scored = careers.map(career => {
    const matchScore = career.tags.reduce((score, tag) => {
      return score + (allTags.some(t => t.includes(tag) || tag.includes(t)) ? 1 : 0);
    }, 0);
    return { ...career, matchScore };
  });

  return scored.sort((a, b) => b.matchScore - a.matchScore).slice(0, 6);
}

function normalizeScenario(scenario) {
  const difficultyLookup = { easy: 10, medium: 20, hard: 30 };
  const rawDifficulty = String(scenario?.difficulty || 'medium').toLowerCase();
  const difficulty = Object.prototype.hasOwnProperty.call(difficultyLookup, rawDifficulty) ? rawDifficulty : 'medium';
  const rewardXp = difficultyLookup[difficulty];
  const sourceOptions = Array.isArray(scenario?.options) ? scenario.options : [];

  const options = sourceOptions.map((option, index) => {
    const id = option?.id || String.fromCharCode(97 + index);
    return {
      ...option,
      id,
      correct: Boolean(option?.correct || option?.isCorrect),
    };
  });

  let correctIndex = options.findIndex((option) => option.correct);
  if (correctIndex === -1 && options.length > 0) {
    correctIndex = 0;
  }

  return {
    ...scenario,
    difficulty,
    rewardXp,
    correctOptionId: options[correctIndex]?.id || null,
    options: options.map((option, index) => ({
      ...option,
      correct: index === correctIndex,
      isCorrect: index === correctIndex,
      xp: index === correctIndex ? rewardXp : 0,
      rewardXp: index === correctIndex ? rewardXp : 0,
    })),
  };
}

function getFallbackScenario(career, scenario) {
  const fallbacks = {
    'se-morning': {
      narrative: `It's 9:30 AM and you walk into the open-plan office at a fast-growing tech startup. Your team of 6 engineers is building a new feature that will serve millions of users. The morning standup is about to begin, and you notice your teammate Sarah looks stressed - she's been stuck on a complex database issue since yesterday.\n\nAs you grab your coffee, the product manager drops by to mention that the CEO wants a demo of the new feature by Friday - that's just 3 days away. Your tech lead opens the standup by asking everyone for their updates.`,
      challenge: 'It\'s your turn to speak. You\'re ahead on your tasks, but the team is behind overall. What do you do?',
      options: [
        { id: 'a', text: 'Report your progress and offer to help Sarah with her database issue', outcome: 'Sarah gratefully accepts your help. Together, you solve the issue in 2 hours. The team gets back on track.', xp: 20, correct: true, traits: ['collaborative', 'helpful'] },
        { id: 'b', text: 'Focus on finishing your own tasks early to have buffer time', outcome: 'You finish your tasks a day early, giving you time to help with testing later.', xp: 0, traits: ['independent', 'efficient'] },
        { id: 'c', text: 'Suggest the team re-prioritize features for the Friday demo', outcome: 'The team agrees to cut one non-essential feature, reducing pressure on everyone.', xp: 0, traits: ['strategic', 'leadership'] },
        { id: 'd', text: 'Propose a pair-programming session for the whole team', outcome: 'The team pairs up and knowledge sharing improves. Morale goes up.', xp: 0, traits: ['collaborative', 'innovative'] },
      ],
    },
    'se-debug': {
      narrative: `Your phone buzzes at 2 PM with an urgent Slack notification: "CRITICAL - Payment processing failing for 30% of users." Your heart rate spikes as you open your laptop. The error logs show a cascade of failures starting 20 minutes ago.\n\nThe on-call engineer has already identified that a recent deployment might be the cause, but rolling back could affect other critical fixes that went out in the same release. Your manager is asking for a status update, and customer support is getting flooded with tickets.`,
      challenge: 'You need to act fast. Thousands of dollars in transactions are failing every minute. What\'s your first move?',
      options: [
        { id: 'a', text: 'Immediately roll back the entire deployment', outcome: 'The rollback fixes payments but reverts a security patch. You\'ll need to isolate and re-deploy the fix separately.', xp: 0, traits: ['decisive', 'cautious'] },
        { id: 'b', text: 'Dig into the logs to identify the exact failing component', outcome: 'You find the bug in 15 minutes - a null pointer in the new payment validation. You push a hotfix.', xp: 0, traits: ['analytical', 'technical'] },
        { id: 'c', text: 'Enable the feature flag to disable only the new payment flow', outcome: 'Smart move! The feature flag isolates the issue without affecting other changes. Payments resume in 2 minutes.', xp: 30, correct: true, traits: ['strategic', 'experienced'] },
        { id: 'd', text: 'Coordinate with the team to split investigation tasks', outcome: 'You assign log analysis, customer communication, and fix development in parallel. Issue resolved in 10 minutes.', xp: 0, traits: ['leadership', 'collaborative'] },
      ],
    },
    'se-design': {
      narrative: `You've been working on a proposal to redesign the notification system. Currently, it's a monolithic service that's becoming a bottleneck. You've spent two weeks researching microservice patterns and event-driven architectures.\n\nToday, you're presenting to 5 senior engineers and the VP of Engineering. Your slides are ready, but you know they'll ask tough questions about scalability, cost, and migration strategy.`,
      challenge: 'A senior engineer challenges your approach, suggesting a simpler solution. How do you respond?',
      options: [
        { id: 'a', text: 'Defend your proposal with data and benchmarks you prepared', outcome: 'Your thorough preparation impresses the team. They approve your design with minor modifications.', xp: 0, traits: ['prepared', 'confident'] },
        { id: 'b', text: 'Acknowledge their point and propose a hybrid approach', outcome: 'The hybrid approach combines the best of both ideas. The team appreciates your flexibility.', xp: 20, correct: true, traits: ['adaptable', 'collaborative'] },
        { id: 'c', text: 'Ask them to elaborate so you can understand their concerns', outcome: 'Their feedback reveals a use case you hadn\'t considered. You improve your design significantly.', xp: 0, traits: ['humble', 'learning-oriented'] },
        { id: 'd', text: 'Suggest a proof-of-concept to test both approaches', outcome: 'The team agrees to a 2-week spike. Data-driven decision making wins.', xp: 0, traits: ['scientific', 'pragmatic'] },
      ],
    },
  };

  // Generic fallback for careers without specific scenarios
  const genericFallback = {
    narrative: `You arrive at work ready to tackle today's challenges as a ${career.title}. The morning brings a mix of routine tasks and unexpected problems that test your skills.\n\nYour colleague approaches with an interesting problem that requires creative thinking and technical expertise.`,
    challenge: `A complex problem has landed on your desk. How do you approach it?`,
    options: [
      { id: 'a', text: 'Research thoroughly before taking action', outcome: 'Your careful research leads to a well-informed solution.', xp: 0, traits: ['analytical', 'thorough'] },
      { id: 'b', text: 'Collaborate with teammates to brainstorm solutions', outcome: 'The team generates creative ideas you wouldn\'t have found alone.', xp: 10, correct: true, traits: ['collaborative', 'creative'] },
      { id: 'c', text: 'Start with a quick prototype to test your hypothesis', outcome: 'Your prototype reveals important insights early in the process.', xp: 0, traits: ['innovative', 'action-oriented'] },
      { id: 'd', text: 'Break the problem into smaller, manageable pieces', outcome: 'Systematic decomposition makes the complex problem solvable.', xp: 0, traits: ['organized', 'methodical'] },
    ],
  };

  return fallbacks[scenario.id] || genericFallback;
}

export async function fetchRoleModelMatches({ profile, activeCareerGoal, recommendedCareers }) {
  const response = await fetch('/api/role-models/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ profile, activeCareerGoal, recommendedCareers }),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = (json && json.message) || `Role model matching returned ${response.status}`;
    throw new Error(message);
  }

  return json.roleModels || [];
}

export async function sendAssistantMessage(message) {
  if (!message || typeof message !== 'string') {
    throw new Error('Empty message');
  }

  const resp = await fetch('/api/assistant/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ message }),
  });

  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    const err = (json && json.message) || `Assistant endpoint returned ${resp.status}`;
    const payload = { ok: false, message: err, detail: json };
    return payload;
  }

  return { ok: true, assistant: json.assistant || (json && json.message) || '' };
}
