/**
 * AvatarReplay3D — 3D humanoid replay component (replaces 2D MeshReplay).
 *
 * Features:
 *   • Full playback with play/pause, scrubber, speed control
 *   • Toggle between 3D avatar view and legacy 2D mesh wireframe
 *   • Higher quality rendering for replay (shadows, environment, AA)
 *   • Timeline with frame indicator
 *   • Smooth interpolation between frames for fluid playback
 *
 * Props:
 *   - frames: array of pose frame data (same format as MeshReplay)
 *   - width/height: container dimensions
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import HumanoidAvatar3D from './HumanoidAvatar3D';
import MeshReplay from './MeshReplay';
import './AvatarReplay3D.css';

// Binary search for frame at time
function findFrameAtTime(frames, targetTs) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].ts <= targetTs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

// Interpolate between two frames for smooth playback
function interpolateFrames(frameA, frameB, t) {
  if (!frameA || !frameB || t <= 0) return frameA;
  if (t >= 1) return frameB;

  const result = { ...frameA };

  // Interpolate headPose
  if (frameA.headPose && frameB.headPose) {
    result.headPose = {
      yaw: frameA.headPose.yaw + (frameB.headPose.yaw - frameA.headPose.yaw) * t,
      pitch: frameA.headPose.pitch + (frameB.headPose.pitch - frameA.headPose.pitch) * t,
      roll: frameA.headPose.roll + (frameB.headPose.roll - frameA.headPose.roll) * t,
    };
  }

  // Interpolate gaze
  if (frameA.gaze && frameB.gaze) {
    result.gaze = {
      x: frameA.gaze.x + (frameB.gaze.x - frameA.gaze.x) * t,
      y: frameA.gaze.y + (frameB.gaze.y - frameA.gaze.y) * t,
      score: frameA.gaze.score + (frameB.gaze.score - frameA.gaze.score) * t,
    };
  }

  // Interpolate face blendshapes
  if (frameA.faceBlendshapes && frameB.faceBlendshapes) {
    result.faceBlendshapes = frameA.faceBlendshapes.map((bs, i) => {
      const bsB = frameB.faceBlendshapes[i];
      if (!bsB) return bs;
      return { ...bs, score: bs.score + (bsB.score - bs.score) * t };
    });
  }

  return result;
}

export default function AvatarReplay3D({ frames, width = 520, height = 450 }) {
  const [mode, setMode] = useState('3d'); // '3d' or '2d'
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frameIdx, setFrameIdx] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(null);
  const rafRef = useRef(null);
  const playStartRef = useRef(null);
  const playOffsetRef = useRef(0);

  const frameCount = frames?.length || 0;
  const duration = useMemo(
    () => frameCount > 1 ? (frames[frameCount - 1].ts - frames[0].ts) / 1000 : 0,
    [frames, frameCount]
  );

  // Update currentFrame when frameIdx changes
  useEffect(() => {
    if (frames && frames[frameIdx]) {
      setCurrentFrame(frames[frameIdx]);
    }
  }, [frameIdx, frames]);

  // Playback loop
  useEffect(() => {
    if (!playing || frameCount < 2) return;

    playStartRef.current = performance.now();
    playOffsetRef.current = frames[frameIdx].ts - frames[0].ts;

    let lastIdx = -1;

    const tick = () => {
      const elapsed = (performance.now() - playStartRef.current) * speed;
      const targetTs = frames[0].ts + playOffsetRef.current + elapsed;

      const idx = findFrameAtTime(frames, targetTs);

      if (idx >= frameCount - 1) {
        setFrameIdx(frameCount - 1);
        setCurrentFrame(frames[frameCount - 1]);
        setPlaying(false);
        return;
      }

      if (idx !== lastIdx) {
        lastIdx = idx;
        setFrameIdx(idx);

        // Interpolate for smooth 3D playback
        if (mode === '3d' && idx < frameCount - 1) {
          const frameA = frames[idx];
          const frameB = frames[idx + 1];
          const frameDuration = frameB.ts - frameA.ts;
          const t = frameDuration > 0 ? (targetTs - frameA.ts) / frameDuration : 0;
          setCurrentFrame(interpolateFrames(frameA, frameB, Math.min(1, Math.max(0, t))));
        } else {
          setCurrentFrame(frames[idx]);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, frameCount, frames, mode, frameIdx]);

  if (!frames || frames.length < 2) {
    return (
      <div className="avatar-replay-3d-empty">
        <p>No pose data captured for replay.</p>
      </div>
    );
  }

  const currentTime = frames[frameIdx]
    ? ((frames[frameIdx].ts - frames[0].ts) / 1000).toFixed(1)
    : '0.0';
  const progress = frameCount > 1 ? ((frameIdx / (frameCount - 1)) * 100).toFixed(1) : 0;

  return (
    <div className="avatar-replay-3d">
      {/* Mode toggle */}
      <div className="avatar-replay-3d-header">
        <div className="avatar-replay-3d-mode-toggle">
          <button
            className={`avatar-replay-3d-mode-btn ${mode === '3d' ? 'active' : ''}`}
            onClick={() => setMode('3d')}
          >
            🧍 3D Avatar
          </button>
          <button
            className={`avatar-replay-3d-mode-btn ${mode === '2d' ? 'active' : ''}`}
            onClick={() => setMode('2d')}
          >
            🔬 2D Mesh
          </button>
        </div>
        {mode === '3d' && (
          <span className="avatar-replay-3d-time">
            {currentTime}s / {duration.toFixed(1)}s ({frames.length} frames)
          </span>
        )}
      </div>

      {/* Render area */}
      <div className="avatar-replay-3d-viewport">
        {mode === '3d' ? (
          <HumanoidAvatar3D
            poseFrame={currentFrame}
            quality="high"
            width={width}
            height={height - 120}
          />
        ) : (
          <MeshReplay frames={frames} width={width} height={height - 120} />
        )}
      </div>

      {/* Progress bar + Controls — only for 3D mode (2D MeshReplay has its own) */}
      {mode === '3d' && (
        <>
          <div className="avatar-replay-3d-progress" style={{ '--progress': `${progress}%` }} />

      {/* Controls */}
      <div className="avatar-replay-3d-controls">
        <button
          className="avatar-replay-3d-btn"
          onClick={() => {
            if (!playing && frameIdx >= frameCount - 1) setFrameIdx(0);
            setPlaying(!playing);
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>

        <button
          className="avatar-replay-3d-btn avatar-replay-3d-btn-sm"
          onClick={() => { setPlaying(false); setFrameIdx(0); }}
          aria-label="Reset"
        >
          ⏮
        </button>

        <input
          type="range"
          className="avatar-replay-3d-scrubber"
          min={0}
          max={frameCount - 1}
          value={frameIdx}
          onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
          aria-label="Scrubber"
        />

        <select
          className="avatar-replay-3d-speed"
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          aria-label="Playback speed"
        >
          <option value={0.25}>0.25×</option>
          <option value={0.5}>0.5×</option>
          <option value={1}>1×</option>
          <option value={1.5}>1.5×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
      </div>
        </>
      )}
    </div>
  );
}
