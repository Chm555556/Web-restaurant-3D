// systems/camera.js — third-person follow camera with mouse/touch orbit, zoom,
// wall collision, an indoor ceiling clamp, first-person mode and animated transitions.
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { rayCast } from './collision.js';

const B = CONFIG.building;
const inside = (x, z) => x > B.minX && x < B.maxX && z > B.minZ && z < B.maxZ;

export class FollowCamera {
  constructor(camera, dom) {
    this.cam = camera;
    this.dist = CONFIG.camera.distance;
    this.orbit = 0;          // extra yaw from dragging
    this.pitch = 0.32;       // radians above horizontal
    this.mode = 'third';     // 'third' | 'first' | 'intro'
    this.pos = new THREE.Vector3(0, 30, 80);
    this.look = new THREE.Vector3();
    this.introT = 0;
    let dragging = false, lx = 0, ly = 0, moved = 0;
    dom.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; moved = 0; });
    addEventListener('pointerup', () => { dragging = false; });
    addEventListener('pointermove', (e) => {
      if (!dragging || this.mode === 'intro') return;
      const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      this.orbit -= dx * 0.006;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, this.mode === 'first' ? -0.9 : -0.05, this.mode === 'first' ? 0.9 : 1.2);
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.1), CONFIG.camera.minDistance, CONFIG.camera.maxDistance);
    }, { passive: false });
    // pinch zoom
    const pts = new Map(); let pinch = 0;
    dom.addEventListener('pointerdown', (e) => pts.set(e.pointerId, e));
    dom.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinch) this.dist = THREE.MathUtils.clamp(this.dist * pinch / d, CONFIG.camera.minDistance, CONFIG.camera.maxDistance); pinch = d; }
    });
    const up = (e) => { pts.delete(e.pointerId); pinch = 0; };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    this.wasDrag = () => moved > 6;
  }

  zoom(f) { this.dist = THREE.MathUtils.clamp(this.dist * f, CONFIG.camera.minDistance, CONFIG.camera.maxDistance); }
  reset() { this.orbit = 0; this.pitch = this.mode === 'first' ? 0 : 0.32; this.dist = CONFIG.camera.distance; }
  setMode(m) { this.mode = m; this.reset(); }

  /** Cinematic orbit used behind the start screen. */
  intro(dt) {
    this.introT += dt * 0.05;
    const a = this.introT + 0.6;
    this.cam.position.set(Math.sin(a) * 78, 34, Math.cos(a) * 78 - 12);
    this.cam.lookAt(0, 0, -14);
  }

  update(dt, player, snap = false) {
    const ch = player.ch;
    const yaw = player.yaw + this.orbit;
    // when walking, slowly swing the camera back behind the player
    if (player.moving > 0.2 && this.mode === 'third') this.orbit *= Math.pow(0.4, dt);
    if (this.mode === 'first') {
      ch.root.visible = false;
      const head = new THREE.Vector3(ch.x + Math.sin(player.yaw) * 0.18, 1.62, ch.z + Math.cos(player.yaw) * 0.18);
      this.cam.position.copy(head);
      const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(yaw) * Math.cos(this.pitch));
      this.cam.lookAt(head.clone().add(dir));
      return;
    }
    ch.root.visible = true;
    const target = new THREE.Vector3(ch.x, 1.45, ch.z);
    const dir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(yaw) * Math.cos(this.pitch));
    // keep the camera in front of walls between it and the player
    const hit = rayCast(target, dir, this.dist);
    let d = Math.max(0.6, hit - 0.25);
    const desired = target.clone().addScaledVector(dir, d);
    if (inside(ch.x, ch.z) || inside(desired.x, desired.z)) desired.y = Math.min(desired.y, CONFIG.camera.indoorCeiling);
    desired.y = Math.max(desired.y, 0.4);
    const k = snap ? 1 : 1 - Math.pow(0.0008, dt);
    this.pos.lerp(desired, k);
    // never let smoothing drag the camera through a wall: clamp to the ray result
    const toCam = this.pos.clone().sub(target); const len = toCam.length();
    if (len > 0.01) { const h2 = rayCast(target, toCam.clone().divideScalar(len), len); if (h2 < len) this.pos.copy(target).addScaledVector(toCam, (h2 - 0.2) / len); }
    this.cam.position.copy(this.pos);
    this.look.lerp(target, snap ? 1 : 1 - Math.pow(0.0001, dt));
    this.cam.lookAt(this.look);
  }
}
