/**
 * QuizBattle — Real-time quiz challenge between two players.
 * Players answer the same set of trivia questions and compare scores.
 * Uses Firestore for real-time sync via challengeService.
 */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUser } from '../context/UserContext';
import { subscribeToChallenge, submitResults } from '../services/challengeService';
import './QuizBattle.css';

const TIME_PER_QUESTION = 15;
const RESULT_SHOW_MS = 1500;

export default function QuizBattle() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user: authUser } = useAuth();
  const { addXP } = useUser();

  const challengeId = searchParams.get('challenge');
  const role = searchParams.get('role');

  const [challengeData, setChallengeData] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [timeLeft, setTimeLeft] = useState(TIME_PER_QUESTION);
  const [phase, setPhase] = useState('waiting'); // waiting | answering | showingResult | finished
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const challengeSubRef = useRef(null);
  const timerRef = useRef(null);
  const resultTimerRef = useRef(null);

  // Subscribe to challenge data
  useEffect(() => {
    if (!challengeId) return;
    challengeSubRef.current = subscribeToChallenge(challengeId, (data) => {
      setChallengeData(data);
      if (data?.questions?.length > 0) {
        setQuestions(prev => {
          if (prev.length > 0) return prev;

          // Check if this user already submitted results (page refresh scenario)
          const myResultsField = role === 'challenger' ? 'challengerResults' : 'opponentResults';
          if (data[myResultsField]) {
            // Already completed — go straight to finished with saved data
            setScore(data[myResultsField].score || 0);
            setAnswers(data[myResultsField].answers || []);
            setCurrentIdx(data.questions.length - 1);
            setPhase('finished');
            return data.questions;
          }

          // Also check if challenge status is completed
          if (data.status === 'completed') {
            setPhase('finished');
            return data.questions;
          }

          // Fresh start
          setPhase('answering');
          return data.questions;
        });
      }
    });
    return () => { challengeSubRef.current?.(); };
  }, [challengeId]); // eslint-disable-line

  // Countdown timer — only runs during 'answering' phase
  useEffect(() => {
    if (phase !== 'answering') return;

    // Reset timer for this question
    setTimeLeft(TIME_PER_QUESTION);

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          // Time's up — record wrong answer and show result
          clearInterval(timerRef.current);
          recordAnswer(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current);
  }, [phase, currentIdx]); // eslint-disable-line

  // Show result phase — wait then advance
  useEffect(() => {
    if (phase !== 'showingResult') return;

    resultTimerRef.current = setTimeout(() => {
      // Move to next question or finish
      const nextIdx = currentIdx + 1;
      if (nextIdx >= questions.length) {
        finishQuiz();
      } else {
        setCurrentIdx(nextIdx);
        setSelectedAnswer(null);
        setPhase('answering');
      }
    }, RESULT_SHOW_MS);

    return () => clearTimeout(resultTimerRef.current);
  }, [phase]); // eslint-disable-line

  // Record an answer (called from user click or timeout)
  const recordAnswer = (optionIdx) => {
    const question = questions[currentIdx];
    const isCorrect = optionIdx >= 0 && optionIdx === question.correct;
    const timeUsed = TIME_PER_QUESTION - timeLeft;
    const points = isCorrect ? 100 + Math.max(0, Math.round((TIME_PER_QUESTION - timeUsed) / TIME_PER_QUESTION * 50)) : 0;

    setSelectedAnswer(optionIdx);
    setScore(prev => prev + points);
    setAnswers(prev => [...prev, { questionIdx: currentIdx, selected: optionIdx, correct: isCorrect, time: timeUsed }]);
    setPhase('showingResult');
  };

  const handleAnswer = (optionIdx) => {
    if (phase !== 'answering') return;
    clearInterval(timerRef.current);
    recordAnswer(optionIdx);
  };

  const finishQuiz = async () => {
    setPhase('finished');

    // Use the latest answers (current state + this isn't stale because we read from DOM after setState batch)
    // We need to use a slight trick: read answers from the ref-like pattern
    // Actually since setPhase('finished') triggers re-render, we'll compute from state in the render
  };

  // Submit results when we enter finished phase
  const hasSubmittedRef = useRef(false);
  useEffect(() => {
    if (phase !== 'finished' || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;

    const correctCount = answers.filter(a => a.correct).length;

    if (challengeId && role) {
      submitResults(challengeId, role, {
        score,
        correct: correctCount,
        total: questions.length,
        answers,
      }).catch(err => console.error('Failed to submit quiz results:', err));
    }

    if (addXP && correctCount > 0) {
      addXP(correctCount * 10);
    }
  }, [phase]); // eslint-disable-line

  const handleBack = () => {
    navigate('/campus');
  };

  // Waiting state
  if (phase === 'waiting') {
    return (
      <div className="quiz-battle">
        <div className="qb-waiting">
          <div className="qb-spinner" />
          <h2>Preparing Quiz Battle...</h2>
          <p>Loading questions</p>
        </div>
      </div>
    );
  }

  // Finished state
  if (phase === 'finished') {
    const correctCount = answers.filter(a => a.correct).length;
    const myResults = role === 'challenger' ? challengeData?.challengerResults : challengeData?.opponentResults;
    const theirResults = role === 'challenger' ? challengeData?.opponentResults : challengeData?.challengerResults;
    const myName = role === 'challenger' ? challengeData?.challengerName : challengeData?.opponentName;
    const theirName = role === 'challenger' ? challengeData?.opponentName : challengeData?.challengerName;
    const bothDone = myResults && theirResults;
    const iWin = bothDone && myResults.score > theirResults.score;
    const tie = bothDone && myResults.score === theirResults.score;

    return (
      <div className="quiz-battle">
        <div className="qb-results">
          <h2 className="qb-results-title">Quiz Complete!</h2>
          <div className="qb-score-display">
            <span className="qb-score-number">{score}</span>
            <span className="qb-score-label">points</span>
          </div>
          <div className="qb-stats">
            <div className="qb-stat">
              <span className="qb-stat-value">{correctCount}/{questions.length}</span>
              <span className="qb-stat-label">Correct</span>
            </div>
            <div className="qb-stat">
              <span className="qb-stat-value">{Math.round((correctCount / Math.max(questions.length, 1)) * 100)}%</span>
              <span className="qb-stat-label">Accuracy</span>
            </div>
          </div>

          {/* Quiz-specific comparison when both players finish */}
          {bothDone && (
            <div className="qb-comparison">
              <div className={`qb-verdict ${iWin ? 'qb-verdict--win' : tie ? 'qb-verdict--tie' : 'qb-verdict--lose'}`}>
                {tie ? 'TIE!' : iWin ? 'YOU WIN!' : `${theirName} WINS!`}
              </div>
              <div className="qb-vs-scores">
                <div className={`qb-vs-player ${iWin ? 'qb-vs-winner' : ''}`}>
                  <span className="qb-vs-name">{myName || 'You'}</span>
                  <span className="qb-vs-score">{myResults.score} pts</span>
                  <span className="qb-vs-detail">{myResults.correct}/{myResults.total} correct</span>
                </div>
                <span className="qb-vs-divider">VS</span>
                <div className={`qb-vs-player ${!iWin && !tie ? 'qb-vs-winner' : ''}`}>
                  <span className="qb-vs-name">{theirName || 'Opponent'}</span>
                  <span className="qb-vs-score">{theirResults.score} pts</span>
                  <span className="qb-vs-detail">{theirResults.correct}/{theirResults.total} correct</span>
                </div>
              </div>
            </div>
          )}

          {/* Waiting for opponent */}
          {myResults && !theirResults && (
            <div className="qb-waiting-opponent">
              <div className="qb-spinner" />
              <p>Waiting for {theirName || 'opponent'} to finish...</p>
            </div>
          )}

          <button className="qb-back-btn" onClick={handleBack}>
            Back to Campus
          </button>
        </div>
      </div>
    );
  }

  // Playing state (answering or showingResult)
  const question = questions[currentIdx];
  const progress = ((currentIdx) / questions.length) * 100;
  const isShowingResult = phase === 'showingResult';

  return (
    <div className="quiz-battle">
      {/* Header */}
      <div className="qb-header">
        <div className="qb-progress-bar">
          <div className="qb-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="qb-header-info">
          <span className="qb-question-counter">
            {currentIdx + 1} / {questions.length}
          </span>
          <span className="qb-score-badge">⭐ {score}</span>
          <span className={`qb-timer ${timeLeft <= 5 ? 'qb-timer--urgent' : ''}`}>
            ⏱ {timeLeft}s
          </span>
        </div>
      </div>

      {/* Question */}
      <div className="qb-question-area">
        <h2 className="qb-question-text">{question?.question}</h2>
      </div>

      {/* Options */}
      <div className="qb-options">
        {question?.options?.map((option, idx) => {
          let className = 'qb-option';
          if (isShowingResult) {
            if (idx === question.correct) className += ' qb-option--correct';
            else if (idx === selectedAnswer && idx !== question.correct) className += ' qb-option--wrong';
          }
          return (
            <button
              key={idx}
              className={className}
              onClick={() => handleAnswer(idx)}
              disabled={isShowingResult}
            >
              <span className="qb-option-letter">{String.fromCharCode(65 + idx)}</span>
              <span className="qb-option-text">{option}</span>
            </button>
          );
        })}
      </div>

      {/* Result feedback */}
      {isShowingResult && (
        <div className={`qb-feedback ${selectedAnswer >= 0 && selectedAnswer === question?.correct ? 'qb-feedback--correct' : 'qb-feedback--wrong'}`}>
          {selectedAnswer >= 0 && selectedAnswer === question?.correct ? '✓ Correct!' : selectedAnswer === -1 ? '⏱ Time\'s up!' : '✗ Wrong!'}
        </div>
      )}
    </div>
  );
}
