// main.js — entry point: sets up scene, camera, renderer, loads everything,
// then runs the animation loop (guide chapter 3: "The Core Rendering Loop").
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONFIG } from './config.js';
import { initMaterials, setAnisotropy, getMat } from './scene/materials.js';
import { createEnvironment, wind } from './scene/environment.js';
import { buildArchitecture, createDoors } from './scene/architecture.js';
import { buildFurniture } from './scene/furniture.js';
import { buildNeighbourhood } from './scene/neighbourhood.js';
import { staticBatch } from './scene/helpers.js';
import { loadCharacters, loadPeople } from './characters/loader.js';
import { createCast } from './characters/npc.js';
import { Player, attachJoystick } from './characters/controller.js';
import { FollowCamera } from './systems/camera.js';
import { createTraffic } from './systems/traffic.js';
import { detectQuality, saveQuality, webglAvailable, FPSMeter, pauseWhenHidden } from './systems/performance.js';
import { rayCast } from './systems/collision.js';
import { createHUD } from './ui/hud.js';
import { createChat } from './ui/chat.js';
import { createInteractions } from './systems/interact.js';
import { createSocial } from './systems/social.js';
import { buildNav, refinePath, walkable } from './systems/nav.js';
import { world } from './systems/routes.js';

if (!webglAvailable()) {
  document.getElementById('error').hidden = false;
  document.getElementById('intro').hidden = true;
  throw new Error('WebGL not available');
}

// ---------- Step 1: setup (runs once) ----------
const qualityKey = new URLSearchParams(location.search).get('quality') || detectQuality();
const profile = CONFIG.quality[qualityKey] || CONFIG.quality.balanced;
const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: profile.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, profile.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = profile.shadows;
renderer.shadowMap.type = qualityKey === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
app.appendChild(renderer.domElement);
setAnisotropy(qualityKey === 'low' ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const labelRenderer = new CSS2DRenderer({ element: document.getElementById('labels') });
labelRenderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, innerWidth / innerHeight, 0.1, 2600);
camera.position.set(60, 40, 70);

const hud = createHUD();
hud.showIntroProgress(0.05, 'Building the resort…');

initMaterials();
const env = createEnvironment(scene, renderer, profile);
const arch = buildArchitecture(scene, profile);
const furn = buildFurniture(scene, profile);
const hood = buildNeighbourhood(scene, profile);
staticBatch(arch.group); staticBatch(furn.group); staticBatch(hood.group);
// walkable grid for people (waiters, room service) + real doors they knock on and open
buildNav();
const doors = createDoors(arch.doors);
world.gate = (ch, tx, tz) => doors.gate(ch, tx, tz);
world.refine = refinePath;
world.walkable = walkable;
const traffic = createTraffic(scene, profile);

env.onNight((n) => {
  furn.setNight(n); hood.setNight(n); traffic.setNight(n);
  arch.water.material.uniforms.uNight.value = n;
  arch.dynamic.traverse((o) => { if (o.userData.signMat) o.userData.signMat.emissiveIntensity = 0.15 + n * 0.9; });
});

const followCam = new FollowCamera(camera, renderer.domElement);
let player = null, cast = null, started = false;

// everything usable (seats, beds, TVs, laptops…) and typed chat with anyone
const interact = createInteractions({ scene, furn, hud, getPlayer: () => player, getNpcs: () => npcsList(), getCouriers: () => cast?.couriers ?? {}, toggleNight: () => toggleNight(), isNight: () => env.isNight() });
furn.anchors.rooms[101].tv.setPower(true);   // Neha is watching the cricket
const chat = createChat({
  getPlayer: () => player,
  getCtx: (npc) => ({ night: env.isNight(), canEscort: npc === cast?.priya && ['TYPING', 'IDLE', 'GREETING'].includes(npc.state) }),
  onAction(act, npc) {
    if (act.type === 'escort') { chat.close(); cast.priya.startEscort(act.arg); }
    else if (act.type === 'travel') { chat.close(); travelTo(CONFIG.zones.find((z) => z.id === act.arg)); }
    else if (act.type === 'menu') hud.showMenu(/room service|waiter|waitress|buffet|chef|bartender|server|concierge|receptionist/i.test(npc.role) ? { order: (item) => { interact.order(item); npc.ch.say(`One ${item.name.toLowerCase()}, coming up!`, 3); } } : {});
    else if (act.type === 'order') { interact.order(act.arg); npc.ch.say('Coming right up!', 3); }
  },
  onGesture: (kind) => social.perform(kind),
});
const social = createSocial({ getPlayer: () => player, getNpcs: () => npcsList(), hud, chat });

// ---------- load characters with a progress bar ----------
const manager = new THREE.LoadingManager();
const fileProgress = new Map();
const origFetch = THREE.FileLoader.prototype.load;
THREE.FileLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  return origFetch.call(this, url, onLoad, (e) => {
    if (e.lengthComputable) {
      fileProgress.set(url, e.loaded / e.total);
      const vals = [...fileProgress.values()];
      hud.showIntroProgress(0.08 + 0.82 * vals.reduce((a, b) => a + b, 0) / 2, `Loading people… ${Math.round(100 * vals.reduce((a, b) => a + b, 0) / 2)}%`);
    }
    onProgress && onProgress(e);
  }, onError);
};

let people = [];
loadCharacters(manager, ['xbot', 'michelle']).then(async () => {
  hud.showIntroProgress(0.92, 'Loading real 3D people…');
  people = await loadPeople(manager, CONFIG.people);
  hud.showIntroProgress(0.95, 'Waking up the staff…');
  cast = createCast(scene, furn.anchors, profile, hud, people);
  hud.buildTravel(travelTo);
  // compile shaders up front so the first walk doesn't stutter
  renderer.compile(scene, camera);
  hud.ready(startAs);
}).catch((err) => {
  console.error(err);
  hud.showIntroProgress(1, 'Could not load the 3D characters. Reload the page to try again.');
});

function startAs(kind) {
  const sex = kind === 'xbot' ? 'm' : 'f';
  player = new Player(scene, kind, kind === 'xbot' ? 'Rahul' : 'Aditi', people.find((p) => p.player === sex)?.kind);
  player.enabled = true;
  player.onStand = () => interact.onStand();
  player.onWave = () => social.perform('wave');
  hud.setTravel(travelTo);
  followCam.pos.copy(camera.position);
  hud.start();
  started = true;
  hud.toast(`Welcome to ${CONFIG.name}. Walk to the glass doors with ↑`, 5);
  setTimeout(() => renderer.domElement.focus?.(), 50);
}

// ---------- interaction ----------
const npcsList = () => (cast ? cast.npcs : []);
let nearest = null;

function travelTo(z) {
  if (!player) return;
  hud.fade(() => {
    const [x, zz, yaw] = z.spawn;
    player.teleport(x, zz, yaw);
    followCam.orbit = 0;
    followCam.update(0, player, true);
  });
}

function interactKey() {
  if (!player || chat.isOpen()) return;
  if (hud.escortOpen()) return;
  if (nearest?.hotspot === 'menu') { hud.showMenu(); return; }
  if (nearest?.door) {
    const d = nearest.door, opened = doors.toggle(d);
    if (opened && player.mode === 'free') { player.yaw = player.ch.root.rotation.y; player.gesture('push'); }
    hud.toast(opened ? `You open the door · ${d.label}` : `You close the door · ${d.label}`, 2);
    return;
  }
  if (nearest?.npc) {
    chat.open(nearest.npc);
    if (!nearest.npc.talkAt && player.mode === 'free') player.yaw = Math.atan2(nearest.npc.x - player.x, nearest.npc.z - player.z);
  } else if (nearest?.item) interact.use(nearest.item);
}

function talkFromPanel(npc) {
  // walk the player next to the NPC and say hello
  hud.fade(() => {
    const a = Math.random() * Math.PI * 2;
    let x = npc.x + Math.sin(npc.ch.root.rotation.y) * 1.6, z = npc.z + Math.cos(npc.ch.root.rotation.y) * 1.6;
    if (npc.ch.kind === 'robot' || npc.zone === 'pool') { x = npc.x + Math.cos(a) * 1.8; z = npc.z + Math.sin(a) * 1.8; }
    player.teleport(x, z, Math.atan2(npc.x - x, npc.z - z));
    followCam.orbit = 0; followCam.update(0, player, true);
    chat.open(npc);
  });
}

addEventListener('keydown', (e) => {
  if (!started) return;
  if (e.target.closest?.('input, textarea, select')) return;   // typing in the chat or notes
  const k = e.key.toLowerCase();
  if (k === 'e') interactKey();
  else if (k === 't' && nearest?.npc) { e.preventDefault(); interactKey(); }
  else if (k === 'c') toggleView();
  else if (k === 'n') toggleNight();
  else if (k === 'l') toggleLabels();
  else if (k === 'h') toggleHelp();
  else if (k === 'g') social.toggleMenu();
  else if (k === 'r') followCam.reset();
  else if (k === '+' || k === '=') followCam.zoom(0.88);
  else if (k === '-') followCam.zoom(1.12);
  else if (k === 'escape') { social.closeMenu(); if (!interact.closeDevice()) { chat.close(); hud.closePanel(); hud.closeEscort(); } }
  else if (/^[1-8]$/.test(k)) travelTo(CONFIG.zones.find((z) => z.id === CONFIG.travel[+k - 1]));
});

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('click', (e) => {
  if (!started || followCam.wasDrag()) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = [...npcsList().map((n) => n.ch.hit), ...furn.anchors.hotspots];
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit) return;
  if (hit.object.userData.hotspot === 'menu') hud.showMenu();
  else if (hit.object.userData.character?.npc) hud.showCharacter(hit.object.userData.character.npc, talkFromPanel);
});

// toolbar
const btnNight = document.getElementById('btn-night'), btnView = document.getElementById('btn-view');
const btnLabels = document.getElementById('btn-labels'), btnHelp = document.getElementById('btn-help');
let labelsOn = true;
function toggleNight() { const n = env.toggleNight(); btnNight.setAttribute('aria-pressed', String(!!n)); hud.toast(n ? 'Evening falls over Azure Bay' : 'Good morning!'); }
function toggleView() { const fp = followCam.mode !== 'first'; followCam.setMode(fp ? 'first' : 'third'); btnView.setAttribute('aria-pressed', String(fp)); }
function toggleLabels() { labelsOn = !labelsOn; btnLabels.setAttribute('aria-pressed', String(labelsOn)); }
function toggleHelp() { const h = document.getElementById('help'); h.hidden = !h.hidden; btnHelp.setAttribute('aria-pressed', String(!h.hidden)); }
btnNight.onclick = toggleNight; btnView.onclick = toggleView; btnLabels.onclick = toggleLabels; btnHelp.onclick = toggleHelp;
const sel = document.getElementById('sel-quality');
for (const [k, q] of Object.entries(CONFIG.quality)) { const o = document.createElement('option'); o.value = k; o.textContent = q.label; if (k === qualityKey) o.selected = true; sel.appendChild(o); }
sel.onchange = () => {
  const ok = saveQuality(sel.value);
  hud.toast(`Switching to ${CONFIG.quality[sel.value].label} quality…`);
  setTimeout(() => {
    if (ok) location.reload();
    else { const u = new URL(location.href); u.searchParams.set('quality', sel.value); location.replace(u.toString()); }
  }, 500);
};
document.getElementById('act').onclick = interactKey;
attachJoystickWhenReady();
function attachJoystickWhenReady() {
  const tryAttach = () => { if (player) attachJoystick(document.getElementById('joy'), document.getElementById('knob'), player); else setTimeout(tryAttach, 300); };
  tryAttach();
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labelRenderer.setSize(innerWidth, innerHeight);
});

// ---------- Step 2: animation loop (~60 fps) ----------
const clock = new THREE.Clock();
const fps = new FPSMeter();
let t = 0, frame = 0, panelTimer = 0;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _v2 = new THREE.Vector3(), _pm = new THREE.Matrix4();
const frustum = new THREE.Frustum(), _sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);

function zoneAt(x, z) { return CONFIG.zones.find((q) => x >= q.rect[0] && x <= q.rect[2] && z >= q.rect[1] && z <= q.rect[3]) || null; }
let lastZone;

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  simulate(dt);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  if (fps.tick(dt) && started) hud.setFPS(fps.fps);
}

/** Advance the whole world by dt seconds (no drawing). */
function simulate(dt) {
  t += dt; frame++;
  wind.uniforms.uTime.value = t;
  arch.water.material.uniforms.uTime.value = t;
  hood.update(dt, t);
  if (frame % 6 === 0) furn.update(t);

  const npcs = npcsList();
  if (player) player.update(dt, npcs.filter((n) => !n.ch.lie && n.ch.root.position.y > -0.2));
  interact.update(dt);
  chat.update();

  // NPC behaviour + animation (far characters animate at a lower rate)
  // everyone standing is solid: walkers wait, say "excuse me" and step round each other
  const solid = npcs.filter((n) => n.standing);
  const ctx = { player: player || { x: 0, z: 60, yaw: 0 }, blockers: player ? [player, ...solid] : solid };
  camera.updateMatrixWorld();
  _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(_pm);
  for (let i = 0; i < npcs.length; i++) {
    const n = npcs[i];
    n.update(dt, ctx);
    const d2 = (n.x - camera.position.x) ** 2 + (n.z - camera.position.z) ** 2;
    // frustum + distance culling for skinned characters (guide: "skip what you cannot see")
    _sphere.center.set(n.x, 1 + n.ch.root.position.y, n.z);
    const visible = d2 < 130 * 130 && frustum.intersectsSphere(_sphere);
    n.ch.root.visible = visible;
    n.ch.setDetail(d2 < 16 * 16);
    n._acc = (n._acc || 0) + dt;
    const every = !visible ? 12 : d2 > 70 * 70 ? 4 : d2 > 35 * 35 ? 2 : 1;
    if ((frame + i) % every === 0) { n.ch.update(n._acc); n._acc = 0; }
  }

  // nobody walks through anybody: push overlapping people apart (only onto walkable floor)
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
    if (d2 > 0.3025 || d2 < 1e-8) continue;            // 0.55 m apart
    const d = Math.sqrt(d2), push = (0.55 - d) / 2, ux = dx / d, uz = dz / d;
    // whoever is walking gives way; someone standing still is only nudged
    const wa = a.ch.speed > 0.05 ? 1 : 0.25, wb = b.ch.speed > 0.05 ? 1 : 0.25, k = push * 2 / (wa + wb);
    const ax = a.x - ux * k * wa, az = a.z - uz * k * wa, bx = b.x + ux * k * wb, bz = b.z + uz * k * wb;
    if (walkable(ax, az) && !a.talkAt) { a.ch.root.position.x = ax; a.ch.root.position.z = az; }
    if (walkable(bx, bz) && !b.talkAt) { b.ch.root.position.x = bx; b.ch.root.position.z = bz; }
  }

  // sliding doors open for anyone nearby; room / kitchen doors only when someone opens them
  const standing = npcs.filter((n) => n.standing);
  doors.update(dt, player ? [player, ...standing] : standing);
  traffic.update(dt, t, player ? [player, ...npcs.filter((n) => n.pedestrian)] : npcs.filter((n) => n.pedestrian));

  if (started && player) {
    followCam.update(dt, player);
    env.update(dt, player.ch.root.position);
    // zone label
    const z = zoneAt(player.x, player.z);
    if (z !== lastZone) { lastZone = z; hud.setZone(z); }
    // nearest interactive thing: a person to chat with, the menu stand, or something to use
    nearest = null; let best = player.mode === 'free' ? 2.6 : 3.2;
    for (const n of npcs) {
      if (n.ch.root.position.y < -0.6) continue;
      const tp = n.talkPos();
      const d = Math.hypot(tp.x - player.x, tp.z - player.z);
      if (d < best && d > 0.05) {
        // only people you can actually see (not through a wall)
        _v.set(player.x, 1.2, player.z); _d.set(tp.x - player.x, 0, tp.z - player.z).normalize();
        if (rayCast(_v, _d, d) < d - 0.05) continue;
        best = d; nearest = { npc: n };
      }
    }
    for (const h of furn.anchors.hotspots) { h.getWorldPosition(_v); const d = Math.hypot(_v.x - player.x, _v.z - player.z); if (d < Math.min(best, 2.2)) { best = d; nearest = { hotspot: h.userData.hotspot }; } }
    if (player.mode === 'free') {
      const it = interact.nearest(player);
      if (it && (!nearest || it.d < 0.9 || it.d < best * 0.6)) nearest = { item: it.item };
      const d = doors.nearest(player);
      if (d && (!nearest || d.target === 0 || nearest.item)) {
        // a closed door right in front of you wins; an open one only if nothing else is closer
        const dd = Math.hypot(d.x - player.x, d.z - player.z);
        if (d.target === 0 || !nearest || dd < 1.0) nearest = { door: d };
      }
    }
    // your head turns to the person you're about to talk to
    player.ch.lookAt = nearest?.npc ? (nearest.npc.ch.bones.Head ? nearest.npc.ch.bones.Head.getWorldPosition(_v2) : _v2.set(nearest.npc.x, 1.6, nearest.npc.z)) : null;
    if (hud.escortOpen() || chat.isOpen() || player.busy) hud.prompt(null);
    else if (nearest?.door) hud.prompt(nearest.door.target ? `Close the door · ${nearest.door.label}` : `Open the door · ${nearest.door.label}`);
    else if (nearest?.hotspot === 'menu') hud.prompt('Read the Café Azure menu');
    else if (nearest?.npc) hud.prompt(`Chat with ${nearest.npc.name} · ${nearest.npc.role}` + (player.mode !== 'free' ? '<em>↑ stand up</em>' : ''));
    else if (nearest?.item) hud.prompt(nearest.item.label);
    else if (player.mode !== 'free') hud.prompt('Stand up', '↑');
    else hud.prompt(null);
    if (frame % 2 === 0) hud.drawMap(player, npcs);
    panelTimer += dt; if (panelTimer > 0.4) { panelTimer = 0; hud.refreshPanel(); }
  } else {
    followCam.intro(dt);
    env.update(dt, { x: 0, z: -10 });
  }

  // labels: near, in view, and not behind a wall
  if (frame % 3 === 0) {
    for (const n of npcs) {
      const L = n.ch.label; if (!L) continue;
      _v.set(n.x, 1.8 + n.ch.root.position.y, n.z);
      const dist = _v.distanceTo(camera.position);
      let vis = started && labelsOn && dist < 14;
      if (vis) { _d.subVectors(_v, camera.position).normalize(); vis = rayCast(camera.position, _d, dist) >= dist - 0.3; }
      L.visible = vis;
      if (n.ch.bubble) n.ch.bubble.visible = started && dist < 22;
      const sitDrop = n.ch.pose.sit * 0.55;
      L.position.y = (n.ch.lie ? 1.0 : 2.05 - sitDrop); n.ch.bubble.position.y = L.position.y + 0.42;
    }
    if (player?.ch.label) player.ch.label.visible = labelsOn && followCam.mode === 'third';
  }

}
renderer.setAnimationLoop(loop);
pauseWhenHidden(renderer, loop, clock);

// expose a tiny debug handle (handy in DevTools)
window.azureBay = { scene, renderer, camera, anchors: furn.anchors, interact, chat, doors, social, followCam, get cast() { return cast; }, get player() { return player; }, get npcs() { return npcsList(); }, travelTo: (id) => travelTo(CONFIG.zones.find((z) => z.id === id)), info: () => renderer.info.render,
  /** fast-forward the simulation (testing on slow machines): step(seconds) */
  step(seconds) { for (let s = 0; s < seconds; s += 0.05) simulate(0.05); },
  toggleNight };
