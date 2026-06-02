const MIN_CONFIDENCE = 0.3;

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const avg = (values) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

export class MLBodyAnalyzer {
  constructor(options = {}) {
    this.video = null;
    this.detector = null;
    this.interval = null;
    this.samples = [];
    this.prevNose = null;
    this.initialized = false;
    this.initError = null;
    this.poseListener = null;
    this.targetFps = options.targetFps || 30;
  }

  setPoseListener(listener) {
    this.poseListener = listener;
  }

  setTargetFps(fps) {
    const nextFps = Number.isFinite(fps) ? Math.max(4, Math.min(30, Math.round(fps))) : this.targetFps;
    this.targetFps = nextFps;
    if (!this.interval) return;
    clearInterval(this.interval);
    this.startLoop();
  }

  startLoop() {
    const intervalMs = Math.max(33, Math.round(1000 / this.targetFps));
    this.interval = setInterval(() => {
      this.captureFrame().catch(() => {});
    }, intervalMs);
  }

  async init(video) {
    this.video = video;
    if (this.initialized) return true;

    try {
      const tf = await import('@tensorflow/tfjs');
      const poseDetection = await import('@tensorflow-models/pose-detection');

      await tf.ready();
      if (tf.getBackend() !== 'webgl') {
        try {
          await tf.setBackend('webgl');
        } catch {
          await tf.setBackend('cpu');
        }
      }

      this.detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
          enableSmoothing: true
        }
      );
      this.has3D = false;

      this.initialized = true;
      this.initError = null;
      return true;
    } catch (error) {
      this.initError = error;
      return false;
    }
  }

  async start() {
    if (this.interval) return true;
    if (!this.video || this.video.readyState < 2) return false;

    const ready = this.initialized || await this.init(this.video);
    if (!ready || !this.detector) return false;

    this.samples = [];
    this.prevNose = null;
    this.startLoop();
    return true;
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  async dispose() {
    this.stop();
    if (this.detector?.dispose) this.detector.dispose();
    this.detector = null;
    this.initialized = false;
  }

  getResults() {
    if (this.samples.length === 0) {
      return { eyeContact: 0, posture: 0, stillness: 0, overall: 0, feedback: ['No camera data captured'] };
    }

    const visible = this.samples.filter((s) => s.poseVisible);
    if (!visible.length) {
      return { eyeContact: 25, posture: 20, stillness: 50, overall: 32, feedback: ['Body landmarks not detected. Improve lighting and camera angle.'] };
    }

    const eyeContact = Math.round(avg(visible.map((s) => s.eyeContact)));
    const posture = Math.round(avg(visible.map((s) => s.posture)));
    const stillness = Math.round(avg(visible.map((s) => s.stillness)));
    const overall = Math.round((eyeContact + posture + stillness) / 3);

    const feedback = [];
    if (eyeContact >= 70) feedback.push('Strong camera focus and eye-line consistency');
    else feedback.push('Keep your face centered and maintain stronger camera focus');

    if (posture >= 70) feedback.push('Posture looked stable and professional');
    else feedback.push('Sit upright and keep shoulders level for stronger presence');

    if (stillness >= 70) feedback.push('Movement control was steady and confident');
    else feedback.push('Reduce upper-body motion and fidgeting while speaking');

    return { eyeContact, posture, stillness, overall, feedback };
  }

  async captureFrame() {
    if (!this.video || this.video.readyState < 2 || !this.detector) return;

    const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
    const pose = poses?.[0];
    if (!pose?.keypoints?.length) {
      this.samples.push({ eyeContact: 0, posture: 0, stillness: 0, poseVisible: false });
      if (this.poseListener) {
        this.poseListener({
          keypoints: [],
          width: this.video.videoWidth,
          height: this.video.videoHeight,
          visible: false
        });
      }
      return;
    }

    try {
      if (!this._poseLogged) {
        const safeStringify = (obj) => {
          const seen = new WeakSet();
          return JSON.stringify(obj, function (k, v) {
            // convert TypedArrays to arrays
            if (v && (v.buffer instanceof ArrayBuffer) && typeof v.length === 'number') {
              try { return Array.from(v); } catch { return String(v); }
            }
            if (v && typeof v === 'object') {
              if (seen.has(v)) return '[Circular]';
              seen.add(v);
            }
            if (typeof v === 'function') return `[Function:${v.name}]`;
            return v;
          }, 2);
        };
        try {
          console.info('raw pose object', safeStringify(pose));
        } catch (e) {
          try { console.info('raw pose object keys', Object.keys(pose || {})); } catch {};
        }
        this._poseLogged = true;
      }
    } catch (e) {}

    const kp = this.toKeypointMap(pose.keypoints);
    const nose = this.pick(kp, ['nose']);
    const leftEye = this.pick(kp, ['left_eye', 'leftEye']);
    const rightEye = this.pick(kp, ['right_eye', 'rightEye']);
    const leftShoulder = this.pick(kp, ['left_shoulder', 'leftShoulder']);
    const rightShoulder = this.pick(kp, ['right_shoulder', 'rightShoulder']);
    const leftHip = this.pick(kp, ['left_hip', 'leftHip']);
    const rightHip = this.pick(kp, ['right_hip', 'rightHip']);

    const shouldersVisible = leftShoulder && rightShoulder;
    const hipsVisible = leftHip && rightHip;
    const faceVisible = nose && leftEye && rightEye;
    const poseVisible = shouldersVisible || faceVisible;

    let eyeContact = 45;
    if (faceVisible) {
      const centerX = this.video.videoWidth / 2;
      const centerY = this.video.videoHeight / 2;
      const eyeMidX = (leftEye.x + rightEye.x) / 2;
      const eyeMidY = (leftEye.y + rightEye.y) / 2;
      const centerDistance = Math.hypot(eyeMidX - centerX, eyeMidY - centerY);
      const diagonal = Math.hypot(this.video.videoWidth, this.video.videoHeight);
      const centered = clamp01(1 - centerDistance / (diagonal * 0.22));

      const eyeWidth = Math.max(1, Math.abs(leftEye.x - rightEye.x));
      const tilt = Math.abs(leftEye.y - rightEye.y) / eyeWidth;
      const levelEyes = clamp01(1 - tilt / 0.22);

      eyeContact = Math.round((0.75 * centered + 0.25 * levelEyes) * 100);
    }

    let posture = 40;
    let shoulderWidth = 60;
    if (shouldersVisible) {
      shoulderWidth = Math.max(20, Math.abs(leftShoulder.x - rightShoulder.x));
      const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth;
      const shoulderLevel = clamp01(1 - shoulderTilt / 0.3);

      let torsoUpright = 0.6;
      if (hipsVisible) {
        const midShoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
        const midHip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
        const leaning = Math.abs(Math.atan2(midShoulder.x - midHip.x, midShoulder.y - midHip.y));
        torsoUpright = clamp01(1 - leaning / (Math.PI / 6));
      }

      posture = Math.round((0.55 * shoulderLevel + 0.45 * torsoUpright) * 100);
    }

    let stillness = 70;
    if (nose && this.prevNose) {
      const frameMotion = Math.hypot(nose.x - this.prevNose.x, nose.y - this.prevNose.y);
      const normalized = clamp01(frameMotion / (shoulderWidth * 0.15));
      stillness = Math.round((1 - normalized) * 100);
    }
    if (nose) this.prevNose = { x: nose.x, y: nose.y };

    this.samples.push({ eyeContact, posture, stillness, poseVisible });

    // Provide keypoints to listener with optional z (3D) when available. If
    // the detector doesn't provide z, synthesize a coarse depth estimate from
    // shoulder width (smaller shoulder width -> farther away -> larger z).
    let keypointsOut = pose.keypoints.map((pt, idx) => ({ ...pt, name: pt.name || pt.part || pt.label || `kp${idx}` }));
    let estZ = 0;
    if (leftShoulder && rightShoulder && this.video && this.video.videoWidth) {
      const sWidth = Math.abs(leftShoulder.x - rightShoulder.x);
      const diag = Math.max(1, this.video.videoWidth);
      // Normalize: shoulder width relative to expected frontal width (approx 0.35 of video)
      const rel = clamp01(sWidth / (diag * 0.35));
      // map to [-1,1] where -1 is close, +1 is far
      estZ = (0.5 - rel) * 2;
    }

    keypointsOut = keypointsOut.map(k => {
      const out = { ...k };
      try {
        if (typeof out.x === 'number' && typeof out.y === 'number') {
          if (out.x <= 1 && out.y <= 1) {
            out.x = out.x * (this.video.videoWidth || out.width || this.video.width || 640);
            out.y = out.y * (this.video.videoHeight || out.height || this.video.height || 480);
          }
        }
      } catch {}

      if (typeof out.z !== 'number') out.z = estZ;
      return out;
    });

    if (this.poseListener) {
      this.poseListener({
        keypoints: keypointsOut.filter((point) => (point?.score ?? 1) >= MIN_CONFIDENCE),
        width: this.video.videoWidth,
        height: this.video.videoHeight,
        visible: poseVisible
      });
    }
  }

  toKeypointMap(keypoints) {
    return keypoints.reduce((map, keypoint) => {
      if (!keypoint) return map;
      const name = keypoint.name || keypoint.part || keypoint.label;
      if (!name) return map;
      if ((keypoint.score ?? 1) >= MIN_CONFIDENCE) map[name] = { ...keypoint, name };
      return map;
    }, {});
  }

  pick(map, names) {
    for (const name of names) {
      if (map[name]) return map[name];
    }
    return null;
  }
}