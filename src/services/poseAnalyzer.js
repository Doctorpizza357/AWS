/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * STEM PathfindR — Holistic Body Language Analyzer
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Powered by MediaPipe Vision Tasks (Face Landmarker + Pose Landmarker + Hand
 * Landmarker). Provides rich body language analysis including:
 *
 *   • True gaze direction via iris tracking (478 face landmarks)
 *   • Head pose estimation (yaw / pitch / roll)
 *   • Posture analysis with 33 full-body keypoints
 *   • Hand gesture scoring (openness, fidgeting, face-touching)
 *   • Micro-expression engagement cues
 *   • Temporal pattern analysis (nodding, shaking, stillness trends)
 *
 * External API is backwards-compatible with the previous MLBodyAnalyzer class.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

const MIN_CONFIDENCE = 0.4;
const FACE_MESH_CONNECTIONS_COUNT = 478;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
const lerp = (a, b, t) => a + (b - a) * t;
const radToDeg = (r) => (r * 180) / Math.PI;

// Key face mesh landmark indices (MediaPipe canonical)
const FACE = {
  noseTip: 1,
  foreheadCenter: 10,
  chinBottom: 152,
  leftEyeInner: 133,
  leftEyeOuter: 33,
  rightEyeInner: 362,
  rightEyeOuter: 263,
  leftIrisCenter: 468,
  rightIrisCenter: 473,
  leftMouthCorner: 61,
  rightMouthCorner: 291,
  upperLipCenter: 13,
  lowerLipCenter: 14,
  leftEyebrowInner: 107,
  rightEyebrowInner: 336,
  leftEyebrowOuter: 70,
  rightEyebrowOuter: 300,
};

// Pose landmark indices (MediaPipe BlazePose 33-point)
const POSE = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  leftMouth: 9,
  rightMouth: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFoot: 31,
  rightFoot: 32,
};

// Hand landmark indices
const HAND = {
  wrist: 0,
  thumbTip: 4,
  indexTip: 8,
  middleTip: 12,
  ringTip: 16,
  pinkyTip: 20,
  indexMcp: 5,
  middleMcp: 9,
  ringMcp: 13,
  pinkyMcp: 17,
};


// ─── Rolling buffer for temporal analysis ───────────────────────────────────────
class RollingBuffer {
  constructor(maxSize = 90) {
    this.data = [];
    this.maxSize = maxSize;
  }
  push(value) {
    this.data.push(value);
    if (this.data.length > this.maxSize) this.data.shift();
  }
  last(n) { return this.data.slice(-n); }
  get length() { return this.data.length; }
  clear() { this.data = []; }
}

// ─── Head pose estimator from face landmarks ────────────────────────────────────
function estimateHeadPose(faceLandmarks) {
  if (!faceLandmarks || faceLandmarks.length < 400) return null;

  const nose = faceLandmarks[FACE.noseTip];
  const forehead = faceLandmarks[FACE.foreheadCenter];
  const chin = faceLandmarks[FACE.chinBottom];
  const leftEye = faceLandmarks[FACE.leftEyeOuter];
  const rightEye = faceLandmarks[FACE.rightEyeOuter];

  if (!nose || !forehead || !chin || !leftEye || !rightEye) return null;

  // Yaw: horizontal asymmetry between nose and midpoint of eyes
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const yaw = (nose.x - eyeMidX) * 2; // normalized [-1, 1] approx

  // Pitch: vertical position of nose relative to forehead-chin line
  const faceHeight = Math.abs(chin.y - forehead.y) || 0.001;
  const noseRelY = (nose.y - forehead.y) / faceHeight;
  const pitch = (noseRelY - 0.45) * 2; // centered around typical rest position

  // Roll: angle between eyes
  const roll = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);

  return { yaw, pitch, roll: radToDeg(roll) };
}

// ─── Gaze direction from iris landmarks ─────────────────────────────────────────
function estimateGaze(faceLandmarks) {
  if (!faceLandmarks || faceLandmarks.length < 475) return null;

  const leftIris = faceLandmarks[FACE.leftIrisCenter];
  const rightIris = faceLandmarks[FACE.rightIrisCenter];
  const leftInner = faceLandmarks[FACE.leftEyeInner];
  const leftOuter = faceLandmarks[FACE.leftEyeOuter];
  const rightInner = faceLandmarks[FACE.rightEyeInner];
  const rightOuter = faceLandmarks[FACE.rightEyeOuter];

  if (!leftIris || !rightIris || !leftInner || !leftOuter || !rightInner || !rightOuter) return null;

  // Horizontal gaze: where is iris within eye bounds (0=looking left, 1=looking right)
  const leftEyeWidth = Math.abs(leftOuter.x - leftInner.x) || 0.001;
  const leftGazeX = (leftIris.x - leftOuter.x) / leftEyeWidth;

  const rightEyeWidth = Math.abs(rightInner.x - rightOuter.x) || 0.001;
  const rightGazeX = (rightIris.x - rightOuter.x) / rightEyeWidth;

  const gazeX = (leftGazeX + rightGazeX) / 2; // 0.5 = looking straight

  // Vertical gaze from iris Y relative to eye center
  const leftEyeCenterY = (leftInner.y + leftOuter.y) / 2;
  const rightEyeCenterY = (rightInner.y + rightOuter.y) / 2;
  const leftGazeY = (leftIris.y - leftEyeCenterY) / (leftEyeWidth * 0.6 || 0.001);
  const rightGazeY = (rightIris.y - rightEyeCenterY) / (rightEyeWidth * 0.6 || 0.001);
  const gazeY = (leftGazeY + rightGazeY) / 2;

  // Score: how centered is the gaze (1.0 = looking directly at camera)
  const deviationX = Math.abs(gazeX - 0.5) * 2;
  const deviationY = Math.abs(gazeY) * 2;
  const score = clamp01(1 - Math.hypot(deviationX, deviationY));

  return { x: gazeX, y: gazeY, score };
}

// ─── Hand openness score ────────────────────────────────────────────────────────
function handOpenness(landmarks) {
  if (!landmarks || landmarks.length < 21) return 0;
  const wrist = landmarks[HAND.wrist];
  const tips = [HAND.thumbTip, HAND.indexTip, HAND.middleTip, HAND.ringTip, HAND.pinkyTip];
  const mcps = [HAND.wrist, HAND.indexMcp, HAND.middleMcp, HAND.ringMcp, HAND.pinkyMcp];

  let openCount = 0;
  for (let i = 0; i < tips.length; i++) {
    const tip = landmarks[tips[i]];
    const mcp = landmarks[mcps[i]];
    if (!tip || !mcp) continue;
    const tipDist = Math.hypot(tip.x - wrist.x, tip.y - wrist.y, (tip.z || 0) - (wrist.z || 0));
    const mcpDist = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y, (mcp.z || 0) - (wrist.z || 0));
    if (tipDist > mcpDist * 1.1) openCount++;
  }
  return openCount / tips.length; // 0-1 scale
}

// ─── Detect face-touching ───────────────────────────────────────────────────────
function isTouchingFace(poseLandmarks, handLandmarks) {
  if (!poseLandmarks || !handLandmarks || handLandmarks.length === 0) return false;
  const nose = poseLandmarks[POSE.nose];
  if (!nose) return false;

  for (const hand of handLandmarks) {
    if (!hand || hand.length < 21) continue;
    const wrist = hand[HAND.wrist];
    const indexTip = hand[HAND.indexTip];
    if (!wrist || !indexTip) continue;
    // Check if any key hand point is near the face area
    const dist = Math.hypot(indexTip.x - nose.x, indexTip.y - nose.y);
    if (dist < 0.15) return true; // Within ~15% of frame = near face
  }
  return false;
}


// ═══════════════════════════════════════════════════════════════════════════════
// MLBodyAnalyzer — Main exported class (backwards-compatible API)
// ═══════════════════════════════════════════════════════════════════════════════
export class MLBodyAnalyzer {
  constructor(options = {}) {
    this.video = null;
    this.faceLandmarker = null;
    this.poseLandmarker = null;
    this.handLandmarker = null;
    this.interval = null;
    this.rafId = null;
    this.samples = [];
    this.initialized = false;
    this.initError = null;
    this.poseListener = null;
    this.targetFps = options.targetFps || 30;
    this.lastTimestamp = -1;

    // Temporal analysis buffers
    this.headPoseBuffer = new RollingBuffer(60);
    this.gazeBuffer = new RollingBuffer(60);
    this.motionBuffer = new RollingBuffer(60);
    this.handActivityBuffer = new RollingBuffer(60);
    this.prevNose = null;
    this.prevShoulderWidth = 0;

    // Engagement metrics
    this.nods = 0;
    this.headShakes = 0;
    this.faceTouches = 0;
    this.smileFrames = 0;
    this.totalVisibleFrames = 0;
  }

  setPoseListener(listener) {
    this.poseListener = listener;
  }

  setTargetFps(fps) {
    const nextFps = Number.isFinite(fps) ? Math.max(4, Math.min(30, Math.round(fps))) : this.targetFps;
    this.targetFps = nextFps;
    // Loop will pick up the new fps on next iteration
  }

  async init(video) {
    this.video = video;
    if (this.initialized) return true;

    try {
      const vision = await import('@mediapipe/tasks-vision');
      const { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      // Initialize all three landmarkers in parallel
      const [faceLandmarker, poseLandmarker, handLandmarker] = await Promise.all([
        FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }),
        PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.4,
          minHandPresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        }),
      ]);

      this.faceLandmarker = faceLandmarker;
      this.poseLandmarker = poseLandmarker;
      this.handLandmarker = handLandmarker;
      this.initialized = true;
      this.initError = null;
      return true;
    } catch (error) {
      console.error('[HolisticAnalyzer] Init failed:', error);
      this.initError = error;
      return false;
    }
  }

  async start() {
    if (this.interval || this.rafId) return true;
    if (!this.video || this.video.readyState < 2) return false;

    const ready = this.initialized || await this.init(this.video);
    if (!ready) return false;

    this.samples = [];
    this.prevNose = null;
    this.headPoseBuffer.clear();
    this.gazeBuffer.clear();
    this.motionBuffer.clear();
    this.handActivityBuffer.clear();
    this.nods = 0;
    this.headShakes = 0;
    this.faceTouches = 0;
    this.smileFrames = 0;
    this.totalVisibleFrames = 0;
    this.lastTimestamp = -1;

    // Warmup: run each model once with a yield between them so the browser
    // stays responsive while GPU shaders compile on the first inference.
    await this.warmup();

    this.startLoop();
    return true;
  }

  async warmup() {
    if (!this.video || this.video.readyState < 2) return;
    const ts = performance.now();
    // Yield to browser between each warmup call
    const yieldFrame = () => new Promise(r => setTimeout(r, 0));

    try {
      if (this.poseLandmarker) {
        this.poseLandmarker.detectForVideo(this.video, ts);
      }
    } catch (e) { /* first call may fail, that's fine */ }
    await yieldFrame();

    try {
      if (this.faceLandmarker) {
        this.faceLandmarker.detectForVideo(this.video, ts + 1);
      }
    } catch (e) {}
    await yieldFrame();

    try {
      if (this.handLandmarker) {
        this.handLandmarker.detectForVideo(this.video, ts + 2);
      }
    } catch (e) {}
    await yieldFrame();

    this.lastTimestamp = ts + 3;
  }

  startLoop() {
    // Use rAF-gated sequential loop instead of setInterval.
    // This prevents frame stacking — the next detection only starts
    // after the previous one completes AND the browser has painted.
    let lastFrameTime = 0;
    const minInterval = Math.max(33, Math.round(1000 / this.targetFps));

    const tick = () => {
      const now = performance.now();
      if (now - lastFrameTime >= minInterval) {
        lastFrameTime = now;
        this.captureFrame().catch(() => {});
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
  }

  async dispose() {
    this.stop();
    if (this.faceLandmarker) { this.faceLandmarker.close(); this.faceLandmarker = null; }
    if (this.poseLandmarker) { this.poseLandmarker.close(); this.poseLandmarker = null; }
    if (this.handLandmarker) { this.handLandmarker.close(); this.handLandmarker = null; }
    this.initialized = false;
  }


  // ─── Main frame capture ─────────────────────────────────────────────────────
  async captureFrame() {
    if (!this.video || this.video.readyState < 2) return;

    const now = performance.now();
    // MediaPipe requires strictly increasing timestamps
    if (now <= this.lastTimestamp) return;
    this.lastTimestamp = now;

    // Run detectors sequentially to avoid blocking the main thread
    // with three heavy WASM calls stacked together.
    let faceResult = null, poseResult = null, handResult = null;

    try {
      if (this.poseLandmarker) {
        poseResult = this.poseLandmarker.detectForVideo(this.video, now);
      }
    } catch (e) { /* pose detection failed this frame */ }

    try {
      if (this.faceLandmarker) {
        faceResult = this.faceLandmarker.detectForVideo(this.video, now);
      }
    } catch (e) { /* face detection failed this frame */ }

    try {
      if (this.handLandmarker) {
        handResult = this.handLandmarker.detectForVideo(this.video, now);
      }
    } catch (e) { /* hand detection failed this frame */ }

    // Extract landmarks
    const faceLandmarks = faceResult?.faceLandmarks?.[0] || null;
    const faceBlendshapes = faceResult?.faceBlendshapes?.[0]?.categories || null;
    const poseLandmarks = poseResult?.landmarks?.[0] || null;
    const poseWorldLandmarks = poseResult?.worldLandmarks?.[0] || null;
    const handLandmarksList = handResult?.landmarks || [];

    const hasFace = faceLandmarks && faceLandmarks.length >= 400;
    const hasPose = poseLandmarks && poseLandmarks.length >= 25;
    const hasHands = handLandmarksList.length > 0;
    const poseVisible = hasFace || hasPose;

    if (!poseVisible) {
      this.samples.push({ eyeContact: 0, posture: 0, stillness: 0, gestures: 0, engagement: 0, poseVisible: false });
      if (this.poseListener) {
        this.poseListener({ keypoints: [], faceMesh: null, hands: null, width: this.video.videoWidth, height: this.video.videoHeight, visible: false });
      }
      return;
    }

    this.totalVisibleFrames++;

    // ─── Eye contact / Gaze ─────────────────────────────────────────────────
    let eyeContact = 50;
    let gazeData = null;
    let headPose = null;

    if (hasFace) {
      gazeData = estimateGaze(faceLandmarks);
      headPose = estimateHeadPose(faceLandmarks);

      if (gazeData) {
        this.gazeBuffer.push(gazeData.score);
        // Combine iris-based gaze with head orientation
        const gazeScore = gazeData.score;
        const headBonus = headPose ? clamp01(1 - Math.abs(headPose.yaw) - Math.abs(headPose.pitch) * 0.5) : 0.5;
        eyeContact = Math.round(lerp(gazeScore, headBonus, 0.3) * 100);
      } else if (headPose) {
        // Fallback: head orientation only
        const centered = clamp01(1 - Math.abs(headPose.yaw) * 1.5 - Math.abs(headPose.pitch));
        eyeContact = Math.round(centered * 100);
      }

      if (headPose) {
        this.headPoseBuffer.push(headPose);
        this.detectNodding();
        this.detectShaking();
      }

      // Smile / engagement from blendshapes
      if (faceBlendshapes) {
        const smile = faceBlendshapes.find(b => b.categoryName === 'mouthSmileLeft' || b.categoryName === 'mouthSmileRight');
        if (smile && smile.score > 0.3) this.smileFrames++;
      }
    }

    // ─── Posture ──────────────────────────────────────────────────────────────
    let posture = 50;
    let shoulderWidth = this.prevShoulderWidth || 60;

    if (hasPose) {
      const leftShoulder = poseLandmarks[POSE.leftShoulder];
      const rightShoulder = poseLandmarks[POSE.rightShoulder];
      const leftHip = poseLandmarks[POSE.leftHip];
      const rightHip = poseLandmarks[POSE.rightHip];

      if (leftShoulder && rightShoulder) {
        shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x) * this.video.videoWidth;
        this.prevShoulderWidth = shoulderWidth;

        // Shoulder level
        const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / (Math.abs(leftShoulder.x - rightShoulder.x) || 0.001);
        const shoulderLevel = clamp01(1 - shoulderTilt / 0.3);

        // Torso upright
        let torsoUpright = 0.65;
        if (leftHip && rightHip) {
          const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
          const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
          const midHipX = (leftHip.x + rightHip.x) / 2;
          const midHipY = (leftHip.y + rightHip.y) / 2;
          const lean = Math.abs(Math.atan2(midShoulderX - midHipX, midShoulderY - midHipY));
          torsoUpright = clamp01(1 - lean / (Math.PI / 5));
        }

        // Shoulder openness (wider = more confident)
        const frameWidth = this.video.videoWidth || 640;
        const shoulderRatio = shoulderWidth / frameWidth;
        const openness = clamp01(shoulderRatio / 0.35);

        posture = Math.round((0.4 * shoulderLevel + 0.35 * torsoUpright + 0.25 * openness) * 100);
      }
    }

    // ─── Stillness / Motion ───────────────────────────────────────────────────
    let stillness = 70;
    const nose = hasPose ? poseLandmarks[POSE.nose] : (hasFace ? faceLandmarks[FACE.noseTip] : null);

    if (nose && this.prevNose) {
      const frameMotion = Math.hypot(
        (nose.x - this.prevNose.x) * this.video.videoWidth,
        (nose.y - this.prevNose.y) * this.video.videoHeight
      );
      const normalizedMotion = clamp01(frameMotion / (shoulderWidth * 0.12));
      stillness = Math.round((1 - normalizedMotion) * 100);
      this.motionBuffer.push(normalizedMotion);
    }
    if (nose) this.prevNose = { x: nose.x, y: nose.y };

    // ─── Gesture scoring ──────────────────────────────────────────────────────
    let gestures = 60;
    if (hasHands) {
      let totalOpenness = 0;
      let handCount = 0;
      for (const handLm of handLandmarksList) {
        const open = handOpenness(handLm);
        totalOpenness += open;
        handCount++;
      }
      const avgOpenness = handCount > 0 ? totalOpenness / handCount : 0;

      // Face touching penalty
      const touching = isTouchingFace(poseLandmarks, handLandmarksList);
      if (touching) this.faceTouches++;

      // Open palms = confident, closed = tense, face-touching = nervous
      gestures = Math.round(clamp01(avgOpenness * 0.7 + (touching ? -0.3 : 0.3)) * 100);
      this.handActivityBuffer.push(avgOpenness);
    } else {
      // No hands visible — neutral score
      gestures = 55;
      this.handActivityBuffer.push(0.5);
    }

    // ─── Engagement composite ─────────────────────────────────────────────────
    const engagement = this.computeEngagement(eyeContact, posture, stillness, gestures);

    this.samples.push({ eyeContact, posture, stillness, gestures, engagement, poseVisible: true });

    // ─── Emit to listener (backwards-compatible keypoints + new data) ─────────
    if (this.poseListener) {
      const keypoints = this.buildKeypoints(poseLandmarks, faceLandmarks);
      this.poseListener({
        keypoints,
        faceMesh: hasFace ? faceLandmarks : null,
        faceBlendshapes: faceBlendshapes || null,
        hands: hasHands ? handLandmarksList : null,
        headPose,
        gaze: gazeData,
        width: this.video.videoWidth,
        height: this.video.videoHeight,
        visible: poseVisible,
      });
    }
  }


  // ─── Temporal pattern detection ─────────────────────────────────────────────
  detectNodding() {
    const recent = this.headPoseBuffer.last(20);
    if (recent.length < 15) return;
    const pitches = recent.map(h => h.pitch);
    let direction = 0;
    let changes = 0;
    for (let i = 1; i < pitches.length; i++) {
      const diff = pitches[i] - pitches[i - 1];
      if (Math.abs(diff) > 0.02) {
        const newDir = diff > 0 ? 1 : -1;
        if (direction !== 0 && newDir !== direction) changes++;
        direction = newDir;
      }
    }
    if (changes >= 3) this.nods++;
  }

  detectShaking() {
    const recent = this.headPoseBuffer.last(20);
    if (recent.length < 15) return;
    const yaws = recent.map(h => h.yaw);
    let direction = 0;
    let changes = 0;
    for (let i = 1; i < yaws.length; i++) {
      const diff = yaws[i] - yaws[i - 1];
      if (Math.abs(diff) > 0.02) {
        const newDir = diff > 0 ? 1 : -1;
        if (direction !== 0 && newDir !== direction) changes++;
        direction = newDir;
      }
    }
    if (changes >= 3) this.headShakes++;
  }

  computeEngagement(eyeContact, posture, stillness, gestures) {
    // Weighted composite of all metrics
    const base = (eyeContact * 0.35 + posture * 0.25 + stillness * 0.2 + gestures * 0.2) / 100;

    // Bonuses for active engagement signals
    let bonus = 0;
    if (this.nods > 0) bonus += 0.05;
    if (this.smileFrames > this.totalVisibleFrames * 0.1) bonus += 0.05;

    // Penalties
    let penalty = 0;
    if (this.faceTouches > 3) penalty += 0.05;
    const recentMotion = this.motionBuffer.last(30);
    const avgMotion = avg(recentMotion);
    if (avgMotion > 0.4) penalty += 0.05; // excessive fidgeting

    return Math.round(clamp01(base + bonus - penalty) * 100);
  }

  // ─── Build backwards-compatible keypoints array ─────────────────────────────
  buildKeypoints(poseLandmarks, faceLandmarks) {
    const keypoints = [];
    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;

    // Pose landmarks → named keypoints (compatible with old POSE_CONNECTIONS)
    const poseNames = [
      'nose', 'left_eye_inner', 'left_eye', 'left_eye_outer',
      'right_eye_inner', 'right_eye', 'right_eye_outer',
      'left_ear', 'right_ear', 'left_mouth', 'right_mouth',
      'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
      'left_wrist', 'right_wrist', 'left_pinky', 'right_pinky',
      'left_index', 'right_index', 'left_thumb', 'right_thumb',
      'left_hip', 'right_hip', 'left_knee', 'right_knee',
      'left_ankle', 'right_ankle', 'left_heel', 'right_heel',
      'left_foot', 'right_foot',
    ];

    if (poseLandmarks) {
      for (let i = 0; i < poseLandmarks.length && i < poseNames.length; i++) {
        const lm = poseLandmarks[i];
        if (!lm) continue;
        keypoints.push({
          name: poseNames[i],
          x: lm.x * w,
          y: lm.y * h,
          z: lm.z || 0,
          score: lm.visibility ?? 0.9,
        });
      }
    } else if (faceLandmarks) {
      // Minimal keypoints from face only
      const facePts = [
        { idx: FACE.noseTip, name: 'nose' },
        { idx: FACE.leftEyeOuter, name: 'left_eye' },
        { idx: FACE.rightEyeOuter, name: 'right_eye' },
        { idx: FACE.leftEyeInner, name: 'left_ear' },
        { idx: FACE.rightEyeInner, name: 'right_ear' },
      ];
      for (const { idx, name } of facePts) {
        const lm = faceLandmarks[idx];
        if (!lm) continue;
        keypoints.push({ name, x: lm.x * w, y: lm.y * h, z: lm.z || 0, score: 0.9 });
      }
    }

    return keypoints.filter(kp => (kp.score ?? 1) >= MIN_CONFIDENCE);
  }

  // ─── Results (backwards-compatible + enhanced) ──────────────────────────────
  getResults() {
    if (this.samples.length === 0) {
      return { eyeContact: 0, posture: 0, stillness: 0, gestures: 0, engagement: 0, overall: 0, feedback: ['No camera data captured'], detailed: null };
    }

    const visible = this.samples.filter(s => s.poseVisible);
    if (!visible.length) {
      return { eyeContact: 25, posture: 20, stillness: 50, gestures: 50, engagement: 30, overall: 32, feedback: ['Body landmarks not detected. Improve lighting and camera angle.'], detailed: null };
    }

    const eyeContact = Math.round(avg(visible.map(s => s.eyeContact)));
    const posture = Math.round(avg(visible.map(s => s.posture)));
    const stillness = Math.round(avg(visible.map(s => s.stillness)));
    const gestures = Math.round(avg(visible.map(s => s.gestures)));
    const engagement = Math.round(avg(visible.map(s => s.engagement)));
    const overall = Math.round((eyeContact * 0.3 + posture * 0.25 + stillness * 0.2 + gestures * 0.1 + engagement * 0.15));

    const feedback = [];

    // Eye contact feedback
    if (eyeContact >= 75) feedback.push('Excellent eye contact — strong camera focus and natural gaze');
    else if (eyeContact >= 55) feedback.push('Good eye contact, try to reduce looking away from camera');
    else feedback.push('Look directly at the camera more often to build connection');

    // Posture feedback
    if (posture >= 75) feedback.push('Great posture — upright, open, and professional');
    else if (posture >= 55) feedback.push('Posture is okay — try sitting a bit more upright with shoulders back');
    else feedback.push('Sit upright with shoulders level and open for stronger presence');

    // Stillness feedback
    if (stillness >= 75) feedback.push('Excellent movement control — steady and confident');
    else if (stillness >= 55) feedback.push('Moderate fidgeting detected — try to reduce unnecessary movement');
    else feedback.push('Significant fidgeting detected — practice being still while speaking');

    // Gesture feedback
    if (gestures >= 70) feedback.push('Natural hand gestures — expressive without distraction');
    else if (this.faceTouches > 3) feedback.push('Avoid touching your face — it signals nervousness');
    else feedback.push('Consider using more open hand gestures to emphasize points');

    // Engagement feedback
    if (this.nods > 2) feedback.push('Good use of head nods — shows active listening');
    if (this.smileFrames > this.totalVisibleFrames * 0.15) feedback.push('Warm facial expressions create positive rapport');

    const detailed = {
      gazeAccuracy: eyeContact,
      headNods: this.nods,
      headShakes: this.headShakes,
      faceTouches: this.faceTouches,
      smilePercentage: this.totalVisibleFrames > 0 ? Math.round((this.smileFrames / this.totalVisibleFrames) * 100) : 0,
      avgMotion: avg(this.motionBuffer.data),
      handOpenness: avg(this.handActivityBuffer.data),
      totalFrames: this.samples.length,
      visibleFrames: visible.length,
    };

    return { eyeContact, posture, stillness, gestures, engagement, overall, feedback, detailed };
  }
}
