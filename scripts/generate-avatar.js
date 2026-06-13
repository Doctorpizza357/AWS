/**
 * Generate a procedural humanoid avatar GLB with:
 *   - Standard humanoid bone rig (compatible with Mixamo/RPM naming)
 *   - ARKit face blendshapes (52 shapes)
 *   - Head + upper body geometry (interview framing)
 *
 * Run: node scripts/generate-avatar.js
 * Output: public/models/avatar.glb
 *
 * REPLACING THIS MODEL:
 * Simply export a GLB from ReadyPlayerMe (add ?morphTargets=ARKit to URL)
 * or download from Mixamo, and save as public/models/avatar.glb
 * The component auto-detects bone naming conventions (Mixamo, RPM, generic).
 */
const THREE = require('three');
const { GLTFExporter } = require('three/examples/jsm/exporters/GLTFExporter.js');
const fs = require('fs');
const path = require('path');

// ARKit blendshape names (52 standard shapes)
const ARKIT_BLENDSHAPES = [
  'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
  'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
  'eyeBlinkLeft', 'eyeBlinkRight', 'eyeLookDownLeft', 'eyeLookDownRight',
  'eyeLookInLeft', 'eyeLookInRight', 'eyeLookOutLeft', 'eyeLookOutRight',
  'eyeLookUpLeft', 'eyeLookUpRight', 'eyeSquintLeft', 'eyeSquintRight',
  'eyeWideLeft', 'eyeWideRight',
  'jawForward', 'jawLeft', 'jawOpen', 'jawRight',
  'mouthClose', 'mouthDimpleLeft', 'mouthDimpleRight',
  'mouthFrownLeft', 'mouthFrownRight', 'mouthFunnel', 'mouthLeft',
  'mouthLowerDownLeft', 'mouthLowerDownRight',
  'mouthPressLeft', 'mouthPressRight', 'mouthPucker', 'mouthRight',
  'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
  'mouthSmileLeft', 'mouthSmileRight', 'mouthStretchLeft', 'mouthStretchRight',
  'mouthUpperUpLeft', 'mouthUpperUpRight',
  'noseSneerLeft', 'noseSneerRight',
];

function createHumanoidSkeleton() {
  // Create bones with standard naming
  const bones = [];
  const boneData = [
    { name: 'Hips', pos: [0, 0.95, 0], parent: -1 },
    { name: 'Spine', pos: [0, 0.1, 0], parent: 0 },
    { name: 'Spine1', pos: [0, 0.12, 0], parent: 1 },
    { name: 'Spine2', pos: [0, 0.12, 0], parent: 2 },
    { name: 'Neck', pos: [0, 0.14, 0], parent: 3 },
    { name: 'Head', pos: [0, 0.1, 0], parent: 4 },
    // Left arm
    { name: 'LeftShoulder', pos: [0.05, 0.12, 0], parent: 3 },
    { name: 'LeftArm', pos: [0.12, 0, 0], parent: 6 },
    { name: 'LeftForeArm', pos: [0.25, 0, 0], parent: 7 },
    { name: 'LeftHand', pos: [0.22, 0, 0], parent: 8 },
    // Right arm
    { name: 'RightShoulder', pos: [-0.05, 0.12, 0], parent: 3 },
    { name: 'RightArm', pos: [-0.12, 0, 0], parent: 10 },
    { name: 'RightForeArm', pos: [-0.25, 0, 0], parent: 11 },
    { name: 'RightHand', pos: [-0.22, 0, 0], parent: 12 },
    // Left leg
    { name: 'LeftUpLeg', pos: [0.09, -0.05, 0], parent: 0 },
    { name: 'LeftLeg', pos: [0, -0.42, 0], parent: 14 },
    { name: 'LeftFoot', pos: [0, -0.4, 0], parent: 15 },
    // Right leg
    { name: 'RightUpLeg', pos: [-0.09, -0.05, 0], parent: 0 },
    { name: 'RightLeg', pos: [0, -0.42, 0], parent: 17 },
    { name: 'RightFoot', pos: [0, -0.4, 0], parent: 18 },
    // Eyes
    { name: 'LeftEye', pos: [0.03, 0.06, 0.08], parent: 5 },
    { name: 'RightEye', pos: [-0.03, 0.06, 0.08], parent: 5 },
  ];

  for (const bd of boneData) {
    const bone = new THREE.Bone();
    bone.name = bd.name;
    bone.position.set(...bd.pos);
    bones.push(bone);
  }

  // Set up hierarchy
  for (let i = 0; i < boneData.length; i++) {
    if (boneData[i].parent >= 0) {
      bones[boneData[i].parent].add(bones[i]);
    }
  }

  return bones;
}

function createHeadMesh(bones) {
  // Create a head-shaped geometry (sphere + some deformation)
  const headGeo = new THREE.SphereGeometry(0.12, 24, 18);

  // Slightly elongate vertically for head shape
  const positions = headGeo.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // Elongate vertically
    positions.setY(i, y * 1.15);
    // Flatten back slightly
    if (z < -0.02) positions.setZ(i, z * 0.85);
    // Narrow chin
    if (y < -0.04) {
      const chinFactor = 1 - Math.abs(y + 0.04) * 2;
      positions.setX(i, x * (0.7 + chinFactor * 0.3));
    }
  }
  positions.needsUpdate = true;
  headGeo.computeVertexNormals();

  // Add morph targets (ARKit blendshapes)
  headGeo.morphAttributes.position = [];
  const basePositions = headGeo.attributes.position.clone();

  for (const shapeName of ARKIT_BLENDSHAPES) {
    const morphPositions = new Float32Array(basePositions.count * 3);

    for (let i = 0; i < basePositions.count; i++) {
      let dx = 0, dy = 0, dz = 0;
      const x = basePositions.getX(i);
      const y = basePositions.getY(i);
      const z = basePositions.getZ(i);

      // Apply subtle deformations based on blendshape name
      if (shapeName === 'jawOpen') {
        if (y < -0.04) { dy = -0.02 * Math.max(0, -y); }
      } else if (shapeName.includes('mouthSmile')) {
        if (y < 0 && y > -0.06 && Math.abs(x) > 0.02) {
          const side = shapeName.includes('Left') ? 1 : -1;
          if (x * side > 0) { dx = side * 0.01; dy = 0.01; }
        }
      } else if (shapeName.includes('eyeBlink')) {
        if (y > 0.03 && y < 0.09 && Math.abs(z) > 0.06) {
          const side = shapeName.includes('Left') ? 1 : -1;
          if (x * side > 0) { dy = -0.008; }
        }
      } else if (shapeName.includes('browDown')) {
        if (y > 0.06 && y < 0.12) {
          const side = shapeName.includes('Left') ? 1 : -1;
          if (x * side > 0) { dy = -0.006; }
        }
      } else if (shapeName.includes('browInnerUp')) {
        if (y > 0.06 && y < 0.12 && Math.abs(x) < 0.04) { dy = 0.008; }
      } else if (shapeName.includes('cheekPuff')) {
        if (y > -0.04 && y < 0.04 && Math.abs(x) > 0.05) { dx = x > 0 ? 0.01 : -0.01; }
      } else if (shapeName.includes('eyeLookDown')) {
        if (y > 0.03 && y < 0.07) {
          const side = shapeName.includes('Left') ? 1 : -1;
          if (x * side > 0) { dy = -0.003; }
        }
      } else if (shapeName.includes('eyeLookUp')) {
        if (y > 0.03 && y < 0.07) {
          const side = shapeName.includes('Left') ? 1 : -1;
          if (x * side > 0) { dy = 0.003; }
        }
      } else if (shapeName.includes('mouthPucker')) {
        if (y < 0 && y > -0.05 && Math.abs(x) > 0.01 && Math.abs(x) < 0.06) {
          dx = x > 0 ? -0.005 : 0.005;
        }
      } else if (shapeName.includes('noseSneer')) {
        if (y > 0 && y < 0.04 && Math.abs(x) < 0.05 && z > 0.05) {
          const side = shapeName.includes('Left') ? 1 : -1;
          if (x * side > 0) { dy = 0.004; dx = side * 0.002; }
        }
      }

      morphPositions[i * 3] = dx;
      morphPositions[i * 3 + 1] = dy;
      morphPositions[i * 3 + 2] = dz;
    }

    const attr = new THREE.Float32BufferAttribute(morphPositions, 3);
    attr.name = shapeName;
    headGeo.morphAttributes.position.push(attr);
  }

  // Skin weights — all vertices bound to Head bone (index 5)
  const skinIndices = [];
  const skinWeights = [];
  for (let i = 0; i < positions.count; i++) {
    skinIndices.push(5, 4, 0, 0); // Head, Neck
    const y = positions.getY(i);
    const neckWeight = Math.max(0, Math.min(0.3, (-y - 0.08) * 2));
    skinWeights.push(1 - neckWeight, neckWeight, 0, 0);
  }
  headGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  headGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mat = new THREE.MeshStandardMaterial({
    color: 0xd4a574, // Neutral skin tone
    roughness: 0.7,
    metalness: 0.0,
    morphTargets: true,
  });

  const mesh = new THREE.SkinnedMesh(headGeo, mat);
  mesh.name = 'Head_Mesh';
  mesh.morphTargetDictionary = {};
  mesh.morphTargetInfluences = new Array(ARKIT_BLENDSHAPES.length).fill(0);
  ARKIT_BLENDSHAPES.forEach((name, i) => { mesh.morphTargetDictionary[name] = i; });

  // Create skeleton and bind
  const skeleton = new THREE.Skeleton(bones);
  mesh.add(bones[0]); // Root bone
  mesh.bind(skeleton);

  return mesh;
}

function createBodyMesh(bones) {
  // Simple torso/body capsule
  const bodyGeo = new THREE.CapsuleGeometry(0.14, 0.4, 8, 16);

  // Skin weights for body
  const positions = bodyGeo.attributes.position;
  const skinIndices = [];
  const skinWeights = [];
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    if (y > 0.1) {
      // Upper chest -> Spine2
      skinIndices.push(3, 4, 0, 0);
      skinWeights.push(0.7, 0.3, 0, 0);
    } else if (y > -0.05) {
      // Mid -> Spine1
      skinIndices.push(2, 3, 0, 0);
      skinWeights.push(0.6, 0.4, 0, 0);
    } else {
      // Lower -> Spine
      skinIndices.push(1, 0, 0, 0);
      skinWeights.push(0.7, 0.3, 0, 0);
    }
  }
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2a3a5c, // Dark blue (business shirt)
    roughness: 0.8,
    metalness: 0.0,
  });

  const mesh = new THREE.SkinnedMesh(bodyGeo, mat);
  mesh.name = 'Body_Mesh';

  const skeleton = new THREE.Skeleton(bones);
  mesh.add(bones[0]);
  mesh.bind(skeleton);

  return mesh;
}

async function generateAvatar() {
  const scene = new THREE.Scene();
  scene.name = 'AvatarScene';

  const bones = createHumanoidSkeleton();

  // Head mesh with blendshapes
  const headMesh = createHeadMesh([...bones]);
  headMesh.position.set(0, 0, 0);
  scene.add(headMesh);

  // Body mesh
  const bodyBones = createHumanoidSkeleton();
  const bodyMesh = createBodyMesh(bodyBones);
  bodyMesh.position.set(0, -0.45, 0);
  scene.add(bodyMesh);

  // Export as GLB
  const exporter = new GLTFExporter();

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (buffer) => {
        const outputPath = path.resolve(__dirname, '..', 'public', 'models', 'avatar.glb');
        fs.writeFileSync(outputPath, Buffer.from(buffer));
        console.log(`✅ Avatar GLB generated: ${outputPath}`);
        console.log(`   Bones: ${bones.length}`);
        console.log(`   Blendshapes: ${ARKIT_BLENDSHAPES.length}`);
        console.log(`   Size: ${(Buffer.from(buffer).length / 1024).toFixed(1)} KB`);
        resolve();
      },
      (error) => {
        console.error('Export failed:', error);
        reject(error);
      },
      { binary: true }
    );
  });
}

generateAvatar().catch(console.error);
