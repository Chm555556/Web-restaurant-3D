// characters/loader.js — loads the rigged .glb characters and prepares their clips.
// Step 4 of the guide's Mixamo workflow: GLTFLoader + AnimationMixer.
// Michelle only ships with a dance, so walk/idle/run are retargeted onto her
// skeleton from the X-Bot clips (both are Mixamo rigs with the same bone names).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { softenSkirt } from './looks.js';

// The published web page serves models as embedded .gltf JSON (its host does not serve .glb);
// locally and on Netlify/Cloudflare the binary .glb files are used.
const EXT = globalThis.AZURE_MODEL_EXT || '.glb';

export const MODELS = {
  xbot: { file: 'assets/models/Xbot' + EXT, height: 1.78 },
  michelle: { file: 'assets/models/Michelle' + EXT, height: 1.66 },
  soldier: { file: 'assets/models/Soldier' + EXT, height: 1.84 },
  robot: { file: 'assets/models/RobotExpressive' + EXT, height: 1.45 },
};

export const library = {};
/** full geometry → its low-detail copy (people far from the camera) */
export const LOD = new Map(); // kind -> { gltf, clips: {idle, walk, run, ...}, yawOffset, scale, hipH }

/** Put every bone back in its bind pose (rotation and position). */
function resetBind(root) { root.traverse((o) => { if (o.isBone && o.userData.bindQ) { o.quaternion.copy(o.userData.bindQ); if (o.userData.bindP) o.position.copy(o.userData.bindP); } }); }

function bonesOf(root) { const a = []; root.traverse((o) => { if (o.isBone) a.push(o); }); return a; }

function poseWorld(root) {
  root.updateMatrixWorld(true);
  const iq = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const m = {};
  for (const b of bonesOf(root)) m[b.name] = b.getWorldQuaternion(new THREE.Quaternion()).premultiply(iq);
  return m;
}
/** Bone positions in the root's own space (metres for every model we load). */
function posWorld(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), m = {};
  for (const b of bonesOf(root)) m[b.name] = b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  return m;
}

function restOf(scene, clips) {
  const tp = clips.find((a) => /tpose/i.test(a.name));
  if (tp) { const mx = new THREE.AnimationMixer(scene); mx.clipAction(tp).play(); mx.update(0); }
  const w = poseWorld(scene);
  Object.defineProperty(w, 'pos', { value: posWorld(scene), enumerable: false });
  if (tp) resetBind(scene);
  return w;
}

// bone → the bone its direction is measured toward (all Mixamo names, without the prefix)
const AIM = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop_End' };
for (const s of ['Left', 'Right']) {
  Object.assign(AIM, { [s + 'Shoulder']: s + 'Arm', [s + 'Arm']: s + 'ForeArm', [s + 'ForeArm']: s + 'Hand', [s + 'Hand']: s + 'HandMiddle1',
    [s + 'UpLeg']: s + 'Leg', [s + 'Leg']: s + 'Foot', [s + 'Foot']: s + 'ToeBase' });
  for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i < 4; i++) AIM[s + 'Hand' + f + i] = s + 'Hand' + f + (i + 1);
}

/**
 * Bring the target's rest pose to the source's rest pose, bone by bone, by turning each
 * bone so it points the same way (shortest turn, like raising an arm from an A-pose to a
 * T-pose). Without this, a model rigged with its arms down (Mixamo auto-rig of an A-pose
 * mesh) adds every arm movement on top of the wrong starting angle: the arms fold behind
 * the back when walking.
 */
function alignRest(srcRest, tgtRest) {
  const out = {}, P = 'mixamorig', S = srcRest.pos, T = tgtRest.pos;
  const ds = new THREE.Vector3(), dt = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const nm of Object.keys(tgtRest)) {
    out[nm] = tgtRest[nm];
    const short = nm.startsWith(P) ? nm.slice(P.length) : null, c = short && AIM[short];
    if (!c || !S[nm] || !S[P + c] || !T[P + c]) continue;
    ds.subVectors(S[P + c], S[nm]); dt.subVectors(T[P + c], T[nm]);
    if (ds.lengthSq() < 1e-10 || dt.lengthSq() < 1e-10) continue;
    q.setFromUnitVectors(dt.normalize(), ds.normalize());
    out[nm] = q.clone().multiply(tgtRest[nm]);
  }
  return out;
}

/**
 * World-space retarget: for every frame, take each source bone's rotation relative to
 * its T-pose and apply the same world delta to the target's T-pose. Robust across
 * Mixamo rigs whose bind poses differ.
 */
function retarget(src, srcRest, clip, tgt, tgtRest, aligned = null) {
  const tgtRestRaw = tgtRest;
  if (aligned) tgtRest = aligned;
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
  // hips translation (the bounce and sway of a real walk), scaled by leg length
  const H = 'mixamorigHips', tH = tgt.getObjectByName(H), sH = src.getObjectByName(H);
  const hipPos = aligned && tH && sH && srcRest.pos?.[H] && tgtRestRaw.pos?.[H] ? new Float32Array(n * 3) : null;
  let legR = 1, hipParentInv = null;
  if (hipPos) {
    const floorOf = (pos) => Math.min(...['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map((b) => pos['mixamorig' + b]?.y ?? Infinity));
    const hs = srcRest.pos[H].y - floorOf(srcRest.pos), ht = tgtRestRaw.pos[H].y - floorOf(tgtRestRaw.pos);
    legR = hs > 0.1 && ht > 0.1 ? ht / hs : 1;
    tgt.updateMatrixWorld(true);
    hipParentInv = tgt.matrixWorld.clone().invert().multiply(tH.parent.matrixWorld).invert();   // root space → hips parent
  }
  const _hp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = Math.min(clip.duration, i / fps);
    times[i] = t; mx.setTime(t);
    const sw = poseWorld(src);
    if (hipPos) {
      src.updateMatrixWorld(true);
      sH.getWorldPosition(_hp).applyMatrix4(src.matrixWorld.clone().invert()).sub(srcRest.pos[H]).multiplyScalar(legR).add(tgtRestRaw.pos[H]);
      _hp.toArray(hipPos, i * 3);
    }
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
  const tracks = tb.map((b) => new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, vals[b.name]));
  if (hipPos) {
    // in-place clips: keep the bounce and side sway, drop any forward drift
    let mx0 = 0, mz0 = 0; for (let i = 0; i < n; i++) { mx0 += hipPos[i * 3]; mz0 += hipPos[i * 3 + 2]; }
    mx0 /= n; mz0 /= n;
    for (let i = 0; i < n; i++) {
      _hp.fromArray(hipPos, i * 3); _hp.x += tgtRestRaw.pos[H].x - mx0; _hp.z += tgtRestRaw.pos[H].z - mz0;
      _hp.applyMatrix4(hipParentInv).toArray(hipPos, i * 3);
    }
    tracks.push(new THREE.VectorKeyframeTrack(H + '.position', times, hipPos));
  }
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

const CONFIG_ORDER = (list, P) => list.indexOf(P);

/** Scale the swing of the legs around their average pose (shorter steps, same rhythm). */
function shrinkStride(clip, f) {
  const q = new THREE.Quaternion(), m = new THREE.Quaternion();
  for (const tr of clip.tracks) {
    if (!/(UpLeg|Leg|Foot|ToeBase)\.quaternion$/.test(tr.name)) continue;
    const v = tr.values, n = v.length / 4, sum = [0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      const s = i && v[i * 4] * v[0] + v[i * 4 + 1] * v[1] + v[i * 4 + 2] * v[2] + v[i * 4 + 3] * v[3] < 0 ? -1 : 1;
      for (let k = 0; k < 4; k++) sum[k] += s * v[i * 4 + k];
    }
    m.fromArray(sum).normalize();
    for (let i = 0; i < n; i++) { q.fromArray(v, i * 4); q.copy(m.clone().slerp(q, f)); q.toArray(v, i * 4); }
  }
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
      if (o.isBone) { o.userData.bindQ = o.quaternion.clone(); o.userData.bindP = o.position.clone(); }
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
    // the dancer is built on the X-Bot skeleton too: bring Michelle's samba across
    if (library.michelle.clips.dance) library.xbot.clips.dance = retarget(ms, mRest, library.michelle.clips.dance, xs, xRest);
    // put both skeletons back in bind pose
    for (const s of [xs, ms]) resetBind(s);
  }

  // measure scale, facing and hip height once per kind (on an idle frame)
  for (const k of kinds) measure(k, MODELS[k].height);
  return library;
}

function measure(k, height) {
  {
    const L = library[k], s = L.gltf.scene;
    const mx = new THREE.AnimationMixer(s); mx.clipAction(L.clips.idle).play(); mx.update(0.01);
    s.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(s, true);
    L.scale = height / Math.max(0.1, box.max.y - box.min.y);
    L.minY = box.min.y;
    L.yawOffset = facingYaw(s, k);
    const hips = s.getObjectByName('mixamorigHips');
    L.hipH = hips ? (hips.getWorldPosition(new THREE.Vector3()).y - box.min.y) * L.scale : 0.9;
    const ul = s.getObjectByName('mixamorigLeftUpLeg'), kn = s.getObjectByName('mixamorigLeftLeg');
    const ft = s.getObjectByName('mixamorigLeftFoot');
    L.ankleH = ft ? (ft.getWorldPosition(new THREE.Vector3()).y - box.min.y) * L.scale : 0.08;
    L.thigh = ul && kn ? ul.getWorldPosition(new THREE.Vector3()).distanceTo(kn.getWorldPosition(new THREE.Vector3())) * L.scale : 0.45;
    mx.stopAllAction(); mx.uncacheRoot(s);
    resetBind(s);
  }
}

// ------------------------------------------------------------------ real 3D people
const CANON = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'HeadTop_End', 'LeftEye', 'RightEye'];

/**
 * Give every bone the canonical Mixamo name ("mixamorigHips"…) whatever the exporter did:
 * "mixamorig:Hips", "mixamorig1:Hips", "mixamorig_Hips", "Armature_Hips" or plain "Hips".
 */
function canonBones(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isBone) return;
    let nm = o.name.replace(/^.*?mixamorig\d*[:_]?/i, '');
    nm = nm.replace(/^(armature|root|skeleton|rig)[:_|.]/i, '').replace(/_\d+$/, '');
    const hit = CANON.find((c) => c.toLowerCase() === nm.toLowerCase()) || (/^(left|right)hand(thumb|index|middle|ring|pinky)\d$/i.test(nm) ? nm : null);
    if (hit) { o.name = 'mixamorig' + hit[0].toUpperCase() + hit.slice(1); n++; }
  });
  return n;
}

/**
 * Load the optional rigged people listed in CONFIG.people. Each one gets the X-Bot idle,
 * walk, run and dance clips retargeted onto its own skeleton, so it walks, sits, lies,
 * swims and gestures exactly like everyone else. Missing or unrigged files are skipped.
 */
export async function loadPeople(manager, list) {
  if (!list?.length || !library.xbot) return [];
  // only files that tools/import-model.sh installed (listed in assets/people/index.json)
  let installed = [];
  try { installed = await (await fetch('assets/people/index.json', { cache: 'no-cache' })).json(); } catch { /* none */ }
  list = list.filter((P) => installed.includes(P.file.split('/').pop()));
  if (!list.length) return [];
  const loader = new GLTFLoader(manager);
  const xs = library.xbot.gltf.scene, xRest = restOf(xs, library.xbot.gltf.animations);
  resetBind(xs);
  const ok = [];
  await Promise.all(list.map(async (P) => {
    let g;
    try { g = await loader.loadAsync(P.file); } catch { console.info(`[people] ${P.file} not found, using the generated character`); return; }
    const found = canonBones(g.scene);
    let skinned = false;
    g.scene.traverse((o) => {
      if (o.isBone) { o.userData.bindQ = o.quaternion.clone(); o.userData.bindP = o.position.clone(); }
      if (o.isSkinnedMesh) skinned = true;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
        // FBX → glTF turns old Phong materials into 40 % metal, which darkens skin and
        // cloth and makes them look like plastic. People are not metal.
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) if (m.metalness > 0.15) { m.metalness = 0; m.roughness = Math.max(m.roughness, 0.72); }
      }
    });
    if (!skinned || found < 12 || !g.scene.getObjectByName('mixamorigHips')) {
      console.warn(`[people] ${P.file} has no usable skeleton (found ${found} bones). Rig it at mixamo.com first.`);
      return;
    }
    const key = 'people:' + P.file;
    // the low-detail copy (tools/import-model.sh makes it): its geometries stand in for
    // the full ones on people far from the camera
    const lodFile = 'lod/' + P.file.split('/').pop();
    if (installed.includes(lodFile)) {
      try {
        const lg = await loader.loadAsync(P.file.replace(/[^/]+$/, lodFile));
        const full = [], low = [];
        g.scene.traverse((o) => { if (o.isMesh) full.push(o); });
        lg.scene.traverse((o) => { if (o.isMesh) low.push(o); });
        if (full.length === low.length) full.forEach((m, i) => { if (low[i].material.name === m.material.name) LOD.set(m.geometry, low[i].geometry); });
      } catch { /* no low-detail copy */ }
    }
    // a face donor only lends its head (characters/looks.js): no clips needed
    let rpm = false; g.scene.traverse((o) => { if (o.isMesh && o.material?.name === 'AvatarHead') rpm = true; });
    const info = { real: true, sex: P.sex, rpm, order: CONFIG_ORDER(list, P), hairRef: P.hairRef ?? 0.006 };
    if (P.face) { library[key] = { gltf: g, clips: {}, faceDonor: true, ...info }; P.kind = key; return; }
    if (P.skirt) softenSkirt(g.scene, P.skirt);
    const rest = restOf(g.scene, g.animations);
    const clips = {};
    const aligned = alignRest(xRest, rest);
    for (const name of ['idle', 'walk', 'run', 'dance']) if (library.xbot.clips[name]) clips[name] = retarget(xs, xRest, library.xbot.clips[name], g.scene, rest, aligned);
    resetBind(g.scene); resetBind(xs);
    // a saree is walked in with shorter steps: smaller leg swing (the cadence follows, see
    // Character.stride), so the legs stay inside the cloth
    let strideScale = 1;
    if (P.skirt) { strideScale = 0.74; for (const c of [clips.walk, clips.run]) if (c) shrinkStride(c, strideScale); }
    library[key] = { gltf: g, clips, ...info, base: P.base || null, parts: P.parts || {}, legs: !!P.legs, dupatta: !!P.dupatta, strideScale };
    measure(key, P.height || 1.72);
    P.kind = key; ok.push(P);
  }));
  return ok;
}
