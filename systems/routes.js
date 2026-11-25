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

/** Hooks set by main.js: door gate (NPCs wait for and open doors) and nav refinement. */
export const world = { gate: null, refine: null, walkable: null };

/**
 * Step a character toward (tx,tz). Returns true when arrived.
 * Speed eases in and out, the character slows down for sharp turns and on the last
 * metre, waits at closed doors (world.gate) and politely waits for blockers (the player).
 */
export function stepToward(ch, tx, tz, speed, dt, blockers = [], { final = true, arrive = 0.1 } = {}) {
  const dx = tx - ch.x, dz = tz - ch.z;
  const dist = Math.hypot(dx, dz);
  ch.curV ??= 0;
  const stop = () => { ch.curV = Math.max(0, ch.curV - dt * 6); ch.setMove(ch.curV); };
  if (dist < arrive) { if (final) { ch.curV = 0; ch.setMove(0); } return true; }
  const yaw = Math.atan2(dx, dz);
  let diff = yaw - ch.root.rotation.y; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  // turn at a human rate (faster when nearly stopped)
  const maxTurn = (ch.curV < 0.5 ? 5.5 : 3.6) * dt;
  ch.root.rotation.y += THREE.MathUtils.clamp(diff, -maxTurn, maxTurn);
  // doors: stop in front of a closed door until it has swung open
  if (world.gate && world.gate(ch, tx, tz)) { stop(); return false; }
  // someone right in front of us: wait a moment, then say "excuse me" and step round
  // them if there is floor to do it (in a doorway we just ask and wait)
  const fx = Math.sin(ch.root.rotation.y), fz = Math.cos(ch.root.rotation.y);
  let sx = 0, sz = 0, blocked = false;
  for (const b of blockers) {
    if (b === ch) continue;
    const bx = b.x - ch.x, bz = b.z - ch.z;
    const ahead = bx * fx + bz * fz, cross = bx * fz - bz * fx, side = Math.abs(cross);
    if (ahead > 0 && ahead < 0.95 && side < 0.55) {
      blocked = true;
      ch.blockT = (ch.blockT || 0) + dt;
      if (ch.blockT > 1.2 && !ch.askedPass) { ch.askedPass = true; ch.say?.(Math.random() < 0.5 ? 'Excuse me!' : 'Excuse me, may I pass?', 2.2); }
      const dir = cross > 0 ? -1 : 1;                 // step to the side away from them
      const px = ch.x + fz * dir * 0.6, pz = ch.z - fx * dir * 0.6;
      if (ch.blockT > 4) continue;                    // still in the way: walk on, they get nudged aside
      if (ch.blockT < 0.8 || (world.walkable && !world.walkable(px, pz))) { stop(); return false; }
      sx = fz * dir; sz = -fx * dir;
    }
  }
  if (!blocked) { ch.blockT = 0; ch.askedPass = false; }
  // target speed: slow for sharp turns, ease into the last waypoint
  let vt = speed * THREE.MathUtils.clamp(Math.cos(diff) * 1.2, 0.12, 1);
  if (final) vt = Math.min(vt, 0.3 + dist * 1.5);
  ch.curV += THREE.MathUtils.clamp(vt - ch.curV, -dt * 5, dt * 2.6);
  const s = Math.min(dist, ch.curV * dt);
  // move mostly where we face, a little straight at the target (smooth curves, no orbiting)
  const mx = THREE.MathUtils.lerp(dx / dist, fx, 0.55) + sx * 0.9, mz = THREE.MathUtils.lerp(dz / dist, fz, 0.55) + sz * 0.9, ml = Math.hypot(mx, mz) || 1;
  ch.root.position.x += (mx / ml) * s;
  ch.root.position.z += (mz / ml) * s;
  ch.setMove(ch.curV);
  return false;
}

/** Follows a path; call update every frame; returns true at the end. Corners are rounded. */
export class PathWalker {
  constructor(ch, path, speed = 1.3) {
    this.ch = ch; this.speed = speed; this.i = 0;
    this.path = world.refine ? world.refine([[ch.x, ch.z], ...path]).slice(1) : path;
  }
  update(dt, blockers) {
    if (this.i >= this.path.length) return true;
    const [x, z] = this.path[this.i];
    const last = this.i === this.path.length - 1;
    if (stepToward(this.ch, x, z, this.speed, dt, blockers, last ? {} : { final: false, arrive: 0.45 })) this.i++;
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
    if (s.wait && !s.sit) { ch.play(s.anim || 'idle'); }
    if (s.pose) for (const p of [].concat(s.pose)) ch.setPose(p, 1);
    if (s.say && Math.random() < (s.sayChance ?? 1)) ch.say(Array.isArray(s.say) ? pick(s.say) : s.say, 3.5);
  }
  update(dt, blockers) {
    if (this.done) return;
    const s = this.steps[this.i], ch = this.npc.ch;
    if (this.walker) { if (this.walker.update(dt, blockers)) { ch.setMove(0); this.next(); } return; }
    if (s.face !== undefined) {
      const yaw = Array.isArray(s.face) ? Math.atan2(s.face[0] - ch.x, s.face[1] - ch.z) : s.face;
      if (!s.sit) turnToward(ch, yaw, dt, 5);
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      if (s.pose) for (const p of [].concat(s.pose)) ch.setPose(p, 0);
      if (s.sit) ch.setPose('sit', 0);
      this.next();
    }
  }
}

export const V2 = (x, z) => new THREE.Vector2(x, z);
