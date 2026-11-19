// characters/loader.js — loads the rigged .glb characters and prepares their clips.
// Step 4 of the guide's Mixamo workflow: GLTFLoader + AnimationMixer.
// Michelle only ships with a dance, so walk/idle/run are retargeted onto her
// skeleton from the X-Bot clips (both are Mixamo rigs with the same bone names).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The published web page serves models as embedded .gltf JSON (its host does not serve .glb);
// locally and on Netlify/Cloudflare the binary .glb files are used.
const EXT = globalThis.AZURE_MODEL_EXT || '.glb';

export const MODELS = {
  xbot: { file: 'assets/models/Xbot' + EXT, height: 1.78 },
  michelle: { file: 'assets/models/Michelle' + EXT, height: 1.66 },
  soldier: { file: 'assets/models/Soldier' + EXT, height: 1.84 },
  robot: { file: 'assets/models/RobotExpressive' + EXT, height: 1.45 },
};

export const library = {}; // kind -> { gltf, clips: {idle, walk, run, ...}, yawOffset, scale, hipH }

function bonesOf(root) { const a = []; root.traverse((o) => { if (o.isBone) a.push(o); }); return a; }

function poseWorld(root) {
  root.updateMatrixWorld(true);
  const iq = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const m = {};
  for (const b of bonesOf(root)) m[b.name] = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(iq);
  return m;
}

function restOf(scene, clips) {
  const tp = clips.find((a) => /tpose/i.test(a.name));
  if (tp) { const mx = new THREE.AnimationMixer(scene); mx.clipAction(tp).play(); mx.update(0); }
  const w = poseWorld(scene);
  if (tp) { scene.traverse((o) => { if (o.isBone && o.userData.bindQ) o.quaternion.copy(o.userData.bindQ); }); }
  return w;
}

/**
 * World-space retarget: for every frame, take each source bone's rotation relative to
 * its T-pose and apply the same world delta to the target's T-pose. Robust across
 * Mixamo rigs whose bind poses differ.
 */
function retarget(src, srcRest, clip, tgt, tgtRest) {
  const mx = new THREE.AnimationMixer(src);
  mx.clipAction(clip).play();
  const fps = 30, n = Math.max(2, Math.round(clip.duration * fps) + 1);
  const tb = bonesOf(tgt);
  const times = new Float32Array(n);
  const vals = {}; for (const b of tb) vals[b.name] = new Float32Array(n * 4);
  const D = new THREE.Quaternion();
  tgt.updateMatrixWorld(true);
  const tRootInv = tgt.getWorldQuaternion(new THREE.Quaternion()).invert();
  const parentRest = {};
  for (const b of tb) if (!b.parent.isBone) parentRest[b.name] = b.parent.getWorldQuaternion(new THREE.Quaternion()).premultiply(tRootInv);
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / fps);
    times[i] = t; mx.setTime(t);
    const sw = poseWorld(src);
    const tw = {};
    for (const b of tb) {
      const nm = b.name;
      let w;
      if (sw[nm] && srcRest[nm] && tgtRest[nm]) w = D.copy(sw[nm]).multiply(srcRest[nm].clone().invert()).clone().multiply(tgtRest[nm]);
      else {
        const pw = b.parent.isBone ? tw[b.parent.name] : parentRest[nm];
        const pr = b.parent.isBone ? tgtRest[b.parent.name] : parentRest[nm];
        w = pw.clone().multiply(pr.clone().invert()).multiply(tgtRest[nm]);
      }
      tw[nm] = w;
      const pw = b.parent.isBone ? tw[b.parent.name] : parentRest[nm];
      pw.clone().invert().multiply(w).toArray(vals[nm], i * 4);
    }
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tb.map((b) => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, vals[b.name])));
}

/** Which way does the model face? Measured from foot → toe, so we never guess. */
function facingYaw(scene, kind) {
  if (kind === 'robot') return 0;
  scene.updateMatrixWorld(true);
  const foot = scene.getObjectByName('mixamorigLeftFoot'), toe = scene.getObjectByName('mixamorigLeftToeBase');
  if (!foot || !toe) return 0;
  const a = foot.getWorldPosition(new THREE.Vector3()), b = toe.getWorldPosition(new THREE.Vector3());
  return -Math.atan2(b.x - a.x, b.z - a.z);
}

export async function loadCharacters(manager, kinds = Object.keys(MODELS)) {
  const loader = new GLTFLoader(manager);
  const gltfs = {};
  await Promise.all(kinds.map(async (k) => { gltfs[k] = await loader.loadAsync(MODELS[k].file); }));

  for (const k of kinds) {
    const g = gltfs[k];
    g.scene.traverse((o) => {
      if (o.isBone) o.userData.bindQ = o.quaternion.clone();
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false; }
    });
    const pick = (re) => g.animations.find((a) => re.test(a.name));
    const clips = {};
    if (k === 'xbot') Object.assign(clips, { idle: pick(/^idle$/i), walk: pick(/^walk$/i), run: pick(/^run$/i) });
    if (k === 'soldier') Object.assign(clips, { idle: pick(/^idle$/i), walk: pick(/^walk$/i), run: pick(/^run$/i) });
    if (k === 'robot') Object.assign(clips, { idle: pick(/^idle$/i), walk: pick(/^walking$/i), run: pick(/^running$/i), wave: pick(/^wave$/i), dance: pick(/^dance$/i), sit: pick(/^sitting$/i), yes: pick(/^yes$/i), thumbs: pick(/thumbsup/i) });
    if (k === 'michelle') clips.dance = pick(/samba/i);
    library[k] = { gltf: g, clips };
  }

  if (gltfs.michelle && gltfs.xbot) {
    const xs = gltfs.xbot.scene, ms = gltfs.michelle.scene;
    const xRest = restOf(xs, gltfs.xbot.animations);
    const mRest = restOf(ms, gltfs.michelle.animations);
    for (const name of ['idle', 'walk', 'run']) library.michelle.clips[name] = retarget(xs, xRest, library.xbot.clips[name], ms, mRest);
    // put both skeletons back in bind pose
    for (const s of [xs, ms]) s.traverse((o) => { if (o.isBone) o.quaternion.copy(o.userData.bindQ); });
  }

  // measure scale, facing and hip height once per kind (on an idle frame)
  for (const k of kinds) {
    const L = library[k], s = L.gltf.scene;
    const mx = new THREE.AnimationMixer(s); mx.clipAction(L.clips.idle).play(); mx.update(0.01);
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s, true);
    L.scale = MODELS[k].height / Math.max(0.1, box.max.y - box.min.y);
    L.minY = box.min.y;
    L.yawOffset = facingYaw(s, k);
    const hips = s.getObjectByName('mixamorigHips');
    L.hipH = hips ? (hips.getWorldPosition(new THREE.Vector3()).y - box.min.y) * L.scale : 0.9;
    const ul = s.getObjectByName('mixamorigLeftUpLeg'), kn = s.getObjectByName('mixamorigLeftLeg');
    L.thigh = ul && kn ? ul.getWorldPosition(new THREE.Vector3()).distanceTo(kn.getWorldPosition(new THREE.Vector3())) * L.scale : 0.45;
    mx.stopAllAction(); mx.uncacheRoot(s);
    s.traverse((o) => { if (o.isBone) o.quaternion.copy(o.userData.bindQ); });
  }
  return library;
}
