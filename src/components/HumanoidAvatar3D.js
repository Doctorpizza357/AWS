/**
 * HumanoidAvatar3D — Real-time 3D head avatar driven by MediaPipe landmarks.
 *
 * Uses the three.js facecap.glb model (MIT licensed).
 * This model has all 52 ARKit face blendshapes.
 *
 * To swap models: replace public/models/facecap.glb with any GLB that has
 * ARKit blendshapes (e.g. from Sketchfab, Mixamo + Blender, etc.)
 *
 * Props:
 *   - poseFrame: current frame data from MLBodyAnalyzer poseListener
 *   - quality: 'low' | 'high'
 *   - width/height: container size
 */
import React, { useRef, useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// ─── Model path ─────────────────────────────────────────────────────────────────
const MODEL_URL = '/models/facecap.glb';

// ─── Blendshape mapping (MediaPipe categoryName → facecap.glb morph target name)
// MediaPipe uses camelCase+Left/Right, model uses camelCase+_L/_R
const MEDIAPIPE_TO_MODEL = {
  browInnerUp: 'browInnerUp',
  browDownLeft: 'browDown_L',
  browDownRight: 'browDown_R',
  browOuterUpLeft: 'browOuterUp_L',
  browOuterUpRight: 'browOuterUp_R',
  eyeLookUpLeft: 'eyeLookUp_L',
  eyeLookUpRight: 'eyeLookUp_R',
  eyeLookDownLeft: 'eyeLookDown_L',
  eyeLookDownRight: 'eyeLookDown_R',
  eyeLookInLeft: 'eyeLookIn_L',
  eyeLookInRight: 'eyeLookIn_R',
  eyeLookOutLeft: 'eyeLookOut_L',
  eyeLookOutRight: 'eyeLookOut_R',
  eyeBlinkLeft: 'eyeBlink_L',
  eyeBlinkRight: 'eyeBlink_R',
  eyeSquintLeft: 'eyeSquint_L',
  eyeSquintRight: 'eyeSquint_R',
  eyeWideLeft: 'eyeWide_L',
  eyeWideRight: 'eyeWide_R',
  cheekPuff: 'cheekPuff',
  cheekSquintLeft: 'cheekSquint_L',
  cheekSquintRight: 'cheekSquint_R',
  noseSneerLeft: 'noseSneer_L',
  noseSneerRight: 'noseSneer_R',
  jawOpen: 'jawOpen',
  jawForward: 'jawForward',
  jawLeft: 'jawLeft',
  jawRight: 'jawRight',
  mouthFunnel: 'mouthFunnel',
  mouthPucker: 'mouthPucker',
  mouthLeft: 'mouthLeft',
  mouthRight: 'mouthRight',
  mouthRollUpper: 'mouthRollUpper',
  mouthRollLower: 'mouthRollLower',
  mouthShrugUpper: 'mouthShrugUpper',
  mouthShrugLower: 'mouthShrugLower',
  mouthClose: 'mouthClose',
  mouthSmileLeft: 'mouthSmile_L',
  mouthSmileRight: 'mouthSmile_R',
  mouthFrownLeft: 'mouthFrown_L',
  mouthFrownRight: 'mouthFrown_R',
  mouthDimpleLeft: 'mouthDimple_L',
  mouthDimpleRight: 'mouthDimple_R',
  mouthUpperUpLeft: 'mouthUpperUp_L',
  mouthUpperUpRight: 'mouthUpperUp_R',
  mouthLowerDownLeft: 'mouthLowerDown_L',
  mouthLowerDownRight: 'mouthLowerDown_R',
  mouthPressLeft: 'mouthPress_L',
  mouthPressRight: 'mouthPress_R',
  mouthStretchLeft: 'mouthStretch_L',
  mouthStretchRight: 'mouthStretch_R',
  tongueOut: 'tongueOut',
};

// Smoothing
const LERP_LOW = 0.4;
const LERP_HIGH = 0.6;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ─── Model loader (imperative, handles KTX2 + meshopt) ──────────────────────────
let cachedGltf = null;
let loadingPromise = null;

function loadModel(renderer) {
  if (cachedGltf) return Promise.resolve(cachedGltf);
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    // Set up KTX2 texture decoder
    const ktx2Loader = new KTX2Loader();
    ktx2Loader.setTranscoderPath('/basis/');
    ktx2Loader.detectSupport(renderer);
    loader.setKTX2Loader(ktx2Loader);

    // Set up meshopt decoder
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      MODEL_URL,
      (gltf) => {
        cachedGltf = gltf;
        try { ktx2Loader.dispose(); } catch (e) {}
        console.info('[Avatar3D] Model loaded successfully');
        resolve(gltf);
      },
      undefined,
      (error) => {
        console.error('[Avatar3D] Model load failed:', error);
        loadingPromise = null;
        cachedGltf = null;
        reject(error);
      }
    );
  });

  return loadingPromise;
}

// ─── Scene component that loads + drives the model ──────────────────────────────
function AvatarScene({ poseFrame, quality, onLoaded, onError }) {
  const { gl } = useThree();
  const groupRef = useRef();
  const morphMeshesRef = useRef([]);
  const headBoneRef = useRef(null);
  const smoothedHead = useRef({ yaw: 0, pitch: 0, roll: 0 });
  const smoothedMorphs = useRef({});
  const [sceneReady, setSceneReady] = useState(false);

  const lerp = quality === 'high' ? LERP_HIGH : LERP_LOW;

  // Load model on mount
  useEffect(() => {
    let cancelled = false;

    loadModel(gl).then((gltf) => {
      if (cancelled) return;

      const clone = gltf.scene.clone(true);
      const morphMeshes = [];
      let headBone = null;

      clone.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;

          // Enhance material — if textures failed to load, add a skin-tone material
          if (child.material) {
            const mat = child.material;
            // Check if the material has no map (textures didn't decode)
            if (!mat.map) {
              // Apply a realistic skin-tone PBR material
              child.material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(0.76, 0.57, 0.45), // warm skin tone
                roughness: 0.55,
                metalness: 0.0,
                envMapIntensity: 0.8,
                morphTargets: true,
                morphNormals: true,
              });
            } else {
              // Textures loaded — just enhance PBR properties
              mat.roughness = Math.min(mat.roughness || 0.6, 0.7);
              mat.metalness = Math.max(mat.metalness || 0, 0.0);
              mat.envMapIntensity = 1.0;
              mat.needsUpdate = true;
            }
          }
        }
        if (child.isBone) {
          const n = child.name.toLowerCase();
          if (n === 'head' || n.includes('head')) {
            headBone = child;
          }
        }
        if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
          morphMeshes.push(child);
        }
      });

      morphMeshesRef.current = morphMeshes;
      headBoneRef.current = headBone;

      if (groupRef.current) {
        // Clear any existing children
        while (groupRef.current.children.length) {
          groupRef.current.remove(groupRef.current.children[0]);
        }
        groupRef.current.add(clone);
      }

      // Auto-center and scale the model to fit view
      const box = new THREE.Box3().setFromObject(clone);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      // Move model so its center is at origin
      clone.position.sub(center);

      // Scale to fit ~2 units tall
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetSize = 2;
      const autoScale = targetSize / maxDim;
      clone.scale.multiplyScalar(autoScale);

      console.info('[Avatar3D] Scene ready. Morph meshes:', morphMeshes.length,
        'Head bone:', headBone?.name || 'none',
        'Blendshapes:', morphMeshes[0]?.morphTargetDictionary
          ? Object.keys(morphMeshes[0].morphTargetDictionary).join(', ')
          : 'none'
      );

      // Log bounding box for positioning debug
      console.info('[Avatar3D] Model bounds — center:', center.toArray().map(v => v.toFixed(3)),
        'size:', size.toArray().map(v => v.toFixed(3)),
        'autoScale:', autoScale.toFixed(3));

      setSceneReady(true);
      if (onLoaded) onLoaded();
    }).catch((err) => {
      if (!cancelled && onError) onError(err);
    });

    return () => { cancelled = true; };
  }, [gl, onLoaded, onError]);

  // Drive the model every frame
  useFrame(() => {
    if (!sceneReady || !poseFrame) return;

    const morphMeshes = morphMeshesRef.current;
    const headBone = headBoneRef.current;

    // ─── Head rotation ──────────────────────────────────────────────────
    if (poseFrame.headPose) {
      const hp = poseFrame.headPose;
      const targetYaw = -hp.yaw * 0.7;
      const targetPitch = -hp.pitch * 0.5;
      const targetRoll = -(hp.roll * Math.PI / 180) * 0.4;

      smoothedHead.current.yaw += (targetYaw - smoothedHead.current.yaw) * lerp;
      smoothedHead.current.pitch += (targetPitch - smoothedHead.current.pitch) * lerp;
      smoothedHead.current.roll += (targetRoll - smoothedHead.current.roll) * lerp;

      if (headBone) {
        headBone.rotation.y = smoothedHead.current.yaw;
        headBone.rotation.x = smoothedHead.current.pitch;
        headBone.rotation.z = smoothedHead.current.roll;
      } else if (groupRef.current) {
        groupRef.current.rotation.y = smoothedHead.current.yaw;
        groupRef.current.rotation.x = smoothedHead.current.pitch;
        groupRef.current.rotation.z = smoothedHead.current.roll;
      }
    }

    // ─── Face blendshapes ───────────────────────────────────────────────
    if (poseFrame.faceBlendshapes && morphMeshes.length > 0) {
      for (const mesh of morphMeshes) {
        const dict = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;
        if (!dict || !influences) continue;

        for (const bs of poseFrame.faceBlendshapes) {
          const modelName = MEDIAPIPE_TO_MODEL[bs.categoryName];
          if (!modelName) continue;
          const idx = dict[modelName];
          if (idx === undefined) continue;

          const key = `m_${modelName}`;
          if (smoothedMorphs.current[key] === undefined) smoothedMorphs.current[key] = 0;
          smoothedMorphs.current[key] += (bs.score - smoothedMorphs.current[key]) * lerp;
          influences[idx] = smoothedMorphs.current[key];
        }
      }
    }

    // ─── Eye gaze via look blendshapes ──────────────────────────────────
    if (poseFrame.gaze && morphMeshes.length > 0) {
      const { x, y } = poseFrame.gaze;
      const lookLeft = clamp((0.5 - x) * 2, 0, 1);
      const lookRight = clamp((x - 0.5) * 2, 0, 1);
      const lookDown = clamp(y * 2, 0, 1);
      const lookUp = clamp(-y * 2, 0, 1);

      for (const mesh of morphMeshes) {
        const dict = mesh.morphTargetDictionary;
        const influences = mesh.morphTargetInfluences;
        if (!dict || !influences) continue;

        const apply = (modelName, value) => {
          const idx = dict[modelName];
          if (idx === undefined) return;
          const key = `g_${modelName}`;
          if (smoothedMorphs.current[key] === undefined) smoothedMorphs.current[key] = 0;
          smoothedMorphs.current[key] += (value - smoothedMorphs.current[key]) * lerp;
          influences[idx] = smoothedMorphs.current[key];
        };

        apply('eyeLookIn_L', lookRight);
        apply('eyeLookOut_L', lookLeft);
        apply('eyeLookIn_R', lookLeft);
        apply('eyeLookOut_R', lookRight);
        apply('eyeLookDown_L', lookDown);
        apply('eyeLookDown_R', lookDown);
        apply('eyeLookUp_L', lookUp);
        apply('eyeLookUp_R', lookUp);
      }
    }
  });

  return <group ref={groupRef} />;
}

// ─── Camera ─────────────────────────────────────────────────────────────────────
function CameraSetup() {
  const { camera } = useThree();
  useEffect(() => {
    // Model is auto-centered at origin, scaled to ~2 units tall
    camera.position.set(0, 0, 3.5);
    camera.lookAt(0, 0, 0);
    camera.fov = 35;
    camera.near = 0.01;
    camera.far = 100;
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function HumanoidAvatar3D({ poseFrame, quality = 'low', width = 400, height = 500 }) {
  const [status, setStatus] = useState('loading'); // loading | ready | error

  const onLoaded = useCallback(() => setStatus('ready'), []);
  const onError = useCallback(() => setStatus('error'), []);

  if (status === 'error') {
    return (
      <div style={{
        width, height, borderRadius: 12, overflow: 'hidden', background: '#0a0e1a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8, color: 'rgba(255,255,255,0.6)', fontSize: 13
      }}>
        <span style={{ fontSize: 28 }}>🧍</span>
        <span>3D Avatar unavailable</span>
        <span style={{ fontSize: 11, opacity: 0.5 }}>Model failed to load.</span>
      </div>
    );
  }

  return (
    <div
      className="humanoid-avatar-3d"
      style={{ width, height, borderRadius: 12, overflow: 'hidden', background: '#1a1f2e', position: 'relative' }}
    >
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: '#00ffd0', fontSize: 12, zIndex: 2,
          background: '#1a1f2e'
        }}>
          Loading 3D model...
        </div>
      )}
      <Canvas
        shadows={quality === 'high'}
        dpr={quality === 'high' ? [1, 2] : [1, 1]}
        gl={{ antialias: quality === 'high', alpha: false, powerPreference: 'default' }}
        frameloop="always"
        style={{ opacity: status === 'ready' ? 1 : 0 }}
        onCreated={({ gl }) => { gl.setClearColor('#1a1f2e'); }}
      >
        <CameraSetup />

        {/* Three-point portrait lighting for realistic look */}
        <ambientLight intensity={0.3} />
        {/* Key light — main illumination from front-right */}
        <directionalLight
          position={[3, 4, 5]}
          intensity={2.0}
          castShadow={quality === 'high'}
          color="#fff5e6"
        />
        {/* Fill light — softer from left side */}
        <directionalLight position={[-3, 2, 2]} intensity={0.8} color="#e6f0ff" />
        {/* Rim/back light — edge definition */}
        <directionalLight position={[0, 2, -4]} intensity={1.0} color="#aaddff" />
        {/* Under-chin bounce */}
        <pointLight position={[0, -1, 2]} intensity={0.3} color="#ffe8d0" />

        <AvatarScene
          poseFrame={poseFrame}
          quality={quality}
          onLoaded={onLoaded}
          onError={onError}
        />

        {/* Always add environment for reflections/PBR */}
        <Environment preset="studio" />
      </Canvas>
    </div>
  );
}
