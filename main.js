// main.js — entry point: sets up scene, camera, renderer, loads everything,
// then runs the animation loop (guide chapter 3: "The Core Rendering Loop").
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CONFIG } from './config.js';
import { initMaterials, setAnisotropy, getMat } from './scene/materials.js';
import { createEnvironment, wind } from './scene/environment.js';
import { buildArchitecture, updateDoors } from './scene/architecture.js';
import { buildFurniture } from './scene/furniture.js';
import { buildNeighbourhood } from './scene/neighbourhood.js';
import { staticBatch } from './scene/helpers.js';
import { loadCharacters } from './characters/loader.js';
import { createCast } from './characters/npc.js';
import { Player, attachJoystick } from './characters/controller.js';
import { FollowCamera } from './systems/camera.js';
import { createTraffic } from './systems/traffic.js';
import { detectQuality, saveQuality, webglAvailable, FPSMeter, pauseWhenHidden } from './systems/performance.js';
import { rayCast } from './systems/collision.js';
import { createHUD } from './ui/hud.js';

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
const traffic = createTraffic(scene, profile);

env.onNight((n) => {
  furn.setNight(n); hood.setNight(n); traffic.setNight(n);
  arch.water.material.uniforms.uNight.value = n;
  arch.dynamic.traverse((o) => { if (o.userData.signMat) o.userData.signMat.emissiveIntensity = 0.15 + n * 0.9; });
});

const followCam = new FollowCamera(camera, renderer.domElement);
let player = null, cast = null, started = false;

// ---------- load characters with a progress bar ----------
const manager = new THREE.LoadingManager();
const fileProgress = new Map();
const origFetch = THREE.FileLoader.prototype.load;
THREE.FileLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  return origFetch.call(this, url, onLoad, (e) => {
    if (e.lengthComputable) {
      fileProgress.set(url, e.loaded / e.total);
      const vals = [...fileProgress.values()];
      hud.showIntroProgress(0.08 + 0.82 * vals.reduce((a, b) => a + b, 0) / 4, `Loading people… ${Math.round(100 * vals.reduce((a, b) => a + b, 0) / 4)}%`);
    }
    onProgress && onProgress(e);
  }, onError);
};

loadCharacters(manager).then(() => {
  hud.showIntroProgress(0.95, 'Waking up the staff…');
  cast = createCast(scene, furn.anchors, profile, hud);
  hud.buildTravel(travelTo);
  // compile shaders up front so the first walk doesn't stutter
  renderer.compile(scene, camera);
  hud.ready(startAs);
}).catch((err) => {
  console.error(err);
  hud.showIntroProgress(1, 'Could not load the 3D characters. Reload the page to try again.');
});

function startAs(kind) {
  player = new Player(scene, kind, kind === 'xbot' ? 'Alex' : 'Maya');
  player.enabled = true;
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

function interact() {
  if (!player) return;
  if (hud.escortOpen()) return;
  if (nearest?.hotspot === 'menu') { hud.showMenu(); return; }
  if (nearest?.npc) {
    nearest.npc.talk(player);
    if (!nearest.npc.talkAt) player.yaw = Math.atan2(nearest.npc.x - player.x, nearest.npc.z - player.z);
  }
}

function talkFromPanel(npc) {
  // walk the player next to the NPC and say hello
  hud.fade(() => {
    const a = Math.random() * Math.PI * 2;
    let x = npc.x + Math.sin(npc.ch.root.rotation.y) * 1.6, z = npc.z + Math.cos(npc.ch.root.rotation.y) * 1.6;
    if (npc.ch.kind === 'robot' || npc.zone === 'pool') { x = npc.x + Math.cos(a) * 1.8; z = npc.z + Math.sin(a) * 1.8; }
    player.teleport(x, z, Math.atan2(npc.x - x, npc.z - z));
    followCam.orbit = 0; followCam.update(0, player, true);
    npc.talk(player);
  });
}

addEventListener('keydown', (e) => {
  if (!started) return;
  const k = e.key.toLowerCase();
  if (k === 'e') interact();
  else if (k === 'c') toggleView();
  else if (k === 'n') toggleNight();
  else if (k === 'l') toggleLabels();
  else if (k === 'h') toggleHelp();
  else if (k === 'r') followCam.reset();
  else if (k === '+' || k === '=') followCam.zoom(0.88);
  else if (k === '-') followCam.zoom(1.12);
  else if (k === 'escape') { hud.closePanel(); hud.closeEscort(); }
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
document.getElementById('act').onclick = interact;
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
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _pm = new THREE.Matrix4();
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

  // NPC behaviour + animation (far characters animate at a lower rate)
  const ctx = { player: player || { x: 0, z: 60, yaw: 0 }, blockers: player ? [player] : [] };
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
    n._acc = (n._acc || 0) + dt;
    const every = !visible ? 12 : d2 > 70 * 70 ? 4 : d2 > 35 * 35 ? 2 : 1;
    if ((frame + i) % every === 0) { n.ch.update(n._acc); n._acc = 0; }
  }

  // doors open for the player and anyone walking nearby
  const actors = player ? [player, ...npcs.filter((n) => n.ch.speed > 0)] : npcs.filter((n) => n.ch.speed > 0);
  updateDoors(arch.doors, actors, dt);
  traffic.update(dt, t, player ? [player, ...npcs.filter((n) => n.pedestrian)] : npcs.filter((n) => n.pedestrian));

  if (started && player) {
    followCam.update(dt, player);
    env.update(dt, player.ch.root.position);
    // zone label
    const z = zoneAt(player.x, player.z);
    if (z !== lastZone) { lastZone = z; hud.setZone(z); }
    // nearest interactive thing in front of the player
    nearest = null; let best = 2.6;
    for (const n of npcs) {
      if (n.ch.root.position.y < -0.2) continue;
      const tp = n.talkPos();
      const d = Math.hypot(tp.x - player.x, tp.z - player.z);
      if (d < best) { best = d; nearest = { npc: n }; }
    }
    for (const h of furn.anchors.hotspots) { h.getWorldPosition(_v); const d = Math.hypot(_v.x - player.x, _v.z - player.z); if (d < Math.min(best, 2.2)) { best = d; nearest = { hotspot: h.userData.hotspot }; } }
    if (hud.escortOpen()) hud.prompt(null);
    else if (nearest?.hotspot === 'menu') hud.prompt('Read the Café Azure menu');
    else if (nearest?.npc) hud.prompt(nearest.npc instanceof Object && nearest.npc.state && ['TYPING', 'IDLE', 'GREETING'].includes(nearest.npc.state) ? `Ask ${nearest.npc.name} to escort you` : `Talk to ${nearest.npc.name} · ${nearest.npc.role}`);
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
window.azureBay = { scene, renderer, camera, get player() { return player; }, get npcs() { return npcsList(); }, travelTo: (id) => travelTo(CONFIG.zones.find((z) => z.id === id)), info: () => renderer.info.render,
  /** fast-forward the simulation (testing on slow machines): step(seconds) */
  step(seconds) { for (let s = 0; s < seconds; s += 0.05) simulate(0.05); },
  toggleNight };
