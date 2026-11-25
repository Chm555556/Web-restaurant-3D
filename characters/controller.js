// characters/controller.js — the player: arrow keys / WASD, Shift to run,
// collisions with walls, furniture and people, smooth acceleration, and real
// sit-down / stand-up / lie-down movements (step to the seat, turn, lower yourself).
import * as THREE from 'three';
import { Character } from './character.js';
import { resolveCircle } from '../systems/collision.js';
import { CONFIG } from '../config.js';
import { dress } from './indian.js';
import { findPath } from '../systems/nav.js';

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Player {
  constructor(scene, kind, name) {
    const outfit = kind === 'xbot'
      ? dress.kurta({ main: 0xf4ecd8, bottom: 0xf4ecd8, vest: 0x1f3a68, skin: 'medium' })
      : dress.anarkali({ main: 0xc62828, bottom: 0xf7e7c6, dupatta: 0xf7e7c6, hair: 'braid', skin: 'wheat' });
    this.ch = new Character(kind, { name, role: 'You', outfit, label: true });
    this.ch.label.element.classList.add('is-player');
    scene.add(this.ch.root);
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.yaw = CONFIG.player.start.yaw;
    this.ch.root.position.set(CONFIG.player.start.x, 0, CONFIG.player.start.z);
    this.ch.root.rotation.y = this.yaw;
    this.enabled = false;
    this.moving = 0;
    this.v = 0;                // current forward speed (accelerates / decelerates)
    this.mode = 'free';        // free | seated | lying
    this.seat = null;          // the anchor we are sitting or lying on
    this.onStand = null;       // callback (set by systems/interact.js)
    this.trans = null;         // an animated move in progress (sit, stand, lie, step)
    this.auto = null;          // walking somewhere on our own (to a seat, to shake hands)

    const keyMap = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      const k = keyMap(e);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === ' ' && this.enabled && !e.repeat) this.onWave ? this.onWave() : this.wave();
      if (this.mode !== 'free' && this.enabled && !this.trans && ['ArrowUp', 'ArrowDown', 'w', 's'].includes(k)) this.standUp();
      if (this.auto && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(k)) this.cancelAuto();
    });
    addEventListener('keyup', (e) => this.keys.delete(keyMap(e)));
    addEventListener('blur', () => this.keys.clear());
  }
  get x() { return this.ch.x; } get z() { return this.ch.z; }
  get busy() { return !!this.trans || !!this.auto; }

  wave() { this.ch.gesture('wave'); }
  gesture(name, opts) { this.ch.gesture(name, opts); }

  // ------------------------------------------------------------------ seats
  /** Where to stand before sitting down: in front of the seat, or beside it if a table is in the way. */
  approachPoint(a, lie) {
    const yaw = a.yaw, cands = [];
    const at = (ang, d) => new THREE.Vector3(a.x + Math.sin(yaw + ang) * d, 0, a.z + Math.cos(yaw + ang) * d);
    if (lie) cands.push(at(-Math.PI / 2, 0.85), at(Math.PI / 2, 0.85), at(0, 1.1));
    else cands.push(at(0, 0.6), at(-Math.PI / 2, 0.62), at(Math.PI / 2, 0.62), at(-Math.PI * 0.7, 0.7), at(Math.PI * 0.7, 0.7));
    let best = null;
    for (const p of cands) {
      const q = resolveCircle(p.clone(), CONFIG.player.radius * 0.9);
      const moved = Math.hypot(q.x - p.x, q.z - p.z);
      const score = moved * 10 + Math.hypot(p.x - this.x, p.z - this.z) * 0.6;
      if (!best || score < best.score) best = { p: moved < 0.05 ? p : q, score };
    }
    return best.p;
  }

  /** Walk to a seat, turn, and sit (or lie) down. */
  sitOn(a, lie = false, done) {
    if (this.mode !== 'free') {
      // already seated: lying down on the same bed / sitting up again happens in place
      const from = this.seat;
      from.occupant = null;
      this.seat = a; a.occupant = this;
      this._seatTrans(from, a, lie, done);
      return;
    }
    this.seat = a; a.occupant = this;
    const ap = this.approachPoint(a, lie);
    this.walkTo(ap.x, ap.z, () => this._sitFrom(ap, a, lie, done), 3);
  }

  _sitFrom(ap, a, lie, done) {
    const ch = this.ch;
    this.mode = lie ? 'lying' : 'seated';
    ch.clearPoses(); ch.setMove(0);
    const p0 = new THREE.Vector3(this.x, 0, this.z), yaw0 = this.yaw;
    const seatPt = new THREE.Vector3(a.x, 0, a.z);
    ch.seatY = a.seatY ?? (lie ? 0.45 : 0.5);
    const dur = lie ? 1.7 : 1.0;
    this.trans = {
      t: 0, dur,
      step: (u) => {
        // turn around first, then lower onto the seat while sliding back into it
        const turn = ease(u / 0.45);
        this.yaw = yaw0 + angDiff(yaw0, a.yaw) * turn; ch.root.rotation.y = this.yaw;
        const slide = ease((u - 0.25) / 0.6);
        ch.root.position.lerpVectors(p0, seatPt, slide);
        if (!lie) { ch.pose.sit = ch.poseT.sit = ease((u - 0.3) / 0.7); return; }
        // lie: sit on the edge, then lean back and stretch out
        const sit = ease((u - 0.25) / 0.35), recl = ease((u - 0.55) / 0.45);
        ch.pose.sit = ch.poseT.sit = sit * (1 - recl);
        ch.pivot.rotation.x = (a.pitch ?? (-Math.PI / 2 + 0.28)) * recl;
        ch.pivot.position.set(0, (a.h ?? 0.52) * recl, (a.off ?? 0.95) * recl);
      },
      end: () => {
        if (lie) ch.lieOn(a); else ch.sitAt(a, true);
        this.yaw = a.yaw;
        done?.();
      },
    };
  }

  /** Seated ⇄ lying on the same piece of furniture (bed). */
  _seatTrans(from, to, lie, done) {
    const ch = this.ch, wasLie = this.mode === 'lying';
    this.mode = lie ? 'lying' : 'seated';
    const p0 = ch.root.position.clone(), p1 = new THREE.Vector3(to.x, 0, to.z);
    const yaw0 = this.yaw;
    const lp = wasLie ? from : to;      // the lying anchor
    this.trans = {
      t: 0, dur: 1.3,
      step: (u) => {
        const e = ease(u);
        ch.root.position.lerpVectors(p0, p1, e);
        this.yaw = yaw0 + angDiff(yaw0, to.yaw) * e; ch.root.rotation.y = this.yaw;
        const recl = wasLie ? 1 - e : e;
        if (!wasLie) ch.seatY = from.seatY ?? 0.5;
        ch.lie = false; ch.pose.sit = ch.poseT.sit = 1 - recl;
        ch.pivot.rotation.x = (lp.pitch ?? (-Math.PI / 2 + 0.28)) * recl;
        ch.pivot.position.set(0, (lp.h ?? 0.52) * recl, (lp.off ?? 0.95) * recl);
      },
      end: () => { if (lie) ch.lieOn(to); else { ch.standUp(); ch.sitAt(to, true); } this.yaw = to.yaw; done?.(); },
    };
  }

  /** Stand up and step to a free spot beside the seat. */
  standUp(quiet = false) {
    const a = this.seat; if (!a) return;
    if (this.trans) { this.trans.step(1); this.trans.end(); this.trans = null; }
    a.occupant = null; this.seat = null;
    const was = this.mode;
    const ch = this.ch;
    ch.clearPoses();
    const reach = was === 'lying' ? 0.85 : 0.6;
    let best = null;
    for (const ang of [0, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75, Math.PI]) {
      for (const d of [reach, reach + 0.35]) {
        const p = new THREE.Vector3(a.x + Math.sin(a.yaw + ang) * d, 0, a.z + Math.cos(a.yaw + ang) * d);
        const q = resolveCircle(p.clone(), CONFIG.player.radius);
        const moved = Math.hypot(q.x - p.x, q.z - p.z);
        if (!best || moved < best.moved - 1e-3) best = { q, moved };
        if (moved < 0.01) break;
      }
      if (best.moved < 0.01) break;
    }
    const p0 = ch.root.position.clone(), p1 = new THREE.Vector3(best.q.x, 0, best.q.z);
    const yaw0 = this.yaw, yaw1 = Math.atan2(p1.x - a.x, p1.z - a.z);
    const lp = was === 'lying' ? a : null;
    if (lp) { ch.lie = false; }
    const sit0 = lp ? 0 : ch.pose.sit;
    this.trans = {
      t: 0, dur: lp ? 1.5 : 0.9,
      step: (u) => {
        if (lp) {
          // sit up first, swing the legs round, then stand
          const up = ease(u / 0.45);
          ch.pivot.rotation.x = (lp.pitch ?? (-Math.PI / 2 + 0.28)) * (1 - up);
          ch.pivot.position.set(0, (lp.h ?? 0.52) * (1 - up), (lp.off ?? 0.95) * (1 - up));
          ch.seatY = lp.h ? lp.h - 0.2 : 0.45;
          ch.pose.sit = ch.poseT.sit = up * (1 - ease((u - 0.55) / 0.45));
        } else ch.pose.sit = ch.poseT.sit = sit0 * (1 - ease(u / 0.75));
        const slide = ease((u - (lp ? 0.5 : 0.15)) / (lp ? 0.5 : 0.75));
        ch.root.position.lerpVectors(p0, p1, slide);
        this.yaw = yaw0 + angDiff(yaw0, yaw1) * ease((u - 0.3) / 0.7); ch.root.rotation.y = this.yaw;
      },
      end: () => {
        ch.standUp(); ch.pose.sit = 0;
        this.mode = 'free';
        if (!quiet && this.onStand) this.onStand(a, was);
      },
    };
    this.mode = 'standing-up';
  }

  teleport(x, z, yaw) {
    if (this.mode !== 'free' && this.seat) { this.seat.occupant = null; this.seat = null; this.ch.standUp(); this.ch.clearPoses(); this.ch.pose.sit = 0; this.mode = 'free'; this.onStand?.(null, 'teleport'); }
    this.trans = null; this.auto = null; this.v = 0;
    this.ch.root.position.set(x, 0, z);
    this.yaw = yaw; this.ch.root.rotation.y = yaw;
  }

  // ------------------------------------------------------------------ auto walk
  /** Walk on our own to (x,z) (used to reach a seat or a person). */
  walkTo(x, z, then, timeout = 3, faceYaw = null) {
    // go round tables and chairs, not through them
    const path = findPath(this.x, this.z, x, z) || [[this.x, this.z], [x, z]];
    const pts = path.slice(1);
    const len = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
    this.auto = { x, z, pts, then, t: Math.max(timeout, len / 1.1 + 1), faceYaw };
  }
  cancelAuto() {
    if (!this.auto) return;
    this.auto = null;
    if (this.seat && this.mode === 'free') { this.seat.occupant = null; this.seat = null; }
  }

  update(dt, others) {
    const P = CONFIG.player, k = this.keys, ch = this.ch;
    // animated transition (sitting down, standing up…)
    if (this.trans) {
      const tr = this.trans;
      tr.t += dt;
      tr.step(Math.min(1, tr.t / tr.dur));
      if (tr.t >= tr.dur) { this.trans = null; tr.end(); }
      ch.setMove(0); this.moving = 0; this.v = 0;
      ch.update(dt);
      return;
    }
    if (this.mode === 'seated' || this.mode === 'lying') {
      // seated / lying: stay put until the player walks off
      const go = this.enabled && (k.has('ArrowUp') || k.has('w') || k.has('ArrowDown') || k.has('s') || Math.abs(this.joy.y) > 0.5);
      if (go) this.standUp();
      ch.setMove(0); this.moving = 0;
      ch.update(dt);
      return;
    }

    let fwd = 0, turn = 0, run = false;
    const pos = ch.root.position, prev = pos.clone();
    if (this.auto) {
      const A = this.auto;
      A.t -= dt;
      // intermediate corners first
      while (A.pts.length > 1 && Math.hypot(A.pts[0][0] - pos.x, A.pts[0][1] - pos.z) < 0.35) A.pts.shift();
      const [gx, gz] = A.pts.length ? A.pts[0] : [A.x, A.z];
      const last = A.pts.length <= 1;
      const dx = gx - pos.x, dz = gz - pos.z, d = Math.hypot(dx, dz);
      if ((last && d < 0.08) || A.t <= 0) {
        if (A.faceYaw !== null && Math.abs(angDiff(this.yaw, A.faceYaw)) > 0.05 && A.t > -1) {
          this.yaw += THREE.MathUtils.clamp(angDiff(this.yaw, A.faceYaw), -6 * dt, 6 * dt); ch.root.rotation.y = this.yaw;
          this.v = Math.max(0, this.v - dt * 8); ch.setMove(0.35);
          ch.update(dt); return;
        }
        this.auto = null; this.v = 0; ch.setMove(0);
        A.then?.();
        ch.update(dt); return;
      }
      const want = Math.atan2(dx, dz), diff = angDiff(this.yaw, want);
      this.yaw += THREE.MathUtils.clamp(diff, -7 * dt, 7 * dt); ch.root.rotation.y = this.yaw;
      const vt = (last ? Math.min(1.25, 0.35 + d * 2.2) : 1.25) * Math.max(0.2, Math.cos(diff));
      this.v += THREE.MathUtils.clamp(vt - this.v, -dt * 8, dt * 5);
      const s = Math.min(d, this.v * dt);
      pos.x += dx / d * s; pos.z += dz / d * s;
      ch.setMove(Math.max(this.v, Math.abs(diff) > 0.3 ? 0.4 : 0));
      this.moving = this.v;
      ch.update(dt);
      return;
    }

    if (this.enabled) {
      if (k.has('ArrowUp') || k.has('w')) fwd += 1;
      if (k.has('ArrowDown') || k.has('s')) fwd -= 1;
      if (k.has('ArrowLeft') || k.has('a')) turn += 1;
      if (k.has('ArrowRight') || k.has('d')) turn -= 1;
      if (Math.abs(this.joy.y) > 0.15) fwd = -this.joy.y;
      if (Math.abs(this.joy.x) > 0.15) turn = -this.joy.x;
      run = (k.has('Shift') || Math.abs(this.joy.y) > 0.85) && fwd > 0;
    }
    // turning is a little slower at a run, like a real body
    const turnRate = P.turnSpeed * (1 - Math.min(0.35, Math.abs(this.v) / 12));
    this.yaw += turn * turnRate * dt * (fwd < 0 ? -1 : 1);
    ch.root.rotation.y = this.yaw;
    const target = fwd > 0 ? (run ? P.runSpeed : P.walkSpeed) * Math.min(1, fwd) : fwd < 0 ? -P.backSpeed : 0;
    // accelerate like a person (≈0.4 s to walking pace), brake a bit faster
    const acc = Math.sign(target - this.v) === Math.sign(this.v) || this.v === 0 ? 4.2 : 8;
    this.v += THREE.MathUtils.clamp(target - this.v, -acc * dt * (target === 0 ? 1.6 : 1), acc * dt);
    if (Math.abs(this.v) < 0.01 && target === 0) this.v = 0;
    pos.x += Math.sin(this.yaw) * this.v * dt;
    pos.z += Math.cos(this.yaw) * this.v * dt;
    // people are solid too
    for (const o of others) {
      if (o.lie || o.ch?.lie) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz);
      if (d < 0.62 && d > 1e-4) { pos.x += dx / d * (0.62 - d); pos.z += dz / d * (0.62 - d); }
    }
    resolveCircle(pos, P.radius);
    const actual = Math.hypot(pos.x - prev.x, pos.z - prev.z) / Math.max(dt, 1e-4);
    this.moving = actual;
    // walking into a wall: don't keep running on the spot
    if (actual < Math.abs(this.v) * 0.35 && Math.abs(this.v) > 0.5) this.v *= 0.85;

    // animation: the blend tree takes the real ground speed; turning on the spot = small steps
    let anim = Math.sign(this.v) * Math.min(Math.abs(this.v), actual + 0.05);
    if (turn !== 0 && Math.abs(anim) < 0.3) anim = 0.45;
    ch.setMove(anim);
    ch.update(dt);
  }
}

/** On-screen joystick for touch devices. */
export function attachJoystick(el, knob, player) {
  let id = null, cx = 0, cy = 0;
  const R = 46;
  const set = (x, y) => {
    let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    player.joy.x = dx / R; player.joy.y = dy / R;
  };
  el.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; el.setPointerCapture(id); set(e.clientX, e.clientY); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e.clientX, e.clientY); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; player.joy.x = player.joy.y = 0; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
