// characters/npc.js — every non-player character and its routine.
// Rhythm + randomness (guide, "The Secret to a Scene That Feels Real"):
// fixed circuits and work loops, random pause lengths and conversation lines.
import * as THREE from 'three';
import { Character } from './character.js';
import { Script, turnToward, PathWalker, rand, pick } from '../systems/routes.js';
import { CONFIG } from '../config.js';
import { dress as D } from './indian.js';

/** Men use the X-Bot rig, women the Michelle rig — both dressed in characters/indian.js. */
const rig = () => 'xbot';   // everyone is generated on the X-Bot skeleton (characters/indian.js)

function makeTray() {
  const tray = new THREE.Group();
  const trayM = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.8, roughness: 0.3 }));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0a24a }));
  dish.scale.y = 0.5; dish.position.y = 0.04;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cup.position.set(0.14, 0.07, 0.05);
  tray.add(trayM, dish, cup); tray.position.set(0, 1.12, 0.42); tray.visible = false;
  return tray;
}

const _head = new THREE.Vector3();
const PARTNER_OK = (n) => !n.swimmer && !n.ch.lie && !n.dancer;

class NPC {
  constructor(scene, kind, opts) {
    if (opts.outfit?.sex) kind = rig(opts.outfit);
    this.ch = new Character(kind, opts);
    this.sex = opts.outfit?.sex ?? (kind === 'michelle' ? 'f' : 'm');
    this.chatting = false;
    this.ch.npc = this;
    this.name = opts.name; this.role = opts.role; this.activity = opts.activity || 'Relaxing';
    this.lines = opts.lines || ['Hello!'];
    this.speed = opts.speed ?? 1.3;
    this.zone = opts.zone;
    this.talkAt = opts.talkAt || null;   // for staff behind a counter: talk from the counter front
    this.holdT = 0;                      // paused (facing the player) for a moment
    this.jobs = [];                      // deliveries waiting (see startJob)
    this.job = null;
    this.lookPt = new THREE.Vector3();
    scene.add(this.ch.root);
  }
  get x() { return this.ch.x; } get z() { return this.ch.z; }
  get standing() { return this.ch.pose.sit < 0.1 && !this.ch.lie && !this.swimmer; }
  talkPos() { return this.talkAt || this.ch; }
  canPartner() { return PARTNER_OK(this) && !this.busyEscort; }
  /** Player pressed E nearby. */
  talk(player) {
    this.ch.say(pick(this.lines), 4.5);
    this.faceT = 2.5; this.facePlayer = player;
  }
  /** Stop what you're doing for a moment and face the player. */
  hold(player, secs = 3) {
    this.holdT = Math.max(this.holdT, secs); this.facePlayer = player; this.faceT = Math.max(this.faceT || 0, secs);
    if (this.standing && !this.dancer) { this.ch.setMove(0); this.ch.curV = 0; }
  }
  /** Typed conversation started / ended (see ui/chat.js). Walkers stop and face you. */
  startChat(player) {
    this.chatting = true; this.facePlayer = player; this.faceT = 1e9;
    if (this.standing && !this.dancer) { this.ch.setMove(0); this.ch.curV = 0; }
  }
  endChat() { this.chatting = false; this.faceT = 0; this.ch.setPose('talk', 0); }

  /**
   * Respond to the player's gesture. Partner gestures (handshake, high five) get a
   * matching move with the shared hand point; the rest get a friendly answer.
   */
  react(kind, player, opts = {}) {
    const ch = this.ch;
    this.hold(player, (opts.dur ?? 2.6) + 0.8);
    const lines = {
      wave: ['Hello!', 'Hi there!', 'Namaste!'], namaste: ['Namaste! 🙏', 'Namaste ji!', 'Namaskar! Welcome!'],
      bow: ['Namaste! So kind of you.', 'Aap ka swagat hai!'], handshake: ['Pleasure to meet you!', 'Good to meet you!', 'Very nice to meet you!'],
      highfive: ['Yes! High five!', 'Ayy! 🙌', 'Too good!'], clap: ['Thank you, thank you!', 'Haha, thanks!'],
      cheer: ['Woohoo!', 'Let\'s go!'], laugh: ['Haha! 😄', 'Hahaha, good one!'], dance: ['Nice moves!', 'Wah! Dance on!', 'Bollywood star!'],
      nod: ['Great!', 'Perfect.'], headshake: ['No? Okay, no problem.', 'Hmm, alright.'], shrug: ['Same here!', 'Who knows!'], think: ['Take your time.', 'Hmm…'],
    };
    const answer = { wave: 'wave', namaste: 'namaste', bow: 'namaste', clap: 'namaste', cheer: 'cheer', laugh: 'laugh', dance: 'clap', nod: 'nod', headshake: 'nod', shrug: 'shrug', think: 'nod', handshake: 'handshake', highfive: 'highfive' }[kind] || 'namaste';
    let g = answer;
    if ((g === 'handshake' || g === 'highfive') && !opts.point) g = 'namaste';
    if (this.swimmer || ch.lie) g = kind === 'wave' ? 'wave' : 'nod';
    if (g === 'cheer' && !this.standing) g = 'clap';
    if (kind === 'dance' && this.standing && !/Security|Chef|Receptionist/.test(this.role) && Math.random() < 0.5) g = 'dance';
    const run = () => {
      ch.gesture(g, opts.point ? { point: opts.point, dur: opts.dur } : {});
      if (g === 'dance') ch.say('Chalo, let\'s dance!', 3);
      else ch.say(pick(lines[kind] || lines.namaste), 3);
    };
    // partners move together; otherwise answer after a human beat
    if (opts.point) run(); else this.pending = { t: 0.35 + Math.random() * 0.3, run };
  }

  /**
   * Deliver something. job = { pickup:{x,z,yaw}, prep (s), dest:()=>{x,z}, face:()=>{x,z},
   *   carry (show tray), knock (text said at a closed door), say, onPickup, onDeliver }
   */
  startJob(job) { this.jobs.push(job); }

  _runJob(dt, ctx) {
    const J = this.job, ch = this.ch;
    const go = (x, z, speed = 1.55) => {
      if (!J.walker || J.walkTo[0] !== x || J.walkTo[1] !== z) { J.walker = new PathWalker(ch, [[x, z]], speed); J.walkTo = [x, z]; }
      return J.walker.update(dt, ctx.blockers);
    };
    switch (J.stage) {
      case 'start':
        J.home = { x: ch.x, z: ch.z, yaw: ch.root.rotation.y };
        J.trayWas = this.tray?.visible; J.carryWas = ch.poseT.carry;
        ch.clearPoses(); if (this.tray) this.tray.visible = false;
        J.stage = 'toPickup'; this.activity = J.activity || 'Fetching your order';
        break;
      case 'toPickup':
        if (go(J.pickup.x, J.pickup.z)) { J.stage = 'prep'; J.t = J.prep ?? 3; ch.setPose(J.prepPose || 'stir', 1); this.activity = 'Preparing your order'; }
        break;
      case 'prep':
        turnToward(ch, J.pickup.yaw, dt, 5);
        J.t -= dt;
        if (J.t <= 0) {
          ch.setPose(J.prepPose || 'stir', 0);
          if (J.carry !== false) { if (this.tray) this.tray.visible = true; ch.setPose('carry', 1); }
          J.onPickup?.(this);
          J.stage = 'toDest'; J.replan = 0; this.activity = `Bringing your ${J.what || 'order'}`;
        }
        break;
      case 'toDest': {
        const d = J.dest();
        J.replan -= dt;
        if (J.walker && J.replan <= 0 && Math.hypot(d.x - J.walkTo[0], d.z - J.walkTo[1]) > 1.2) J.walker = null;
        if (J.replan <= 0) J.replan = 1.5;
        if (go(d.x, d.z)) { J.stage = 'serve'; J.t = 0; }
        break;
      }
      case 'serve': {
        const f = J.face();
        const ok = turnToward(ch, Math.atan2(f.x - ch.x, f.z - ch.z), dt, 6);
        if (J.t === 0 && !ok) break;
        if (J.t === 0) { ch.setPose('carry', 0); ch.gesture('serve'); ch.say(J.say || 'Here you are. Enjoy!', 3.5); }
        J.t += dt;
        if (J.t > 0.75 && !J.delivered) { J.delivered = true; if (this.tray) this.tray.visible = false; J.onDeliver?.(this); }
        if (J.t > 1.8) { J.stage = 'return'; J.walker = null; this.activity = 'Heading back'; }
        break;
      }
      case 'return':
        if (go(J.home.x, J.home.z, 1.45)) {
          if (this.tray) this.tray.visible = !!J.trayWas;
          if (J.carryWas) ch.setPose('carry', J.carryWas);
          this.job = null;
          if (this.script && this.script.steps[this.script.i]?.pose) for (const q of [].concat(this.script.steps[this.script.i].pose)) ch.setPose(q, 1);
        }
        break;
    }
  }

  tickPending(dt) { if (this.pending && (this.pending.t -= dt) <= 0) { const r = this.pending.run; this.pending = null; r(); } }
  update(dt, ctx) {
    const ch = this.ch;
    if (this.holdT > 0) this.holdT -= dt;
    this.tickPending(dt);
    if (!this.job && this.jobs.length && !this.chatting && this.holdT <= 0) { this.job = this.jobs.shift(); this.job.stage = 'start'; }
    if (this.chatting || this.holdT > 0) {
      if (this.standing && ch.speed > 0 && !this.dancer) { ch.curV = Math.max(0, (ch.curV || 0) - dt * 6); ch.setMove(ch.curV); }
    } else if (this.job) this._runJob(dt, ctx);
    else if (this.script) this.script.update(dt, ctx.blockers);
    if (this.faceT > 0 && this.standing && !this.dancer && ch.speed < 0.05) {
      this.faceT -= dt;
      turnToward(ch, Math.atan2(this.facePlayer.x - ch.x, this.facePlayer.z - ch.z), dt, 5);
    }
    // look at the player when they are close and in front of us
    const p = ctx.player;
    const d = Math.hypot(p.x - ch.x, p.z - ch.z);
    if (d < 3.6 && p.ch && !this.swimmer && !(ch.pose.type > 0.5 && d > 1.8)) {
      p.ch.bones.Head ? p.ch.bones.Head.getWorldPosition(this.lookPt) : this.lookPt.set(p.x, 1.6, p.z);
      ch.lookAt = this.lookPt;
    } else ch.lookAt = null;
  }
}

/** Seated person: alternates between two activities (eating ↔ talking, typing ↔ phone…). */
class Seated extends NPC {
  constructor(scene, kind, opts, seat, poses = ['eat', 'talk']) {
    super(scene, kind, opts);
    this.ch.sitAt(seat, true); this.seat = seat; seat.occupant = this;
    this.poses = poses; this.labels = opts.labels || { eat: 'Eating', talk: 'Chatting', type: 'Working on a laptop', phone: 'Checking their phone', look: 'Watching TV', none: 'Relaxing' };
    this.timer = 0;
  }
  update(dt, ctx) {
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = rand(4, 11);
      const p = pick(this.poses);
      for (const q of this.poses) this.ch.setPose(q, 0);
      if (p !== 'none') this.ch.setPose(p, 1);
      this.activity = this.labels[p] || p;
    }
    super.update(dt, ctx);
  }
}

/**
 * Receptionist — the guide's own example state machine:
 * IDLE → TYPING ↔ IDLE, GREETING when a visitor approaches,
 * STANDING → ESCORTING (walks beside the visitor) → RETURNING → back to TYPING.
 */
class Receptionist extends NPC {
  constructor(scene, opts, anchors, hud) {
    super(scene, 'michelle', opts);
    this.a = anchors.reception; this.hud = hud;
    this.ch.sitAt(this.a.seat, true);
    this.state = 'TYPING'; this.timer = rand(3, 6);
    this.ch.setPose('type', 1);
    this.greeted = false;
  }
  setState(s) {
    this.state = s;
    const labels = { IDLE: 'Idle at the front desk', TYPING: 'Typing guest records', GREETING: 'Greeting a visitor', STANDING: 'Standing up', ESCORTING: 'Escorting you to ' + (this.dest?.label || ''), WAITING: 'Waiting for you to catch up', ARRIVED: 'Showing you the way', RETURNING: 'Walking back to the desk', SITTING: 'Sitting down' };
    this.activity = labels[s] || s;
  }
  talkPos() { return ['TYPING', 'IDLE', 'GREETING'].includes(this.state) ? this.a.front : this.ch; }
  playerNear(p) { return Math.hypot(p.x - this.a.front.x, p.z - this.a.front.z) < 3.4 && p.z > -6; }
  talk(player) {
    if (['TYPING', 'IDLE', 'GREETING'].includes(this.state)) {
      this.ch.say('Where can I take you?', 6);
      this.hud.showEscort(CONFIG.escort, (dest) => this.startEscort(dest));
    } else if (this.state === 'ESCORTING' || this.state === 'WAITING') this.ch.say('Follow me, it\'s just this way!', 3);
  }
  startEscort(dest) {
    this.dest = dest;
    this.ch.clearPoses(); this.ch.setPose('sit', 0);
    this.setState('STANDING'); this.timer = 0.9;
    this.ch.say(`Of course! Please follow me to ${dest.label}.`, 4);
  }
  update(dt, ctx) {
    const p = ctx.player, ch = this.ch;
    this.tickPending(dt);
    switch (this.state) {
      case 'TYPING':
      case 'IDLE':
        this.timer -= dt;
        if (this.timer <= 0) {
          if (this.state === 'TYPING') { this.setState('IDLE'); ch.setPose('type', 0); ch.setPose('look', 0.5); this.timer = rand(2, 4); }
          else { this.setState('TYPING'); ch.setPose('look', 0); ch.setPose('type', 1); this.timer = rand(5, 9); }
        }
        if (this.playerNear(p) && !this.greeted) {
          this.greeted = true; this.setState('GREETING'); this.timer = 3.2;
          ch.clearPoses(['sit']); ch.gesture('namaste');
          ch.say(`Welcome to ${CONFIG.name}! I'm Priya. Press E and I'll walk you anywhere.`, 6);
        }
        break;
      case 'GREETING':
        this.timer -= dt;
        if (this.timer <= 0) ch.setPose('talk', 0.6);
        if (!this.playerNear(p) && this.timer < -1) { ch.setPose('talk', 0); this.setState('TYPING'); ch.setPose('type', 1); this.timer = rand(5, 8); }
        break;
      case 'STANDING':
        this.timer -= dt;
        if (this.timer <= 0) {
          const ex = this.dest.side < 0 ? this.a.exitL : this.a.exitR;
          this.walker = new PathWalker(ch, [[this.a.seat.x, -8.6], [ex.x, -8.6], [ex.x, -7.0], ...this.dest.path], 1.45);
          this.setState('ESCORTING');
        }
        break;
      case 'ESCORTING': {
        const d = Math.hypot(p.x - ch.x, p.z - ch.z);
        if (d > 5.5) { this.setState('WAITING'); ch.setMove(0); ch.curV = 0; ch.say('This way! I\'ll wait for you.', 3); break; }
        if (this.walker.update(dt, [p])) {
          this.setState('ARRIVED'); this.timer = 4.5; ch.setMove(0);
          ch.setPose('talk', 1); ch.say(this.dest.arrive, 5);
          this.hud.toast(`Priya escorted you to ${this.dest.label}`);
        }
        break;
      }
      case 'WAITING': {
        turnToward(ch, Math.atan2(p.x - ch.x, p.z - ch.z), dt, 4);
        ch.setPose('wave', 0.8);
        if (Math.hypot(p.x - ch.x, p.z - ch.z) < 3) { ch.setPose('wave', 0); this.setState('ESCORTING'); }
        break;
      }
      case 'ARRIVED':
        turnToward(ch, Math.atan2(p.x - ch.x, p.z - ch.z), dt, 4);
        this.timer -= dt;
        if (this.timer <= 0) {
          ch.setPose('talk', 0);
          const ex = this.dest.side < 0 ? this.a.exitL : this.a.exitR;
          this.walker = new PathWalker(ch, [...[...this.dest.path].reverse(), [ex.x, -7.0], [ex.x, -8.6], [this.a.seat.x, -8.6], [this.a.seat.x, this.a.seat.z]], 1.6);
          this.setState('RETURNING');
        }
        break;
      case 'RETURNING':
        if (this.walker.update(dt, [p])) { ch.sitAt(this.a.seat); this.setState('SITTING'); this.timer = 1.2; }
        break;
      case 'SITTING':
        this.timer -= dt;
        if (this.timer <= 0) { ch.setPose('type', 1); this.setState('TYPING'); this.timer = rand(5, 9); this.greeted = false; }
        break;
    }
    if (!this.playerNear(p) && ['TYPING', 'IDLE'].includes(this.state) && Math.hypot(p.x - this.a.front.x, p.z - this.a.front.z) > 7) this.greeted = false;
    this.busyEscort = !['TYPING', 'IDLE', 'GREETING', 'SITTING'].includes(this.state);
    if (Math.hypot(p.x - ch.x, p.z - ch.z) < 4 && p.ch?.bones.Head) { p.ch.bones.Head.getWorldPosition(this.lookPt); ch.lookAt = this.lookPt; } else ch.lookAt = null;
  }
}

/** Swimmer doing laps along a lane. */
class Swimmer extends NPC {
  constructor(scene, kind, opts, laneZ, x0, x1) {
    super(scene, kind, opts);
    this.swimmer = true;
    this.laneZ = laneZ; this.x0 = x0; this.x1 = x1; this.dir = 1; this.v = rand(0.8, 1.15);
    const ch = this.ch;
    ch.root.position.set(rand(x0, x1), -0.42, laneZ);
    ch.pivot.rotation.x = Math.PI / 2; ch.pivot.position.set(0, 0, -0.9);
    ch.setPose('swim', 1); ch.pose.swim = 1;
    this.activity = 'Swimming laps';
    this.rest = 0;
  }
  talk() { this.ch.say(pick(this.lines), 3); }
  update(dt) {
    const ch = this.ch;
    this.tickPending(dt);
    if (this.rest > 0) { this.rest -= dt; if (this.rest <= 0) { this.dir *= -1; ch.setPose('swim', 1); } ch.root.rotation.y += ((this.dir > 0 ? Math.PI / 2 : -Math.PI / 2) - ch.root.rotation.y) * Math.min(1, dt * 2); return; }
    ch.root.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    ch.root.position.x += this.dir * this.v * dt;
    ch.root.position.y = -0.42 + Math.sin(ch.t * 3.2) * 0.04;
    if ((this.dir > 0 && ch.x > this.x1) || (this.dir < 0 && ch.x < this.x0)) { this.rest = rand(1.5, 4); ch.setPose('swim', 0.15); }
  }
}

/** Pedestrian / stroller on a looping circuit with random pauses. */
function walkerScript(npc, route, { pauseChance = 0.35, pause = [2, 6], lines = null } = {}) {
  const steps = [];
  for (const seg of route) {
    steps.push({ path: seg, activity: npc.activityWalk || 'Taking a walk' });
    if (Math.random() < pauseChance) steps.push({ wait: pause, activity: 'Taking a short break', pose: Math.random() < 0.5 ? 'phone' : 'look' });
  }
  return new Script(npc, steps);
}

export function createCast(scene, anchors, profile, hud, people = []) {
  const npcs = [];
  const add = (n, core = false) => { n.core = core; npcs.push(n); return n; };
  const full = profile.npcScale >= 1;
  // real 3D people from CONFIG.people take over the cast members they list
  const real = new Map(); for (const p of people) for (const n of p.use || []) real.set(n, p.kind);
  // everyone else is built from a base body: men from the kurta, women from the body that
  // matches what they wear (staff all wear the uniform saree)
  const base = {}; for (const p of people) if (p.base) base[p.base] = p.kind;
  const WEAR = { saree: 'saree', lehenga: 'saree', salwar: 'suit', anarkali: 'suit' };
  const bodyFor = (role, of) => {
    if (!of?.sex) return null;
    if (of.sex === 'm') return base.kurta || null;
    const want = /receptionist|waitress|buffet|housekeeping/i.test(role) ? 'saree' : WEAR[of.style] || 'saree';
    return base[want] || base.saree || base.suit || null;
  };
  const P = (name, role, outfit, extra = {}) => ({ name, role, outfit, model: real.get(name) || bodyFor(role, outfit), ...extra });

  // ===================== LOBBY =====================
  const priya = add(new Receptionist(scene, P('Priya', 'Receptionist', D.saree({ main: 0x8b1538, blouse: 0xe3b33f, hair: 'bun', sindoor: true, mangalsutra: true, skin: 'wheat' }), { zone: 'lobby' }), anchors, hud), true);
  add(new Seated(scene, 'xbot', P('Arjun', 'Concierge', D.kurta({ main: 0xf5ecd7, bottom: 0xf5ecd7, vest: 0x1f3a68, mustache: true, skin: 'medium' }), { zone: 'lobby', talkAt: { x: 1.2, z: -4.6 }, lines: ['Need a cab or a dinner booking? Just ask.', 'Sunset from the beach is beautiful after 6.', 'Room service runs until midnight.'], labels: { type: 'Booking a cab for a guest', phone: 'On a call with a guest', talk: 'Helping a guest' } }), anchors.reception.seat2, ['type', 'phone', 'type']), true);

  const harpreet = add(new NPC(scene, 'xbot', P('Harpreet', 'Security', D.guard({ turban: 0x1d3c78, beard: true, mustache: true, kada: true, skin: 'wheat' }), { zone: 'plaza', lines: ['Sat Sri Akal! Enjoy your stay.', 'All clear out here.', 'The pool is through the lobby and out the back.'] })), true);
  harpreet.ch.root.position.set(4, 0, 22.2);
  harpreet.script = new Script(harpreet, [
    { wait: [6, 10], face: 0, pose: 'look', activity: 'Watching the entrance' },
    { path: [[4, 24.4], [-4, 24.4]], speed: 1.1, activity: 'Patrolling the entrance' },
    { wait: [5, 9], face: 0, pose: 'look', activity: 'Watching the entrance' },
    { path: [[-4, 22.2], [4, 22.2]], speed: 1.1, activity: 'Patrolling the entrance' },
  ]);

  const sofa = anchors.sofaSeats;
  add(new Seated(scene, 'michelle', P('Meera', 'Guest', D.anarkali({ main: 0x8e244d, bottom: 0xf3e3c4, dupatta: 0xf7d9a6, hair: 'open', skin: 'fair' }), { zone: 'lobby', lines: ['We just checked in. This lobby is gorgeous!', 'Have you tried the café yet?'] }), sofa[0], ['talk', 'none', 'talk']));
  add(new Seated(scene, 'xbot', P('Rohit', 'Guest', D.kurta({ main: 0x2e5d8c, bottom: 0xf3efe6, mustache: true, skin: 'medium' }), { zone: 'lobby', lines: ['Waiting for our airport cab.', 'The Wi-Fi here is really fast.'] }), sofa[1], ['phone', 'talk']));
  if (full) add(new Seated(scene, 'xbot', P('Karan', 'Guest', D.kurta({ main: 0xf6f0e2, bottom: 0xf6f0e2, vest: 0x7b1e3a, mustache: true, beard: true, skin: 'wheat' }), { zone: 'lobby', lines: ['I could sit here all day.'] }), sofa[3], ['phone', 'none']));
  if (full) add(new Seated(scene, 'michelle', P('Kavya', 'Guest', D.salwar({ main: 0xf2a541, bottom: 0x2f4f6f, dupatta: 0x2f4f6f, hair: 'braid', skin: 'medium' }), { zone: 'lobby', lines: ['Our room has a sea view!'] }), sofa[6], ['talk', 'phone']));

  // bellboy with luggage: lobby → room 102 → lobby → entrance
  const kabir = add(new NPC(scene, 'xbot', P('Kabir', 'Bellboy', D.sherwani({ main: 0xa31d24, bottom: 0xf3ead8, safa: 0xf2a900, mustache: 'royal', skin: 'dusky' }), { zone: 'lobby', speed: 1.35, lines: ['Let me know if you need help with your bags!', 'Room 102\'s luggage, coming through!'] })));
  const suitcase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.22), new THREE.MeshStandardMaterial({ color: 0x2b3a5c, roughness: 0.6 }));
  suitcase.position.set(0, 1.0, 0.4); suitcase.castShadow = true; kabir.ch.root.add(suitcase);
  kabir.ch.root.position.set(5, 0, 16);
  kabir.script = new Script(kabir, [
    { do: (n) => { suitcase.visible = true; n.ch.setPose('carry', 1); }, path: [[5, 4], [5, 0.5], [8, 0], [23, 0], [23, -1.3]], activity: 'Delivering luggage to Room 102' },
    { wait: [1.5, 2.5], face: Math.PI, say: 'Luggage delivery, sir!', sayChance: 0.3 },
    { do: (n) => { suitcase.visible = false; n.ch.setPose('carry', 0); }, path: [[23, -4.5]], activity: 'Placing bags in Room 102' },
    { wait: [2, 3] },
    { path: [[23, 0], [8, 0], [5, 0.5], [5, 4], [5, 17.2]], activity: 'Returning to the entrance' },
    { wait: [6, 12], face: 0, pose: 'look', activity: 'Waiting for arriving guests' },
  ]);

  // ===================== CAFÉ =====================
  const seats = anchors.cafeSeats; // 12 tables × 4 seats, index = table*4 + [E, W, S, N]
  const diners = [
    ['Rohan', D.kurta({ main: 0x8fb3d9, mustache: true, skin: 'wheat' }), 0], ['Aisha', D.saree({ main: 0x5e2b97, blouse: 0xe3b33f, hair: 'braid', skin: 'fair' }), 1],
    ['Vivek', D.kurta({ main: 0xe9e4d8, bottom: 0xe9e4d8, vest: 0x3e4e3a, skin: 'medium' }), 9], ['Sneha', D.saree({ main: 0x0e7c7b, blouse: 0xc0392b, sindoor: true, skin: 'wheat' }), 8],
    ['Aditya', D.kurta({ main: 0x2e7d32, skin: 'dusky' }), 18],
    ['Pooja', D.anarkali({ main: 0xef6c00, bottom: 0xfff3e0, dupatta: 0xb71c1c, skin: 'medium' }), 21], ['Siddharth', D.kurta({ main: 0xd35400, mustache: true, skin: 'medium' }), 20],
    ['Fatima', D.salwar({ main: 0x0e6655, bottom: 0xf3efe6, dupatta: 0xf5f5f5, bindi: false, hair: 'bun', skin: 'fair' }), 30],
    ['Manish', D.sherwani({ main: 0xf3e5c0, safa: null, mustache: true, skin: 'wheat' }), 36], ['Nikhil', D.kurta({ main: 0x5e35b1, skin: 'wheat' }), 37],
    ['Ishita', D.lehenga({ main: 0xc2185b, second: 0xf8bbd0, blouse: 0xc2185b, dupatta: 0xffd54f, jewel: 'full', skin: 'medium' }), 44], ['Ali', D.kurta({ main: 0xffffff, bottom: 0xffffff, beard: true, skin: 'wheat' }), 45],
  ];
  const dinerLines = ['The paneer tikka here is amazing!', 'Try the mango lassi.', 'We come here every summer.', 'The Goan prawn curry is perfect.', 'Is the buffet still open?', 'Best masala dosa on the coast!'];
  diners.forEach(([name, of, si], i) => {
    if (!full && i % 2 === 1) return;
    add(new Seated(scene, 'xbot', P(name, 'Diner', of, { zone: 'cafe', lines: dinerLines }), seats[si], ['eat', 'talk', 'eat']), i < 4);
  });

  // waiter with a tray: pass window → table → back
  const sameer = add(new NPC(scene, 'xbot', P('Sameer', 'Waiter', D.kurta({ main: 0xfaf7f0, bottom: 0xfaf7f0, vest: 0x7b1e3a, mustache: true, skin: 'medium' }), { zone: 'cafe', speed: 1.5, lines: ['Can I get you anything?', 'Today\'s special is the Goan prawn curry.', 'Your table will be ready in a moment.'] })), true);
  const tray = makeTray(); sameer.ch.root.add(tray); sameer.tray = tray;
  sameer.ch.root.position.set(-27.2, 0, -12.5);
  const sameerSteps = [];
  for (const [tx, tz] of [[-19.5, -8], [-14, 8], [-25, 14.5], [-19.5, -14.5], [-25, -8], [-14, 14.5]]) {
    const rowZ = tz + (tz < 0 ? 3.25 : -3.25), side = rowZ > tz ? 1.0 : -1.0;
    sameerSteps.push(
      { path: [[-27.2, -12.5]], activity: 'Collecting an order from the kitchen' },
      { wait: [1.5, 2.5], face: -Math.PI / 2, activity: 'Picking up plates at the pass' },
      { do: (n) => { tray.visible = true; n.ch.setPose('carry', 1); }, path: [[-27.2, rowZ], [tx + 1.0, rowZ], [tx + 1.0, tz + side]], activity: 'Serving a table' },
      { wait: [2, 3.5], face: [tx, tz], say: ['Here you are. Enjoy!', 'Your prawn curry!', 'Careful, the plate is hot.'], sayChance: 0.5, activity: 'Serving a table' },
      { do: (n) => { tray.visible = false; n.ch.setPose('carry', 0); }, path: [[tx + 1.0, rowZ], [-27.2, rowZ]], activity: 'Heading back to the kitchen' },
    );
  }
  sameer.script = new Script(sameer, sameerSteps);

  if (full) {
    const anjali = add(new NPC(scene, 'michelle', P('Anjali', 'Waitress', D.saree({ main: 0x0f6e66, blouse: 0x0f6e66, hair: 'bun', jewel: 'light', skin: 'wheat' }), { zone: 'cafe', speed: 1.4, lines: ['Welcome to Café Azure!', 'The buffet has fresh fruit and hot jalebis.'] })));
    anjali.ch.root.position.set(-16.75, 0, 0);
    anjali.script = new Script(anjali, [
      { path: [[-16.75, 4.75], [-13, 4.75], [-13, 7]], activity: 'Checking on guests' },
      { wait: [2, 4], face: [-14, 8], pose: 'talk', say: ['Is everything alright?', 'More water?'], sayChance: 0.5, activity: 'Talking to diners' },
      { path: [[-13, 4.75], [-22.25, 4.75], [-22.25, 0], [-22.25, -4.75], [-18.5, -4.75], [-18.5, -7]], activity: 'Checking on guests' },
      { wait: [2, 4], face: [-19.5, -8], pose: 'talk', activity: 'Taking an order' },
      { path: [[-18.5, -4.75], [-12, -1.5]], activity: 'Walking to the entrance' },
      { wait: [4, 8], face: Math.PI / 2, pose: 'look', activity: 'Greeting guests at the café door' },
    ]);
  }

  const rekha = add(new NPC(scene, 'michelle', P('Rekha', 'Buffet Host', D.saree({ main: 0xd35400, blouse: 0x1b5e20, sindoor: true, mangalsutra: true, skin: 'dusky' }), { zone: 'cafe', talkAt: { x: -32, z: 9 }, lines: ['Hot idlis just came out!', 'The dal on the left is Jain, no onion or garlic.'] })));
  rekha.ch.root.position.set(-35.1, 0, 5);
  rekha.script = new Script(rekha, [
    { wait: [4, 7], face: Math.PI / 2, pose: 'stir', activity: 'Refilling the buffet' },
    { path: [[-35.1, 9.5]], speed: 0.9 },
    { wait: [4, 7], face: Math.PI / 2, pose: 'stir', activity: 'Arranging desserts' },
    { path: [[-35.1, 14]], speed: 0.9 },
    { wait: [3, 6], face: Math.PI / 2, pose: 'talk', activity: 'Chatting with guests' },
    { path: [[-35.1, 5]], speed: 0.9 },
  ]);

  const K = anchors.kitchen;
  const rajesh = add(new NPC(scene, 'xbot', P('Rajesh', 'Head Chef', D.chef({ mustache: true, skin: 'medium' }), { zone: 'kitchen', lines: ['Tonight: tandoori prawns with lime butter!', 'Mind the hot pans!', 'A pinch more garam masala…'] })), true);
  rajesh.ch.root.position.set(K.stove.x, 0, K.stove.z);
  rajesh.script = new Script(rajesh, [
    { wait: [6, 10], face: K.stove.yaw, pose: 'stir', activity: 'Cooking at the stove' },
    { path: [[-33.4, -13.5], [K.prep.x, K.prep.z]], speed: 1.2 },
    { wait: [5, 8], face: K.prep.yaw, pose: 'type', activity: 'Chopping vegetables' },
    { path: [[-31.5, -12.5], [K.pass.x, K.pass.z]], speed: 1.2 },
    { wait: [2.5, 4], face: K.pass.yaw, pose: 'carry', say: ['Order up!', 'Table seven, ready!', 'Service!'], activity: 'Plating at the pass' },
    { path: [[-31.5, -16], [K.stove.x, K.stove.z]], speed: 1.2 },
  ]);
  if (full) {
    const sunil = add(new NPC(scene, 'xbot', P('Sunil', 'Sous Chef', D.chef({ skin: 'dusky' }), { zone: 'kitchen', lines: ['Yes, chef!'] })));
    sunil.ch.root.position.set(-31, 0, -17.9);
    sunil.script = new Script(sunil, [
      { wait: [7, 11], face: Math.PI, pose: 'stir', activity: 'Frying fish' },
      { path: [[-32, -8], [-34.0, -8]], speed: 1.1 },
      { wait: [4, 6], face: -Math.PI / 2, pose: 'type', activity: 'Making chutneys' },
      { path: [[-32, -8], [-31, -17.9]], speed: 1.1 },
    ]);
  }

  // ===================== ROOMS =====================
  const R = anchors.rooms;
  add(new Seated(scene, 'michelle', P('Neha', 'Guest · Room 101', D.salwar({ main: 0x9c27b0, bottom: 0xf5e6f7, dupatta: 0xf5e6f7, hair: 'open', skin: 'wheat' }), { zone: 'rooms', lines: ['Shh, my cricket match is on!', 'This bed is so comfy.'], labels: { look: 'Watching TV', none: 'Watching TV', phone: 'Texting a friend' } }), R[101].bedEdge, ['none', 'phone', 'none']));
  add(new Seated(scene, 'xbot', P('Imran', 'Guest · Room 105', D.kurta({ main: 0x37474f, bottom: 0xeceff1, beard: true, skin: 'medium' }), { zone: 'rooms', lines: ['Just finishing some work before the beach.', 'Quick video call, then swimming!'], labels: { type: 'Working on a laptop', phone: 'On a video call' } }), R[105].desk, ['type', 'type', 'phone']));
  const lata = add(new NPC(scene, 'michelle', P('Lata', 'Housekeeping', D.saree({ main: 0x7e57c2, blouse: 0x7e57c2, border: 0xffffff, hair: 'bun', jewel: 'light', sindoor: true, skin: 'dusky' }), { zone: 'rooms', speed: 1.1, lines: ['Fresh towels are on the way!', 'Good morning! Room 103 is ready.'] })));
  lata.ch.root.position.set(31.67, 0, 0);
  const cleanSteps = [];
  for (const [n, x, s] of [[103, 31.67, -1], [106, 31.67, 1], [102, 23, -1]]) {
    cleanSteps.push(
      { path: [[x, 0], [x, s * 4], [x - 2, s * 9]], activity: `Cleaning Room ${n}` },
      { wait: [5, 9], face: s < 0 ? Math.PI : 0, pose: 'stir', activity: `Making the bed in Room ${n}` },
      { path: [[x, s * 4], [x, 0]], activity: 'Walking the corridor' },
    );
  }
  lata.script = new Script(lata, cleanSteps);

  // room service: waits at the pantry trolley at the end of the corridor, brings orders to the rooms
  const RS = anchors.roomService;
  const vikram = add(new NPC(scene, 'xbot', P('Vikram', 'Room Service', D.kurta({ main: 0xfaf7f0, bottom: 0xfaf7f0, vest: 0x8b1538, mustache: true, skin: 'wheat' }), { zone: 'rooms', speed: 1.5, lines: ['Room service, 24 hours! Order from the laptop in your room.', 'Hungry? The butter chicken is very popular.'] })), true);
  const tray3 = makeTray(); vikram.ch.root.add(tray3); vikram.tray = tray3;
  vikram.ch.root.position.set(RS.idle.x, 0, RS.idle.z); vikram.ch.root.rotation.y = RS.idle.yaw;
  vikram.script = new Script(vikram, [
    { wait: [6, 10], face: RS.idle.yaw, activity: 'Waiting for room-service orders' },
    { path: [[RS.station.x, RS.station.z]], speed: 0.9, activity: 'Checking the trolley' },
    { wait: [3, 5], face: RS.station.yaw, pose: 'stir', activity: 'Setting a tray' },
    { path: [[RS.idle.x, RS.idle.z]], speed: 0.9 },
  ]);

  // ===================== POOL =====================
  add(new Swimmer(scene, 'xbot', P('Arnav', 'Swimmer', D.swim({ bottom: 0x1565c0, skin: 'medium' }), { zone: 'pool', lines: ['The water is perfect!'] }), -36, -12, 12), true);
  add(new Swimmer(scene, 'michelle', P('Riya', 'Swimmer', D.swimF({ main: 0xe84393, skin: 'wheat' }), { zone: 'pool', lines: ['Race you to the end!'] }), -40, -11, 11));
  if (full) add(new Swimmer(scene, 'xbot', P('Varun', 'Swimmer', D.swim({ bottom: 0xc0392b, skin: 'dusky' }), { zone: 'pool', lines: ['Just 10 more laps.'] }), -44, -12, 12));
  const L = anchors.loungers;
  [[1, D.kurta({ main: 0xfff3c4, mustache: true, skin: 'medium' }), 'Rakesh'], [4, D.salwar({ main: 0x26a69a, bottom: 0xffffff, dupatta: null, hair: 'open', skin: 'fair' }), 'Tanvi'], [6, D.kurta({ main: 0x90caf9, skin: 'wheat' }), 'Yash'], [10, D.anarkali({ main: 0xffab91, bottom: 0xffffff, dupatta: null, skin: 'medium' }), 'Diya']].forEach(([i, of, name], k) => {
    if (!full && k > 1) return;
    const n = add(new NPC(scene, 'xbot', P(name, 'Sunbathing', of, { zone: 'pool', lines: ['Zzz… oh, hello!', 'Perfect weather today.'] })));
    n.ch.lieOn(L[i]); n.activity = 'Sunbathing'; L[i].occupant = n;
  });
  const ravi = add(new Seated(scene, 'xbot', P('Ravi', 'Lifeguard', D.tee({ main: 0xd32f2f, bottom: 0xd32f2f, mustache: true, skin: 'dusky' }), { zone: 'pool', lines: ['No running on the deck, please!', 'The pool is 1.6 m deep. Swim safe!'], labels: { look: 'Watching the swimmers', none: 'On duty' } }), anchors.lifeguard, ['look', 'look', 'none']), true);
  ravi.ch.root.position.y = 0;

  // pool bar
  const joseph = add(new NPC(scene, 'xbot', P('Joseph', 'Bartender', D.kurta({ main: 0xffffff, bottom: 0xffffff, vest: 0x00695c, mustache: true, skin: 'medium' }), { zone: 'poolbar', talkAt: { x: 25, z: -34.6 }, lines: ['Nimbu soda? Kokum cooler? Fresh mango lassi?', 'Happy hour starts at 5!'] })), true);
  joseph.ch.root.position.set(25, 0, -31.7);
  joseph.script = new Script(joseph, [
    { wait: [4, 7], face: Math.PI, pose: 'stir', activity: 'Mixing a kokum cooler' },
    { path: [[22.6, -31.7]], speed: 1 },
    { wait: [3, 5], face: Math.PI, pose: 'talk', activity: 'Chatting with guests' },
    { path: [[27.4, -31.7]], speed: 1 },
    { wait: [3, 6], face: 0, pose: 'stir', activity: 'Taking bottles from the shelf' },
    { path: [[25, -31.7]], speed: 1 },
  ]);
  const st = anchors.barStools;
  add(new Seated(scene, 'michelle', P('Sanya', 'Guest', D.anarkali({ main: 0xf06292, bottom: 0xfce4ec, dupatta: 0xfce4ec, skin: 'fair' }), { zone: 'poolbar', lines: ['These mocktails are lovely.'] }), st[1], ['talk', 'eat']));
  add(new Seated(scene, 'xbot', P('Kunal', 'Guest', D.kurta({ main: 0x00838f, skin: 'wheat' }), { zone: 'poolbar', lines: ['Cheers!'] }), st[2], ['talk', 'eat']));
  if (full) add(new Seated(scene, 'michelle', P('Simran', 'Guest', D.salwar({ main: 0xf6c90e, bottom: 0xffffff, dupatta: 0xe84393, paranda: 0xe84393, skin: 'fair' }), { zone: 'poolbar', lines: ['I love this music.'] }), st[4], ['phone', 'talk']));

  // dancer on the stage
  const ananya = add(new NPC(scene, 'michelle', P('Ananya', 'Dancer', D.lehenga({ main: 0xc2185b, second: 0xffc107, blouse: 0xc2185b, dupatta: 0xffd54f, mehndi: true, payal: true, nath: true, skin: 'wheat' }), { zone: 'poolbar', lines: ['Come dance with us!', 'Bollywood night every evening by the pool!'] })), true);
  ananya.ch.root.position.set(anchors.stage.x, 0.31, anchors.stage.z); ananya.ch.root.rotation.y = -Math.PI * 0.8;
  ananya.dancer = true; ananya.ch.play('dance'); ananya.activity = 'Dancing to Bollywood hits';

  // pool server (was a robot): bar → loungers → bar, with a tray of drinks
  const mohan = add(new NPC(scene, 'xbot', P('Mohan', 'Pool Server', D.kurta({ main: 0xffffff, bottom: 0xffffff, vest: 0x1f6f8b, skin: 'dusky' }), { zone: 'pool', speed: 1.2, lines: ['Your tender coconut, madam.', 'Fresh nimbu pani, sir?', 'Have a refreshing day!'] })), true);
  const tray2 = makeTray(); mohan.ch.root.add(tray2); mohan.tray = tray2;
  mohan.ch.root.position.set(25, 0, -35.5);
  const trayOn = (v) => (n) => { tray2.visible = v; n.ch.setPose('carry', v ? 1 : 0); };
  mohan.script = new Script(mohan, [
    { wait: [2, 3], face: 0, activity: 'Collecting drinks at the bar' },
    { do: trayOn(true), path: [[18, -36], [16, -48], [3, -48.6]], activity: 'Delivering drinks to the loungers' },
    { wait: [2.5, 3.5], face: Math.PI, say: ['Your coconut water, madam.', 'One masala chaas!'], activity: 'Serving a sunbather' },
    { path: [[-9, -48.6]], activity: 'Delivering drinks to the loungers' },
    { wait: [2, 3], face: Math.PI, activity: 'Serving a sunbather' },
    { path: [[-17.35, -48], [-17.35, -44]], activity: 'Delivering drinks' },
    { wait: [2, 3], face: -Math.PI / 2, activity: 'Serving a sunbather' },
    { do: trayOn(false), path: [[-17.35, -28], [16, -28], [18, -35.5], [25, -35.5]], activity: 'Returning to the bar' },
  ]);

  // strolling couple around the pool
  const pr = [[[-17.35, -28], [16, -28]], [[16, -48]], [[-17.35, -48]], [[-17.35, -28]]];
  const s1 = add(new NPC(scene, 'michelle', P('Lakshmi', 'Guest', D.saree({ main: 0x6a1b9a, blouse: 0xf5b041, sindoor: true, mangalsutra: true, nath: true, skin: 'medium' }), { zone: 'pool', speed: 1.0, lines: ['What a view!', 'We are walking to the beach later.'] })));
  s1.ch.root.position.set(-17.35, 0, -28); s1.script = walkerScript(s1, pr, { pauseChance: 0.5 });
  if (full) {
    const s2 = add(new NPC(scene, 'xbot', P('Prakash', 'Guest', D.dhoti({ grey: true, mustache: true, shawl: 0x8d6e63, tilak: true, skin: 'medium' }), { zone: 'pool', speed: 1.0, lines: ['Have you seen the fishing boats?'] })));
    s2.ch.root.position.set(16, 0, -48); s2.script = walkerScript(s2, [[[-17.35, -48]], [[-17.35, -28]], [[16, -28]], [[16, -48]]], { pauseChance: 0.5 });
  }
  const aryan = add(new NPC(scene, 'xbot', P('Aryan', 'Beachgoer', D.kurta({ main: 0xff7043, skin: 'dusky' }), { zone: 'beach', speed: 1.1, lines: ['Shells everywhere!', 'The water is warm today.'] })));
  aryan.ch.root.position.set(-30, 0, -68); aryan.script = walkerScript(aryan, [[[30, -68.5]], [[-30, -68]]], { pauseChance: 0.8, pause: [4, 8] });

  // ===================== STREET =====================
  const pedLines = ['Lovely day for a walk.', 'Is this the Azure Bay resort?', 'I\'m heading to the beach.', 'Excuse me!'];
  const peds = [
    ['Suresh', D.dhoti({ main: 0xe6d3a3, grey: true, mustache: true, shawl: 0x7b5b3a, skin: 'dusky' }), [[[-60, 50], [60, 50]], [[60, 50.2], [-60, 50.2]]]],
    ['Nandini', D.saree({ main: 0x1565c0, blouse: 0xf1c40f, hair: 'braid', skin: 'wheat' }), [[[50, 36], [2, 36], [1.5, 36.5], [1.5, 49.5], [-50, 49.5]], [[-50, 49.8], [-2, 49.8], [-1.5, 49.5], [-1.5, 36.5], [50, 36.2]]]],
    ['Amit', D.kurta({ main: 0xadd8e6, bottom: 0xf3efe6, vest: 0x203a5c, skin: 'wheat' }), [[[-70, 36.5], [70, 36.5]], [[70, 36.8], [-70, 36.8]]]],
    ['Shreya', D.anarkali({ main: 0x6a1b9a, bottom: 0xf3e5f5, dupatta: 0xf3e5f5, hair: 'braid', skin: 'medium' }), [[[-14, 36.3], [-3.6, 36.3], [-3.6, 32.5], [-6, 28]], [[-3.6, 32.5], [-3.6, 36.3], [-45, 36.3]], [[-14, 36.3]]]],
  ];
  peds.forEach(([name, of, route], i) => {
    if (!full && i > 1) return;
    const n = add(new NPC(scene, 'xbot', P(name, 'Pedestrian', of, { zone: 'street', speed: rand(1.0, 1.35), lines: pedLines })));
    n.ch.root.position.set(route[0][0][0], 0, route[0][0][1]);
    n.script = walkerScript(n, route, { pauseChance: 0.4 });
    n.pedestrian = true;
  });
  add(new Seated(scene, 'xbot', P('Ramesh', 'Visitor', D.kurta({ main: 0xe8e2d0, bottom: 0xe8e2d0, grey: true, mustache: true, mala: true, skin: 'medium' }), { zone: 'plaza', lines: ['I love watching the fountain.', 'In my day, this beach was just coconut trees!'] }), anchors.benches[0], ['phone', 'none', 'look']));
  if (full) {
    const dev = add(new NPC(scene, 'xbot', P('Dev', 'Security Patrol', D.guard({ mustache: true, skin: 'dusky' }), { zone: 'plaza', speed: 1.15, lines: ['Patrolling the grounds. Have a good day.'] })));
    dev.ch.root.position.set(-37.4, 0, 26);
    dev.script = new Script(dev, [
      { path: [[-37.4, -22], [-28, -22.5]], activity: 'Patrolling the west garden' },
      { wait: [3, 6], pose: 'look', activity: 'Checking the pool deck' },
      { path: [[-37.4, -22], [-37.4, 26]], activity: 'Patrolling the west garden' },
      { wait: [3, 6], pose: 'look', activity: 'Watching the street' },
    ]);
  }

  const couriers = { cafe: sameer, pool: mohan, bar: joseph, rooms: vikram };
  return { npcs, priya, couriers };
}
