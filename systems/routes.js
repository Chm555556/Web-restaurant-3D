// systems/routes.js — waypoint routing, exactly as the guide describes:
// a route is an ordered list of [x, z] points; walk toward the current one,
// advance when close enough, trigger the next state at the last one.
import * as THREE from 'three';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Smoothly turn a character's root toward a yaw. */
export function turnToward(ch, yaw, dt, rate = 6) {
  let d = yaw - ch.root.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  ch.root.rotation.y += d * Math.min(1, dt * rate);
  return Math.abs(d) < 0.05;
}

/**
 * Step a character toward (tx,tz). Returns true when arrived.
 * blockers: positions the character politely waits for (e.g. the player).
 */
export function stepToward(ch, tx, tz, speed, dt, blockers = []) {
  const dx = tx - ch.x, dz = tz - ch.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.12) return true;
  const yaw = Math.atan2(dx, dz);
  turnToward(ch, yaw, dt, 8);
  // wait if someone is right in front of us
  const fx = Math.sin(ch.root.rotation.y), fz = Math.cos(ch.root.rotation.y);
  for (const b of blockers) {
    if (b === ch) continue;
    const bx = b.x - ch.x, bz = b.z - ch.z;
    const ahead = bx * fx + bz * fz, side = Math.abs(bx * fz - bz * fx);
    if (ahead > 0 && ahead < 0.95 && side < 0.55) { ch.play('idle'); ch.speed = 0; return false; }
  }
  const s = Math.min(dist, speed * dt);
  ch.root.position.x += (dx / dist) * s;
  ch.root.position.z += (dz / dist) * s;
  ch.speed = speed;
  const run = speed > 3;
  ch.play(run ? 'run' : 'walk');
  const a = ch.actions[run ? 'run' : 'walk'];
  if (a) a.timeScale = ch.kind === 'robot' ? speed / 1.1 : speed / (run ? 3.6 : 1.35);
  return false;
}

/** Follows a path; call update every frame; returns true at the end. */
export class PathWalker {
  constructor(ch, path, speed = 1.3) { this.ch = ch; this.path = path; this.i = 0; this.speed = speed; }
  update(dt, blockers) {
    if (this.i >= this.path.length) return true;
    const [x, z] = this.path[this.i];
    if (stepToward(this.ch, x, z, this.speed, dt, blockers)) this.i++;
    return this.i >= this.path.length;
  }
}

/**
 * Script runner — a small state machine built from steps:
 *   { path: [[x,z],...], speed }           walk a route
 *   { wait: [min,max], face, pose, say }   pause (random duration = believable rhythm)
 *   { sit: anchor, wait: [min,max], pose } sit down for a while, then stand
 *   { do: (npc) => {} }                    run code (show a tray, change activity…)
 */
export class Script {
  constructor(npc, steps, { loop = true } = {}) { this.npc = npc; this.steps = steps; this.loop = loop; this.i = -1; this.next(); }
  next() {
    this.i++;
    if (this.i >= this.steps.length) { if (!this.loop) { this.done = true; return; } this.i = 0; }
    const s = this.steps[this.i];
    const ch = this.npc.ch;
    this.timer = s.wait ? rand(s.wait[0], s.wait[1]) : 0;
    this.walker = s.path ? new PathWalker(ch, s.path, s.speed ?? this.npc.speed ?? 1.3) : null;
    if (s.activity) this.npc.activity = s.activity;
    if (s.do) s.do(this.npc);
    if (s.sit) { ch.sitAt(s.sit); }
    if (s.wait && !s.sit) { ch.play(s.anim || 'idle'); ch.speed = 0; }
    if (s.pose) for (const p of [].concat(s.pose)) ch.setPose(p, 1);
    if (s.say && Math.random() < (s.sayChance ?? 1)) ch.say(Array.isArray(s.say) ? pick(s.say) : s.say, 3.5);
  }
  update(dt, blockers) {
    if (this.done) return;
    const s = this.steps[this.i], ch = this.npc.ch;
    if (this.walker) { if (this.walker.update(dt, blockers)) { ch.play('idle'); ch.speed = 0; this.next(); } return; }
    if (s.face !== undefined) {
      const yaw = Array.isArray(s.face) ? Math.atan2(s.face[0] - ch.x, s.face[1] - ch.z) : s.face;
      if (!s.sit) turnToward(ch, yaw, dt, 5);
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      if (s.pose) for (const p of [].concat(s.pose)) ch.setPose(p, 0);
      if (s.sit) { ch.setPose('sit', 0); if (ch.kind === 'robot') ch.play('idle'); }
      this.next();
    }
  }
}

export const V2 = (x, z) => new THREE.Vector2(x, z);
