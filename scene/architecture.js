// scene/architecture.js — the structural shell: floors, walls, glass, roof, doors, pool.
//
//            NORTH (pool deck, beach, ocean)
//   x=-36 ┌────────┬──────────┬──────────────┐ x=36   z=-20
//         │kitchen │          │ 101 │102│103 │
//         ├──┐     │  LOBBY   ├─────┴───┴────┤ corridor z=0
//         │  café  │reception │ 104 │105│106 │
//         └────────┴───┬──┬───┴──────────────┘        z=20
//                 SOUTH (entrance plaza, street)
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { mat, getMat, signTexture } from './materials.js';
import { boxFromTo, box } from './helpers.js';
import { addBox } from '../systems/collision.js';

const H = CONFIG.building.height;
const T = 0.3; // wall thickness

/**
 * Wall along X (at z) or along Z (at x). openings: [from, to, bottom, top] along the wall.
 * matA faces +normal side, matB faces -normal side (two skins when they differ).
 */
function wall(group, axis, at, from, to, openings, matA, matB = matA, opts = {}) {
  const h = opts.height ?? H;
  const spans = [];
  let cur = from;
  const ops = [...openings].sort((a, b) => a[0] - b[0]);
  for (const o of ops) { if (o[0] > cur) spans.push([cur, o[0], 0, h, false]); cur = Math.max(cur, o[1]); }
  if (cur < to) spans.push([cur, to, 0, h, false]);
  for (const o of ops) {
    if (o[2] > 0.001) spans.push([o[0], o[1], 0, o[2], true]);      // sill
    if (o[3] < h - 0.001) spans.push([o[0], o[1], o[3], h, true]);  // lintel
    if (o[2] > 0.001 && opts.glass !== false) glassPane(group, axis, at, o);
  }
  for (const [a, b, y0, y1] of spans) {
    const skins = matA === matB ? [[-T / 2, T / 2, matA]] : [[0, T / 2, matA], [-T / 2, 0, matB]];
    for (const [o0, o1, m] of skins) {
      if (axis === 'x') boxFromTo(group, m, a, y0, at + o0, b, y1, at + o1);
      else boxFromTo(group, m, at + o0, y0, a, at + o1, y1, b);
    }
    // collider: full-height wall pieces and window columns block everything; lintels only block the camera
    const isDoorLintel = y0 > 0.01 && ops.some((o) => o[2] <= 0.001 && Math.abs(o[0] - a) < 1e-6);
    const y0c = isDoorLintel ? y0 : 0;
    if (axis === 'x') addBox(a, b, at - T / 2, at + T / 2, { minY: y0c, maxY: y1, cam: true });
    else addBox(at - T / 2, at + T / 2, a, b, { minY: y0c, maxY: y1, cam: true });
  }
}

function glassPane(group, axis, at, [a, b, y0, y1]) {
  const g = getMat('glass'), f = getMat('frame');
  if (axis === 'x') {
    boxFromTo(group, g, a, y0, at - 0.03, b, y1, at + 0.03, { cast: false });
    boxFromTo(group, f, a, y0 - 0.05, at - 0.18, b, y0, at + 0.18);
    for (let x = a; x <= b + 1e-6; x += Math.max(1.2, (b - a) / Math.round((b - a) / 1.6))) boxFromTo(group, f, x - 0.04, y0, at - 0.06, x + 0.04, y1, at + 0.06);
  } else {
    boxFromTo(group, g, at - 0.03, y0, a, at + 0.03, y1, b, { cast: false });
    boxFromTo(group, f, at - 0.18, y0 - 0.05, a, at + 0.18, y0, b);
    for (let z = a; z <= b + 1e-6; z += Math.max(1.2, (b - a) / Math.round((b - a) / 1.6))) boxFromTo(group, f, at - 0.06, y0, z - 0.04, at + 0.06, y1, z + 0.04);
  }
}

export function buildArchitecture(scene, profile) {
  const group = new THREE.Group(); group.name = 'architecture';
  const dynamic = new THREE.Group(); dynamic.name = 'architecture-dynamic';
  scene.add(group, dynamic);

  const M = (k) => getMat(k);
  // ---------- floors ----------
  boxFromTo(group, M('marble'), -10, -0.1, -20, 10, 0, 20, { cast: false });
  boxFromTo(group, M('wood'), -28, -0.1, -20, -10, 0, 20, { cast: false });
  boxFromTo(group, M('wood'), -36, -0.1, -4, -28, 0, 20, { cast: false });
  boxFromTo(group, M('kitchenFloor'), -36, -0.1, -20, -28, 0, -4, { cast: false });
  boxFromTo(group, M('carpet'), 10, -0.1, -2, 36, 0, 2, { cast: false });
  boxFromTo(group, M('roomCarpet'), 10, -0.1, -20, 36, 0, -2, { cast: false });
  boxFromTo(group, M('roomCarpet'), 10, -0.1, 2, 36, 0, 20, { cast: false });
  boxFromTo(group, M('carpet'), -4.5, 0, 5, 4.5, 0.015, 15, { cast: false }); // lobby rug

  // ---------- ceiling / roof (roof does not cast shadows → interiors stay sunlit) ----------
  boxFromTo(group, M('wallWhite'), -36.3, H, -20.3, 36.3, H + 0.35, 20.3, { cast: false });
  boxFromTo(group, M('exterior'), -36.4, H + 0.35, -20.4, 36.4, H + 0.9, -20.1);
  boxFromTo(group, M('exterior'), -36.4, H + 0.35, 20.1, 36.4, H + 0.9, 20.4);
  boxFromTo(group, M('exterior'), -36.4, H + 0.35, -20.4, -36.1, H + 0.9, 20.4);
  boxFromTo(group, M('exterior'), 36.1, H + 0.35, -20.4, 36.4, H + 0.9, 20.4);
  // decorative wood cornice band
  boxFromTo(group, M('darkWood'), -36.45, H - 0.2, 20.15, 36.45, H + 0.35, 20.5);
  boxFromTo(group, M('darkWood'), -36.45, H - 0.2, -20.5, 36.45, H + 0.35, -20.15);

  // entrance canopy
  boxFromTo(group, M('darkWood'), -6.5, 4.15, 20.2, 6.5, 4.45, 25.5);
  boxFromTo(group, M('gold'), -6.5, 4.05, 25.4, 6.5, 4.15, 25.5);
  for (const x of [-6, 6]) box(group, M('stone'), x, 2.1, 25, 0.5, 4.2, 0.5);
  addBox(-6.25, -5.75, 24.75, 25.25); addBox(5.75, 6.25, 24.75, 25.25);

  const EXT = M('exterior');
  // ---------- exterior walls ----------
  const roomWin = (y0 = 0.9, y1 = 3.6) => [[12.3, 16.3, y0, y1], [21, 25, y0, y1], [29.7, 33.7, y0, y1]];
  // south (z = 20): +z side is outside
  wall(group, 'x', 20, -36, -10, [[-33, -27, 0.8, 3.8], [-25, -19, 0.8, 3.8], [-17, -12, 0.8, 3.8]], EXT, M('wallCafe'));
  wall(group, 'x', 20, -10, 10, [[-8.5, -3, 0.25, 4.3], [-2.4, 2.4, 0, 3.4], [3, 8.5, 0.25, 4.3]], EXT, M('wallWarm'));
  wall(group, 'x', 20, 10, 36, roomWin(), EXT, M('wallRoom'));
  // north (z = -20): -z side is outside
  wall(group, 'x', -20, -36, -28, [[-35, -30, 1.2, 3]], M('wallWhite'), EXT);
  wall(group, 'x', -20, -28, -10, [[-26, -20, 0.8, 3.8], [-18, -12, 0.8, 3.8]], M('wallCafe'), EXT);
  wall(group, 'x', -20, -10, 10, [[-8.5, -5.5, 0, 3.2], [-4, 4, 0.25, 4.3], [5.5, 8.5, 0, 3.2]], M('wallWarm'), EXT);
  wall(group, 'x', -20, 10, 36, roomWin(), M('wallRoom'), EXT);
  // west (x = -36): -x outside
  wall(group, 'z', -36, -20, -4, [], M('wallWhite'), EXT);
  wall(group, 'z', -36, -4, 20, [[4, 10, 0.8, 3.8], [12, 18, 0.8, 3.8]], M('wallCafe'), EXT);
  // east (x = 36): +x outside
  wall(group, 'z', 36, -20, -2, [[-15, -7, 0.9, 3.6]], EXT, M('wallRoom'));
  wall(group, 'z', 36, -2, 2, [[-1.5, 1.5, 0.9, 3.6]], EXT, M('wallTeal'));
  wall(group, 'z', 36, 2, 20, [[7, 15, 0.9, 3.6]], EXT, M('wallRoom'));

  // ---------- interior walls ----------
  wall(group, 'z', -10, -20, 20, [[-3, 3, 0, 3.8]], M('wallWarm'), M('wallCafe'));         // lobby | café
  wall(group, 'z', 10, -20, 20, [[-2, 2, 0, 3.4]], M('wallRoom'), M('wallWarm'));          // lobby | rooms
  wall(group, 'z', -28, -20, -4, [[-7, -5.2, 0, 2.6], [-17, -9, 1.05, 2.3]], M('wallCafe'), M('wallWhite'), { glass: false }); // kitchen | café
  wall(group, 'x', -4, -36, -28, [], M('wallCafe'), M('wallWhite'));
  // pass-window counter
  boxFromTo(group, M('steel'), -28.6, 1.0, -17, -27.4, 1.1, -9);
  const doorsX = [14.33, 23, 31.67];
  const corridorDoors = doorsX.map((x) => [x - 0.6, x + 0.6, 0, 2.5]);
  wall(group, 'x', -2, 10, 36, corridorDoors, M('wallTeal'), M('wallRoom'));
  wall(group, 'x', 2, 10, 36, corridorDoors, M('wallRoom'), M('wallTeal'));
  for (const x of [18.67, 27.33]) {
    wall(group, 'z', x, -20, -2, [], M('wallRoom'));
    wall(group, 'z', x, 2, 20, [], M('wallRoom'));
  }
  // skirting boards in the lobby
  boxFromTo(group, M('darkWood'), -9.85, 0, -19.85, -9.75, 0.15, 19.85, { cast: false });
  boxFromTo(group, M('darkWood'), 9.75, 0, -19.85, 9.85, 0.15, 19.85, { cast: false });

  // lobby columns
  for (const [x, z] of [[-6, -14], [6, -14], [-6, 2], [6, 2], [-6, 16], [6, 16]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, H, 20), M('wallWhite'));
    c.position.set(x, H / 2, z); c.castShadow = c.receiveShadow = true; group.add(c);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.42, 0.25, 20), M('gold'));
    cap.position.set(x, H - 0.12, z); group.add(cap);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.2, 20), M('gold'));
    base.position.set(x, 0.1, z); group.add(base);
    addBox(x - 0.4, x + 0.4, z - 0.4, z + 0.4, { cam: true });
  }

  // ---------- signs ----------
  const signs = [
    ['AZURE BAY', 'RESTAURANT · RESORT · POOL', 0, 5.35, 25.3, 0, 7.6, 1.9, 'rgba(0,0,0,0)', '#f3e3c0'],
    ['Reception', 'Lobby · Exit · Pool', -10.2, 4.25, 0, -Math.PI / 2, 4, 1, '#173238', '#f3e3c0'],
    ['Café Azure', 'Restaurant & Buffet', -9.8, 4.25, 0, Math.PI / 2, 4, 1, '#173238', '#f3e3c0'],
    ['Rooms 101–106', 'Guest corridor', 9.8, 4.0, 0, -Math.PI / 2, 4, 1, '#173238', '#f3e3c0'],
    ['Pool Deck', 'Infinity pool · Bar · Beach', -7, 3.75, -19.8, 0, 3.4, 0.85, '#173238', '#f3e3c0'],
    ['Pool Deck', 'Infinity pool · Bar · Beach', 7, 3.75, -19.8, 0, 3.4, 0.85, '#173238', '#f3e3c0'],
    ['Kitchen', 'Staff only', -27.8, 3.0, -6.1, Math.PI / 2, 2.2, 0.55, '#3b4447', '#ffffff'],
  ];
  for (const [t, sub, x, y, z, ry, w, h, bg, fg] of signs) {
    const tex = signTexture(t, { sub, bg, fg, font: '600 128px Marcellus, Georgia, serif', subFont: '600 40px Manrope, sans-serif' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: bg === 'rgba(0,0,0,0)', roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
    s.position.set(x, y, z); s.rotation.y = ry; s.userData.dynamic = true; s.userData.signMat = s.material;
    dynamic.add(s);
  }
  // room number plaques
  doorsX.forEach((x, i) => {
    for (const [z, ry, n] of [[-1.84, 0, 101 + i], [1.84, Math.PI, 104 + i]]) {
      const tex = signTexture(String(n), { w: 256, h: 128, bg: '#c9a86a', fg: '#1d2a2e', font: '700 84px Marcellus, Georgia, serif' });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0.3 }));
      p.position.set(x + 0.95, 1.6, z); p.rotation.y = ry; p.userData.dynamic = true; dynamic.add(p);
    }
  });

  // ---------- doors ----------
  const doors = [];
  // automatic sliding glass doors: entrance + 2 pool doors
  const slider = (cx, z, w) => {
    const panels = [];
    for (const side of [-1, 1]) {
      const p = new THREE.Group();
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 0.04, 3.1, 0.06), M('glass'));
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.2, 0.1), M('frame'));
      edge.position.x = -side * (w / 4 - 0.04);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, 0.14), M('gold'));
      bar.position.set(-side * (w / 4 - 0.18), 1.1 - 1.6, 0);
      p.add(glass, edge, bar);
      glass.position.y = edge.position.y = 0;
      p.position.set(cx + side * w / 4, 1.6, z);
      p.userData = { dynamic: true, closedX: cx + side * w / 4, openX: cx + side * (w / 2 + w / 4 - 0.1) };
      dynamic.add(p); panels.push(p);
    }
    doors.push({ type: 'slide', panels, x: cx, z, open: 0, range: 4.2 });
  };
  slider(0, 20, 4.8);
  slider(-7, -20, 3);
  slider(7, -20, 3);

  // swing doors: hotel rooms + kitchen
  const swing = (hx, hz, w, closedRot, openDir, axis) => {
    const pivot = new THREE.Group();
    pivot.position.set(hx, 0, hz);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, 2.45, 0.06), M('darkWood'));
    leaf.position.set(w / 2, 1.225, 0); leaf.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), M('gold'));
    knob.position.set(w - 0.12, 1.05, 0.06);
    const knob2 = knob.clone(); knob2.position.z = -0.06;
    pivot.add(leaf, knob, knob2);
    pivot.rotation.y = closedRot;
    pivot.userData.dynamic = true;
    dynamic.add(pivot);
    const cx = axis === 'x' ? hx + Math.cos(closedRot) * w / 2 : hx;
    const cz = axis === 'x' ? hz : hz - Math.sin(closedRot) * w / 2;
    doors.push({ type: 'swing', pivot, closedRot, openRot: closedRot + openDir * Math.PI * 0.55, x: cx, z: cz, open: 0, range: 2.1 });
  };
  doorsX.forEach((x) => {
    swing(x - 0.6, -2, 1.2, 0, 1, 'x');            // north rooms, open inward (−z)
    swing(x - 0.6, 2, 1.2, 0, -1, 'x');            // south rooms, open inward (+z)
  });
  swing(-28, -5.2, 1.8, Math.PI / 2, -1, 'z');      // kitchen

  // ---------- pool ----------
  const pool = { minX: -14, maxX: 14, minZ: -46, maxZ: -30, waterY: -0.25 };
  const PT = M('poolTile');
  boxFromTo(group, PT, pool.minX, -1.75, pool.minZ, pool.maxX, -1.6, pool.maxZ, { cast: false });
  boxFromTo(group, PT, pool.minX - 0.3, -1.75, pool.minZ - 0.3, pool.maxX + 0.3, 0, pool.minZ, { cast: false });
  boxFromTo(group, PT, pool.minX - 0.3, -1.75, pool.maxZ, pool.maxX + 0.3, 0, pool.maxZ + 0.3, { cast: false });
  boxFromTo(group, PT, pool.minX - 0.3, -1.75, pool.minZ, pool.minX, 0, pool.maxZ, { cast: false });
  boxFromTo(group, PT, pool.maxX, -1.75, pool.minZ, pool.maxX + 0.3, 0, pool.maxZ, { cast: false });
  // coping stones
  const cop = M('stone');
  boxFromTo(group, cop, pool.minX - 0.6, 0, pool.minZ - 0.6, pool.maxX + 0.6, 0.06, pool.minZ, { cast: false });
  boxFromTo(group, cop, pool.minX - 0.6, 0, pool.maxZ, pool.maxX + 0.6, 0.06, pool.maxZ + 0.6, { cast: false });
  boxFromTo(group, cop, pool.minX - 0.6, 0, pool.minZ, pool.minX, 0.06, pool.maxZ, { cast: false });
  boxFromTo(group, cop, pool.maxX, 0, pool.minZ, pool.maxX + 0.6, 0.06, pool.maxZ, { cast: false });
  // lane ropes
  for (const z of [-34, -38, -42]) {
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 28, 6), M('fabricCoral'));
    rope.rotation.z = Math.PI / 2; rope.position.set(0, pool.waterY + 0.02, z); group.add(rope);
  }
  // steps
  for (let i = 0; i < 4; i++) boxFromTo(group, M('poolTile'), 10.5, -1.6, -30 - (i + 1) * 0.4, 13.9, -0.37 - i * 0.32, -30, { cast: false });
  // ladder
  for (const x of [-12.4, -11.6]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 6, 16, Math.PI), M('steel'));
    r.position.set(x, 0.05, -30.05); r.rotation.y = Math.PI / 2; group.add(r);
  }
  addBox(pool.minX, pool.maxX, pool.minZ, pool.maxZ, { maxY: 0.5 });

  const water = makeWater(pool);
  water.position.set((pool.minX + pool.maxX) / 2, pool.waterY, (pool.minZ + pool.maxZ) / 2);
  dynamic.add(water);

  // deck around the pool (building edge → beach)
  const D = M('deck');
  boxFromTo(group, D, -40, -0.25, -62, 40, 0, pool.minZ - 0.6, { cast: false });
  boxFromTo(group, D, -40, -0.25, pool.maxZ + 0.6, 40, 0, -20.4, { cast: false });
  boxFromTo(group, D, -40, -0.25, pool.minZ - 0.6, pool.minX - 0.6, 0, pool.maxZ + 0.6, { cast: false });
  boxFromTo(group, D, pool.maxX + 0.6, -0.25, pool.minZ - 0.6, 40, 0, pool.maxZ + 0.6, { cast: false });

  return { group, dynamic, doors, water, pool };
}

/** Pool water: animated caustics + fresnel — a tiny custom shader, no textures. */
function makeWater(pool) {
  const w = pool.maxX - pool.minX, d = pool.maxZ - pool.minZ;
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: `varying vec3 vW; varying vec2 vUv;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform float uNight; varying vec3 vW; varying vec2 vUv;
      float c(vec2 p){ float t=uTime*0.8; return sin(p.x*2.1+t)+sin(p.y*2.6-t*1.3)+sin((p.x+p.y)*1.7+t*0.6)+sin(length(p*1.3)*2.0-t); }
      void main(){
        vec2 p = vW.xz;
        float k = c(p) * 0.25;
        float caust = pow(1.0 - abs(sin(k*3.14159)), 6.0);
        vec3 deep = mix(vec3(0.05,0.55,0.72), vec3(0.02,0.18,0.35), uNight);
        vec3 shallow = mix(vec3(0.45,0.88,0.95), vec3(0.15,0.75,0.95), uNight);
        vec3 col = mix(deep, shallow, 0.35 + 0.25*sin(k*2.0));
        col += caust * mix(0.35, 0.55, uNight);
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(v.y, 0.0), 3.0);
        col = mix(col, vec3(0.8,0.92,1.0) * (1.0 - uNight*0.7), fres*0.6);
        float edge = smoothstep(0.0, 0.02, vUv.x) * smoothstep(0.0, 0.02, vUv.y) * smoothstep(0.0, 0.02, 1.0-vUv.x) * smoothstep(0.0, 0.02, 1.0-vUv.y);
        gl_FragColor = vec4(col, mix(0.95, 0.72, edge));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 1, 1), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData.dynamic = true;
  mesh.renderOrder = 2;
  return mesh;
}

/** Open doors when the player or any NPC is near. */
export function updateDoors(doors, actors, dt) {
  for (const d of doors) {
    let near = false;
    for (const a of actors) {
      const dx = a.x - d.x, dz = a.z - d.z;
      if (dx * dx + dz * dz < d.range * d.range) { near = true; break; }
    }
    d.open += ((near ? 1 : 0) - d.open) * Math.min(1, dt * 4);
    if (d.type === 'slide') for (const p of d.panels) p.position.x = THREE.MathUtils.lerp(p.userData.closedX, p.userData.openX, d.open);
    else d.pivot.rotation.y = THREE.MathUtils.lerp(d.closedRot, d.openRot, d.open);
  }
}
