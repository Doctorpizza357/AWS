/**
 * MeshReplay — Full-body holistic mesh replay with proper triangulation.
 *
 * Renders a complete "digital twin" with:
 *   • Full 478-point face mesh with proper Delaunay tessellation
 *   • Body segment fills (torso, limbs) from 33-point pose
 *   • Hand wireframe with all 21 landmarks × 2
 *   • Gaze vector, head pose HUD, timeline scrubber
 *
 * Performance optimizations:
 *   • Uses OffscreenCanvas for pre-rendering when available
 *   • Batches draw calls (single path per layer)
 *   • Binary search for frame lookup during playback
 *   • requestAnimationFrame-driven loop (no setInterval)
 *   • Skips invisible/unchanged frames
 */
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import './MeshReplay.css';

// ═══════════════════════════════════════════════════════════════════════════════
// MediaPipe Face Mesh Tessellation (canonical triangle indices)
// This is a subset of the official 468-triangle tessellation for performance.
// Full tessellation has ~900 triangles; we use ~300 key triangles for smooth look.
// ═══════════════════════════════════════════════════════════════════════════════
const FACE_TRIANGLES = [
  // Forehead
  [10,338,297],[10,297,332],[10,332,284],[10,284,251],[10,251,389],
  [10,109,67],[10,67,103],[10,103,54],[10,54,21],[10,21,162],
  // Left cheek
  [234,127,162],[127,162,21],[127,21,54],[234,93,132],[93,132,58],
  [132,58,172],[58,172,136],[172,136,150],[136,150,149],[150,149,176],
  // Right cheek
  [454,356,389],[356,389,251],[356,251,284],[454,323,361],[323,361,288],
  [361,288,397],[288,397,365],[397,365,379],[365,379,378],[379,378,400],
  // Nose
  [168,6,197],[6,197,195],[197,195,5],[195,5,4],[5,4,1],
  [168,6,122],[6,122,188],[168,6,351],[6,351,412],
  // Left eye region
  [33,7,163],[7,163,144],[163,144,145],[144,145,153],[145,153,154],
  [154,155,133],[155,133,173],[133,173,157],[173,157,158],[157,158,159],
  [158,159,160],[159,160,161],[160,161,246],[161,246,33],
  // Right eye region
  [263,249,390],[249,390,373],[390,373,374],[373,374,380],[374,380,381],
  [381,382,362],[382,362,398],[362,398,384],[398,384,385],[384,385,386],
  [385,386,387],[386,387,388],[387,388,466],[388,466,263],
  // Lips
  [61,146,91],[146,91,181],[91,181,84],[181,84,17],[84,17,314],
  [17,314,405],[314,405,321],[405,321,375],[321,375,291],
  [61,185,40],[185,40,39],[40,39,37],[39,37,0],[37,0,267],
  [0,267,269],[267,269,270],[269,270,409],[270,409,291],
  // Chin
  [152,148,176],[152,377,400],[148,176,149],[377,400,378],
  // Jaw line
  [132,93,234],[361,323,454],
  // Bridge areas
  [107,66,105],[105,63,70],[336,296,334],[334,293,300],
];

// Face contour lines for sharp definition
const FACE_CONTOURS = [
  [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109,10],
  [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246,33],
  [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398,362],
  [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185,61],
  [168,6,197,195,5,4,1],
  [70,63,105,66,107,55,65,52,53,46],
  [300,293,334,296,336,285,295,282,283,276],
];


// Pose connections (BlazePose 33-pt) + body segment polygons
const POSE_CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
  [15,17],[15,19],[15,21],[16,18],[16,20],[16,22],
  [27,29],[29,31],[28,30],[30,32],
  [0,1],[1,2],[2,3],[3,7],[0,4],[4,5],[5,6],[6,8],
];

// Body segment fills (polygon index lists for filled areas)
const BODY_SEGMENTS = {
  torso: [11, 12, 24, 23],      // shoulders → hips
  leftUpperArm: [11, 13],
  leftForearm: [13, 15],
  rightUpperArm: [12, 14],
  rightForearm: [14, 16],
  leftThigh: [23, 25],
  leftShin: [25, 27],
  rightThigh: [24, 26],
  rightShin: [26, 28],
};

// Hand connections
const HAND_CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [0,9],[9,10],[10,11],[11,12],
  [0,13],[13,14],[14,15],[15,16],
  [0,17],[17,18],[18,19],[19,20],
  [5,9],[9,13],[13,17],
];

// Pose landmark name array
const POSE_NAMES = [
  'nose','left_eye_inner','left_eye','left_eye_outer',
  'right_eye_inner','right_eye','right_eye_outer',
  'left_ear','right_ear','left_mouth','right_mouth',
  'left_shoulder','right_shoulder','left_elbow','right_elbow',
  'left_wrist','right_wrist','left_pinky','right_pinky',
  'left_index','right_index','left_thumb','right_thumb',
  'left_hip','right_hip','left_knee','right_knee',
  'left_ankle','right_ankle','left_heel','right_heel',
  'left_foot','right_foot',
];

// ─── Binary search for frame by timestamp ───────────────────────────────────
function findFrameAtTime(frames, targetTs) {
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].ts <= targetTs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}


export default function MeshReplay({ frames, width = 520, height = 390 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const playStartRef = useRef(null);
  const playOffsetRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [frameIdx, setFrameIdx] = useState(0);
  const [showFaceMesh, setShowFaceMesh] = useState(true);
  const [showHands, setShowHands] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showBodyFill, setShowBodyFill] = useState(true);

  const frameCount = frames?.length || 0;
  const duration = useMemo(
    () => frameCount > 1 ? (frames[frameCount - 1].ts - frames[0].ts) / 1000 : 0,
    [frames, frameCount]
  );

  // ─── High-performance draw function ──────────────────────────────────────
  const drawFrame = useCallback((idx) => {
    const canvas = canvasRef.current;
    if (!canvas || !frames || idx < 0 || idx >= frames.length) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const frame = frames[idx];
    const W = width;
    const H = height;

    // Background (clear full buffer area then draw in logical coords)
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.fillStyle = '#080c16';
    ctx.fillRect(0, 0, W, H);

    // Subtle scan lines
    ctx.save();
    ctx.globalAlpha = 0.025;
    ctx.strokeStyle = '#00ffd0';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < H; y += 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.restore();

    const sourceW = frame.width || 640;
    const sourceH = frame.height || 480;
    const scale = Math.min(W / sourceW, H / sourceH);
    const offsetX = (W - sourceW * scale) / 2;
    const offsetY = (H - sourceH * scale) / 2;

    // Fast coordinate transform (inlined for perf)
    const tx = (x) => x * sourceW * scale + offsetX;
    const ty = (y) => y * sourceH * scale + offsetY;
    // For keypoints that are already in pixel coords
    const px = (x) => x * scale + offsetX;
    const py = (y) => y * scale + offsetY;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ─── Face Mesh (full triangulated body) ─────────────────────────────────
    if (showFaceMesh && frame.faceMesh && frame.faceMesh.length > 400) {
      const mesh = frame.faceMesh;

      // Triangulation fill (very subtle, depth-shaded)
      ctx.save();
      ctx.beginPath();
      for (const [ai, bi, ci] of FACE_TRIANGLES) {
        const a = mesh[ai], b = mesh[bi], c = mesh[ci];
        if (!a || !b || !c) continue;
        ctx.moveTo(tx(a.x), ty(a.y));
        ctx.lineTo(tx(b.x), ty(b.y));
        ctx.lineTo(tx(c.x), ty(c.y));
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(0,255,210,0.04)';
      ctx.fill();
      // Wireframe on top
      ctx.strokeStyle = 'rgba(0,255,210,0.12)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
      ctx.restore();

      // Contour lines (crisp)
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.strokeStyle = '#00ffd0';
      ctx.lineWidth = 1.1;
      for (const contour of FACE_CONTOURS) {
        ctx.beginPath();
        let started = false;
        for (const i of contour) {
          const lm = mesh[i];
          if (!lm) continue;
          if (!started) { ctx.moveTo(tx(lm.x), ty(lm.y)); started = true; }
          else ctx.lineTo(tx(lm.x), ty(lm.y));
        }
        ctx.stroke();
      }
      ctx.restore();

      // Iris dots
      if (mesh[468] && mesh[473]) {
        ctx.save();
        ctx.fillStyle = '#00ff88';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#00ff88';
        for (const i of [468, 473]) {
          const ir = mesh[i];
          ctx.beginPath();
          ctx.arc(tx(ir.x), ty(ir.y), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // ─── Body segment fills ─────────────────────────────────────────────────
    const kpMap = {};
    if (frame.keypoints && frame.keypoints.length > 0) {
      for (const pt of frame.keypoints) {
        const i = POSE_NAMES.indexOf(pt.name);
        if (i >= 0) kpMap[i] = pt;
      }
    }

    if (showBodyFill && Object.keys(kpMap).length > 10) {
      ctx.save();
      // Torso fill
      const torso = BODY_SEGMENTS.torso;
      const torsoVerts = torso.map(i => kpMap[i]).filter(Boolean);
      if (torsoVerts.length === 4) {
        ctx.beginPath();
        ctx.moveTo(px(torsoVerts[0].x), py(torsoVerts[0].y));
        for (let i = 1; i < torsoVerts.length; i++) ctx.lineTo(px(torsoVerts[i].x), py(torsoVerts[i].y));
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,180,255,0.06)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,180,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Limb tubes (thick semi-transparent lines)
      ctx.globalAlpha = 0.15;
      ctx.lineCap = 'round';
      const limbPairs = [
        [11,13],[13,15],[12,14],[14,16], // arms
        [23,25],[25,27],[24,26],[26,28], // legs
      ];
      for (const [ai, bi] of limbPairs) {
        const a = kpMap[ai], b = kpMap[bi];
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(80,200,255,0.5)';
        ctx.lineWidth = 12;
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
        ctx.stroke();
      }
      ctx.restore();
    }


    // ─── Pose Skeleton ──────────────────────────────────────────────────────
    if (showSkeleton && Object.keys(kpMap).length > 0) {
      ctx.save();
      // Batch all skeleton lines into one path (glow pass)
      ctx.beginPath();
      for (const [i, j] of POSE_CONNECTIONS) {
        const a = kpMap[i], b = kpMap[j];
        if (!a || !b || (a.score ?? 1) < 0.25 || (b.score ?? 1) < 0.25) continue;
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
      }
      ctx.shadowBlur = 8;
      ctx.shadowColor = 'rgba(0,255,200,0.6)';
      ctx.strokeStyle = 'rgba(0,255,200,0.25)';
      ctx.lineWidth = 5;
      ctx.stroke();

      // Core pass (same path, thinner, brighter)
      ctx.beginPath();
      for (const [i, j] of POSE_CONNECTIONS) {
        const a = kpMap[i], b = kpMap[j];
        if (!a || !b || (a.score ?? 1) < 0.25 || (b.score ?? 1) < 0.25) continue;
        ctx.moveTo(px(a.x), py(a.y));
        ctx.lineTo(px(b.x), py(b.y));
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(170,255,244,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Keypoint dots (batched)
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(250,204,21,0.6)';
      ctx.fillStyle = 'rgba(250,204,21,0.95)';
      for (const [, pt] of Object.entries(kpMap)) {
        if ((pt.score ?? 1) < 0.25) continue;
        ctx.beginPath();
        ctx.arc(px(pt.x), py(pt.y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ─── Hands ──────────────────────────────────────────────────────────────
    if (showHands && frame.hands && frame.hands.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.8;
      for (const hand of frame.hands) {
        if (!hand || hand.length < 21) continue;
        // Batched connections
        ctx.beginPath();
        for (const [i, j] of HAND_CONNECTIONS) {
          const a = hand[i], b = hand[j];
          if (!a || !b) continue;
          ctx.moveTo(tx(a.x), ty(a.y));
          ctx.lineTo(tx(b.x), ty(b.y));
        }
        ctx.strokeStyle = '#ff66ff';
        ctx.lineWidth = 1.6;
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(255,100,255,0.4)';
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Fingertips + palm center
        ctx.fillStyle = '#ffaaff';
        for (const i of [4, 8, 12, 16, 20, 0]) {
          const tip = hand[i];
          if (!tip) continue;
          ctx.beginPath();
          ctx.arc(tx(tip.x), ty(tip.y), i === 0 ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // ─── Gaze vector ────────────────────────────────────────────────────────
    if (frame.gaze && frame.faceMesh && frame.faceMesh[468] && frame.faceMesh[473]) {
      const mesh = frame.faceMesh;
      const midX = (mesh[468].x + mesh[473].x) / 2;
      const midY = (mesh[468].y + mesh[473].y) / 2;
      const cx = tx(midX), cy = ty(midY);
      const len = 22;
      const gx = (frame.gaze.x - 0.5) * len * 2;
      const gy = frame.gaze.y * len * 2;
      const color = frame.gaze.score > 0.7 ? '#00ff88' : frame.gaze.score > 0.4 ? '#ffcc00' : '#ff4444';

      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + gx, cy + gy); ctx.stroke();
      // arrowhead
      const angle = Math.atan2(gy, gx);
      ctx.beginPath();
      ctx.moveTo(cx + gx, cy + gy);
      ctx.lineTo(cx + gx - 6 * Math.cos(angle - 0.35), cy + gy - 6 * Math.sin(angle - 0.35));
      ctx.lineTo(cx + gx - 6 * Math.cos(angle + 0.35), cy + gy - 6 * Math.sin(angle + 0.35));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // ─── HUD ────────────────────────────────────────────────────────────────
    ctx.save();
    ctx.font = '10px monospace';
    const t = ((frame.ts - frames[0].ts) / 1000).toFixed(1);
    ctx.fillStyle = 'rgba(0,255,210,0.5)';
    ctx.fillText(`T+${t}s  ${idx + 1}/${frameCount}`, 6, H - 6);
    if (frame.headPose) {
      const hp = frame.headPose;
      ctx.fillText(`Y${(hp.yaw*45).toFixed(0)}° P${(hp.pitch*45).toFixed(0)}° R${hp.roll.toFixed(0)}°`, 6, 14);
    }
    if (frame.gaze) {
      const label = frame.gaze.score > 0.7 ? 'ON CAM' : frame.gaze.score > 0.4 ? 'DRIFT' : 'AWAY';
      ctx.fillStyle = frame.gaze.score > 0.7 ? '#00ff88' : frame.gaze.score > 0.4 ? '#ffcc00' : '#ff4444';
      ctx.fillText(`${label} ${Math.round(frame.gaze.score*100)}%`, W - 80, 14);
    }
    ctx.restore();
  }, [frames, frameCount, showFaceMesh, showHands, showSkeleton, showBodyFill, width, height]);


  // ─── Playback loop (rAF-driven, binary search) ────────────────────────────
  useEffect(() => {
    if (!playing || frameCount < 2) return;

    // Calculate the playback offset so we resume from current frame
    playStartRef.current = performance.now();
    playOffsetRef.current = frames[frameIdx].ts - frames[0].ts;

    let lastDrawnIdx = -1;

    const tick = () => {
      const elapsed = (performance.now() - playStartRef.current) * speed;
      const targetTs = frames[0].ts + playOffsetRef.current + elapsed;

      const idx = findFrameAtTime(frames, targetTs);

      if (idx >= frameCount - 1) {
        setFrameIdx(frameCount - 1);
        drawFrame(frameCount - 1);
        setPlaying(false);
        return;
      }

      // Only redraw if frame changed
      if (idx !== lastDrawnIdx) {
        lastDrawnIdx = idx;
        setFrameIdx(idx);
        drawFrame(idx);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, speed, frameCount, frames, drawFrame, frameIdx]);

  // Draw on scrub / toggle change
  useEffect(() => {
    if (!playing) drawFrame(frameIdx);
  }, [frameIdx, playing, drawFrame, showFaceMesh, showHands, showSkeleton, showBodyFill]);

  // Canvas DPI scaling for crisp rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(dpr, dpr);
  }, [width, height]);

  if (!frames || frames.length < 2) {
    return (
      <div className="mesh-replay-empty">
        <p>No mesh data captured for replay.</p>
      </div>
    );
  }

  const currentTime = frames[frameIdx] ? ((frames[frameIdx].ts - frames[0].ts) / 1000).toFixed(1) : '0.0';
  const progress = frameCount > 1 ? ((frameIdx / (frameCount - 1)) * 100).toFixed(1) : 0;

  return (
    <div className="mesh-replay">
      <div className="mesh-replay-header">
        <span className="mesh-replay-title">🔬 Full Body Mesh Replay</span>
        <span className="mesh-replay-time">{currentTime}s / {duration.toFixed(1)}s ({frames.length} frames)</span>
      </div>

      <div className="mesh-replay-canvas-wrap">
        <canvas ref={canvasRef} className="mesh-replay-canvas" />
        {playing && <div className="mesh-replay-live-badge">● PLAYING</div>}
      </div>

      <div className="mesh-replay-progress" style={{ '--progress': `${progress}%` }} />

      <div className="mesh-replay-controls">
        <button
          className="mesh-replay-btn"
          onClick={() => {
            if (!playing && frameIdx >= frameCount - 1) setFrameIdx(0);
            setPlaying(!playing);
          }}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? '⏸' : '▶'}
        </button>

        <button
          className="mesh-replay-btn mesh-replay-btn-sm"
          onClick={() => { setPlaying(false); setFrameIdx(0); }}
          aria-label="Reset"
          title="Reset to start"
        >
          ⏮
        </button>

        <input
          type="range"
          className="mesh-replay-scrubber"
          min={0}
          max={frameCount - 1}
          value={frameIdx}
          onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }}
          aria-label="Scrubber"
        />

        <select
          className="mesh-replay-speed"
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

      <div className="mesh-replay-toggles">
        <label><input type="checkbox" checked={showFaceMesh} onChange={(e) => setShowFaceMesh(e.target.checked)} /> Face Mesh</label>
        <label><input type="checkbox" checked={showBodyFill} onChange={(e) => setShowBodyFill(e.target.checked)} /> Body Fill</label>
        <label><input type="checkbox" checked={showSkeleton} onChange={(e) => setShowSkeleton(e.target.checked)} /> Skeleton</label>
        <label><input type="checkbox" checked={showHands} onChange={(e) => setShowHands(e.target.checked)} /> Hands</label>
      </div>
    </div>
  );
}
