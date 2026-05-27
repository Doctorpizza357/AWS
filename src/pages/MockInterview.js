import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useInterview } from '../context/InterviewContext';
import { generateInterviewQuestions, analyzeInterviewResponse } from '../services/interviewService';
import './MockInterview.css';

// ─── Body Language Analyzer (canvas-based) ─────────────────────────────────────
class BodyAnalyzer {
  constructor() { this.frames = []; this.canvas = null; this.ctx = null; this.interval = null; this.lastBrightness = 0; }

  init(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 120; this.canvas.height = 90;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  start() {
    this.frames = []; this.lastBrightness = 0;
    this.interval = setInterval(() => {
      if (!this.video || this.video.readyState < 2) return;
      try {
        this.ctx.drawImage(this.video, 0, 0, 120, 90);
        const data = this.ctx.getImageData(0, 0, 120, 90).data;
        const cx = 60, cy = 45, r = 25;
        let centerB = 0, edgeB = 0, cPx = 0, ePx = 0;
        for (let y = 0; y < 90; y++) for (let x = 0; x < 120; x++) {
          const idx = (y * 120 + x) * 4;
          const b = (data[idx] + data[idx+1] + data[idx+2]) / 3;
          if (Math.abs(x-cx) < r && Math.abs(y-cy) < r) { centerB += b; cPx++; } else { edgeB += b; ePx++; }
        }
        const avgC = cPx ? centerB/cPx : 0, avgE = ePx ? edgeB/ePx : 0;
        const faceLikely = avgC > 40 && avgC > avgE * 0.8;
        const ratio = avgC / Math.max(avgE, 1);
        const eye = faceLikely ? (ratio > 1.1 ? 'good' : ratio > 0.9 ? 'moderate' : 'poor') : 'none';
        const motion = this.lastBrightness ? Math.abs((centerB+edgeB)/(cPx+ePx) - this.lastBrightness) : 0;
        this.lastBrightness = (centerB+edgeB)/(cPx+ePx);
        this.frames.push({ eye, faceLikely, motion });
      } catch {}
    }, 1500);
  }

  stop() { clearInterval(this.interval); this.interval = null; }

  getResults() {
    if (this.frames.length === 0) return { eyeContact: 0, posture: 0, stillness: 0, overall: 0, feedback: ['No camera data captured'] };
    const valid = this.frames.filter(f => f.faceLikely);
    if (valid.length === 0) return { eyeContact: 20, posture: 20, stillness: 50, overall: 30, feedback: ['Face not clearly detected. Ensure good lighting.'] };
    const eyeGood = valid.filter(f => f.eye === 'good').length;
    const eyeMod = valid.filter(f => f.eye === 'moderate').length;
    const eyeContact = Math.round(((eyeGood + eyeMod * 0.5) / this.frames.length) * 100);
    const posture = Math.round((valid.length / this.frames.length) * 100);
    const avgMotion = valid.reduce((s, f) => s + f.motion, 0) / valid.length;
    const stillness = avgMotion < 3 ? 85 : avgMotion < 6 ? 65 : 40;
    const overall = Math.round((eyeContact + posture + stillness) / 3);
    const feedback = [];
    if (eyeContact >= 70) feedback.push('Good eye contact maintained');
    else feedback.push('Try looking directly at the camera more');
    if (stillness < 60) feedback.push('Reduce fidgeting and excessive movement');
    if (posture >= 70) feedback.push('Good framing and positioning');
    else feedback.push('Adjust your distance from the camera');
    return { eyeContact, posture, stillness, overall, feedback };
  }
}

export default function MockInterview() {
  const navigate = useNavigate();
  const { jobDescription, addSession } = useInterview();
  const [phase, setPhase] = useState('setup');
  const [selectedType, setSelectedType] = useState('technical');
  const [questions, setQuestions] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [bodyResults, setBodyResults] = useState(null);
  const [speechStats, setSpeechStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const bodyRef = useRef(new BodyAnalyzer());
  const startTimeRef = useRef(null);

  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }, []);
  useEffect(() => () => { stopCamera(); clearInterval(timerRef.current); }, [stopCamera]);

  const handleStart = async () => {
    setLoading(true); setError('');
    try {
      const qs = await generateInterviewQuestions(jobDescription || 'General software engineering role', selectedType, 'mid');
      if (!qs || qs.length === 0) throw new Error('No questions generated');
      setQuestions(qs);
      try { const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); streamRef.current = stream; } catch { /* no camera */ }
      setPhase('interview');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  useEffect(() => {
    if (phase === 'interview' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      bodyRef.current.init(videoRef.current);
    }
  }, [phase]);

  const startRecording = () => {
    setRecording(true); setTimer(0); setTranscript(''); setInterim('');
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    // Body language
    if (streamRef.current) bodyRef.current.start();
    // Speech
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'en-US';
      r.onresult = (e) => { let fin = '', int = ''; for (let i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) fin += e.results[i][0].transcript + ' '; else int += e.results[i][0].transcript; } if (fin) setTranscript(p => p + fin); setInterim(int); };
      r.onend = () => { if (recognitionRef.current) try { r.start(); } catch {} };
      r.start(); recognitionRef.current = r;
    }
  };

  const stopRecording = async () => {
    setRecording(false); clearInterval(timerRef.current);
    if (recognitionRef.current) { const r = recognitionRef.current; recognitionRef.current = null; try { r.stop(); } catch {} }
    bodyRef.current.stop();

    // Compute speech stats IMMEDIATELY
    const elapsed = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : timer;
    const finalText = (transcript + interim).trim();
    const words = finalText.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;
    const fillers = ['um','uh','like','basically','actually','you know','sort of','kind of'];
    let fillerCount = 0;
    fillers.forEach(f => { const matches = finalText.toLowerCase().match(new RegExp(`\\b${f}\\b`, 'g')); if (matches) fillerCount += matches.length; });
    const wpm = elapsed > 5 ? Math.round(totalWords / (elapsed / 60)) : 0;
    const confidence = totalWords === 0 ? 0 : Math.max(0, Math.min(100, 85 - (fillerCount / Math.max(totalWords, 1)) * 200 + (totalWords > 20 ? 10 : 0)));
    setSpeechStats({ totalWords, fillerCount, wpm, confidence: Math.round(confidence), duration: elapsed });

    // Body language results IMMEDIATELY
    const body = bodyRef.current.getResults();
    setBodyResults(body);

    // Show review phase RIGHT AWAY with local results
    setResults(prev => [...prev, { question: questions[qIdx]?.question, score: null, body: body.overall, confidence: Math.round(confidence) }]);
    setPhase('review');

    // AI content analysis in background (don't block the UI)
    const q = questions[qIdx];
    if (finalText.length > 10 && q) {
      setLoading(true);
      try {
        const a = await analyzeInterviewResponse(q.question, finalText, 'software-engineer', 'mid');
        setAnalysis(a);
        // Update the last result with AI score
        setResults(prev => { const copy = [...prev]; copy[copy.length - 1].score = a.overallScore; return copy; });
      } catch (err) { setAnalysis(null); setError(err.message); }
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (qIdx < questions.length - 1) { setQIdx(qIdx + 1); setAnalysis(null); setBodyResults(null); setSpeechStats(null); setPhase('interview'); }
    else { stopCamera(); addSession({ type: selectedType, results, date: new Date().toISOString() }); setPhase('done'); }
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;

  // ─── SETUP ───────────────────────────────────────────────────────────────────
  if (phase === 'setup') return (
    <div className="mock-interview"><div className="container">
      <motion.div className="mi-setup" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}>
        <h1>🎥 AI Mock Interview</h1>
        <p>Practice with AI-generated questions. Get feedback on speech, body language, and answer quality.</p>
        {jobDescription && <div className="mi-jd-notice">✅ Questions tailored to your job description</div>}
        <div className="mi-types">
          {['technical','behavioral','situational'].map(t => (
            <button key={t} className={`mi-type-btn ${selectedType===t?'active':''}`} onClick={() => setSelectedType(t)}>{t}</button>
          ))}
        </div>
        {error && <p className="mi-error">{error}</p>}
        <button className="btn-primary" onClick={handleStart} disabled={loading}>{loading ? 'Preparing...' : 'Start Interview →'}</button>
      </motion.div>
    </div></div>
  );

  // ─── INTERVIEW ───────────────────────────────────────────────────────────────
  if (phase === 'interview') return (
    <div className="mock-interview mi-active"><div className="mi-layout">
      <div className="mi-video-panel">
        {streamRef.current ? <video ref={videoRef} autoPlay muted playsInline className="mi-video" /> : <div className="mi-no-cam">📷 No camera</div>}
        {recording && <div className="mi-rec">● REC {fmt(timer)}</div>}
      </div>
      <div className="mi-question-panel">
        <span className="mi-qnum">Q{qIdx+1}/{questions.length} • {selectedType}</span>
        <h2>{questions[qIdx]?.question}</h2>
        {questions[qIdx]?.tips && <p className="mi-tip">💡 {questions[qIdx].tips}</p>}
        {recording && <div className="mi-transcript"><p>{transcript}<span className="mi-interim">{interim}</span>{!transcript && !interim && <span className="mi-interim">Listening... speak now</span>}</p></div>}
        <div className="mi-controls">
          {!recording ? <button className="btn-primary" onClick={startRecording}>⏺ Start Recording</button> : <button className="mi-stop-btn" onClick={stopRecording}>⏹ Stop & Analyze</button>}
          <button className="btn-secondary" onClick={handleNext}>Skip →</button>
        </div>
      </div>
    </div></div>
  );

  // ─── REVIEW ──────────────────────────────────────────────────────────────────
  if (phase === 'review') return (
    <div className="mock-interview"><div className="container">
      <motion.div className="mi-review" initial={{opacity:0}} animate={{opacity:1}}>
        <h2>Analysis — Q{qIdx+1}</h2>
        {error && <p className="mi-error">{error}</p>}

        {/* Speech Stats */}
        {speechStats && (
          <div className="mi-section">
            <h3>🗣️ Speech</h3>
            <div className="mi-metrics">
              <div><span>{speechStats.confidence}%</span><small>Confidence</small></div>
              <div><span>{speechStats.wpm}</span><small>WPM</small></div>
              <div><span>{speechStats.fillerCount}</span><small>Fillers</small></div>
              <div><span>{fmt(speechStats.duration)}</span><small>Duration</small></div>
              <div><span>{speechStats.totalWords}</span><small>Words</small></div>
            </div>
          </div>
        )}

        {/* Body Language */}
        {bodyResults && (
          <div className="mi-section">
            <h3>👤 Body Language</h3>
            <div className="mi-metrics">
              <div><span>{bodyResults.eyeContact}%</span><small>Eye Contact</small></div>
              <div><span>{bodyResults.posture}%</span><small>Posture</small></div>
              <div><span>{bodyResults.stillness}%</span><small>Stillness</small></div>
              <div><span>{bodyResults.overall}%</span><small>Overall</small></div>
            </div>
            {bodyResults.feedback?.map((f, i) => <p key={i} className="mi-body-fb">• {f}</p>)}
          </div>
        )}

        {/* AI Content Analysis */}
        {loading && <p className="mi-loading">🤖 AI analyzing your answer...</p>}
        {analysis && (
          <div className="mi-section">
            <h3>📋 Answer Quality (AI)</h3>
            <div className="mi-metrics">
              <div><span>{analysis.overallScore}</span><small>Overall</small></div>
              <div><span>{analysis.technicalAccuracy?.score}</span><small>Technical</small></div>
              <div><span>{analysis.communicationClarity?.score}</span><small>Clarity</small></div>
              <div><span>{analysis.depth?.score}</span><small>Depth</small></div>
            </div>
            {analysis.strengths && <div className="mi-fb"><h4>✅ Strengths</h4><ul>{analysis.strengths.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
            {analysis.improvements && <div className="mi-fb"><h4>🔧 Improve</h4><ul>{analysis.improvements.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
            {analysis.sampleAnswer && <div className="mi-fb"><h4>💡 Ideal Answer</h4><p className="mi-sample">{analysis.sampleAnswer}</p></div>}
          </div>
        )}

        <div className="mi-review-actions">
          <button className="btn-primary" onClick={handleNext}>{qIdx < questions.length-1 ? 'Next Question →' : 'Finish Session'}</button>
          <button className="btn-secondary" onClick={() => { stopCamera(); navigate('/interview'); }}>Back to Hub</button>
        </div>
      </motion.div>
    </div></div>
  );

  // ─── DONE ────────────────────────────────────────────────────────────────────
  return (
    <div className="mock-interview"><div className="container">
      <motion.div className="mi-done" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}>
        <h1>🎉 Session Complete</h1>
        <p>{results.length} questions answered</p>
        <div className="mi-final-scores">
          {results.map((r,i) => <div key={i}><span>Q{i+1}</span><span>AI: {r.score || '-'}</span><span>Body: {r.body || '-'}%</span><span>Conf: {r.confidence || '-'}%</span></div>)}
        </div>
        <div className="mi-done-actions">
          <button className="btn-primary" onClick={() => { setPhase('setup'); setQIdx(0); setResults([]); setAnalysis(null); setBodyResults(null); setSpeechStats(null); setError(''); }}>Practice Again</button>
          <button className="btn-secondary" onClick={() => navigate('/interview')}>Back to Hub</button>
        </div>
      </motion.div>
    </div></div>
  );
}
