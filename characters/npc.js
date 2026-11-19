// characters/npc.js — every non-player character and its routine.
// Rhythm + randomness (guide, "The Secret to a Scene That Feels Real"):
// fixed circuits and work loops, random pause lengths and conversation lines.
import * as THREE from 'three';
import { Character } from './character.js';
import { Script, stepToward, turnToward, PathWalker, rand, pick } from '../systems/routes.js';
import { CONFIG } from '../config.js';

const C = {
  navy: { body: 0x23324f, joints: 0xc9a86a }, black: { body: 0x1d1f22, joints: 0xf1f1f1 }, white: { body: 0xf3f3f1, joints: 0x3a3a3a },
  red: { body: 0xc23b33, joints: 0xf4f4f4 }, teal: { body: 0x1f8a80, joints: 0xf2e3c4 }, lav: { body: 0x9b87c9, joints: 0xffffff },
  coral: { body: 0xe07a5f, joints: 0x3d405b }, olive: { body: 0x6b7f3a, joints: 0xe9e2d0 }, sky: { body: 0x7fb7e6, joints: 0x2b3a55 },
  sand: { body: 0xd8c3a5, joints: 0x5a4632 }, plum: { body: 0x6b3f69, joints: 0xf0c987 }, slate: { body: 0x56636e, joints: 0xe4b363 },
  rust: { body: 0xa4583a, joints: 0xf6eee3 }, mint: { body: 0x8fd1b8, joints: 0x2d4a41 },
};
const tint = (hex) => ({ tint: hex });

class NPC {
  constructor(scene, kind, opts) {
    this.ch = new Character(kind, opts);
    this.ch.npc = this;
    this.name = opts.name; this.role = opts.role; this.activity = opts.activity || 'Relaxing';
    this.lines = opts.lines || ['Hello!'];
    this.speed = opts.speed ?? 1.3;
    this.zone = opts.zone;
    this.talkAt = opts.talkAt || null;   // for staff behind a counter: talk from the counter front
    scene.add(this.ch.root);
  }
  get x() { return this.ch.x; } get z() { return this.ch.z; }
  talkPos() { return this.talkAt || this.ch; }
  /** Player pressed E nearby. */
  talk(player) {
    this.ch.say(pick(this.lines), 4.5);
    this.faceT = 2.5; this.facePlayer = player;
  }
  update(dt, ctx) {
    if (this.script) this.script.update(dt, ctx.blockers);
    if (this.faceT > 0 && this.ch.pose.sit < 0.1 && !this.ch.lie && this.ch.speed === 0) {
      this.faceT -= dt;
      turnToward(this.ch, Math.atan2(this.facePlayer.x - this.ch.x, this.facePlayer.z - this.ch.z), dt, 5);
    }
  }
}

/** Seated person: alternates between two activities (eating ↔ talking, typing ↔ phone…). */
class Seated extends NPC {
  constructor(scene, kind, opts, seat, poses = ['eat', 'talk']) {
    super(scene, kind, opts);
    this.ch.sitAt(seat, true);
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
          ch.clearPoses(['sit']); ch.setPose('wave', 1);
          ch.say(`Welcome to ${CONFIG.name}! I'm Priya. Press E and I'll walk you anywhere.`, 6);
        }
        break;
      case 'GREETING':
        this.timer -= dt;
        if (this.timer <= 0) { ch.setPose('wave', 0); ch.setPose('talk', 0.6); }
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
        if (d > 5.5) { this.setState('WAITING'); ch.play('idle'); ch.speed = 0; ch.say('This way! I\'ll wait for you.', 3); break; }
        if (this.walker.update(dt, [p])) {
          this.setState('ARRIVED'); this.timer = 4.5; ch.play('idle');
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
  }
}

/** Swimmer doing laps along a lane. */
class Swimmer extends NPC {
  constructor(scene, kind, opts, laneZ, x0, x1) {
    super(scene, kind, opts);
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

export function createCast(scene, anchors, profile, hud) {
  const npcs = [];
  const add = (n, core = false) => { n.core = core; npcs.push(n); return n; };
  const full = profile.npcScale >= 1;

  // ===================== LOBBY =====================
  const priya = add(new Receptionist(scene, { name: 'Priya', role: 'Receptionist', zone: 'lobby' }, anchors, hud), true);
  const arjun = add(new Seated(scene, 'xbot', { name: 'Arjun', role: 'Concierge', outfit: C.navy, zone: 'lobby', talkAt: { x: 1.2, z: -4.6 }, lines: ['Need a taxi or a dinner booking? Just ask.', 'The sunset from the beach is wonderful after 6.', 'Room service runs until midnight.'], labels: { type: 'Booking a taxi for a guest', phone: 'On a call with a guest', talk: 'Helping a guest' } }, anchors.reception.seat2, ['type', 'phone', 'type']), true);

  const vikram = add(new NPC(scene, 'soldier', { name: 'Vikram', role: 'Security', zone: 'plaza', lines: ['Good day. Enjoy your stay.', 'All clear out here.', 'The pool is through the lobby and out the back.'] }), true);
  vikram.ch.root.position.set(4, 0, 22.2);
  vikram.script = new Script(vikram, [
    { wait: [6, 10], face: 0, pose: 'look', activity: 'Watching the entrance' },
    { path: [[4, 24.4], [-4, 24.4]], speed: 1.1, activity: 'Patrolling the entrance' },
    { wait: [5, 9], face: 0, pose: 'look', activity: 'Watching the entrance' },
    { path: [[-4, 22.2], [4, 22.2]], speed: 1.1, activity: 'Patrolling the entrance' },
  ]);

  const sofa = anchors.sofaSeats;
  add(new Seated(scene, 'michelle', { name: 'Meera', role: 'Guest', outfit: tint(0xffe2d6), zone: 'lobby', lines: ['We just checked in. This lobby is gorgeous!', 'Have you tried the café yet?'] }, sofa[0], ['talk', 'none', 'talk']));
  add(new Seated(scene, 'xbot', { name: 'Daniel', role: 'Guest', outfit: C.rust, zone: 'lobby', lines: ['Waiting for our airport shuttle.', 'Great Wi-Fi here.'] }, sofa[1], ['phone', 'talk']));
  if (full) add(new Seated(scene, 'xbot', { name: 'Sofia', role: 'Guest', outfit: C.teal, zone: 'lobby', lines: ['I could sit here all day.'] }, sofa[3], ['phone', 'none']));
  if (full) add(new Seated(scene, 'michelle', { name: 'Hana', role: 'Guest', outfit: tint(0xcfe3ff), zone: 'lobby', lines: ['Our room has an ocean view!'] }, sofa[6], ['talk', 'phone']));

  // bellboy with luggage: lobby → room 102 → lobby → entrance
  const kabir = add(new NPC(scene, 'xbot', { name: 'Kabir', role: 'Bellboy', outfit: C.red, zone: 'lobby', speed: 1.35, lines: ['Let me know if you need help with your bags!', 'Room 102\'s luggage, coming through!'] }));
  const suitcase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.22), new THREE.MeshStandardMaterial({ color: 0x2b3a5c, roughness: 0.6 }));
  suitcase.position.set(0, 1.0, 0.4); suitcase.castShadow = true; kabir.ch.root.add(suitcase);
  kabir.ch.root.position.set(5, 0, 16);
  kabir.script = new Script(kabir, [
    { do: (n) => { suitcase.visible = true; n.ch.setPose('carry', 1); }, path: [[5, 4], [5, 0.5], [8, 0], [23, 0], [23, -1.3]], activity: 'Delivering luggage to Room 102' },
    { wait: [1.5, 2.5], face: Math.PI, say: 'Housekeeping… I mean, luggage delivery!', sayChance: 0.3 },
    { do: (n) => { suitcase.visible = false; n.ch.setPose('carry', 0); }, path: [[23, -4.5]], activity: 'Placing bags in Room 102' },
    { wait: [2, 3] },
    { path: [[23, 0], [8, 0], [5, 0.5], [5, 4], [5, 17.2]], activity: 'Returning to the entrance' },
    { wait: [6, 12], face: 0, pose: 'look', activity: 'Waiting for arriving guests' },
  ]);

  // ===================== CAFÉ =====================
  const seats = anchors.cafeSeats; // 12 tables × 4 seats, index = table*4 + [E, W, S, N]
  const diners = [
    ['Rohan', 'xbot', C.olive, 0], ['Aisha', 'michelle', tint(0xfff0e0), 1],
    ['Lucas', 'xbot', C.sky, 9], ['Emma', 'michelle', tint(0xe0ffe8), 8],
    ['Kenji', 'xbot', C.slate, 18],
    ['Isabel', 'michelle', tint(0xffd9ec), 21], ['Noah', 'xbot', C.coral, 20],
    ['Fatima', 'michelle', tint(0xe8e0ff), 30],
    ['Grace', 'xbot', C.mint, 36], ['Mateo', 'xbot', C.plum, 37],
    ['Zoe', 'michelle', tint(0xfff6d0), 44], ['Ali', 'xbot', C.sand, 45],
  ];
  const dinerLines = ['The pasta here is amazing!', 'Try the mango lassi.', 'We come here every summer.', 'Mmm… the grilled fish is perfect.', 'Is the buffet still open?', 'Best breakfast on the coast!'];
  diners.forEach(([name, kind, of, si], i) => {
    if (!full && i % 2 === 1) return;
    add(new Seated(scene, kind, { name, role: 'Diner', outfit: of, zone: 'cafe', lines: dinerLines }, seats[si], ['eat', 'talk', 'eat']), i < 4);
  });

  // waiter with a tray: pass window → table → back
  const leo = add(new NPC(scene, 'xbot', { name: 'Leo', role: 'Waiter', outfit: C.black, zone: 'cafe', speed: 1.5, lines: ['Can I get you anything?', 'Today\'s special is the coconut curry.', 'Your table will be ready in a moment.'] }), true);
  const tray = new THREE.Group();
  const trayM = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.8, roughness: 0.3 }));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshStandardMaterial({ color: 0xe0a24a }));
  dish.scale.y = 0.5; dish.position.y = 0.04;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cup.position.set(0.14, 0.07, 0.05);
  tray.add(trayM, dish, cup); tray.position.set(0, 1.12, 0.42); tray.visible = false;
  leo.ch.root.add(tray);
  leo.ch.root.position.set(-27.2, 0, -12.5);
  const tablesX = [-25, -19.5, -14], tablesZ = [-14.5, -8, 8, 14.5];
  const leoSteps = [];
  for (const [tx, tz] of [[-19.5, -8], [-14, 8], [-25, 14.5], [-19.5, -14.5], [-25, -8], [-14, 14.5]]) {
    const rowZ = tz + (tz < 0 ? 3.25 : -3.25), side = rowZ > tz ? 1.0 : -1.0;
    leoSteps.push(
      { path: [[-27.2, -12.5]], activity: 'Collecting an order from the kitchen' },
      { wait: [1.5, 2.5], face: -Math.PI / 2, activity: 'Picking up plates at the pass' },
      { do: (n) => { tray.visible = true; n.ch.setPose('carry', 1); }, path: [[-27.2, rowZ], [tx + 1.0, rowZ], [tx + 1.0, tz + side]], activity: `Serving table at (${tx}, ${tz})` },
      { wait: [2, 3.5], face: [tx, tz], say: ['Here you are. Enjoy!', 'Your coconut curry!', 'Careful, the plate is hot.'], sayChance: 0.5, activity: 'Serving a table' },
      { do: (n) => { tray.visible = false; n.ch.setPose('carry', 0); }, path: [[tx + 1.0, rowZ], [-27.2, rowZ]], activity: 'Heading back to the kitchen' },
    );
  }
  leo.script = new Script(leo, leoSteps);

  // second waiter in full mode
  if (full) {
    const maya = add(new NPC(scene, 'michelle', { name: 'Maya', role: 'Waitress', outfit: tint(0xf0f0f0), zone: 'cafe', speed: 1.4, lines: ['Welcome to Café Azure!', 'The buffet has fresh fruit and pastries.'] }));
    maya.ch.root.position.set(-16.75, 0, 0);
    maya.script = new Script(maya, [
      { path: [[-16.75, 4.75], [-13, 4.75], [-13, 7]], activity: 'Checking on guests' },
      { wait: [2, 4], face: [-14, 8], pose: 'talk', say: ['Is everything alright?', 'More water?'], sayChance: 0.5, activity: 'Talking to diners' },
      { path: [[-13, 4.75], [-22.25, 4.75], [-22.25, 0], [-22.25, -4.75], [-18.5, -4.75], [-18.5, -7]], activity: 'Checking on guests' },
      { wait: [2, 4], face: [-19.5, -8], pose: 'talk', activity: 'Taking an order' },
      { path: [[-18.5, -4.75], [-12, -1.5]], activity: 'Walking to the entrance' },
      { wait: [4, 8], face: Math.PI / 2, pose: 'look', activity: 'Greeting guests at the café door' },
    ]);
  }

  // buffet host
  const ana = add(new NPC(scene, 'michelle', { name: 'Ana', role: 'Buffet Host', outfit: tint(0xdfefff), zone: 'cafe', talkAt: { x: -32, z: 9 }, lines: ['Fresh croissants just came out!', 'The curry on the left is vegetarian.'] }));
  ana.ch.root.position.set(-35.1, 0, 5);
  ana.script = new Script(ana, [
    { wait: [4, 7], face: Math.PI / 2, pose: 'stir', activity: 'Refilling the buffet' },
    { path: [[-35.1, 9.5]], speed: 0.9 },
    { wait: [4, 7], face: Math.PI / 2, pose: 'stir', activity: 'Arranging desserts' },
    { path: [[-35.1, 14]], speed: 0.9 },
    { wait: [3, 6], face: Math.PI / 2, pose: 'talk', activity: 'Chatting with guests' },
    { path: [[-35.1, 5]], speed: 0.9 },
  ]);

  // chef in the kitchen
  const K = anchors.kitchen;
  const marco = add(new NPC(scene, 'xbot', { name: 'Marco', role: 'Head Chef', outfit: C.white, zone: 'kitchen', lines: ['Tonight: grilled prawns with lime butter!', 'Mind the hot pans!', 'A pinch more salt…'] }), true);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.28, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
  hat.castShadow = true; scene.add(hat); marco.ch.attach(hat, 'Head', new THREE.Vector3(0, 0.24, 0));
  marco.ch.root.position.set(K.stove.x, 0, K.stove.z);
  marco.script = new Script(marco, [
    { wait: [6, 10], face: K.stove.yaw, pose: 'stir', activity: 'Cooking at the stove' },
    { path: [[-33.4, -13.5], [K.prep.x, K.prep.z]], speed: 1.2 },
    { wait: [5, 8], face: K.prep.yaw, pose: 'type', activity: 'Chopping vegetables' },
    { path: [[-31.5, -12.5], [K.pass.x, K.pass.z]], speed: 1.2 },
    { wait: [2.5, 4], face: K.pass.yaw, pose: 'carry', say: ['Order up!', 'Table seven, ready!', 'Service!'], activity: 'Plating at the pass' },
    { path: [[-31.5, -16], [K.stove.x, K.stove.z]], speed: 1.2 },
  ]);
  if (full) {
    const sous = add(new NPC(scene, 'xbot', { name: 'Ines', role: 'Sous Chef', outfit: C.white, zone: 'kitchen', lines: ['Yes, chef!'] }));
    const hat2 = hat.clone(); scene.add(hat2); sous.ch.attach(hat2, 'Head', new THREE.Vector3(0, 0.24, 0));
    sous.ch.root.position.set(-31, 0, -17.9);
    sous.script = new Script(sous, [
      { wait: [7, 11], face: Math.PI, pose: 'stir', activity: 'Searing fish' },
      { path: [[-32, -8], [-34.0, -8]], speed: 1.1 },
      { wait: [4, 6], face: -Math.PI / 2, pose: 'type', activity: 'Preparing salads' },
      { path: [[-32, -8], [-31, -17.9]], speed: 1.1 },
    ]);
  }

  // ===================== ROOMS =====================
  const R = anchors.rooms;
  add(new Seated(scene, 'michelle', { name: 'Nina', role: 'Guest · Room 101', outfit: tint(0xc9e4ff), zone: 'rooms', lines: ['Shh, my show is on!', 'This bed is so comfy.'], labels: { look: 'Watching TV', none: 'Watching TV', phone: 'Texting a friend' } }, R[101].bedEdge, ['none', 'phone', 'none']));
  add(new Seated(scene, 'xbot', { name: 'Omar', role: 'Guest · Room 105', outfit: C.plum, zone: 'rooms', lines: ['Just finishing some work before the beach.', 'Quick video call, then swimming!'], labels: { type: 'Working on a laptop', phone: 'On a video call' } }, R[105].desk, ['type', 'type', 'phone']));
  const lata = add(new NPC(scene, 'xbot', { name: 'Lata', role: 'Housekeeping', outfit: C.lav, zone: 'rooms', speed: 1.1, lines: ['Fresh towels are on the way!', 'Good morning! Room 103 is ready.'] }));
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

  // ===================== POOL =====================
  add(new Swimmer(scene, 'xbot', { name: 'Liam', role: 'Swimmer', outfit: C.sky, zone: 'pool', lines: ['The water is perfect!'] }, -36, -12, 12), true);
  add(new Swimmer(scene, 'michelle', { name: 'Chloe', role: 'Swimmer', outfit: tint(0xffffff), zone: 'pool', lines: ['Race you to the end!'] }, -40, -11, 11));
  if (full) add(new Swimmer(scene, 'xbot', { name: 'Ethan', role: 'Swimmer', outfit: C.coral, zone: 'pool', lines: ['Just 10 more laps.'] }, -44, -12, 12));
  const L = anchors.loungers;
  [[1, 'xbot', C.sand, 'Paul'], [4, 'michelle', tint(0xffe9c9), 'Olivia'], [6, 'xbot', C.coral, 'Sam'], [10, 'michelle', tint(0xe6f5ff), 'Lily']].forEach(([i, kind, of, name], k) => {
    if (!full && k > 1) return;
    const n = add(new NPC(scene, kind, { name, role: 'Sunbathing', outfit: of, zone: 'pool', lines: ['Zzz… oh, hello!', 'Perfect weather today.'] }));
    n.ch.lieOn(L[i]); n.activity = 'Sunbathing';
  });
  const ravi = add(new Seated(scene, 'xbot', { name: 'Ravi', role: 'Lifeguard', outfit: C.red, zone: 'pool', lines: ['No running on the deck, please!', 'Pool is 1.6 m deep. Swim safe!'], labels: { look: 'Watching the swimmers', none: 'On duty' } }, anchors.lifeguard, ['look', 'look', 'none']), true);
  ravi.ch.root.position.y = 0;

  // pool bar
  const tomas = add(new NPC(scene, 'xbot', { name: 'Tomás', role: 'Bartender', outfit: C.teal, zone: 'poolbar', talkAt: { x: 25, z: -34.6 }, lines: ['Mojito? Coconut cooler? Fresh lime soda?', 'Happy hour starts at 5!'] }), true);
  tomas.ch.root.position.set(25, 0, -31.7);
  tomas.script = new Script(tomas, [
    { wait: [4, 7], face: Math.PI, pose: 'stir', activity: 'Mixing a mojito' },
    { path: [[22.6, -31.7]], speed: 1 },
    { wait: [3, 5], face: Math.PI, pose: 'talk', activity: 'Chatting with guests' },
    { path: [[27.4, -31.7]], speed: 1 },
    { wait: [3, 6], face: 0, pose: 'stir', activity: 'Taking bottles from the shelf' },
    { path: [[25, -31.7]], speed: 1 },
  ]);
  const st = anchors.barStools;
  add(new Seated(scene, 'michelle', { name: 'Ava', role: 'Guest', outfit: tint(0xfff0f5), zone: 'poolbar', lines: ['These cocktails are lovely.'] }, st[1], ['talk', 'eat']));
  add(new Seated(scene, 'xbot', { name: 'Jack', role: 'Guest', outfit: C.olive, zone: 'poolbar', lines: ['Cheers!'] }, st[2], ['talk', 'eat']));
  if (full) add(new Seated(scene, 'xbot', { name: 'Mia', role: 'Guest', outfit: C.mint, zone: 'poolbar', lines: ['I love the music.'] }, st[4], ['phone', 'talk']));

  // dancer on the stage
  const zara = add(new NPC(scene, 'michelle', { name: 'Zara', role: 'Samba Dancer', zone: 'poolbar', lines: ['Come dance with us!', 'Samba every evening by the pool!'] }), true);
  zara.ch.root.position.set(anchors.stage.x, 0.31, anchors.stage.z); zara.ch.root.rotation.y = -Math.PI * 0.8;
  zara.ch.play('dance', 0); zara.activity = 'Dancing the samba';

  // robot server
  const rx = add(new NPC(scene, 'robot', { name: 'RX-7', role: 'Robot Server', zone: 'pool', speed: 1.2, lines: ['BEEP. Your drink is served.', 'I carry 12 drinks without spilling.', 'Have a refreshing day, human!'] }), true);
  rx.ch.root.position.set(25, 0, -35.5);
  rx.script = new Script(rx, [
    { wait: [2, 3], face: 0, anim: 'yes', activity: 'Collecting drinks at the bar' },
    { path: [[18, -36], [16, -48], [3, -48.6]], activity: 'Delivering drinks to the loungers' },
    { wait: [2.5, 3.5], face: Math.PI, anim: 'wave', say: ['Your coconut cooler, madam.', 'BEEP. Drink delivered.'], activity: 'Serving a sunbather' },
    { path: [[-9, -48.6]], activity: 'Delivering drinks to the loungers' },
    { wait: [2, 3], face: Math.PI, anim: 'thumbs', activity: 'Serving a sunbather' },
    { path: [[-17.35, -48], [-17.35, -44]], activity: 'Delivering drinks' },
    { wait: [2, 3], face: -Math.PI / 2, anim: 'wave', activity: 'Serving a sunbather' },
    { path: [[-17.35, -28], [16, -28], [18, -35.5], [25, -35.5]], activity: 'Returning to the bar' },
  ]);

  // strolling couple around the pool
  const pr = [[[-17.35, -28], [16, -28]], [[16, -48]], [[-17.35, -48]], [[-17.35, -28]]];
  const s1 = add(new NPC(scene, 'michelle', { name: 'Elena', role: 'Guest', outfit: tint(0xffddc1), zone: 'pool', speed: 1.0, lines: ['What a view!', 'We\'re walking to the beach later.'] }));
  s1.ch.root.position.set(-17.35, 0, -28); s1.script = walkerScript(s1, pr, { pauseChance: 0.5 });
  if (full) {
    const s2 = add(new NPC(scene, 'xbot', { name: 'Marcus', role: 'Guest', outfit: C.slate, zone: 'pool', speed: 1.0, lines: ['Have you seen the boats?'] }));
    s2.ch.root.position.set(16, 0, -48); s2.script = walkerScript(s2, [[[-17.35, -48]], [[-17.35, -28]], [[16, -28]], [[16, -48]]], { pauseChance: 0.5 });
  }
  // beach walkers
  const bw = add(new NPC(scene, 'xbot', { name: 'Kai', role: 'Beachgoer', outfit: C.coral, zone: 'beach', speed: 1.1, lines: ['Shells everywhere!', 'The water is warm today.'] }));
  bw.ch.root.position.set(-30, 0, -68); bw.script = walkerScript(bw, [[[30, -68.5]], [[-30, -68]]], { pauseChance: 0.8, pause: [4, 8] });

  // ===================== STREET =====================
  const pedLines = ['Lovely day for a walk.', 'Is this the Azure Bay resort?', 'I\'m heading to the beach.', 'Excuse me!'];
  const peds = [
    ['Ben', 'xbot', C.olive, [[[-60, 50], [60, 50]], [[60, 50.2], [-60, 50.2]]]],
    ['Sara', 'michelle', tint(0xfff3d6), [[[50, 36], [2, 36], [1.5, 36.5], [1.5, 49.5], [-50, 49.5]], [[-50, 49.8], [-2, 49.8], [-1.5, 49.5], [-1.5, 36.5], [50, 36.2]]]],
    ['Tom', 'xbot', C.sky, [[[-70, 36.5], [70, 36.5]], [[70, 36.8], [-70, 36.8]]]],
    ['Leah', 'michelle', tint(0xe5d4ff), [[[-14, 36.3], [-3.6, 36.3], [-3.6, 32.5], [-6, 28]], [[-3.6, 32.5], [-3.6, 36.3], [-45, 36.3]], [[-14, 36.3]]]],
  ];
  peds.forEach(([name, kind, of, route], i) => {
    if (!full && i > 1) return;
    const n = add(new NPC(scene, kind, { name, role: 'Pedestrian', outfit: of, zone: 'street', speed: rand(1.0, 1.35), lines: pedLines }));
    n.ch.root.position.set(route[0][0][0], 0, route[0][0][1]);
    n.script = walkerScript(n, route, { pauseChance: 0.4 });
    n.pedestrian = true;
  });
  // bench sitter in the plaza
  add(new Seated(scene, 'xbot', { name: 'George', role: 'Visitor', outfit: C.sand, zone: 'plaza', lines: ['I love watching the fountain.', 'The pigeons are friendly here.'] }, anchors.benches[0], ['phone', 'none', 'look']));
  if (full) {
    const guard2 = add(new NPC(scene, 'soldier', { name: 'Dev', role: 'Security Patrol', zone: 'plaza', speed: 1.15, lines: ['Patrolling the grounds. Have a good one.'] }));
    guard2.ch.root.position.set(-37.4, 0, 26);
    guard2.script = new Script(guard2, [
      { path: [[-37.4, -22], [-28, -22.5]], activity: 'Patrolling the west garden' },
      { wait: [3, 6], pose: 'look', activity: 'Checking the pool deck' },
      { path: [[-37.4, -22], [-37.4, 26]], activity: 'Patrolling the west garden' },
      { wait: [3, 6], pose: 'look', activity: 'Watching the street' },
    ]);
  }

  // label visibility starts hidden until near
  return { npcs, priya };
}
