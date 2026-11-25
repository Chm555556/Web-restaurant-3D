// characters/character.js — one animated person in the world.
//   root  (position + yaw; yaw 0 = facing +Z)
//   └ pivot (pitch for lying on a lounger / swimming)
//     └ model (cloned .glb, scaled, turned so it faces +Z)
//
// Locomotion is a speed-driven blend tree, not a clip switch: idle, walk and run play
// together, their weights follow the (smoothed) ground speed and walk/run share one
// phase, so feet never slide and there is no pop between walking and running.
// The clips' stride speeds were measured from the foot contacts: walk 1.44 m/s, run 3.19 m/s.
//
// On top of the clips:
//   • procedural poses (sit, eat, type, talk, carry, stir, look, swim, phone, wave)
//   • gestures driven by two-bone arm IK (namaste, handshake, high five, clap, bow…)
//   • body lean into turns and speed, and a head that looks at nearby people.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { library } from './loader.js';
import { applyDress, sizeOf } from './indian.js';
import { lookFor, personalize } from './looks.js';

const outfitCache = new Map();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _r = new THREE.Quaternion(), _id = new THREE.Quaternion();
const _v = new THREE.Vector3(), _L = new THREE.Vector3(), _F = new THREE.Vector3(), _U = new THREE.Vector3();
const _S = new THREE.Vector3(), _E = new THREE.Vector3(), _W = new THREE.Vector3(), _T = new THREE.Vector3(), _P = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _C = new THREE.Vector3();

// measured once from the X-Bot clips (see loader): metres per second at timeScale 1
const WALK_SPEED = 1.44, RUN_SPEED = 3.34, RUN_PHASE = 0.075;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const frac = (x) => x - Math.floor(x);

function rotW(bone, axis, ang) {
  if (!bone || Math.abs(ang) < 1e-4) return;
  bone.parent.getWorldQuaternion(_pq);
  _r.setFromAxisAngle(axis, ang);
  _q.copy(_pq).invert().multiply(_r).multiply(_pq);
  bone.quaternion.premultiply(_q);
  bone.updateMatrixWorld(true);
}

/** Rotate a bone (in world space) so that world direction `from` turns toward `to`, by weight w. */
function alignW(bone, from, to, w) {
  if (!bone || w < 1e-3) return;
  _r.setFromUnitVectors(from, to);
  if (w < 1) _r.slerpQuaternions(_id, _r, w);
  bone.parent.getWorldQuaternion(_pq);
  _q.copy(_pq).invert().multiply(_r).multiply(_pq);
  bone.quaternion.premultiply(_q);
  bone.updateMatrixWorld(true);
}

/** Recolour X-Bot / tint Michelle (only for the old, undressed rigs). */
function outfit(kind, mesh, o) {
  if (!o) return;
  const key = kind + mesh.material.name + JSON.stringify(o);
  if (!outfitCache.has(key)) {
    const m = mesh.material.clone();
    if (kind === 'xbot') {
      const isJoint = /joint/i.test(m.name);
      m.color.set(isJoint ? (o.joints ?? 0x333333) : (o.body ?? 0xbbbbbb));
      m.roughness = 0.55; m.metalness = isJoint ? 0.3 : 0.05;
    } else if (o.tint) m.color.set(o.tint);
    outfitCache.set(key, m);
  }
  mesh.material = outfitCache.get(key);
}

/**
 * Gestures. Hand targets are given relative to the upper chest (Spine2) in the
 * character's own axes: x = to the character's left, y = up, z = forward (metres, × body size).
 * The right hand is on −x. Each gesture lasts `dur` seconds and fades in/out over `fade`.
 */
export const GESTURES = {
  wave:      { dur: 2.4, fade: 0.3, label: 'Wave', icon: '👋' },
  namaste:   { dur: 2.6, fade: 0.4, label: 'Namaste', icon: '🙏' },
  bow:       { dur: 2.6, fade: 0.5, label: 'Bow', icon: '🙇' },
  handshake: { dur: 2.6, fade: 0.45, label: 'Shake hands', icon: '🤝', partner: true },
  highfive:  { dur: 1.5, fade: 0.25, label: 'High five', icon: '✋', partner: true },
  clap:      { dur: 2.4, fade: 0.3, label: 'Clap', icon: '👏' },
  cheer:     { dur: 2.2, fade: 0.35, label: 'Cheer', icon: '🙌' },
  laugh:     { dur: 2.4, fade: 0.35, label: 'Laugh', icon: '😄' },
  nod:       { dur: 1.4, fade: 0.25, label: 'Nod yes', icon: '🙂' },
  headshake: { dur: 1.4, fade: 0.25, label: 'Shake head', icon: '🙃' },
  shrug:     { dur: 1.8, fade: 0.35, label: 'Shrug', icon: '🤷' },
  think:     { dur: 2.8, fade: 0.4, label: 'Think', icon: '🤔' },
  dance:     { dur: 7.5, fade: 0.5, label: 'Dance', icon: '💃', clip: 'dance' },
  knock:     { dur: 1.3, fade: 0.2 },
  serve:     { dur: 1.6, fade: 0.35 },
  push:      { dur: 1.0, fade: 0.25 },
};

export class Character {
  constructor(kind, { name = '', role = '', outfit: of = null, label = true, model = null } = {}) {
    // a real rigged 3D person (CONFIG.people) if one was loaded for this name, otherwise
    // a person generated on the X-Bot skeleton (characters/indian.js)
    const real = !!(model && library[model]);
    if (real) kind = model; else if (of?.sex) kind = 'xbot';
    const L = library[kind];
    this.kind = kind; this.name = name; this.role = role; this.lib = L; this.real = real;
    // a real person gets their own face, colours, height and build (characters/looks.js)
    // (Aditi, the player, is the saree model exactly as made: own face, colours and size)
    const asMade = role === 'You' && L.sex === 'f';
    this.appearance = real && L.base && !asMade ? lookFor({ name, role, outfit: of || {}, sex: L.sex, lib: L }) : null;
    this.k = real ? (this.appearance?.height ?? 1) : sizeOf(of);   // generated women are 0.93 × the skeleton (≈ 1.65 m)
    // leg length relative to the X-Bot the walk and run clips were measured on: a shorter
    // person takes shorter strides, so the cadence must follow or the feet slide
    this.stride = real && library.xbot?.hipH ? L.hipH * this.k / library.xbot.hipH * (L.strideScale ?? 1) : this.k;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.model = SkeletonUtils.clone(L.gltf.scene);
    this.model.scale.setScalar(L.scale * this.k);
    if (this.appearance) { this.model.scale.x *= this.appearance.build; this.model.scale.z *= this.appearance.build; }
    this.model.rotation.y = L.yawOffset;
    this.baseY = -L.minY * L.scale * this.k;
    this.model.position.y = this.baseY;
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (of && !of.sex) outfit(kind, o, of); } });
    this.outfit = of;
    this.pivot.add(this.model); this.root.add(this.pivot);
    if (!real) applyDress(this, of);
    else if (this.appearance) personalize(this, this.appearance);

    this.bones = {};
    if (kind !== 'robot') for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftShoulder', 'RightShoulder', 'LeftHand', 'RightHand', 'LeftHandMiddle1', 'RightHandMiddle1', 'LeftFoot', 'RightFoot'])
      this.bones[n] = this.model.getObjectByName('mixamorig' + n);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [k, c] of Object.entries(L.clips)) if (c) this.actions[k] = this.mixer.clipAction(c);
    // locomotion blend: idle + walk + run always "playing", weights follow speed
    this.loco = { v: 0, vt: 0, phase: Math.random(), over: null, overW: 0, idleT: Math.random() * 2.5 };
    for (const k of ['idle', 'walk', 'run']) {
      const a = this.actions[k]; if (!a) continue;
      a.play(); a.setEffectiveWeight(k === 'idle' ? 1 : 0);
      if (k !== 'idle') a.timeScale = 0;          // walk / run time is set by hand (shared phase)
    }
    this.actions.idle?.setEffectiveTimeScale(0.9 + Math.random() * 0.2);
    this.mixer.update(Math.random() * 2);
    this.currentName = 'idle';

    // procedural pose weights (current → target)
    this.pose = { sit: 0, wave: 0, eat: 0, type: 0, talk: 0, carry: 0, stir: 0, look: 0, swim: 0, phone: 0 };
    this.poseT = { ...this.pose };
    this.seatY = 0.5;
    this.lie = false;
    this.legFlex = 0;          // hips bent while reclining on a lounger (radians)
    this.t = Math.random() * 10;
    this.speed = 0;
    this.accessories = [];
    this.gest = null;          // { name, t, dur, opts }
    this.lookAt = null;        // world point the head turns toward (or null)
    this.look = { yaw: 0, pitch: 0 };
    this.prevYaw = 0; this.yawRate = 0; this.lean = 0; this.roll = 0;

    // invisible hit capsule for click raycasting (cheap, unlike skinned raycasts)
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.9; hit.userData.character = this;
    this.hit = hit; this.root.add(hit);

    // name label (HTML, positioned with CSS2DRenderer)
    if (label && name) {
      const el = document.createElement('div');
      el.className = 'npc-label';
      el.innerHTML = `<b>${name}</b>${role ? `<span>${role}</span>` : ''}`;
      this.label = new CSS2DObject(el);
      this.label.position.set(0, 2.05, 0);
      this.root.add(this.label);
      const b = document.createElement('div'); b.className = 'bubble'; b.hidden = true;
      this.bubbleEl = b;
      this.bubble = new CSS2DObject(b); this.bubble.position.set(0, 2.45, 0); this.root.add(this.bubble);
    }
    this.bubbleTime = 0;
  }

  get x() { return this.root.position.x; }
  get z() { return this.root.position.z; }

  /** Ground speed this frame (m/s, negative = walking backwards). Drives the blend tree. */
  setMove(v) {
    this.loco.vt = v;
    this.speed = Math.abs(v) > 0.02 ? Math.abs(v) : 0;
  }

  /** Back-compat: 'idle' stops, 'dance' (or any extra clip) plays over locomotion. */
  play(name) {
    if (name === 'idle') { this.setMove(0); this.stopOver(); return; }
    if (name === 'walk' || name === 'run') return;
    this.playOver(name);
  }
  playOver(name) {
    const a = this.actions[name]; if (!a) return;
    if (this.loco.over && this.loco.over !== a) this.loco.over.stop();
    if (this.loco.over !== a) { a.reset().play(); a.setEffectiveWeight(0); }
    this.loco.over = a; this.loco.overOn = true; this.currentName = name;
  }
  stopOver() { if (this.loco.over) this.loco.overOn = false; this.currentName = 'idle'; }

  setPose(k, v) { this.poseT[k] = v; }
  clearPoses(except = []) { for (const k of Object.keys(this.poseT)) if (!except.includes(k)) this.poseT[k] = 0; }

  /** Play a gesture (see GESTURES). opts.point(): world hand target for partner gestures. */
  gesture(name, opts = {}) {
    const g = GESTURES[name]; if (!g) return;
    this.gest = { name, t: 0, dur: opts.dur ?? g.dur, fade: g.fade, opts };
    if (g.clip) this.playOver(g.clip);
  }
  gestureActive() { return !!this.gest; }

  say(text, secs = 4) {
    if (!this.bubbleEl) return;
    this.bubbleEl.textContent = text; this.bubbleEl.hidden = false; this.bubbleTime = secs;
  }

  /** Put the character in a seat (anchor = {x,z,yaw,seatY}). */
  sitAt(a, instant = false) {
    this.root.position.set(a.x, 0, a.z); this.root.rotation.y = a.yaw;
    this.seatY = a.seatY ?? 0.5;
    this.poseT.sit = 1; if (instant) this.pose.sit = 1;
    this.setMove(0);
  }

  /**
   * How to lie on a bed or sun lounger. A bed anchor gives its own pitch / height / offset.
   * A lounger: the back rests on the backrest (34°), the hips sit in the crease and the
   * hips bend so the legs lie flat on the cushion, like a person really reclines.
   */
  liePose(a) {
    if (a.pitch != null) return { pitch: a.pitch, y: a.h ?? 0.52, z: a.off ?? 0.95, legs: 0 };
    const back = 0.6, pitch = -(Math.PI / 2 - back), h = (this.lib.hipH ?? 0.95) * this.k;
    const hipY = 0.53, hipZ = -0.36;                  // hip joint just above the crease of the cushion
    return { pitch, y: hipY - h * Math.cos(pitch), z: hipZ - h * Math.sin(pitch), legs: back };
  }
  /** Lie on a sun lounger or bed (anchor yaw = lounger yaw; head toward the backrest). */
  lieOn(a) {
    this.lie = true; this.lieAnchor = a;
    this.root.position.set(a.x, 0, a.z); this.root.rotation.y = a.yaw;
    const L = this.liePose(a);
    this.pivot.rotation.x = L.pitch;
    this.pivot.position.set(0, L.y, L.z);
    this.legFlex = L.legs;
    this.poseT.sit = 0; this.pose.sit = 0;
    this.setMove(0);
  }

  /** Get up from a seat, bed or lounger. */
  standUp() {
    this.lie = false; this.lieAnchor = null; this.legFlex = 0;
    this.pivot.rotation.x = 0; this.pivot.position.set(0, 0, 0);
    this.poseT.sit = 0;
  }

  /** Show the small parts (eyes, lashes, jewellery, glasses) only when near the camera. */
  setDetail(on) {
    if (this._detail === on || !this.detail) return;
    this._detail = on;
    for (const m of this.detail) m.visible = on;
    // far away: the low-detail meshes (a quarter of the triangles)
    if (this.lod) for (const l of this.lod) l.mesh.geometry = on ? l.near : l.far;
  }

  attach(obj, boneName, offset = new THREE.Vector3()) {
    const a = { obj, bone: this.bones[boneName], offset }; this.accessories.push(a); return a;
  }
  detach(obj) { this.accessories = this.accessories.filter((a) => a.obj !== obj); }

  // ---------------------------------------------------------------- animation
  _locomotion(dt) {
    const Lc = this.loco, A = this.actions;
    Lc.v += (Lc.vt - Lc.v) * Math.min(1, dt * 7);
    const av = Math.abs(Lc.v), k = this.stride;
    const walkN = WALK_SPEED * k, runN = RUN_SPEED * k;
    // below normal walking speed people take shorter steps, not slower ones: the stride
    // shrinks (walk blended with standing) with the square root of speed, and so does the
    // cadence, so a stroll looks like a stroll and not a slow-motion walk
    const ww = sstep(0.02, 0.12, av) * Math.min(1, Math.sqrt(av / walkN));
    const wr = sstep(walkN * 1.1, runN * 0.92, av);
    // over-clip (dance…) fades in/out
    Lc.overW += ((Lc.overOn ? 1 : 0) - Lc.overW) * Math.min(1, dt * 4);
    if (Lc.over && !Lc.overOn && Lc.overW < 0.01) { Lc.over.stop(); Lc.over = null; }
    const keep = 1 - (Lc.over ? Lc.overW : 0);
    if (A.walk && A.run) {
      const wd = A.walk.getClip().duration, rd = A.run.getClip().duration;
      // one cadence for both clips so their footfalls line up while blending
      const fW = Math.max(av, 0.3) / (walkN * Math.max(0.35, ww)) / wd, fR = av / runN / rd;
      const f = THREE.MathUtils.lerp(fW, Math.max(fR, fW * 0.6), wr);
      Lc.phase = frac(Lc.phase + f * dt * (Lc.v < 0 ? -1 : 1));
      A.walk.time = Lc.phase * wd;
      A.run.time = frac(Lc.phase + RUN_PHASE) * rd;
      A.walk.setEffectiveWeight(ww * (1 - wr) * keep);
      A.run.setEffectiveWeight(ww * wr * keep);
    }
    A.idle?.setEffectiveWeight((1 - ww) * keep);
    if (Lc.over) Lc.over.setEffectiveWeight(Lc.overW);
    return { av, ww, wr };
  }

  /** Two-bone IK: put the wrist of `side` at world point T, elbow toward world direction `pole`. */
  _armIK(side, T, pole, w) {
    const B = this.bones, A = B[side + 'Arm'], F = B[side + 'ForeArm'], H = B[side + 'Hand'];
    if (!A || !F || !H || w < 1e-3) return;
    A.getWorldPosition(_S); F.getWorldPosition(_E); H.getWorldPosition(_W);
    const a = _S.distanceTo(_E), b = _E.distanceTo(_W);
    _a.subVectors(T, _S); let d = _a.length();
    d = THREE.MathUtils.clamp(d, Math.abs(a - b) + 0.01, (a + b) * 0.995);
    _a.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    _b.copy(pole).addScaledVector(_a, -pole.dot(_a));
    if (_b.lengthSq() < 1e-6) _b.set(0, -1, 0).addScaledVector(_a, _a.y);
    _b.normalize();
    _P.copy(_S).addScaledVector(_a, cosA * a).addScaledVector(_b, sinA * a);          // desired elbow
    alignW(A, _c.subVectors(_E, _S).normalize(), _b.subVectors(_P, _S).normalize(), w);
    F.getWorldPosition(_E); H.getWorldPosition(_W);
    _P.copy(_S).addScaledVector(_a, d);                                                 // reachable target
    alignW(F, _c.subVectors(_W, _E).normalize(), _b.subVectors(_P, _E).normalize(), w);
  }
  /** Turn the hand so its fingers point along world direction dir. */
  _handDir(side, dir, w) {
    const H = this.bones[side + 'Hand'], M = this.bones[side + 'HandMiddle1'];
    if (!H || !M || w < 1e-3) return;
    H.getWorldPosition(_W); M.getWorldPosition(_E);
    alignW(H, _c.subVectors(_E, _W).normalize(), _b.copy(dir).normalize(), w);
  }
  /** World point relative to the upper chest, in body axes (scaled by body size). */
  _rel(x, y, z, out = _T) {
    const k = this.k;
    return out.copy(_C).addScaledVector(_L, x * k).addScaledVector(_U, y * k).addScaledVector(_F, z * k);
  }
  _dir(x, y, z, out = _v) { return out.set(0, 0, 0).addScaledVector(_L, x).addScaledVector(_U, y).addScaledVector(_F, z).normalize(); }

  _gesture(name, w, t, opts) {
    const B = this.bones, R = 'Right', Lf = 'Left';
    const pole = (x, y, z) => this._dir(x, y, z, _W.clone());
    switch (name) {
      case 'wave': {
        const sw = Math.sin(t * 8.5);
        this._armIK(R, this._rel(-0.3 + sw * 0.03, 0.36, 0.1), pole(-1, -1.2, -0.3), w);
        this._handDir(R, this._dir(sw * 0.45, 1, 0.15, _a.clone()), w);
        rotW(B.Head, _U, -0.12 * w);
        break;
      }
      case 'namaste': case 'bow': {
        const bowW = name === 'bow' ? 1 : 0.35;
        rotW(B.Spine1, _L, 0.16 * bowW * w); rotW(B.Spine2, _L, 0.12 * bowW * w);
        rotW(B.Head, _L, (0.22 + 0.1 * bowW) * w);
        this.root.updateMatrixWorld(true); B.Spine2.getWorldPosition(_C);
        for (const [s, sx] of [[Lf, 1], [R, -1]]) {
          this._armIK(s, this._rel(sx * 0.028, -0.16, 0.2, _T.clone()), pole(sx, -0.7, -0.4), w);
          this._handDir(s, this._dir(-sx * 0.12, 1, 0.25, _a.clone()), w);
        }
        break;
      }
      case 'handshake': {
        const pump = t > 0.55 && t < 1.9 ? Math.sin((t - 0.55) * 13) * 0.035 : 0;
        const P = opts.point ? opts.point(_T.clone()) : this._rel(-0.06, -0.38, 0.42, _T.clone());
        P.y += pump;
        this._armIK(R, P, pole(-0.6, -1, -0.2), w);
        _a.subVectors(P, _C); _a.y = -0.15 * _a.length(); this._handDir(R, _a.normalize(), w);
        rotW(B.Head, _L, 0.12 * w);
        break;
      }
      case 'highfive': {
        const up = this._rel(-0.2, 0.42, 0.3, _T.clone());
        const P = opts.point ? opts.point(_P.clone()) : this._rel(-0.12, 0.48, 0.42, _P.clone());
        const hit = sstep(0.3, 0.55, t);
        up.lerp(P, hit);
        this._armIK(R, up, pole(-1, -1, -0.4), w);
        this._handDir(R, this._dir(0, 1, 0.35, _a.clone()), w);
        rotW(B.Head, _L, -0.12 * w);
        break;
      }
      case 'clap': {
        const gap = 0.012 + 0.07 * Math.abs(Math.sin(t * Math.PI * 2.3));
        for (const [s, sx] of [[Lf, 1], [R, -1]]) {
          this._armIK(s, this._rel(sx * gap, -0.13, 0.27, _T.clone()), pole(sx, -0.8, -0.3), w);
          this._handDir(s, this._dir(-sx * 0.4, 0.8, 0.5, _a.clone()), w);
        }
        break;
      }
      case 'cheer': {
        const bob = Math.sin(t * 7) * 0.04;
        for (const [s, sx] of [[Lf, 1], [R, -1]]) {
          this._armIK(s, this._rel(sx * 0.3, 0.64 + bob, 0.06, _T.clone()), pole(sx, -0.3, -0.5), w);
          this._handDir(s, this._dir(sx * 0.15, 1, 0, _a.clone()), w);
        }
        rotW(B.Head, _L, -0.18 * w);
        break;
      }
      case 'laugh': {
        rotW(B.Spine1, _L, (Math.sin(t * 15) * 0.035 + 0.05) * w);
        rotW(B.Head, _L, (-0.22 + Math.sin(t * 15) * 0.05) * w);
        this.root.updateMatrixWorld(true); B.Spine2.getWorldPosition(_C);
        this._armIK(R, this._rel(-0.04, -0.4, 0.2, _T.clone()), pole(-1, -0.5, -0.3), w);
        this._armIK(Lf, this._rel(0.09, -0.46, 0.19, _T.clone()), pole(1, -0.5, -0.3), w * 0.8);
        break;
      }
      case 'nod': rotW(B.Head, _L, Math.sin(t * 8) * 0.2 * w); break;
      case 'headshake': rotW(B.Head, _U, Math.sin(t * 9) * 0.32 * w); break;
      case 'shrug': {
        rotW(B.LeftShoulder, _F, -0.18 * w); rotW(B.RightShoulder, _F, 0.18 * w);
        for (const [s, sx] of [[Lf, 1], [R, -1]]) {
          this._armIK(s, this._rel(sx * 0.36, -0.36, 0.26, _T.clone()), pole(sx * 0.3, -1, -0.4), w);
          this._handDir(s, this._dir(sx, 0.1, 0.6, _a.clone()), w);
        }
        rotW(B.Head, _F, 0.12 * w);
        break;
      }
      case 'think': {
        rotW(B.Head, _L, 0.08 * w); rotW(B.Head, _F, -0.1 * w);
        this.root.updateMatrixWorld(true); B.Spine2.getWorldPosition(_C);
        this._armIK(R, this._rel(-0.05, 0.2, 0.17, _T.clone()), pole(-0.5, -1, 0.2), w);
        this._handDir(R, this._dir(0.2, 1, 0.2, _a.clone()), w);
        this._armIK(Lf, this._rel(0.0, -0.25, 0.2, _T.clone()), pole(1, -0.6, 0), w * 0.9);
        break;
      }
      case 'knock': {
        const k = Math.max(0, Math.sin(t * 15)) * 0.05;
        this._armIK(R, this._rel(-0.12, 0.02, 0.43 + k), pole(-1, -1, -0.2), w);
        this._handDir(R, this._dir(0, 0.6, 1, _a.clone()), w);
        break;
      }
      case 'push': {
        this._armIK(R, this._rel(-0.14, -0.08, 0.5), pole(-1, -1, -0.2), w);
        this._handDir(R, this._dir(0, 0.7, 1, _a.clone()), w);
        break;
      }
      case 'serve': {
        rotW(B.Spine1, _L, 0.22 * w); rotW(B.Head, _L, 0.2 * w);
        this.root.updateMatrixWorld(true); B.Spine2.getWorldPosition(_C);
        for (const [s, sx] of [[Lf, 1], [R, -1]]) this._armIK(s, this._rel(sx * 0.14, -0.32, 0.46, _T.clone()), pole(sx, -1, -0.3), w);
        break;
      }
    }
  }

  /** Called every frame. */
  update(dt) {
    this.t += dt;
    if (this.bubbleTime > 0) { this.bubbleTime -= dt; if (this.bubbleTime <= 0) this.bubbleEl.hidden = true; }
    const loco = this._locomotion(dt);
    this.mixer.update(dt);
    // ease pose weights
    const k = Math.min(1, dt * 3.5);
    for (const p in this.pose) this.pose[p] += (this.poseT[p] - this.pose[p]) * k;
    if (this.kind === 'robot') return;

    // turn rate (for leaning into turns), measured from the root's yaw
    const yaw = this.root.rotation.y;
    let dy = yaw - this.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.prevYaw = yaw;
    this.yawRate += ((dt > 0 ? dy / dt : 0) - this.yawRate) * Math.min(1, dt * 6);
    const leanT = loco.ww * (0.035 + 0.11 * loco.wr), rollT = THREE.MathUtils.clamp(-this.yawRate * loco.av * 0.045, -0.22, 0.22);
    this.lean += (leanT - this.lean) * Math.min(1, dt * 5); this.roll += (rollT - this.roll) * Math.min(1, dt * 5);

    const P = this.pose, B = this.bones;
    const g = this.gest;
    const anyPose = P.sit + P.wave + P.eat + P.type + P.talk + P.carry + P.stir + P.look + P.swim + P.phone > 0.01;
    const lookOn = this.lookAt || Math.abs(this.look.yaw) + Math.abs(this.look.pitch) > 0.01;
    const leanOn = Math.abs(this.lean) + Math.abs(this.roll) > 0.004;
    if (!anyPose && !g && !lookOn && !leanOn && !this.accessories.length && this.legFlex < 1e-3) { this.model.position.y = this.baseY; return; }
    this.root.updateMatrixWorld(true);
    // character axes in world space
    this.pivot.getWorldQuaternion(_q);
    _L.set(1, 0, 0).applyQuaternion(_q); _F.set(0, 0, 1).applyQuaternion(_q); _U.set(0, 1, 0).applyQuaternion(_q);
    const t = this.t;

    if (leanOn && P.sit < 0.5 && !this.lie) {
      rotW(B.Spine, _L, this.lean);
      rotW(B.Spine1, _F, this.roll);
    }
    if (P.sit > 0.01) {
      const s = P.sit;
      for (const side of ['Left', 'Right']) { rotW(B[side + 'UpLeg'], _L, -Math.PI / 2 * s); rotW(B[side + 'Leg'], _L, Math.PI / 2 * s * 0.95); }
      // lean back a little into the backrest, like people really sit
      rotW(B.Spine, _L, -0.08 * s);
      this.model.position.y = this.baseY + ((this.seatY + 0.11) - this.lib.hipH * this.k) * s;
      // feet flat on the floor: let the thighs slope down (and bend the knees back) until they reach it
      if (!this.lie && B.LeftFoot && this.lib.thigh) {
        this.model.updateMatrixWorld(true);
        const floor = this.root.position.y + (this.lib.ankleH ?? 0.08) * this.k, th = this.lib.thigh * this.k;
        for (const side of ['Left', 'Right']) {
          B[side + 'Foot'].getWorldPosition(_v);
          const d = _v.y - floor;
          if (d > 0.01) { const a = Math.asin(Math.min(0.6, d / th)) * s; rotW(B[side + 'UpLeg'], _L, a); rotW(B[side + 'Leg'], _L, -a); }
        }
      }
    } else this.model.position.y = this.baseY;

    if (this.legFlex > 1e-3) {
      // reclining: legs bent up at the hips to lie flat, knees a little soft, arms resting
      for (const side of ['Left', 'Right']) { rotW(B[side + 'UpLeg'], _L, -this.legFlex - 0.06); rotW(B[side + 'Leg'], _L, 0.1); }
      const r = Math.min(1, this.legFlex / 0.6);
      rotW(B.Head, _L, 0.25 * r);
    }
    if (P.swim > 0.01) {
      const w = P.swim, ph = t * 3.2;
      rotW(B.LeftArm, _L, (ph % (Math.PI * 2)) * w);
      rotW(B.RightArm, _L, ((ph + Math.PI) % (Math.PI * 2)) * w);
      rotW(B.LeftUpLeg, _L, Math.sin(t * 9) * 0.3 * w); rotW(B.RightUpLeg, _L, -Math.sin(t * 9) * 0.3 * w);
      rotW(B.Head, _F, Math.sin(t * 1.6) * 0.4 * w);
    }
    if (P.carry > 0.01) {
      const w = P.carry;
      for (const s of ['Left', 'Right']) { rotW(B[s + 'Arm'], _L, -0.35 * w); rotW(B[s + 'ForeArm'], _L, -1.25 * w); }
    }
    if (P.type > 0.01) {
      const w = P.type;
      for (const [s, ph] of [['Left', 0], ['Right', 1.7]]) {
        rotW(B[s + 'Arm'], _L, -0.45 * w); rotW(B[s + 'ForeArm'], _L, (-1.05 + Math.sin(t * 13 + ph) * 0.05) * w);
      }
      rotW(B.Head, _L, 0.22 * w);
    }
    if (P.eat > 0.01) {
      const w = P.eat, cyc = (Math.sin(t * 1.4) + 1) / 2;
      rotW(B.RightArm, _L, -0.75 * w); rotW(B.RightForeArm, _L, -(0.7 + cyc * 1.1) * w);
      rotW(B.LeftArm, _L, -0.55 * w); rotW(B.LeftForeArm, _L, -0.9 * w);
      rotW(B.Head, _L, (0.15 - cyc * 0.1) * w);
    }
    if (P.stir > 0.01) {
      const w = P.stir;
      rotW(B.RightArm, _L, -0.6 * w); rotW(B.RightForeArm, _L, -1.0 * w); rotW(B.RightForeArm, _U, Math.sin(t * 5) * 0.45 * w);
      rotW(B.LeftArm, _L, -0.4 * w); rotW(B.LeftForeArm, _L, -0.8 * w);
      rotW(B.Head, _L, 0.3 * w);
    }
    if (P.talk > 0.01) {
      const w = P.talk * (g ? 0.3 : 1);
      rotW(B.Head, _U, Math.sin(t * 0.8) * 0.2 * w); rotW(B.Head, _L, Math.sin(t * 3.1) * 0.05 * w);
      if (!g) { rotW(B.RightForeArm, _L, -(0.5 + Math.sin(t * 2.3) * 0.35) * w); rotW(B.RightForeArm, _U, Math.sin(t * 1.7) * 0.3 * w); }
    }
    if (P.phone > 0.01) {
      const w = P.phone;
      rotW(B.RightArm, _L, -0.5 * w); rotW(B.RightForeArm, _L, -1.4 * w); rotW(B.Head, _L, 0.35 * w);
    }
    if (P.look > 0.01) rotW(B.Head, _U, Math.sin(t * 0.45) * 0.7 * P.look);

    // IK gestures work in world space from the (posed) upper chest
    if (B.Spine2 && (P.wave > 0.01 || g)) {
      this.root.updateMatrixWorld(true);
      B.Spine2.getWorldPosition(_C);
      if (P.wave > 0.01 && g?.name !== 'wave') this._gesture('wave', P.wave, t, {});
      if (g) {
        g.t += dt;
        const w = sstep(0, g.fade, g.t) * (g.dur === Infinity ? 1 : sstep(0, g.fade, g.dur - g.t));
        B.Spine2.getWorldPosition(_C);
        if (!GESTURES[g.name].clip) this._gesture(g.name, w, g.t, g.opts);
        if (g.t >= g.dur) { if (GESTURES[g.name].clip) this.stopOver(); g.opts.done?.(); this.gest = null; }
      }
    }

    // head turns toward whoever we are looking at (clamped like a real neck)
    let ty = 0, tp = 0;
    if (this.lookAt && B.Head) {
      B.Head.getWorldPosition(_v);
      _a.subVectors(this.lookAt, _v);
      const fx = _a.dot(_F), lx = _a.dot(_L), uy = _a.dot(_U);
      if (fx > -0.2) {
        ty = THREE.MathUtils.clamp(Math.atan2(lx, Math.max(0.05, fx)), -1.0, 1.0);
        tp = THREE.MathUtils.clamp(-Math.atan2(uy, Math.hypot(fx, lx)), -0.35, 0.4);
      }
    }
    const lr = Math.min(1, dt * 4);
    this.look.yaw += (ty - this.look.yaw) * lr; this.look.pitch += (tp - this.look.pitch) * lr;
    if (Math.abs(this.look.yaw) + Math.abs(this.look.pitch) > 0.005) {
      rotW(B.Neck, _U, this.look.yaw * 0.4); rotW(B.Head, _U, this.look.yaw * 0.6);
      rotW(B.Head, _L, this.look.pitch);
    }

    for (const a of this.accessories) {
      if (!a.bone) continue;
      a.bone.getWorldPosition(_v);
      a.obj.position.copy(_v).add(a.offset);
      this.root.getWorldQuaternion(a.obj.quaternion);
    }
  }
}
