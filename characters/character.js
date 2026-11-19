// characters/character.js — one animated person (or robot) in the world.
//   root  (position + yaw; yaw 0 = facing +Z)
//   └ pivot (pitch for lying on a lounger / swimming)
//     └ model (cloned .glb, scaled, turned so it faces +Z)
// AnimationMixer plays idle/walk/run with 0.3 s crossfades (guide, chapter 4).
// On top of the clip, small procedural poses (sit, eat, type, wave, talk, carry,
// stir, swim) bend individual bones in world space, so one rig can do many jobs.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { library } from './loader.js';

const outfitCache = new Map();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _r = new THREE.Quaternion();
const _v = new THREE.Vector3(), _L = new THREE.Vector3(), _F = new THREE.Vector3(), _U = new THREE.Vector3();

function rotW(bone, axis, ang) {
  if (!bone || Math.abs(ang) < 1e-4) return;
  bone.parent.getWorldQuaternion(_pq);
  _r.setFromAxisAngle(axis, ang);
  _q.copy(_pq).invert().multiply(_r).multiply(_pq);
  bone.quaternion.premultiply(_q);
  bone.updateMatrixWorld(true);
}

/** Recolour X-Bot / tint Michelle — "different clothing colours create visual variety". */
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

export class Character {
  constructor(kind, { name = '', role = '', outfit: of = null, label = true } = {}) {
    const L = library[kind];
    this.kind = kind; this.name = name; this.role = role; this.lib = L;
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.model = SkeletonUtils.clone(L.gltf.scene);
    this.model.scale.setScalar(L.scale);
    this.model.rotation.y = L.yawOffset;
    this.baseY = -L.minY * L.scale;
    this.model.position.y = this.baseY;
    this.model.traverse((o) => { if (o.isMesh) { o.castShadow = true; if (of) outfit(kind, o, of); } });
    this.pivot.add(this.model); this.root.add(this.pivot);

    this.bones = {};
    if (kind !== 'robot') for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftShoulder', 'RightShoulder'])
      this.bones[n] = this.model.getObjectByName('mixamorig' + n);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    for (const [k, c] of Object.entries(L.clips)) if (c) this.actions[k] = this.mixer.clipAction(c);
    if (this.actions.sit) { this.actions.sit.setLoop(THREE.LoopOnce); this.actions.sit.clampWhenFinished = true; }
    this.current = null;
    this.play('idle', 0);
    this.mixer.update(Math.random() * 2);

    // procedural pose weights (current → target)
    this.pose = { sit: 0, wave: 0, eat: 0, type: 0, talk: 0, carry: 0, stir: 0, look: 0, swim: 0, phone: 0 };
    this.poseT = { ...this.pose };
    this.seatY = 0.5;
    this.lie = false;
    this.t = Math.random() * 10;
    this.speed = 0;
    this.accessories = [];

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

  play(name, fade = 0.3) {
    const next = this.actions[name] || this.actions.idle;
    if (next === this.current) return;
    next.reset().setEffectiveWeight(1).play();
    if (this.current && fade > 0) this.current.crossFadeTo(next, fade, true);
    else if (this.current) this.current.stop();
    this.current = next; this.currentName = name;
  }

  setPose(k, v) { this.poseT[k] = v; }
  clearPoses(except = []) { for (const k of Object.keys(this.poseT)) if (!except.includes(k)) this.poseT[k] = 0; }

  say(text, secs = 4) {
    if (!this.bubbleEl) return;
    this.bubbleEl.textContent = text; this.bubbleEl.hidden = false; this.bubbleTime = secs;
  }

  /** Put the character in a seat (anchor = {x,z,yaw,seatY}). */
  sitAt(a, instant = false) {
    this.root.position.set(a.x, 0, a.z); this.root.rotation.y = a.yaw;
    this.seatY = a.seatY ?? 0.5;
    this.poseT.sit = 1; if (instant) this.pose.sit = 1;
    this.play('idle', instant ? 0 : 0.3);
    if (this.kind === 'robot' && this.actions.sit) this.play('sit');
  }

  /** Lie on a sun lounger (anchor yaw = lounger yaw; head toward the backrest). */
  lieOn(a) {
    this.lie = true;
    this.root.position.set(a.x, 0, a.z); this.root.rotation.y = a.yaw;
    this.pivot.rotation.x = -Math.PI / 2 + 0.28;
    this.pivot.position.set(0, 0.52, 0.95);
    this.play('idle', 0);
  }

  attach(obj, boneName, offset = new THREE.Vector3()) {
    this.accessories.push({ obj, bone: this.bones[boneName], offset });
  }

  /** Called every frame. far = skip expensive detail. */
  update(dt, far = false) {
    this.t += dt;
    if (this.bubbleTime > 0) { this.bubbleTime -= dt; if (this.bubbleTime <= 0) this.bubbleEl.hidden = true; }
    this.mixer.update(dt);
    // ease pose weights
    const k = Math.min(1, dt * 3.5);
    for (const p in this.pose) this.pose[p] += (this.poseT[p] - this.pose[p]) * k;
    if (this.kind === 'robot') return;
    const P = this.pose, B = this.bones;
    const anyPose = P.sit + P.wave + P.eat + P.type + P.talk + P.carry + P.stir + P.look + P.swim + P.phone > 0.01;
    if (!anyPose && !this.accessories.length) { this.model.position.y = this.baseY; return; }
    this.root.updateMatrixWorld(true);
    // character axes in world space
    this.pivot.getWorldQuaternion(_q);
    _L.set(1, 0, 0).applyQuaternion(_q); _F.set(0, 0, 1).applyQuaternion(_q); _U.set(0, 1, 0).applyQuaternion(_q);
    const t = this.t;

    if (P.sit > 0.01) {
      const s = P.sit;
      for (const side of ['Left', 'Right']) { rotW(B[side + 'UpLeg'], _L, -Math.PI / 2 * s); rotW(B[side + 'Leg'], _L, Math.PI / 2 * s * 0.95); }
      this.model.position.y = this.baseY + ((this.seatY + 0.1) - this.lib.hipH) * s;
    } else this.model.position.y = this.baseY;

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
      const w = P.talk;
      rotW(B.Head, _U, Math.sin(t * 0.8) * 0.35 * w); rotW(B.Head, _L, Math.sin(t * 3.1) * 0.06 * w);
      rotW(B.RightForeArm, _L, -(0.5 + Math.sin(t * 2.3) * 0.35) * w);
      rotW(B.RightForeArm, _U, Math.sin(t * 1.7) * 0.3 * w);
    }
    if (P.phone > 0.01) {
      const w = P.phone;
      rotW(B.RightArm, _L, -0.5 * w); rotW(B.RightForeArm, _L, -1.4 * w); rotW(B.Head, _L, 0.35 * w);
    }
    if (P.look > 0.01) rotW(B.Head, _U, Math.sin(t * 0.45) * 0.7 * P.look);
    if (P.wave > 0.01) {
      const w = P.wave;
      rotW(B.RightArm, _F, -2.3 * w);
      rotW(B.RightForeArm, _F, (Math.sin(t * 9) * 0.45 - 0.2) * w);
    }
    for (const a of this.accessories) {
      if (!a.bone) continue;
      a.bone.getWorldPosition(_v);
      a.obj.position.copy(_v).add(a.offset);
      this.root.getWorldQuaternion(a.obj.quaternion);
    }
  }
}
