import React, { useState } from 'react';
import './KnowledgeOrbs.css';

const TRIVIA_QUESTIONS = [
  { id: 'q1', question: 'What does API stand for?', options: ['Application Programming Interface', 'Applied Program Integration', 'Automated Process Input', 'Application Process Interface'], correct: 0, zone: 'tech-hub', xp: 15 },
  { id: 'q2', question: 'Which language is most used in data science?', options: ['Java', 'Python', 'C++', 'Ruby'], correct: 1, zone: 'tech-hub', xp: 15 },
  { id: 'q3', question: 'What does HTML stand for?', options: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Hyper Transfer Markup Language', 'Home Tool Markup Language'], correct: 0, zone: 'tech-hub', xp: 10 },
  { id: 'q4', question: 'What is the primary function of a firewall?', options: ['Speed up internet', 'Filter network traffic', 'Store data', 'Compress files'], correct: 1, zone: 'tech-hub', xp: 15 },
  { id: 'q5', question: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'], correct: 0, zone: 'engineering-quad', xp: 10 },
  { id: 'q6', question: "Newton's second law relates force to what?", options: ['Velocity', 'Mass and acceleration', 'Energy', 'Distance'], correct: 1, zone: 'engineering-quad', xp: 15 },
  { id: 'q7', question: 'What is the powerhouse of the cell?', options: ['Nucleus', 'Ribosome', 'Mitochondria', 'Golgi apparatus'], correct: 2, zone: 'health-sciences', xp: 10 },
  { id: 'q8', question: 'What does UX stand for?', options: ['User Experience', 'Universal Exchange', 'Unified Extension', 'User Execution'], correct: 0, zone: 'creative-stem', xp: 10 },
  { id: 'q9', question: 'Which gas do plants absorb from the atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'], correct: 2, zone: 'science-park', xp: 10 },
  { id: 'q10', question: 'What is machine learning a subset of?', options: ['Database management', 'Artificial Intelligence', 'Networking', 'Operating Systems'], correct: 1, zone: 'tech-hub', xp: 15 },
  { id: 'q11', question: 'What protocol is used for secure web browsing?', options: ['HTTP', 'FTP', 'HTTPS', 'SMTP'], correct: 2, zone: 'tech-hub', xp: 15 },
  { id: 'q12', question: 'What does RAM stand for?', options: ['Random Access Memory', 'Read Access Module', 'Rapid Application Memory', 'Runtime Allocation Memory'], correct: 0, zone: 'engineering-quad', xp: 10 },
  { id: 'q13', question: 'What is the smallest unit of data in computing?', options: ['Byte', 'Bit', 'Nibble', 'Word'], correct: 1, zone: 'tech-hub', xp: 15 },
  { id: 'q14', question: 'Which vitamin is produced when skin is exposed to sunlight?', options: ['Vitamin A', 'Vitamin C', 'Vitamin D', 'Vitamin B12'], correct: 2, zone: 'health-sciences', xp: 10 },
  { id: 'q15', question: 'What does SQL stand for?', options: ['Structured Query Language', 'Simple Question Language', 'Standard Query Logic', 'System Query Language'], correct: 0, zone: 'tech-hub', xp: 15 },
];

function KnowledgeOrbs({ collectedOrbs, onCollectOrb, onAnswer }) {
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [answered, setAnswered] = useState(null); // 'correct' | 'wrong' | null

  const availableOrbs = TRIVIA_QUESTIONS.filter(q => !collectedOrbs.includes(q.id));

  // Auto-pick a random question on mount if none active
  React.useEffect(() => {
    if (!activeQuestion && availableOrbs.length > 0) {
      const randomIdx = Math.floor(Math.random() * availableOrbs.length);
      setActiveQuestion(availableOrbs[randomIdx]);
    }
    // eslint-disable-next-line
  }, []);

  const handleAnswer = (optionIndex) => {
    const isCorrect = optionIndex === activeQuestion.correct;
    setAnswered(isCorrect ? 'correct' : 'wrong');

    if (isCorrect) {
      onCollectOrb(activeQuestion.id);
      onAnswer(activeQuestion.xp, true);
    } else {
      onAnswer(0, false);
    }

    setTimeout(() => {
      setActiveQuestion(null);
      setAnswered(null);
    }, isCorrect ? 1500 : 2000);
  };

  if (activeQuestion) {
    return (
      <div className="orb-question-overlay">
        <div className={`orb-question-panel ${answered || ''}`}>
          <div className="orb-question-header">
            <span className="orb-question-icon">💡</span>
            <span className="orb-question-xp">+{activeQuestion.xp} XP</span>
          </div>
          <h3 className="orb-question-text">{activeQuestion.question}</h3>
          <div className="orb-question-options">
            {activeQuestion.options.map((opt, idx) => (
              <button
                key={idx}
                className={`orb-option ${answered && idx === activeQuestion.correct ? 'correct' : ''} ${answered === 'wrong' && idx !== activeQuestion.correct ? '' : ''}`}
                onClick={() => !answered && handleAnswer(idx)}
                disabled={!!answered}
              >
                {opt}
              </button>
            ))}
          </div>
          {answered === 'correct' && <p className="orb-result orb-result--correct">✓ Correct! +{activeQuestion.xp} XP</p>}
          {answered === 'wrong' && <p className="orb-result orb-result--wrong">✗ Not quite. The answer was: {activeQuestion.options[activeQuestion.correct]}</p>}
        </div>
      </div>
    );
  }

  return null;
}

export { TRIVIA_QUESTIONS };
export default KnowledgeOrbs;
