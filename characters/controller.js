// characters/controller.js — the player: arrow keys / WASD, Shift to run,
// collisions with walls, furniture and people, and the idle/walk/run state machine.
import * as THREE from 'three';
import { Character } from './character.js';
import { resolveCircle } from '../systems/collision.js';
import { CONFIG } from '../config.js';
import { dress } from './indian.js';

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
    this.waveT = 0;
    this.mode = 'free';        // free | seated | lying
    this.seat = null;          // the anchor we are sitting or lying on
    this.onStand = null;       // callback (set by systems/interact.js)

    const keyMap = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      return k;
    };
    addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input,select,textarea')) return;
      const k = keyMap(e);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      this.keys.add(k);
      if (k === ' ' && this.enabled && !e.repeat) this.wave();
      if (this.mode !== 'free' && this.enabled && ['ArrowUp', 'ArrowDown', 'w', 's'].includes(k)) this.standUp();
    });
    addEventListener('keyup', (e) => this.keys.delete(keyMap(e)));
    addEventListener('blur', () => this.keys.clear());
  }
  get x() { return this.ch.x; } get z() { return this.ch.z; }

  wave() { this.waveT = 2.2; this.ch.setPose('wave', 1); }

  /** Sit on a seat anchor {x,z,yaw,seatY}, or lie down on one {x,z,yaw,pitch,h,off}. */
  sitOn(a, lie = false) {
    if (this.mode !== 'free') this.standUp(true);
    this.seat = a; a.occupant = this;
    this.mode = lie ? 'lying' : 'seated';
    this.yaw = a.yaw;
    this.ch.clearPoses();
    if (lie) this.ch.lieOn(a); else this.ch.sitAt(a);
    this.ch.play('idle', 0.2); this.ch.speed = 0;
  }

  /** Stand up and step to the nearest free spot beside the seat. */
  standUp(quiet = false) {
    const a = this.seat; if (!a) return;
    a.occupant = null; this.seat = null;
    const was = this.mode; this.mode = 'free';
    this.ch.standUp(); this.ch.clearPoses();
    const pos = this.ch.root.position, yaw = a.yaw;
    const reach = was === 'lying' ? 1.25 : 0.62;
    let best = null;
    for (const ang of [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75]) {
      for (const d of [reach, reach + 0.4]) {
        const p = new THREE.Vector3(a.x + Math.sin(yaw + ang) * d, 0, a.z + Math.cos(yaw + ang) * d);
        const q = resolveCircle(p.clone(), CONFIG.player.radius);
        const moved = Math.hypot(q.x - p.x, q.z - p.z);
        if (!best || moved < best.moved - 1e-3) best = { q, moved, ang };
        if (moved < 0.01) break;
      }
      if (best && best.moved < 0.01) break;
    }
    pos.set(best.q.x, 0, best.q.z);
    this.yaw = Math.atan2(pos.x - a.x, pos.z - a.z); this.ch.root.rotation.y = this.yaw;
    if (!quiet && this.onStand) this.onStand(a, was);
  }

  teleport(x, z, yaw) {
    if (this.mode !== 'free') this.standUp();
    this.ch.root.position.set(x, 0, z);
    this.yaw = yaw; this.ch.root.rotation.y = yaw;
  }

  update(dt, others) {
    const P = CONFIG.player, k = this.keys;
    if (this.mode !== 'free') {
      // seated / lying: stay put until the player walks off
      const go = this.enabled && (k.has('ArrowUp') || k.has('w') || k.has('ArrowDown') || k.has('s') || Math.abs(this.joy.y) > 0.5);
      if (go) this.standUp();
      else {
        this.ch.speed = 0; this.moving = 0;
        if (this.waveT > 0) { this.waveT -= dt; if (this.waveT <= 0) this.ch.setPose('wave', 0); }
        this.ch.update(dt);
        return;
      }
    }
    let fwd = 0, turn = 0;
    if (this.enabled) {
      if (k.has('ArrowUp') || k.has('w')) fwd += 1;
      if (k.has('ArrowDown') || k.has('s')) fwd -= 1;
      if (k.has('ArrowLeft') || k.has('a')) turn += 1;
      if (k.has('ArrowRight') || k.has('d')) turn -= 1;
      if (Math.abs(this.joy.y) > 0.15) fwd = -this.joy.y;
      if (Math.abs(this.joy.x) > 0.15) turn = -this.joy.x;
    }
    const run = (k.has('Shift') || Math.abs(this.joy.y) > 0.85) && fwd > 0;
    this.yaw += turn * P.turnSpeed * dt * (fwd < 0 ? -1 : 1) * (fwd === 0 ? 1 : 0.85);
    this.ch.root.rotation.y = this.yaw;
    const speed = fwd > 0 ? (run ? P.runSpeed : P.walkSpeed) * Math.min(1, fwd) : fwd < 0 ? -P.backSpeed : 0;
    const pos = this.ch.root.position;
    const prev = pos.clone();
    pos.x += Math.sin(this.yaw) * speed * dt;
    pos.z += Math.cos(this.yaw) * speed * dt;
    // people are solid too
    for (const o of others) {
      if (o.lie || o.ch?.lie) continue;
      const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz);
      if (d < 0.62 && d > 1e-4) { pos.x += dx / d * (0.62 - d); pos.z += dz / d * (0.62 - d); }
    }
    resolveCircle(pos, P.radius);
    const actual = Math.hypot(pos.x - prev.x, pos.z - prev.z) / Math.max(dt, 1e-4);
    this.moving = actual;

    // animation state: idle / walk / run (+ backwards walk)
    const ch = this.ch;
    if (Math.abs(speed) < 0.01) ch.play('idle', 0.25);
    else if (run) { ch.play('run', 0.25); ch.actions.run.timeScale = Math.max(0.6, actual / 3.6); }
    else { ch.play('walk', 0.25); const a = ch.actions.walk; a.timeScale = speed < 0 ? -0.85 : Math.max(0.6, actual / 1.35) * 1.0; }
    if (turn !== 0 && Math.abs(speed) < 0.01) { ch.play('walk', 0.25); ch.actions.walk.timeScale = 0.6; }
    if (this.waveT > 0) { this.waveT -= dt; if (this.waveT <= 0) ch.setPose('wave', 0); }
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
