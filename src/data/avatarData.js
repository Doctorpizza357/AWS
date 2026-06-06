/**
 * Avatar character definitions and checkpoint messages.
 * Adding/editing avatars or messages requires only changes to this file.
 *
 * Each avatar represents a unique cultural/ethnic background and gender presentation
 * to reinforce inclusivity and diversity in STEM.
 */

const avatarCharacters = [
  {
    id: 'avatar-priya',
    displayName: 'Priya',
    visualAsset: '/assets/avatars/priya.svg',
    culturalBackground: 'south-asian',
    genderPresentation: 'feminine',
    altText: 'Priya, AI career assistant avatar',
  },
  {
    id: 'avatar-jamal',
    displayName: 'Jamal',
    visualAsset: '/assets/avatars/jamal.svg',
    culturalBackground: 'african-american',
    genderPresentation: 'masculine',
    altText: 'Jamal, AI career assistant avatar',
  },
  {
    id: 'avatar-mei',
    displayName: 'Mei',
    visualAsset: '/assets/avatars/mei.svg',
    culturalBackground: 'east-asian',
    genderPresentation: 'feminine',
    altText: 'Mei, AI career assistant avatar',
  },
  {
    id: 'avatar-carlos',
    displayName: 'Carlos',
    visualAsset: '/assets/avatars/carlos.svg',
    culturalBackground: 'latin-american',
    genderPresentation: 'masculine',
    altText: 'Carlos, AI career assistant avatar',
  },
  {
    id: 'avatar-amara',
    displayName: 'Amara',
    visualAsset: '/assets/avatars/amara.svg',
    culturalBackground: 'west-african',
    genderPresentation: 'feminine',
    altText: 'Amara, AI career assistant avatar',
  },
  {
    id: 'avatar-alex',
    displayName: 'Alex',
    visualAsset: '/assets/avatars/alex.svg',
    culturalBackground: 'european',
    genderPresentation: 'non-binary',
    altText: 'Alex, AI career assistant avatar',
  },
  {
    id: 'avatar-hiroshi',
    displayName: 'Hiroshi',
    visualAsset: '/assets/avatars/hiroshi.svg',
    culturalBackground: 'japanese',
    genderPresentation: 'masculine',
    altText: 'Hiroshi, AI career assistant avatar',
  },
  {
    id: 'avatar-fatima',
    displayName: 'Fatima',
    visualAsset: '/assets/avatars/fatima.svg',
    culturalBackground: 'middle-eastern',
    genderPresentation: 'feminine',
    altText: 'Fatima, AI career assistant avatar',
  },
  {
    id: 'avatar-kai',
    displayName: 'Kai',
    visualAsset: '/assets/avatars/kai.svg',
    culturalBackground: 'pacific-islander',
    genderPresentation: 'non-binary',
    altText: 'Kai, AI career assistant avatar',
  },
];

const checkpointMessages = [
  {
    checkpointId: 'landing',
    messages: [
      {
        id: 'landing-1',
        text: 'Welcome to STEM PathfindR! Explore careers that match your interests, build skills through guided projects, and practice interviews to land your dream role.',
      },
      {
        id: 'landing-2',
        text: 'Ready to discover your path? Start with career exploration, level up your skills with personalized roadmaps, and prep for interviews with AI-powered practice.',
      },
      {
        id: 'landing-3',
        text: "Your STEM journey starts here. Discover careers you'll love, bridge skill gaps with hands-on learning, and build interview confidence step by step.",
      },
      {
        id: 'landing-4',
        text: 'Hi there! Dive into career discovery to find your fit, sharpen skills through real projects, and rehearse interviews so you walk in prepared and confident.',
      },
    ],
  },
  {
    checkpointId: 'skillbridge',
    messages: [
      {
        id: 'sb-general-1',
        text: 'Focus on one skill at a time. Consistency beats intensity when building lasting expertise.',
      },
      {
        id: 'sb-general-2',
        text: 'Set a small daily goal. Even 20 minutes of focused practice adds up over weeks.',
      },
      {
        id: 'sb-general-3',
        text: 'Learning is a marathon, not a sprint. Celebrate small wins along the way.',
      },
      {
        id: 'sb-dreamjob-1',
        text: 'Think about what excites you most. Your dream job should align with both your strengths and passions.',
        wizardStep: 'dream-job',
      },
      {
        id: 'sb-dreamjob-2',
        text: "Don't worry about picking the perfect job. You can always refine your choice as you learn more.",
        wizardStep: 'dream-job',
      },
      {
        id: 'sb-assessment-1',
        text: 'Be honest in your self-assessment. Knowing your true starting point helps build the best roadmap.',
        wizardStep: 'assessment',
      },
      {
        id: 'sb-assessment-2',
        text: "Rate your skills based on real experience. It's okay to be a beginner — that's what growth looks like.",
        wizardStep: 'assessment',
      },
      {
        id: 'sb-gap-analysis-1',
        text: "Gaps aren't weaknesses — they're opportunities. Each one you close brings you closer to your goal.",
        wizardStep: 'gap-analysis',
      },
      {
        id: 'sb-gap-analysis-2',
        text: 'Focus on the biggest gaps first. Tackling high-impact skills gives you the fastest progress.',
        wizardStep: 'gap-analysis',
      },
      {
        id: 'sb-roadmap-1',
        text: 'Your roadmap is personalized just for you. Follow it step by step and track your progress.',
        wizardStep: 'roadmap',
      },
      {
        id: 'sb-roadmap-2',
        text: 'Stick to the plan but stay flexible. Adjust timelines if life gets busy — progress still counts.',
        wizardStep: 'roadmap',
      },
    ],
  },
  {
    checkpointId: 'mock-interview',
    messages: [
      {
        id: 'mi-1',
        text: "You've got this! Take a deep breath before each answer and use the STAR method: Situation, Task, Action, Result.",
      },
      {
        id: 'mi-2',
        text: 'Confidence comes with practice. Pause before responding to collect your thoughts — interviewers respect a thoughtful answer.',
      },
      {
        id: 'mi-3',
        text: "You're more prepared than you think! Structure answers with a clear beginning, middle, and end to stay focused.",
      },
      {
        id: 'mi-4',
        text: 'Every interview is a learning opportunity. Maintain eye contact with the camera and speak at a steady, calm pace.',
      },
    ],
  },
];

module.exports = { avatarCharacters, checkpointMessages };
