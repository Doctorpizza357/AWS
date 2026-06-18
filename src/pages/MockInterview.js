import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useInterview } from '../context/InterviewContext';
import { useUser } from '../context/UserContext';
import { useAvatar } from '../context/AvatarContext';
import { useAuth } from '../context/AuthContext';
import { generateInterviewQuestions, analyzeInterviewResponse } from '../services/interviewService';
import { speakText, stopSpeaking, isSpeaking } from '../services/ttsService';
import { MLBodyAnalyzer } from '../services/poseAnalyzer';
import { createPoseBroadcaster, subscribeToChallenge, setRecordingState, submitResults } from '../services/challengeService';
import OpponentPoseView from '../components/social/OpponentPoseView';
import ChallengeResults from '../components/social/ChallengeResults';
import './MockInterview.css';
import { getIconComponent } from '../utils/iconMap';

const safeNum = (v) => Number.isFinite(v) ? v : '-';
const safePct = (v) => Number.isFinite(v) ? `${v}%` : '-';
const clampScore = (v) => Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;

const POSE_CONNECTIONS = [
  ['left_eye', 'right_eye'],
  ['left_eye', 'nose'],
  ['right_eye', 'nose'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle']
];

// Add extra facial/neck/hand connections where available for richer avatar skeleton
POSE_CONNECTIONS.push(
  ['nose', 'left_eye'], ['nose', 'right_eye'], ['left_eye', 'left_ear'], ['right_eye', 'right_ear'],
  ['left_wrist', 'left_index'] , ['right_wrist', 'right_index']
);

// Enable fancier overlay visuals
const showFancyOverlay = true;

// Avatar replay removed — using live pose overlay only (replay was causing issues)

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
  const [searchParams] = useSearchParams();
  const { jobDescription, addSession, sessions } = useInterview();
  const { user } = useUser();
  const { triggerCheckpoint } = useAvatar();
  const { user: authUser } = useAuth();

  // Challenge mode — read from URL params: ?challenge=ID&role=challenger|opponent
  const challengeId = searchParams.get('challenge');
  const challengeRole = searchParams.get('role');
  const [challengeData, setChallengeData] = useState(null);
  const [opponentPose, setOpponentPose] = useState(null);
  const poseBroadcasterRef = useRef(null);
  const challengeSubRef = useRef(null);

  // Subscribe to challenge data when in challenge mode
  useEffect(() => {
    if (!challengeId) return;
    challengeSubRef.current = subscribeToChallenge(challengeId, (data) => {
      setChallengeData(data);
      // Extract opponent's pose
      if (data && challengeRole) {
        const opponentPoseField = challengeRole === 'challenger' ? 'opponentPose' : 'challengerPose';
        setOpponentPose(data[opponentPoseField] || null);
      }
    });
    return () => { challengeSubRef.current?.(); };
  }, [challengeId, challengeRole]);

  // Create pose broadcaster when challenge is active
  useEffect(() => {
    if (!challengeId || !challengeRole) return;
    poseBroadcasterRef.current = createPoseBroadcaster(challengeId, challengeRole);
    return () => { poseBroadcasterRef.current?.dispose?.(); };
  }, [challengeId, challengeRole]);

  // Auto-start ref (moved effect below after handleStart is defined)
  const challengeAutoStartedRef = useRef(false);

  // Compute interview metrics for the AI prompt
  const interviewCount = Array.isArray(sessions) ? sessions.length : 0;
  const avgInterviewScore = interviewCount > 0
    ? Math.round(
        sessions.reduce((sum, s) => {
          const scores = (s.results || []).map((r) => r.score).filter(Number.isFinite);
          return sum + (scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0);
        }, 0) / interviewCount
      )
    : undefined;

  // Trigger avatar checkpoint on mount with real metrics
  useEffect(() => {
    triggerCheckpoint('mock-interview', {
      userName: user?.profile?.name || user?.name || undefined,
      interviewCount,
      avgInterviewScore,
      xpLevel: user?.progress?.level,
    });
  }, []); // eslint-disable-line
  const [phase, setPhase] = useState('setup');
  const [selectedType, setSelectedType] = useState('technical');
  const [questions, setQuestions] = useState([]);
  const [qIdx, setQIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [followUpQuestions, setFollowUpQuestions] = useState([]);
  const [replayEntries, setReplayEntries] = useState([]);
  const [activeFollowUp, setActiveFollowUp] = useState(null);
  const [bodyResults, setBodyResults] = useState(null);
  const [speechStats, setSpeechStats] = useState(null);
  const [speechStatus, setSpeechStatus] = useState({ supported: false, active: false, error: '', message: 'Speech recognition idle' });
  const [speechDebug, setSpeechDebug] = useState('');
  const [speechLogs, setSpeechLogs] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState('');
  const [forceMicOnChromium, setForceMicOnChromium] = useState(false);
  const [answerTranscript, setAnswerTranscript] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingReady, setTrackingReady] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState('Preparing pose model...');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [trackingMode, setTrackingMode] = useState('ml');
  const [showPoseOverlay, setShowPoseOverlay] = useState(true);
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);

  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const skeletonRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micSourceRef = useRef(null);
  const micFrameRef = useRef(null);
  const transcriptRef = useRef('');
  const interimRef = useRef('');
  const speechRestartRef = useRef(null);
  const speechLastResultRef = useRef(0);
  const recognitionRestartCountRef = useRef(0);
  const recognitionRestartTimerRef = useRef(null);
  const bodyRef = useRef(new MLBodyAnalyzer());
  const fallbackBodyRef = useRef(new BodyAnalyzer());
  const usingFallbackRef = useRef(false);
  const startTimeRef = useRef(null);

  const clearPoseOverlay = useCallback(() => {
    const clear = (c) => {
      if (!c) return;
      const ctx = c.getContext && c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
    };
    clear(overlayRef.current);
    clear(skeletonRef.current);
  }, []);

  const previousPosesRef = useRef([]);
  const poseFramesRef = useRef([]);
  const recordingRef = useRef(false);

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const highlightAnswerReplay = (text) => {
    const fillerTerms = ['um', 'uh', 'like', 'basically', 'actually', 'you know', 'sort of', 'kind of'];
    const fillerPattern = new RegExp(`\\b(${fillerTerms.map(escapeRegExp).join('|')})\\b`, 'ig');
    const parts = String(text || '').split(fillerPattern);

    return parts.map((part, index) => {
      if (!part) return null;
      if (fillerTerms.some((term) => term.toLowerCase() === part.toLowerCase())) {
        return <mark key={`filler-${index}`} className="mi-replay-filler">{part}</mark>;
      }
      return <span key={`part-${index}`}>{part}</span>;
    });
  };

  const drawPoseOverlay = useCallback((poseFrame) => {
    if (!showPoseOverlay) {
      clearPoseOverlay();
      return;
    }

    // draw into the separate skeleton box when available, otherwise fall back to overlay
    const canvas = skeletonRef.current || overlayRef.current;
    if (!canvas || !videoRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const targetWidth = Math.round(rect.width) || 320;
    const targetHeight = Math.round(rect.height) || 240;
    if (!targetWidth || !targetHeight) return;

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!poseFrame?.visible || !poseFrame.keypoints?.length) {
      // draw faint idle grid when no pose
      if (showFancyOverlay) {
        ctx.save(); ctx.globalAlpha = 0.06; ctx.strokeStyle = '#00ffd0'; ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 40) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke(); }
        for (let y = 0; y < canvas.height; y += 40) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke(); }
        ctx.restore();
      }
      return;
    }

    const sourceWidth = poseFrame.width || videoRef.current.videoWidth || targetWidth;
    const sourceHeight = poseFrame.height || videoRef.current.videoHeight || targetHeight;
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const offsetX = (targetWidth - sourceWidth * scale) / 2;
    const offsetY = (targetHeight - sourceHeight * scale) / 2;

    const points = poseFrame.keypoints.reduce((acc, point) => {
      if (!point?.name) return acc;
      acc[point.name] = {
        x: point.x * scale + offsetX,
        y: point.y * scale + offsetY,
        score: point.score ?? 1
      };
      return acc;
    }, {});
    // Fancy neon skeleton + trails
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // push to trail buffer
    try {
      previousPosesRef.current.push({ ts: Date.now(), pts: points });
      if (previousPosesRef.current.length > 20) previousPosesRef.current.shift();
    } catch (e) {}

    // draw per-point trails (each keypoint has its own thin trail)
    try {
      const names = Object.keys(points);
      names.forEach((name) => {
        ctx.beginPath();
        let moved = false;
        for (let i = 0; i < previousPosesRef.current.length; i++) {
          const p = previousPosesRef.current[i].pts[name];
          if (!p) continue;
          if (!moved) { ctx.moveTo(p.x, p.y); moved = true; } else ctx.lineTo(p.x, p.y);
        }
        if (!moved) return;
        // subtle color based on hash of name
        let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
        const colorA = `hsla(${h},85%,60%,0.95)`;
        const colorB = `hsla(${(h+80)%360},75%,60%,0.6)`;
        const grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
        grad.addColorStop(0, colorA);
        grad.addColorStop(1, colorB);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    } catch (e) {}

    // main skeleton lines (soft glow pass + crisp core pass)
    POSE_CONNECTIONS.forEach(([from, to]) => {
      if (!points[from] || !points[to]) return;

      const p1 = points[from];
      const p2 = points[to];
      const confidence = Math.min(p1.score ?? 1, p2.score ?? 1);
      if (confidence < 0.22) return;

      ctx.beginPath();
      ctx.shadowBlur = 10;
      ctx.shadowColor = 'rgba(0,255,200,0.65)';
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(0,255,200,${0.18 + confidence * 0.22})`;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = `rgba(170,255,244,${0.52 + confidence * 0.4})`;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // keypoints
    const pulse = 1 + Math.sin(Date.now() / 300) * 0.15;
    Object.entries(points).forEach(([name, point]) => {
      if ((point.score ?? 0) < 0.25) return;

      let coreColor = 'rgba(250,204,21,0.98)';
      if (name.includes('shoulder') || name.includes('elbow') || name.includes('wrist')) {
        coreColor = 'rgba(80,240,255,0.98)';
      } else if (name.includes('hip') || name.includes('knee') || name.includes('ankle')) {
        coreColor = 'rgba(120,200,255,0.96)';
      }

      const confidence = point.score ?? 1;
      const rOuter = (5 + confidence * 5) * pulse;
      const rInner = (2.8 + confidence * 2.2) * pulse;

      ctx.beginPath();
      ctx.shadowBlur = 12;
      ctx.shadowColor = 'rgba(0,255,200,0.9)';
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.arc(point.x, point.y, rOuter, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.shadowBlur = 9;
      ctx.shadowColor = coreColor;
      ctx.fillStyle = coreColor;
      ctx.arc(point.x, point.y, rInner, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }, [clearPoseOverlay, showPoseOverlay]);

  const stopMicMeter = useCallback(() => {
    if (micFrameRef.current) {
      cancelAnimationFrame(micFrameRef.current);
      micFrameRef.current = null;
    }
    if (speechRestartRef.current) {
      clearTimeout(speechRestartRef.current);
      speechRestartRef.current = null;
    }
    if (micSourceRef.current) {
      try { micSourceRef.current.disconnect(); } catch {}
      micSourceRef.current = null;
    }
    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const stopCamera = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }, []);
  useEffect(() => () => {
    stopCamera();
    clearInterval(timerRef.current);
    bodyRef.current.stop();
    fallbackBodyRef.current.stop();
    bodyRef.current.setPoseListener(null);
    bodyRef.current.dispose().catch(() => {});
    clearPoseOverlay();
    stopMicMeter();
  }, [clearPoseOverlay, stopCamera, stopMicMeter]);

  const resetSpeechStatus = (supported) => {
    setSpeechStatus({
      supported,
      active: false,
      error: '',
      message: supported ? 'Speech recognition ready' : 'Speech recognition not supported in this browser',
    });
    setSpeechDebug('');
  };

  const pushSpeechLog = useCallback((level, msg, data) => {
    const time = new Date().toISOString();
    const entry = { time, level, msg, data };
    // console output for debugging
    try { console.log(`[SR] ${time} [${level}] ${msg}`, data || ''); } catch (e) {}
    setSpeechLogs((s) => {
      const copy = [...s, entry].slice(-200);
      return copy;
    });
  }, []);

  const refreshAudioDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter(d => d.kind === 'audioinput');
      setAudioDevices(inputs);
      if (!selectedAudioDeviceId && inputs.length) setSelectedAudioDeviceId(inputs[0].deviceId);
      pushSpeechLog('info', 'refreshed audio devices', { count: inputs.length });
    } catch (e) {
      pushSpeechLog('error', 'enumerateDevices failed', { message: e?.message });
    }
  }, [pushSpeechLog, selectedAudioDeviceId]);

  const applySelectedMicForMeter = useCallback(async () => {
    if (!selectedAudioDeviceId) return pushSpeechLog('warn', 'No selected audio device');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedAudioDeviceId } } });
      pushSpeechLog('info', 'getUserMedia for selected mic succeeded', { tracks: s.getAudioTracks().length });
      startMicMeter(s);
    } catch (e) {
      pushSpeechLog('error', 'getUserMedia for selected mic failed', { message: e?.message });
    }
  }, [selectedAudioDeviceId]);

  const setTrackingLoadingState = useCallback((message) => {
    setTrackingLoading(true);
    setTrackingReady(false);
    setTrackingMessage(message || 'Preparing pose model...');
  }, []);

  const clearTrackingLoadingState = useCallback((message) => {
    setTrackingLoading(false);
    setTrackingReady(true);
    if (message) setTrackingMessage(message);
  }, []);

  const startMicMeter = useCallback(async (stream) => {
    stopMicMeter();

    if (!stream || !stream.getAudioTracks().length) {
      setMicLevel(0);
      return;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      setMicLevel(0);
      return;
    }

    try {
      const context = new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === 'suspended') {
        try { await context.resume(); } catch {}
      }

      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      analyserRef.current = analyser;
      micSourceRef.current = source;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          const sample = (buffer[i] - 128) / 128;
          sumSquares += sample * sample;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        setMicLevel(Math.min(100, Math.round(rms * 900)));
        micFrameRef.current = requestAnimationFrame(tick);
      };

      tick();
    } catch (err) {
      setMicLevel(0);
      setSpeechStatus(prev => ({
        ...prev,
        error: prev.error || 'Mic meter unavailable',
        message: 'Mic meter unavailable',
      }));
    }
  }, [stopMicMeter]);

  const handleStart = async () => {
    setLoading(true); setError('');
    try {
      setQuestions([]);
      setQIdx(0);
      setResults([]);
      setAnalysis(null);
      setFollowUpQuestions([]);
      setReplayEntries([]);
      setActiveFollowUp(null);
      setBodyResults(null);
      setSpeechStats(null);
      setSpeechStatus({ supported: false, active: false, error: '', message: 'Speech recognition idle' });
      setSpeechDebug('');
      setAnswerTranscript('');
      setMicLevel(0);
      setTranscript('');
      setInterim('');
      transcriptRef.current = '';
      interimRef.current = '';
      const qs = challengeData?.questions?.length > 0
        ? challengeData.questions
        : await generateInterviewQuestions(jobDescription || (user.activeCareerGoal ? `${user.activeCareerGoal.title} in ${user.activeCareerGoal.field || 'STEM'}` : 'General software engineering role'), selectedType, 'mid');
      if (!qs || qs.length === 0) throw new Error('No questions generated');
      setQuestions(qs);
      setTrackingLoadingState('Opening camera...');
      try {
        // Request ONLY video here. Chrome's SpeechRecognition opens its own mic
        // connection to Google's servers. If we hold a getUserMedia audio track on
        // the same device, Chrome can fail to capture audio for speech recognition
        // (resulting in "no-speech" errors). Edge uses a local speech engine and
        // doesn't have this conflict.
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        // enumerate devices for diagnostics
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          pushSpeechLog('info', 'enumerateDevices', devices.filter(d => d.kind && d.kind.includes('audio')).map(d => ({ kind: d.kind, label: d.label || 'hidden', deviceId: d.deviceId })));
        } catch (e) {
          pushSpeechLog('warn', 'enumerateDevices failed', { message: e?.message });
        }
      } catch (err) {
        setSpeechStatus({ supported: false, active: false, error: err.message || 'Camera unavailable', message: 'Camera unavailable' });
        clearTrackingLoadingState('Camera unavailable');
        setTrackingMessage('Camera unavailable');
      }
      setPhase('interview');
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  // Auto-start interview when in challenge mode (skip setup phase)
  useEffect(() => {
    if (!challengeId || !challengeData || challengeAutoStartedRef.current) return;
    if (challengeData.questions?.length > 0 && phase === 'setup') {
      challengeAutoStartedRef.current = true;
      setTimeout(() => {
        handleStart();
      }, 100);
    }
  }); // eslint-disable-line

  useEffect(() => {
    let cancelled = false;

    const setupAnalyzer = async () => {
      if (phase !== 'interview' || !videoRef.current || !streamRef.current) return;
      videoRef.current.srcObject = streamRef.current;
      setTrackingLoadingState('Loading pose model...');
      bodyRef.current.setPoseListener((frame) => {
        try {
          // debug: log the first few frames to inspect keypoint payloads
          if (Array.isArray(frame?.keypoints) && poseFramesRef.current.length < 6) {
            try {
              const sample = (frame.keypoints || []).slice(0,6).map(k => ({ name: k.name, x: Number(k.x), y: Number(k.y), z: Number(k.z), score: Number(k.score) }));
              console.info('pose frame sample json', JSON.stringify({ count: frame.keypoints.length, visible: !!frame.visible, keys: sample }));
            } catch (e) {
              console.info('pose frame sample', { count: frame.keypoints.length, visible: !!frame.visible });
            }
          }
          drawPoseOverlay(frame);

          // Broadcast pose to challenge opponent if in challenge mode
          if (poseBroadcasterRef.current && recordingRef.current) {
            poseBroadcasterRef.current(frame);
          }
        } catch (e) {
          console.warn('poseListener error', e?.message || e);
        }
      });

      const mlReady = await Promise.race([
        bodyRef.current.init(videoRef.current),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 9000))
      ]);
      if (cancelled) return;

      if (mlReady === 'timeout') {
        usingFallbackRef.current = true;
        setTrackingMode('fallback');
        fallbackBodyRef.current.init(videoRef.current);
        clearPoseOverlay();
        clearTrackingLoadingState('Pose model is taking longer than expected. Using fallback tracking for now.');
        Promise.resolve(fallbackBodyRef.current.start()).catch(() => {});
        return;
      }

      if (!mlReady) {
        usingFallbackRef.current = true;
        setTrackingMode('fallback');
        fallbackBodyRef.current.init(videoRef.current);
        clearPoseOverlay();
        clearTrackingLoadingState('Pose fallback ready');
        Promise.resolve(fallbackBodyRef.current.start()).catch(() => {});
      } else {
        usingFallbackRef.current = false;
        setTrackingMode('ml');
        clearTrackingLoadingState('Pose ML ready');
        bodyRef.current.start().catch((err) => {
          pushSpeechLog('warn', 'pose loop warmup failed', { message: err?.message });
        });
      }
    };

    setupAnalyzer();
    return () => { cancelled = true; };
  }, [clearPoseOverlay, drawPoseOverlay, phase]);

  useEffect(() => {
    if (!showPoseOverlay) clearPoseOverlay();
  }, [clearPoseOverlay, showPoseOverlay]);

  // Expose some navigator / permission info at start for debugging
  useEffect(() => {
    try {
      pushSpeechLog('info', 'navigator info', { ua: navigator.userAgent, platform: navigator.platform });
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' }).then(p => pushSpeechLog('info', 'microphone permission', { state: p.state })).catch(() => {});
      }
    } catch {}
  }, [pushSpeechLog]);

  // Close settings when clicking outside or pressing Escape
  useEffect(() => {
    if (!showSettings) return;
    const onDocClick = (e) => {
      const panel = settingsRef.current;
      const btn = settingsButtonRef.current;
      if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
        setShowSettings(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setShowSettings(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('touchstart', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('touchstart', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [showSettings]);

  // refresh device list on mount
  useEffect(() => { refreshAudioDevices(); }, [refreshAudioDevices]);

  const startRecording = async () => {
    setRecording(true); setTimer(0); setTranscript(''); setInterim('');
    recordingRef.current = true;
    poseFramesRef.current = [];
    transcriptRef.current = '';
    interimRef.current = '';
    setAnswerTranscript('');
    speechLastResultRef.current = Date.now();
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    // reset restart counters for this recording session
    recognitionRestartCountRef.current = 0;
    if (recognitionRestartTimerRef.current) { clearTimeout(recognitionRestartTimerRef.current); recognitionRestartTimerRef.current = null; }

    pushSpeechLog('info', 'startRecording called', { phase, qIdx });
    if (selectedAudioDeviceId) {
      applySelectedMicForMeter();
    }
    // Body language
      if (streamRef.current) {
        if (usingFallbackRef.current) {
          Promise.resolve(fallbackBodyRef.current.start()).catch(() => {});
          clearPoseOverlay();
        } else {
          bodyRef.current.start().catch((err) => {
            pushSpeechLog('warn', 'pose loop start failed; switching to fallback', { message: err?.message });
            usingFallbackRef.current = true;
            setTrackingMode('fallback');
            fallbackBodyRef.current.init(videoRef.current);
            Promise.resolve(fallbackBodyRef.current.start()).catch(() => {});
            clearPoseOverlay();
          });
        }
      }

    // Speech Recognition
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    pushSpeechLog('info', 'SpeechRecognition available', { available: !!SR });
    if (SR) {
      const r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = 'en-US';
      r.maxAlternatives = 1;
      resetSpeechStatus(true);

      r.onaudiostart = () => {
        pushSpeechLog('info', 'onaudiostart: Mic audio connected');
        setSpeechDebug('Mic audio connected');
        setSpeechStatus(prev => ({ ...prev, active: true, message: 'Mic audio connected' }));
        // prefer selected device if provided
        const audioRequest = selectedAudioDeviceId ? { audio: { deviceId: { exact: selectedAudioDeviceId } } } : { audio: true };
        navigator.mediaDevices.getUserMedia(audioRequest).then(audioStream => {
          pushSpeechLog('info', 'getUserMedia(audio) succeeded for mic meter', { tracks: audioStream.getAudioTracks().length, deviceId: selectedAudioDeviceId || 'default' });
          startMicMeter(audioStream);
        }).catch((err) => {
          pushSpeechLog('warn', 'getUserMedia(audio) failed for mic meter', { message: err?.message });
          setSpeechDebug('Mic meter unavailable (audio already in use)');
        });
      };
      r.onspeechstart = () => { pushSpeechLog('info', 'onspeechstart: Speech detected'); setSpeechDebug('Speech detected'); setSpeechStatus(prev => ({ ...prev, active: true, message: 'Speech detected, transcribing...' })); };
      r.onstart = () => { pushSpeechLog('info', 'onstart: recognition started'); setSpeechStatus({ supported: true, active: true, error: '', message: 'Listening for your answer...' }); };
      r.onresult = (e) => {
        let finalChunk = '';
        let interimChunk = '';
        speechLastResultRef.current = Date.now();
        pushSpeechLog('info', 'onresult event', { resultIndex: e.resultIndex, resultsLength: e.results.length });
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) finalChunk += `${text} `;
          else interimChunk += text;
        }

        if (finalChunk) transcriptRef.current = `${transcriptRef.current}${finalChunk}`;
        interimRef.current = interimChunk;
        setTranscript(transcriptRef.current);
        setInterim(interimRef.current);
        setSpeechDebug(`Transcript update received (${transcriptRef.current.length} chars)`);
      };
      r.onspeechend = () => { pushSpeechLog('info', 'onspeechend: speech ended'); setSpeechDebug('Speech ended'); };
      r.onaudioend = () => { pushSpeechLog('info', 'onaudioend: mic audio ended'); setSpeechDebug('Mic audio ended'); };
      r.onnomatch = () => { pushSpeechLog('warn', 'onnomatch: no speech match'); setSpeechStatus(prev => ({ ...prev, active: false, message: 'No speech recognized. Try speaking a bit louder.' })); setSpeechDebug('No speech match'); };
      r.onerror = (e) => {
        const errorMsg = e.error || 'unknown';
        pushSpeechLog('error', `onerror: ${errorMsg}`, e);
        setSpeechDebug(`Error: ${errorMsg}`);
        // "no-speech" means recognition timed out without detecting speech — restart silently
        if (e.error === 'no-speech') {
          setSpeechStatus(prev => ({ ...prev, active: false, message: 'Waiting for speech... speak into your mic' }));
          return;
        }
        if (e.error === 'aborted') return;
        setSpeechStatus({ supported: true, active: false, error: errorMsg, message: `Speech recognition error: ${errorMsg}` });
      };
      r.onend = () => {
        pushSpeechLog('info', 'onend: recognition ended');
        setSpeechStatus(prev => ({ ...prev, active: false, message: prev.error ? prev.message : 'Recognition ended' }));
        setSpeechDebug('Recognition ended');
        if (!recognitionRef.current) return;

        // Exponential backoff restart policy to avoid tight restart loops
        // when the browser/service is unreliable. After maxRestarts, stop
        // attempting to restart and surface the error to the user.
        const maxRestarts = 6;
        const count = recognitionRestartCountRef.current || 0;
        if (count >= maxRestarts) {
          pushSpeechLog('error', 'Max recognition restarts reached; will not restart further');
          setSpeechStatus(prev => ({ ...prev, active: false, error: 'Speech recognition unstable', message: 'Speech recognition unstable — try refreshing or use server transcription' }));
          return;
        }

        const baseMs = 300;
        const backoff = Math.min(8000, baseMs * Math.pow(2, count));
        recognitionRestartCountRef.current = count + 1;
        pushSpeechLog('info', 'scheduling recognition restart', { attempt: recognitionRestartCountRef.current, backoff });

        if (recognitionRestartTimerRef.current) clearTimeout(recognitionRestartTimerRef.current);
        recognitionRestartTimerRef.current = setTimeout(() => {
          if (!recognitionRef.current) return;
          try {
            recognitionRef.current.start();
            pushSpeechLog('info', 'recognition restarted after backoff', { attempt: recognitionRestartCountRef.current });
            setSpeechDebug('Recognition restarted');
          } catch (err) {
            pushSpeechLog('error', 'recognition restart failed', { message: err.message });
            setSpeechDebug(`Restart failed: ${err.message}`);
          }
        }, backoff);
      };
      try {
        recognitionRef.current = r;
        r.start();
        pushSpeechLog('info', 'recognition.start() called successfully');
      } catch (err) {
        pushSpeechLog('error', 'recognition.start() exception', { message: err?.message });
        setSpeechStatus({ supported: true, active: false, error: err.message || 'Speech recognition failed to start', message: 'Speech recognition failed to start' });
        setSpeechDebug(`Start failed: ${err.message || 'unknown'}`);
      }
    } else {
      resetSpeechStatus(false);
    }
  };

  const stopRecording = async () => {
    pushSpeechLog('info', 'stopRecording called');
    setRecording(false); recordingRef.current = false; clearInterval(timerRef.current);
    if (recognitionRef.current) { const r = recognitionRef.current; recognitionRef.current = null; try { r.stop(); } catch {} }
    if (usingFallbackRef.current) fallbackBodyRef.current.stop();
    else bodyRef.current.stop();
    clearPoseOverlay();
    stopMicMeter();

    // Compute speech stats IMMEDIATELY
    const elapsed = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : timer;
    const finalText = `${transcriptRef.current}${interimRef.current}`.trim() || (transcript + interim).trim();
    const words = finalText.split(/\s+/).filter(w => w.length > 0);
    const totalWords = words.length;
    const fillers = ['um','uh','like','basically','actually','you know','sort of','kind of'];
    let fillerCount = 0;
    fillers.forEach(f => { const matches = finalText.toLowerCase().match(new RegExp(`\\b${f}\\b`, 'g')); if (matches) fillerCount += matches.length; });
    const wpm = elapsed > 5 ? Math.round(totalWords / (elapsed / 60)) : 0;
    const confidence = totalWords === 0 ? 0 : Math.max(0, Math.min(100, 85 - (fillerCount / Math.max(totalWords, 1)) * 200 + (totalWords > 20 ? 10 : 0)));
    const replayLabel = phase === 'followup' && activeFollowUp ? `Follow-up: ${activeFollowUp}` : `Q${qIdx + 1}`;
    setReplayEntries(prev => [...prev, { id: `${phase}-${Date.now()}`, label: replayLabel, prompt: phase === 'followup' ? activeFollowUp : questions[qIdx]?.question, answer: finalText, wpm, fillerCount, confidence: Math.round(confidence), duration: elapsed }]);
    setAnswerTranscript(finalText);

    setSpeechStatus(prev => ({ ...prev, active: false, message: prev.error ? prev.message : 'Transcript captured' }));

    if (phase === 'followup') {
      setActiveFollowUp(null);
      setPhase('review');
      return;
    }

    setSpeechStats({ totalWords, fillerCount, wpm, confidence: Math.round(confidence), duration: elapsed });

    // Body language results IMMEDIATELY
    const body = usingFallbackRef.current ? fallbackBodyRef.current.getResults() : bodyRef.current.getResults();
    setBodyResults(body);

    // Not saving pose frames for replay (replay feature removed)

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
        setFollowUpQuestions(a.followUpQuestions || []);
        // Update the last result with AI score
        setResults(prev => { const copy = [...prev]; copy[copy.length - 1].score = a.overallScore; return copy; });
      } catch (err) { setAnalysis(null); setError(err.message); }
      setLoading(false);
    }
  };

  const handleNext = () => {
    stopSpeaking();
    setTtsPlaying(false);
    setFollowUpQuestions([]);
    setActiveFollowUp(null);
    if (qIdx < questions.length - 1) {
      setQIdx(qIdx + 1);
      setAnalysis(null);
      setBodyResults(null);
      setSpeechStats(null);
      setPhase('interview');
    } else {
      stopCamera();
      // Save session summary for history
      try {
        addSession({
          id: `sess-${Date.now()}`,
          type: selectedType,
          date: new Date().toISOString(),
          results,
          replayEntries,
          analysis,
          speechStats,
        });
      } catch (e) {
        pushSpeechLog('error', 'addSession failed', { message: e?.message });
      }

      // Submit results to challenge if in challenge mode
      if (challengeId && challengeRole) {
        const challengeResultData = {
          score: analysis?.overallScore || 0,
          bodyOverall: bodyResults?.overall || 0,
          confidence: speechStats?.confidence || 0,
          wpm: speechStats?.wpm || 0,
          fillerCount: speechStats?.fillerCount || 0,
          transcript: answerTranscript || '',
        };
        submitResults(challengeId, challengeRole, challengeResultData).catch(console.error);
      }

      setPhase('done');

      // ── Event-based avatar trigger: interview complete ──
      const completedScores = results
        .map((r) => r.score || r.confidence)
        .filter(Number.isFinite);
      const avgScore = completedScores.length > 0
        ? Math.round(completedScores.reduce((a, b) => a + b, 0) / completedScores.length)
        : undefined;

      // Record mood signal based on performance
      import('../services/moodService').then(({ recordSignal }) => {
        if (avgScore !== undefined) {
          if (avgScore >= 90) recordSignal('interview_great');
          else if (avgScore >= 70) recordSignal('interview_pass');
          else if (avgScore < 40) recordSignal('interview_fail');
        }
      });

      triggerCheckpoint('interview-complete', {
        eventId: `interview-${Date.now()}`,
        userName: user?.profile?.name || user?.name || undefined,
        avgInterviewScore: avgScore,
        interviewCount: interviewCount + 1,
      });
    }
  };

  const startFollowUp = (questionText) => {
    setActiveFollowUp(questionText);
    setAnalysis(null);
    setBodyResults(null);
    setSpeechStats(null);
    setTranscript('');
    setInterim('');
    setSpeechStatus({ supported: false, active: false, error: '', message: 'Speech recognition idle' });
    setPhase('followup');
  };

  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const currentPrompt = phase === 'followup' && activeFollowUp ? activeFollowUp : questions[qIdx]?.question;
  const currentPromptLabel = phase === 'followup' ? 'Adaptive follow-up' : `Q${qIdx+1}/${questions.length}`;
  const improvementChartData = [
    { key: 'speech', label: 'Speech confidence', value: clampScore(speechStats?.confidence), target: 80, tone: 'speech' },
    { key: 'body', label: 'Body language', value: clampScore(bodyResults?.overall), target: 80, tone: 'body' },
    { key: 'answer', label: 'AI answer quality', value: clampScore(analysis?.overallScore), target: 85, tone: 'ai' },
  ];
  const strongestOpportunity = improvementChartData
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => a.value - b.value)[0];

  const handleReadAloud = async () => {
    if (isSpeaking()) {
      stopSpeaking();
      setTtsPlaying(false);
      return;
    }
    if (!currentPrompt) return;
    setTtsLoading(true);
    setTtsPlaying(true);
    try {
      const audio = await speakText(currentPrompt);
      audio.addEventListener('ended', () => setTtsPlaying(false));
      audio.addEventListener('error', () => setTtsPlaying(false));
    } catch (err) {
      console.error('TTS failed:', err);
      setTtsPlaying(false);
    }
    setTtsLoading(false);
  };

  // ─── SETUP ───────────────────────────────────────────────────────────────────
  if (phase === 'setup' && challengeId) {
    // Challenge mode: show loading state while auto-starting
    return (
      <div className="mock-interview"><div className="container">
        <motion.div className="mi-setup" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} style={{ textAlign: 'center', padding: '60px 20px' }}>
          <h1>Challenge Mode</h1>
          <p>Setting up your challenge interview...</p>
          <div className="mi-spinner" style={{ margin: '20px auto' }} />
        </motion.div>
      </div></div>
    );
  }

  if (phase === 'setup') return (
    <div className="mock-interview"><div className="container">
      <motion.div className="mi-setup" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}>
        <h1>{(() => { const Icon = getIconComponent('bot'); return <><Icon size={22} className="mi-header-icon"/> AI Mock Interview</>; })()}</h1>
        <p>Practice with AI-generated questions. Get feedback on speech, body language, and answer quality.</p>
        {jobDescription && <div className="mi-jd-notice">{(() => { const Icon = getIconComponent('check'); return <><Icon size={14} style={{marginRight:8}}/> Questions tailored to your job description</>; })()}</div>}
        {!jobDescription && user.activeCareerGoal && <div className="mi-jd-notice">{(() => { const Icon = getIconComponent('check'); return <><Icon size={14} style={{marginRight:8}}/> Questions tailored to your goal: {user.activeCareerGoal.title}</>; })()}</div>}
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
        {streamRef.current ? <>
          <video ref={videoRef} autoPlay muted playsInline className="mi-video" />
          <canvas ref={overlayRef} className="mi-pose-overlay" aria-hidden="true" style={{ display: 'none' }} />
        </> : <div className="mi-no-cam">{(() => { const Icon = getIconComponent('camera'); return <><Icon size={18} style={{marginRight:8}}/> No camera</>; })()}</div>}
        {trackingLoading && <div className="mi-loading-overlay"><div className="mi-loading-card"><div className="mi-spinner" /><p>{trackingMessage}</p></div></div>}
        {recording && <div className="mi-rec">● REC {fmt(timer)}</div>}
        {streamRef.current && recording && <div className="mi-track-mode">Tracking: {trackingMode === 'ml' ? 'Pose ML' : 'Fallback'}</div>}
        {streamRef.current && recording && (
          <button
            type="button"
            className={`mi-overlay-toggle ${showPoseOverlay ? 'active' : ''}`}
            onClick={() => setShowPoseOverlay(prev => !prev)}
          >
            {showPoseOverlay ? 'Hide Pose Overlay' : 'Show Pose Overlay'}
          </button>
        )}
      </div>
      <div className="mi-question-panel">
        <span className="mi-qnum">{currentPromptLabel} • {selectedType}</span>
        <div className="mi-question-row">
          <h2>{currentPrompt}</h2>
          <button
            type="button"
            className={`mi-read-aloud-btn ${ttsPlaying ? 'active' : ''}`}
            onClick={handleReadAloud}
            disabled={ttsLoading && !ttsPlaying}
            aria-label={ttsPlaying ? 'Stop reading' : 'Read question aloud'}
            title={ttsPlaying ? 'Stop reading' : 'Read question aloud'}
          >
            {ttsLoading && !ttsPlaying ? (
              <span className="mi-tts-spinner" />
            ) : ttsPlaying ? (
              (() => { const Icon = getIconComponent('x'); return <Icon size={16} />; })()
            ) : (
              (() => { const Icon = getIconComponent('play'); return <Icon size={16} />; })()
            )}
            <span>{ttsPlaying ? 'Stop' : 'Listen'}</span>
          </button>
        </div>
        {questions[qIdx]?.tips && <p className="mi-tip">{(() => { const Icon = getIconComponent('badge-quick-thinker'); return <><Icon size={14} style={{marginRight:8}}/> {questions[qIdx].tips}</>; })()}</p>}
        {recording && <p className="mi-speech-status-inline">{speechStatus.message}{speechStatus.error ? ` • ${speechStatus.error}` : ''}{speechDebug ? ` • ${speechDebug}` : ''}</p>}
        {recording && (
          <div className="mi-mic-meter-wrap">
            <div className="mi-mic-meter-label">Mic input</div>
            <div className="mi-mic-meter-track"><div className="mi-mic-meter-fill" style={{ width: `${micLevel}%` }} /></div>
          </div>
        )}
          {recording && (
            <div className="mi-recording-controls-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button ref={settingsButtonRef} className="mi-settings-btn" onClick={() => setShowSettings(s => !s)} aria-expanded={showSettings} aria-label="Settings">
                  {(() => { const Icon = getIconComponent('settings'); return <Icon size={16} />; })()}
                </button>
                <div className="mi-selected-mic" title={audioDevices.find(d => d.deviceId === selectedAudioDeviceId)?.label || 'Default microphone'}>
                  {audioDevices.find(d => d.deviceId === selectedAudioDeviceId)?.label || 'Default microphone'}
                </div>
              </div>

              {showSettings && (
                <div ref={settingsRef} className="mi-settings-panel" role="region" aria-label="Interview settings">
                  <div className="mi-settings-header">Audio & Options</div>
                  <div className="mi-settings-row">
                    <label className="mi-settings-label">Microphone</label>
                    <select className="mi-settings-select" value={selectedAudioDeviceId} onChange={(e) => setSelectedAudioDeviceId(e.target.value)}>
                      {audioDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
                    </select>
                  </div>
                  <div className="mi-settings-row">
                    <button className="btn-secondary" onClick={applySelectedMicForMeter}>Use Mic</button>
                    <button className="btn-link" onClick={refreshAudioDevices}>Refresh</button>
                  </div>
                  <div className="mi-settings-row">
                    <label className="mi-settings-label" title="Force opening a separate mic stream on Chromium (may affect recognition)">
                      <input type="checkbox" checked={forceMicOnChromium} onChange={(e) => setForceMicOnChromium(e.target.checked)} />
                      <span style={{ marginLeft: 8 }}>Force mic</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}
        
        {recording && showPoseOverlay && (
          <div style={{ marginTop: 12 }}>
            <div className="mi-skeleton-box">
              <canvas ref={skeletonRef} width={320} height={240} style={{ width: '100%', height: '100%', transform: 'scaleX(-1)' }} />
            </div>
          </div>
        )}
        {/* Opponent's live pose during challenge mode */}
        {challengeId && recording && (
          <div style={{ marginTop: 12 }}>
            <OpponentPoseView
              poseData={opponentPose}
              opponentName={challengeData ? (challengeRole === 'challenger' ? challengeData.opponentName : challengeData.challengerName) : 'Opponent'}
              isRecording={challengeData ? (challengeRole === 'challenger' ? challengeData.opponentRecording : challengeData.challengerRecording) : false}
            />
          </div>
        )}
        <div className="mi-controls">
          {!recording ? <button className="btn-primary" onClick={startRecording}>{(() => { const Icon = getIconComponent('play'); return <><Icon size={14} style={{marginRight:8}}/> Start Recording</>; })()}</button> : <button className="mi-stop-btn" onClick={stopRecording}>{(() => { const Icon = getIconComponent('x'); return <><Icon size={14} style={{marginRight:8}}/> Stop & Analyze</>; })()}</button>}
          {!challengeId && <button className="btn-secondary" onClick={handleNext}>Skip →</button>}
        </div>
      </div>
    </div></div>
  );

  if (phase === 'followup') return (
    <div className="mock-interview mi-active"><div className="mi-layout">
      <div className="mi-video-panel">
        {streamRef.current ? <>
          <video ref={videoRef} autoPlay muted playsInline className="mi-video" />
          <canvas ref={overlayRef} className="mi-pose-overlay" aria-hidden="true" style={{ display: 'none' }} />
        </> : <div className="mi-no-cam">{(() => { const Icon = getIconComponent('camera'); return <><Icon size={18} style={{marginRight:8}}/> No camera</>; })()}</div>}
        {trackingLoading && <div className="mi-loading-overlay"><div className="mi-loading-card"><div className="mi-spinner" /><p>{trackingMessage}</p></div></div>}
        {recording && <div className="mi-rec">● REC {fmt(timer)}</div>}
        {streamRef.current && recording && <div className="mi-track-mode">Tracking: {trackingMode === 'ml' ? 'Pose ML' : 'Fallback'}</div>}
      </div>
      <div className="mi-question-panel">
        <span className="mi-qnum">Adaptive follow-up • {selectedType}</span>
        <div className="mi-question-row">
          <h2>{activeFollowUp}</h2>
          <button
            type="button"
            className={`mi-read-aloud-btn ${ttsPlaying ? 'active' : ''}`}
            onClick={handleReadAloud}
            disabled={ttsLoading && !ttsPlaying}
            aria-label={ttsPlaying ? 'Stop reading' : 'Read question aloud'}
            title={ttsPlaying ? 'Stop reading' : 'Read question aloud'}
          >
            {ttsLoading && !ttsPlaying ? (
              <span className="mi-tts-spinner" />
            ) : ttsPlaying ? (
              (() => { const Icon = getIconComponent('x'); return <Icon size={16} />; })()
            ) : (
              (() => { const Icon = getIconComponent('play'); return <Icon size={16} />; })()
            )}
            <span>{ttsPlaying ? 'Stop' : 'Listen'}</span>
          </button>
        </div>
        <p className="mi-tip">{(() => { const Icon = getIconComponent('zap'); return <><Icon size={14} style={{marginRight:8}}/> This follow-up was generated from your previous answer.</>; })()}</p>
        {recording && <p className="mi-speech-status-inline">{speechStatus.message}{speechStatus.error ? ` • ${speechStatus.error}` : ''}{speechDebug ? ` • ${speechDebug}` : ''}</p>}
        {recording && (
          <div className="mi-mic-meter-wrap">
            <div className="mi-mic-meter-label">Mic input</div>
            <div className="mi-mic-meter-track"><div className="mi-mic-meter-fill" style={{ width: `${micLevel}%` }} /></div>
          </div>
        )}
        <div className="mi-controls">
          {!recording ? <button className="btn-primary" onClick={startRecording}>{(() => { const Icon = getIconComponent('play'); return <><Icon size={14} style={{marginRight:8}}/> Start Follow-up</>; })()}</button> : <button className="mi-stop-btn" onClick={stopRecording}>{(() => { const Icon = getIconComponent('x'); return <><Icon size={14} style={{marginRight:8}}/> Stop & Review</>; })()}</button>}
          <button className="btn-secondary" onClick={() => { setActiveFollowUp(null); setPhase('review'); }}>Cancel</button>
        </div>
        {recording && showPoseOverlay && (
          <div style={{ marginTop: 12 }}>
            <div className="mi-skeleton-box">
              <canvas ref={skeletonRef} width={320} height={240} style={{ width: '100%', height: '100%', transform: 'scaleX(-1)' }} />
            </div>
          </div>
        )}
      </div>
    </div></div>
  );

  // ─── REVIEW ──────────────────────────────────────────────────────────────────
  if (phase === 'review') return (
    <div className="mock-interview"><div className="container">
      <motion.div className="mi-review" initial={{opacity:0}} animate={{opacity:1}}>
        <div className="mi-review-header">
          <div>
            <h2>Analysis — Q{qIdx+1}</h2>
            <p className="mi-review-subtitle">Quick dashboard view of your answer quality, speech, and body language.</p>
          </div>
          <div className="mi-review-badge">{selectedType} • {currentPromptLabel}</div>
        </div>
        {error && <p className="mi-error">{error}</p>}

        <div className="mi-dashboard-shell">
          <div className="mi-metric-strip">
            <div className="mi-metric-tile">
              <span>{safeNum(speechStats?.confidence)}</span>
              <small>Speech confidence</small>
            </div>
            <div className="mi-metric-tile">
              <span>{safeNum(speechStats?.wpm)}</span>
              <small>WPM</small>
            </div>
            <div className="mi-metric-tile">
              <span>{safeNum(bodyResults?.overall)}</span>
              <small>Body overall</small>
            </div>
            <div className="mi-metric-tile">
              <span>{safeNum(analysis?.overallScore)}</span>
              <small>AI score</small>
            </div>
          </div>

          <div className="mi-dashboard-grid">
            <div className="mi-dashboard-main">
              <div className="mi-section">
                <h3>{(() => { const Icon = getIconComponent('feature-quiz'); return <><Icon size={16} style={{marginRight:8}}/> Answer Quality (AI)</>; })()}</h3>
                {loading && !analysis ? (
                  <div className="mi-analysis-loading-inline" role="status" aria-live="polite">
                    <div className="mi-spinner" />
                    <div>
                      <strong>Analyzing your answer</strong>
                      <p>Scoring clarity, depth, and technical accuracy now.</p>
                    </div>
                  </div>
                ) : analysis ? (
                  <>
                    <div className="mi-metrics">
                      <div><span>{safeNum(analysis.overallScore)}</span><small>Overall</small></div>
                      <div><span>{safeNum(analysis.technicalAccuracy?.score)}</span><small>Technical</small></div>
                      <div><span>{safeNum(analysis.communicationClarity?.score)}</span><small>Clarity</small></div>
                      <div><span>{safeNum(analysis.depth?.score)}</span><small>Depth</small></div>
                    </div>
                    <div className="mi-analysis-columns">
                      {analysis.strengths && <div className="mi-analysis-card"><h4>{(() => { const Icon = getIconComponent('check'); return <><Icon size={14} style={{marginRight:8}}/> Strengths</>; })()}</h4><ul>{analysis.strengths.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
                      {analysis.improvements && <div className="mi-analysis-card"><h4>{(() => { const Icon = getIconComponent('zap'); return <><Icon size={14} style={{marginRight:8}}/> Improve</>; })()}</h4><ul>{analysis.improvements.map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
                      {analysis.sampleAnswer && <div className="mi-analysis-card mi-analysis-card-wide"><h4>{(() => { const Icon = getIconComponent('badge-quick-thinker'); return <><Icon size={14} style={{marginRight:8}}/> Ideal Answer</>; })()}</h4><p className="mi-sample">{analysis.sampleAnswer}</p></div>}
                    </div>
                  </>
                ) : (
                  <p className="mi-body-fb">Results will appear here once the analysis completes.</p>
                )}
              </div>

              <div className="mi-section">
                <h3>{(() => { const Icon = getIconComponent('badge-quick-thinker'); return <><Icon size={16} style={{marginRight:8}}/> Adaptive Follow-ups</>; })()}</h3>
                {followUpQuestions.length > 0 ? (
                  <div className="mi-followup-list">
                    {followUpQuestions.map((item, index) => (
                      <button key={`${item}-${index}`} type="button" className="mi-followup-btn" onClick={() => startFollowUp(item)}>
                        {item}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mi-body-fb">No follow-up questions were generated for this response.</p>
                )}
              </div>
            </div>

            <div className="mi-dashboard-side">
              <div className="mi-section">
                <h3>{(() => { const Icon = getIconComponent('career-data'); return <><Icon size={16} style={{marginRight:8}}/> Improvement Chart</>; })()}</h3>
                <p className="mi-body-fb">Track the next session around the weakest area so progress is obvious at a glance.</p>
                {improvementChartData.some((item) => Number.isFinite(item.value)) ? (
                  <div className="mi-improvement-chart" role="img" aria-label="Improvement chart for speech, body language, and answer quality">
                    {improvementChartData.map((item) => {
                      const width = Number.isFinite(item.value) ? item.value : 0;
                      return (
                        <div className="mi-improvement-row" key={item.key}>
                          <div className="mi-improvement-row-head">
                            <span>{item.label}</span>
                            <small>{Number.isFinite(item.value) ? `${item.value}%` : '—'}</small>
                          </div>
                          <div className={`mi-improvement-track ${item.tone}`}>
                            <div className="mi-improvement-fill" style={{ width: `${width}%` }} />
                            <div className="mi-improvement-target" style={{ left: `${item.target}%` }} title={`Target ${item.target}%`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mi-body-fb">Your chart will populate after the first analyzed response.</p>
                )}
                {strongestOpportunity && Number.isFinite(strongestOpportunity.value) && (
                  <div className="mi-improvement-callout">
                    <strong>Focus next:</strong> {strongestOpportunity.label.toLowerCase()} is currently the lowest at {strongestOpportunity.value}%.
                  </div>
                )}
              </div>

              {speechStats && (
                <div className="mi-section">
                  <h3>{(() => { const Icon = getIconComponent('mic'); return <><Icon size={16} style={{marginRight:8}}/> Speech</>; })()}</h3>
                  <div className="mi-metrics mi-metrics-compact">
                    <div><span>{safePct(speechStats.confidence)}</span><small>Confidence</small></div>
                    <div><span>{safeNum(speechStats.wpm)}</span><small>WPM</small></div>
                    <div><span>{safeNum(speechStats.fillerCount)}</span><small>Fillers</small></div>
                    <div><span>{fmt(Number.isFinite(speechStats.duration) ? speechStats.duration : 0)}</span><small>Duration</small></div>
                    <div><span>{safeNum(speechStats.totalWords)}</span><small>Words</small></div>
                  </div>
                </div>
              )}

              {bodyResults && (
                <div className="mi-section">
                  <h3>{(() => { const Icon = getIconComponent('user'); return <><Icon size={16} style={{marginRight:8}}/> Body Language</>; })()}</h3>
                  <div className="mi-metrics mi-metrics-compact">
                    <div><span>{safePct(bodyResults.eyeContact)}</span><small>Eye Contact</small></div>
                    <div><span>{safePct(bodyResults.posture)}</span><small>Posture</small></div>
                    <div><span>{safePct(bodyResults.stillness)}</span><small>Stillness</small></div>
                    <div><span>{safePct(bodyResults.overall)}</span><small>Overall</small></div>
                  </div>
                  {bodyResults.feedback?.slice(0, 3).map((f, i) => <p key={i} className="mi-body-fb">• {f}</p>)}
                </div>
              )}

              {/* Avatar replay removed */}

              {answerTranscript && (
                <div className="mi-section">
                  <h3>{(() => { const Icon = getIconComponent('mic'); return <><Icon size={16} style={{marginRight:8}}/> Transcript</>; })()}</h3>
                  <p className="mi-transcript-final mi-transcript-final-compact">{answerTranscript}</p>
                </div>
              )}

              {replayEntries.length > 0 && (
                <div className="mi-section">
                  <h3>{(() => { const Icon = getIconComponent('feature-quiz'); return <><Icon size={16} style={{marginRight:8}}/> Answer Replay</>; })()}</h3>
                  <div className="mi-replay-list">
                    {replayEntries.slice().reverse().map((entry, index) => (
                      <div key={entry.id} className="mi-fb mi-replay-card">
                        <h4>{entry.label}</h4>
                        <p className="mi-replay-prompt">{entry.prompt}</p>
                        <div className="mi-replay-text">{highlightAnswerReplay(entry.answer || 'No transcript captured.')}</div>
                        <div className="mi-replay-meta">
                          <span>{safeNum(entry.duration)}s</span>
                          <span>{safeNum(entry.wpm)} WPM</span>
                          <span>{safeNum(entry.fillerCount)} fillers</span>
                          <span>{safePct(entry.confidence)} confidence</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mi-review-actions">
          <button className="btn-primary" onClick={handleNext}>{qIdx < questions.length-1 ? 'Next Question →' : 'Finish Session'}</button>
          {!challengeId && <button className="btn-secondary" onClick={() => { stopCamera(); navigate('/interview'); }}>Back to Hub</button>}
        </div>
      </motion.div>
    </div></div>
  );

  // ─── DONE ────────────────────────────────────────────────────────────────────
  // Challenge mode: show comparison results
  if (challengeId && challengeData) {
    return (
      <div className="mock-interview"><div className="container">
        <motion.div className="mi-done" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}>
          <ChallengeResults
            challengeData={challengeData}
            currentRole={challengeRole}
            onClose={() => navigate('/campus')}
          />
        </motion.div>
      </div></div>
    );
  }

  // Normal mode: standard session complete
  return (
    <div className="mock-interview"><div className="container">
      <motion.div className="mi-done" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}}>
      <h1>{(() => { const Icon = getIconComponent('badge-level-10'); return <><Icon size={26} style={{marginRight:8}}/> Session Complete</>; })()}</h1>
        <p>{results.length} questions answered</p>
        <div className="mi-final-scores">
          {results.map((r,i) => <div key={i}><span>Q{i+1}</span><span>AI: {r.score || '-'}</span><span>Body: {r.body || '-'}%</span><span>Conf: {r.confidence || '-'}%</span></div>)}
        </div>
        <div className="mi-done-actions">
          <button className="btn-primary" onClick={() => { setPhase('setup'); setQIdx(0); setResults([]); setAnalysis(null); setBodyResults(null); setSpeechStats(null); setFollowUpQuestions([]); setReplayEntries([]); setActiveFollowUp(null); setSpeechStatus({ supported: false, active: false, error: '', message: 'Speech recognition idle' }); setError(''); }}>Practice Again</button>
          <button className="btn-secondary" onClick={() => navigate('/interview')}>Back to Hub</button>
          <button className="btn-secondary" onClick={() => navigate('/skillbridge')}>Improve Skills →</button>
        </div>
      </motion.div>
    </div></div>
  );
}
