/**
 * OpponentPoseView
 * Renders a live skeleton overlay of the opponent's pose data
 * received via Firestore real-time updates during a challenge.
 */
import React, { useRef, useEffect, useCallback } from 'react';
import './OpponentPoseView.css';

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
  ['right_knee', 'right_ankle'],
];

function OpponentPoseView({ poseData, opponentName, isRecording }) {
  const canvasRef = useRef(null);
  const animFrameRef = useRef(null);
  const prevPosesRef = useRef([]);

  const drawPose = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const w = Math.round(rect.width) || 280;
    const h = Math.round(rect.height) || 210;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();

    if (!poseData?.visible || !poseData.keypoints?.length) {
      // No pose — show waiting state
      ctx.fillStyle = 'rgba(255, 107, 107, 0.6)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(isRecording ? 'Waiting for pose...' : 'Not recording yet', w / 2, h / 2);
      return;
    }

    const sourceW = poseData.width || 640;
    const sourceH = poseData.height || 480;
    const scale = Math.min(w / sourceW, h / sourceH);
    const offsetX = (w - sourceW * scale) / 2;
    const offsetY = (h - sourceH * scale) / 2;

    // Map keypoints to canvas coords (mirror horizontally so it looks natural)
    const points = {};
    poseData.keypoints.forEach(kp => {
      if (!kp?.name) return;
      points[kp.name] = {
        x: w - (kp.x * scale + offsetX),
        y: kp.y * scale + offsetY,
        score: kp.score || 0,
      };
    });

    // Store trail
    prevPosesRef.current.push({ ts: Date.now(), pts: points });
    if (prevPosesRef.current.length > 12) prevPosesRef.current.shift();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw motion trails (orange-red theme to distinguish from own green skeleton)
    try {
      Object.keys(points).forEach(name => {
        ctx.beginPath();
        let moved = false;
        for (let i = 0; i < prevPosesRef.current.length; i++) {
          const p = prevPosesRef.current[i].pts[name];
          if (!p) continue;
          if (!moved) { ctx.moveTo(p.x, p.y); moved = true; } else ctx.lineTo(p.x, p.y);
        }
        if (!moved) return;
        ctx.strokeStyle = 'rgba(255, 107, 107, 0.3)';
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    } catch (e) {}

    // Draw skeleton connections (orange/coral neon)
    POSE_CONNECTIONS.forEach(([from, to]) => {
      if (!points[from] || !points[to]) return;
      const p1 = points[from];
      const p2 = points[to];
      const confidence = Math.min(p1.score, p2.score);
      if (confidence < 0.2) return;

      // Glow
      ctx.beginPath();
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(255, 107, 107, 0.6)';
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(255, 107, 107, ${0.15 + confidence * 0.2})`;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Core line
      ctx.beginPath();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(255, 180, 150, ${0.5 + confidence * 0.4})`;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // Draw keypoints
    const pulse = 1 + Math.sin(Date.now() / 350) * 0.12;
    Object.entries(points).forEach(([name, point]) => {
      if (point.score < 0.2) return;
      const r = (3 + point.score * 3) * pulse;

      ctx.beginPath();
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(255, 150, 100, 0.8)';
      ctx.fillStyle = 'rgba(255, 200, 150, 0.9)';
      ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });
  }, [poseData, isRecording]);

  // Animate at 30fps for smooth trail rendering
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      drawPose();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [drawPose]);

  return (
    <div className="opponent-pose-view">
      <div className="opv-header">
        <span className="opv-name">{opponentName || 'Opponent'}</span>
        {isRecording && <span className="opv-live">● LIVE</span>}
      </div>
      <canvas ref={canvasRef} className="opv-canvas" />
    </div>
  );
}

export default OpponentPoseView;
