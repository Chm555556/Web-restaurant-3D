// scene/park.js — Azure Gardens: a small park on the west lawn, next to the entrance plaza.
//
// Everything here is built in code, and all the movement runs on the GPU (one shared
// wind clock), so the park costs about twenty draw calls and almost no CPU:
//   • a meadow of wind-blown grass that rolls in gusts and parts around people walking
//     through it;
//   • cherry blossom trees (procedural branches, blossom clusters) shedding petals that
//     flutter down and settle on a carpet of fallen petals;
//   • bluebell beds that glow at night, with fireflies over them;
//   • a voxel garden: raised beds of cube grass and cube flowers, cube topiary and blocky
//     clouds drifting over the park;
//   • a big shade tree with a rope swing;
//   • the Vortex, a sculpture of light: a funnel of spinning particle strands, comets and
//     a pulse that climbs it, over a fountain basin;
//   • paved paths, a central circle, ten benches you can sit on, and lanterns that light
//     up at dusk.
import * as THREE from 'three';
import { getMat, signTexture } from './materials.js';
import { boxFromTo, instanced, trs, compose } from './helpers.js';
import { addBox } from '../systems/collision.js';
import { wind } from './environment.js';

/** The park's ground: x from -80 to -42 (west of the resort), z from -19 to 33.5. */
export const PARK = { x0: -80, x1: -42, z0: -19, z1: 33.5 };
const CENTER = { x: -60, z: 7 };          // the circle with the Vortex
const MAX_PUSH = 8;                        // people the grass can part around at once

let seed = 20251126;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + (b - a) * rnd();

// ------------------------------------------------------------------ shared wind
/**
 * Sway for instanced foliage, in world space (so every plant leans the same way in a
 * gust, however it is rotated), plus parting around people (uPush: x, z, radius).
 */
const pushU = { value: Array.from({ length: MAX_PUSH }, () => new THREE.Vector3()) };
function sway(material, { strength = 0.25, height = 1, part = false, key = '' } = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    sh.uniforms.uTime = wind.uniforms.uTime;
    if (part) sh.uniforms.uPush = pushU;
    sh.vertexShader = `uniform float uTime;\n${part ? `uniform vec3 uPush[${MAX_PUSH}];\n` : ''}` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 ip = vec3(0.0); mat3 R = mat3(1.0); float sc = 1.0;
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz; R = mat3(instanceMatrix); sc = length(instanceMatrix[0].xyz);
        #endif
        float hgt = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);
        // rolling gusts sweep across the park, with a quicker flutter on top
        float gust = 0.5 + 0.5 * sin(dot(ip.xz, vec2(0.23, 0.11)) - uTime * 1.6);
        float w = gust * gust * 1.1 + sin(uTime * 2.4 + ip.x * 0.9 + ip.z * 0.7) * 0.25;
        vec3 disp = vec3(0.85, 0.0, 0.4) * w * ${strength.toFixed(3)} * hgt * hgt * sc;
        ${part ? `for (int i = 0; i < ${MAX_PUSH}; i++) {
          vec2 d = ip.xz - uPush[i].xy; float L = length(d);
          float f = (1.0 - smoothstep(0.0, max(uPush[i].z, 0.001), L)) * step(0.001, uPush[i].z);
          disp.xz += d / max(L, 0.05) * f * 0.5 * hgt * sc;
          disp.y -= f * 0.45 * hgt * sc;
        }` : ''}
        transformed += transpose(R) * disp / (sc * sc);
      }`);
  };
  material.customProgramCacheKey = () => 'park-sway' + strength + height + part + key;
  return material;
}

function softDot(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.3, inner.replace(/[\d.]+\)$/, '0.6)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ layout
function curvePoints(pts, step = 0.5) {
  const c = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(c.getLength() / step));
  return { curve: c, pts: c.getSpacedPoints(n) };
}
const PATHS = [
  // from the plaza (through the hedge) to the circle
  { w: 2.4, pts: [[-40.6, 25.5], [-45, 25.2], [-49.5, 22.5], [-53.5, 17], [-56.5, 11.8]] },
  // from the street gate to the circle
  { w: 2.2, pts: [[-59, 33.6], [-59.2, 27], [-59.6, 19], [-60, 13]] },
  // the loop round the meadow
  { w: 1.8, loop: true, pts: [[-60, 22.5], [-51.5, 19], [-48.5, 9], [-49.5, -2], [-54.5, -8.5], [-60, -10], [-66, -8.5], [-70.5, -2], [-71.5, 8], [-69, 17], [-63.5, 22]] },
  // to the cherry grove and the shade tree
  { w: 1.6, pts: [[-60, 1], [-60, -10], [-60, -13.5]] },
  { w: 1.6, pts: [[-70.5, -2], [-73.5, -4.5]] },
  // to the voxel garden
  { w: 1.6, pts: [[-66, 9], [-71.5, 8], [-73, 14], [-73.1, 21], [-73.1, 31]] },
  // to the bluebell valley
  { w: 1.4, pts: [[-49.5, -2], [-46, -6.5]] },
];
const SAKURA = [[-64.2, -13.4, 1.0, 11], [-55.6, -14.6, 0.9, 23], [-60.4, -16.6, 0.78, 37]];
const BIG_TREE = { x: -75.2, z: -6.5 };
const BLUEBELL_BEDS = [[-46.2, -11, 3.2, 5.2], [-49.5, -16.2, 2.8, 1.8], [-45.4, 2.2, 2.2, 3.4], [-65.2, 15.6, 2.2, 1.6]];
const VOXEL_BEDS = [[-76, 23.4], [-70.2, 23.4], [-76, 29.2], [-70.2, 29.2]];
const BENCHES = [];   // filled in buildPark: { x, z, yaw }

// ------------------------------------------------------------------ build
export function buildPark(scene, profile, anchors) {
  const group = new THREE.Group(); group.name = 'park';           // static, merged by staticBatch
  const dyn = new THREE.Group(); dyn.name = 'park-dynamic';
  scene.add(group, dyn);
  const M = (k) => getMat(k);
  const q = profile.npcScale < 1 ? 0.4 : profile.shadowSize >= 2048 ? 1.4 : 1;   // detail level

  // ---------- hedges round the park (with gaps for the two entrances) ----------
  const hedge = M('leafDark');
  boxFromTo(group, hedge, -80.6, 0, -19.6, -80, 1.3, 33.5);
  boxFromTo(group, hedge, -80.6, 0, -19.6, -42, 1.3, -19);
  boxFromTo(group, hedge, -80.6, 0, 33, -61.2, 0.9, 33.6);
  boxFromTo(group, hedge, -56.8, 0, 33, -42, 0.9, 33.6);
  addBox(-80.6, -80, -19.6, 33.5); addBox(-80.6, -42, -19.6, -19);
  addBox(-80.6, -61.2, 33, 33.6, { maxY: 0.9 }); addBox(-56.8, -42, 33, 33.6, { maxY: 0.9 });

  // ---------- paths and the central circle ----------
  const pathSamples = [];
  const pathMat = M('paving');
  for (const P of PATHS) {
    const pts = P.loop ? [...P.pts, P.pts[0]] : P.pts;
    const { pts: sp } = curvePoints(pts, 0.35);
    for (const v of sp) pathSamples.push([v.x, v.z, P.w / 2]);
    group.add(ribbon(sp, P.w, pathMat));
  }
  const circle = new THREE.Mesh(new THREE.CircleGeometry(6.4, 48).rotateX(-Math.PI / 2), pathMat);
  worldUV(circle.geometry); circle.position.set(CENTER.x, 0.022, CENTER.z); circle.receiveShadow = true; group.add(circle);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.4, 0.09, 6, 64).rotateX(Math.PI / 2), M('stone'));
  rim.position.set(CENTER.x, 0.03, CENTER.z); group.add(rim);

  // ---------- the Vortex sculpture over a fountain basin ----------
  const basin = compose([
    [new THREE.CylinderGeometry(2.3, 2.45, 0.5, 40, 1, true), trs(0, 0.25, 0)],
    [new THREE.TorusGeometry(2.36, 0.12, 8, 48).rotateX(Math.PI / 2), trs(0, 0.5, 0)],
    [new THREE.CylinderGeometry(0.42, 0.55, 0.95, 20), trs(0, 0.47, 0)],
  ]);
  const basinM = new THREE.Mesh(basin, M('stone')); basinM.position.set(CENTER.x, 0, CENTER.z); basinM.castShadow = true; basinM.receiveShadow = true; group.add(basinM);
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3f8fa8, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.88 }));
  water.position.set(CENTER.x, 0.42, CENTER.z); group.add(water);
  const brass = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 32).rotateX(Math.PI / 2), M('gold'));
  brass.position.set(CENTER.x, 0.95, CENTER.z); group.add(brass);
  addBox(CENTER.x - 2.5, CENTER.x + 2.5, CENTER.z - 2.5, CENTER.z + 2.5, { maxY: 0.6 });
  const vortex = makeVortex(q);
  vortex.position.set(CENTER.x, 0, CENTER.z); dyn.add(vortex);

  // ---------- benches: round the circle, under the cherry trees, by the bluebells ----------
  BENCHES.length = 0;
  // round the circle, clear of the four paths that come into it (at 54°, 90°, 162°, 270°)
  for (const deg of [20, 125, 200, 235, 305, 340]) {
    const a = deg * Math.PI / 180;
    const x = CENTER.x + Math.cos(a) * 5.3, z = CENTER.z + Math.sin(a) * 5.3;
    BENCHES.push({ x, z, yaw: Math.atan2(CENTER.x - x, CENTER.z - z) });
  }
  BENCHES.push({ x: -66.3, z: -11, yaw: Math.atan2(-60.8 + 66.3, -14.6 + 11) });   // under the cherries
  BENCHES.push({ x: -57.2, z: -11.6, yaw: Math.atan2(-60.8 + 57.2, -14.6 + 11.6) });
  BENCHES.push({ x: -51.2, z: -11.2, yaw: Math.PI / 2 });                            // by the bluebells
  BENCHES.push({ x: -72.6, z: -9.6, yaw: Math.atan2(BIG_TREE.x - -72.6, BIG_TREE.z + 9.6) + Math.PI });   // in the shade
  const BoxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const benchWood = compose([[BoxG(1.8, 0.07, 0.5), trs(0, 0.45, 0.02)], [BoxG(1.8, 0.36, 0.05), trs(0, 0.72, -0.24, 0, 1, -0.12)]]);
  const benchIron = compose([[BoxG(0.07, 0.45, 0.5), trs(-0.82, 0.22, 0)], [BoxG(0.07, 0.45, 0.5), trs(0.82, 0.22, 0)], [BoxG(0.06, 0.45, 0.06), trs(-0.82, 0.68, -0.24)], [BoxG(0.06, 0.45, 0.06), trs(0.82, 0.68, -0.24)]]);
  instanced(group, [{ geometry: benchWood, material: M('lightWood') }, { geometry: benchIron, material: M('darkSteel') }], BENCHES.map((b) => trs(b.x, 0, b.z, b.yaw)));
  const seats = [];
  for (const b of BENCHES) {
    const c = Math.abs(Math.cos(b.yaw)), s = Math.abs(Math.sin(b.yaw));
    const hw = (1.9 * c + 0.6 * s) / 2, hd = (1.9 * s + 0.6 * c) / 2;
    addBox(b.x - hw, b.x + hw, b.z - hd, b.z + hd, { maxY: 0.8 });
    for (const dx of [-0.45, 0.45]) {
      const seat = { x: b.x + dx * Math.cos(b.yaw) + Math.sin(b.yaw) * 0.05, z: b.z - dx * Math.sin(b.yaw) + Math.cos(b.yaw) * 0.05, yaw: b.yaw, seatY: 0.48 };
      seats.push(seat); anchors.benchSeats.push(seat);
    }
  }

  // ---------- cherry blossom trees, falling petals, petal carpets ----------
  const bark = new THREE.MeshStandardMaterial({ color: 0x4e3328, roughness: 0.95 });
  const trunks = [], blooms = [];
  for (const [x, z, s, sd] of SAKURA) {
    const t = sakura(sd, s);
    trunks.push([t.wood, trs(x, 0, z, sd)]);
    for (const b of t.blooms) { const p = b.p.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), sd).add(new THREE.Vector3(x, 0, z)); blooms.push({ p, r: b.r }); }
    addBox(x - 0.3, x + 0.3, z - 0.3, z + 0.3);
  }
  const trunkMesh = new THREE.Mesh(compose(trunks), bark); trunkMesh.castShadow = true; group.add(trunkMesh);
  const PINKS = [0xf7c6d9, 0xf4a7c4, 0xfbd9e6, 0xee9bbb, 0xffe4ee, 0xf9b8cf];
  const bloomMat = sway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, flatShading: true }), { strength: 0.06, height: 6, key: 'bloom' });
  const bloomIM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), bloomMat, blooms.length);
  blooms.forEach((b, i) => { bloomIM.setMatrixAt(i, trs(b.p.x, b.p.y, b.p.z, rnd() * 6, [b.r, b.r * 0.82, b.r])); bloomIM.setColorAt(i, new THREE.Color(PINKS[i % PINKS.length])); });
  bloomIM.castShadow = true; bloomIM.computeBoundingSphere(); dyn.add(bloomIM);
  // fallen petals on the ground
  const carpetTex = petalCarpet();
  const carpetMat = new THREE.MeshStandardMaterial({ map: carpetTex, transparent: true, depthWrite: false, roughness: 1 });
  for (const [x, z, s] of SAKURA) {
    const c = new THREE.Mesh(new THREE.CircleGeometry(3.6 * s, 32).rotateX(-Math.PI / 2), carpetMat);
    c.position.set(x + 0.8, 0.014, z + 0.3); c.receiveShadow = true; c.renderOrder = 1; dyn.add(c);
  }
  const petalsMesh = fallingPetals(Math.round(150 * q));
  dyn.add(petalsMesh);

  // ---------- the big shade tree with a swing ----------
  const big = shadeTree();
  big.position.set(BIG_TREE.x, 0, BIG_TREE.z); dyn.add(big.group);
  addBox(BIG_TREE.x - 0.5, BIG_TREE.x + 0.5, BIG_TREE.z - 0.5, BIG_TREE.z + 0.5);

  // ---------- bluebell beds that glow at night ----------
  const soil = new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1 });
  for (const [x, z, a, b] of BLUEBELL_BEDS) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), soil);
    g.scale.set(a + 0.3, 1, b + 0.3); g.position.set(x, 0.012, z); g.receiveShadow = true; group.add(g);
  }
  const bells = bluebells(Math.round(1300 * q));
  for (const m of bells.meshes) dyn.add(m);

  // ---------- voxel garden ----------
  const vox = voxelGarden();
  dyn.add(vox.mesh);
  for (const [x, z] of VOXEL_BEDS) addBox(x - 2.1, x + 2.1, z - 1.6, z + 1.6, { maxY: 0.55 });
  for (const [x, z] of [[-78.6, 31.6], [-78.6, 17.5]]) addBox(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
  const clouds = voxelClouds();
  dyn.add(clouds.mesh);

  // ---------- meadow grass, rolling in the wind ----------
  // path samples bucketed in 2 m cells, so placing thousands of grass clumps stays quick
  const cell = new Map(), key = (i, j) => i * 1000 + j;
  for (const s of pathSamples) {
    const i = Math.floor(s[0] / 2), j = Math.floor(s[1] / 2);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const k = key(i + di, j + dj); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(s);
    }
  }
  const nearPath = (x, z) => (cell.get(key(Math.floor(x / 2), Math.floor(z / 2))) || []).some(([px, pz, h]) => Math.hypot(px - x, pz - z) < h + 0.25);
  const blocked = (x, z) => {
    if (x < PARK.x0 + 0.8 || x > PARK.x1 + 0.6 || z < PARK.z0 + 0.8 || z > PARK.z1 - 0.8) return true;
    if (Math.hypot(x - CENTER.x, z - CENTER.z) < 6.9) return true;
    if (nearPath(x, z)) return true;
    for (const b of BENCHES) if (Math.hypot(b.x - x, b.z - z) < 1.3) return true;
    for (const [bx, bz, a, b] of BLUEBELL_BEDS) if (((x - bx) / (a + 0.4)) ** 2 + ((z - bz) / (b + 0.4)) ** 2 < 1) return true;
    for (const [bx, bz] of VOXEL_BEDS) if (Math.abs(x - bx) < 2.4 && Math.abs(z - bz) < 1.9) return true;
    for (const [sx, sz] of SAKURA) if (Math.hypot(sx - x, sz - z) < 0.7) return true;
    if (Math.hypot(BIG_TREE.x - x, BIG_TREE.z - z) < 0.9) return true;
    return false;
  };
  const grass = meadowGrass(Math.round(13000 * q), blocked);
  dyn.add(grass);

  // ---------- lanterns along the paths ----------
  const lampSpots = [[-44.5, 27], [-50, 20.6], [-57.6, 29], [-61.6, 21.4], [-51.4, 8.2], [-50.8, -4.2], [-57.6, -9.4], [-67.6, -7.4], [-71.2, 2.6], [-70.4, 14.6], [-66.2, 3.4], [-54, 3.4], [-54.2, 11.6], [-66, 11.6]];
  const post = compose([[new THREE.CylinderGeometry(0.05, 0.07, 2.5, 8), trs(0, 1.25, 0)], [new THREE.CylinderGeometry(0.12, 0.14, 0.12, 8), trs(0, 0.06, 0)], [new THREE.ConeGeometry(0.2, 0.18, 6), trs(0, 2.86, 0)], [new THREE.BoxGeometry(0.26, 0.03, 0.26), trs(0, 2.5, 0)]]);
  const glow = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffc46b, emissiveIntensity: 0.25, roughness: 0.4 });
  const lampHead = new THREE.BoxGeometry(0.2, 0.26, 0.2); lampHead.translate(0, 2.65, 0);
  const lm = lampSpots.map(([x, z]) => trs(x, 0, z));
  instanced(group, [{ geometry: post, material: M('darkSteel') }], lm);
  instanced(dyn, [{ geometry: lampHead, material: glow }], lm, { cast: false });
  for (const [x, z] of lampSpots) addBox(x - 0.1, x + 0.1, z - 0.1, z + 0.1);
  const haloGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(lampSpots.flatMap(([x, z]) => [x, 2.66, z]), 3));
  const halo = new THREE.Points(haloGeo, new THREE.PointsMaterial({ map: softDot(64, 'rgba(255,214,150,1)'), size: 2.2, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.frustumCulled = false; dyn.add(halo);

  // ---------- fireflies over the bluebells and the meadow ----------
  const flies = fireflies(Math.round(150 * q));
  dyn.add(flies);

  // ---------- gateway arches with the park's name ----------
  arch(group, dyn, -41.6, 25.5, Math.PI / 2, 5.6, 'Azure Gardens', 'Cherry blossoms · Bluebells · The Vortex');
  arch(group, dyn, -59, 33.3, 0, 4.0, 'Azure Gardens', 'Park open sunrise to 10 pm');

  const heavy = [grass, ...bells.meshes, petalsMesh, vox.mesh];

  // anchors for the cast (park visitors and the gardener)
  anchors.park = {
    seats, circleSeats: seats.slice(0, 12), sakuraSeats: seats.slice(12, 16), bellSeats: seats.slice(16, 18), shadeSeats: seats.slice(18, 20),
    loop: [...PATHS[2].pts, PATHS[2].pts[0]],
    beds: BLUEBELL_BEDS.map(([x, z, a, b]) => [x, z + b + 0.7, x, z]),   // stand north of a bed, facing it
    voxel: VOXEL_BEDS.map(([x, z]) => [x + 2.5, z]),
  };

  return {
    group, dyn,
    /** people the grass parts around: [{x, z}] (the nearest few are used) */
    update(dt, t, people = []) {
      // far over on the east side of the resort the park can't be seen: skip its heavy parts
      const near = !people.length || people[0].x < 6;
      for (const m of heavy) m.visible = near;
      let k = 0;
      for (const p of people) {
        if (k >= MAX_PUSH) break;
        if (p.x < PARK.x0 - 1 || p.x > PARK.x1 + 1 || p.z < PARK.z0 - 1 || p.z > PARK.z1 + 1) continue;
        pushU.value[k++].set(p.x, p.z, 0.75);
      }
      for (; k < MAX_PUSH; k++) pushU.value[k].set(0, 0, 0);
      vortex.material.uniforms.uTime.value = t;
      flies.material.uniforms.uTime.value = t;
      clouds.update(dt);
      big.update(t);
    },
    setNight(n) {
      glow.emissiveIntensity = 0.25 + n * 2.6;
      halo.material.opacity = n * 0.85;
      bells.glow(n);
      flies.material.uniforms.uNight.value = n;
      vortex.material.uniforms.uNight.value = n;
    },
  };
}

// ------------------------------------------------------------------ pieces
function worldUV(geo) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return geo;
}

/** A flat strip along sampled points (a path), UVs in metres. */
function ribbon(pts, width, material) {
  const pos = [], uv = [], idx = [];
  let along = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
    if (i) along += pts[i].distanceTo(pts[i - 1]);
    for (const s of [-1, 1]) { pos.push(pts[i].x + nx * s * width / 2, 0.018, pts[i].z + nz * s * width / 2); uv.push((s + 1) / 2 * width, along); }
    if (i) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.receiveShadow = true;
  return m;
}

/** A clump of five grass blades (1 m tall before scaling), root dark, tip light, normals up. */
function grassClump() {
  const pos = [], col = [], nor = [], idx = [];
  const root = new THREE.Color(0x1f4a1c), tip = new THREE.Color(0x9cc45a);
  for (let b = 0; b < 5; b++) {
    const a = rnd() * Math.PI * 2, ox = Math.cos(a) * rr(0, 0.12), oz = Math.sin(a) * rr(0, 0.12);
    const yaw = rnd() * Math.PI, h = rr(0.6, 1), w = rr(0.035, 0.055), bend = rr(0.12, 0.3);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), base = pos.length / 3;
    for (let s = 0; s <= 4; s++) {
      const t = s / 4, ww = w * (1 - t) ** 0.8;
      const fwd = bend * t * t;
      for (const side of [-1, 1]) {
        const lx = side * ww, lz = fwd;
        pos.push(ox + lx * cy - lz * sy, t * h, oz + lx * sy + lz * cy);
        const c = root.clone().lerp(tip, t); col.push(c.r, c.g, c.b);
        nor.push(0, 1, 0);
      }
      if (s) { const k = base + (s - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function meadowGrass(count, blocked) {
  const geo = grassClump();
  const mat = sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), { strength: 0.32, height: 1, part: true, key: 'grass' });
  const im = new THREE.InstancedMesh(geo, mat, count);
  const tint = new THREE.Color();
  let n = 0;
  for (let tries = 0; n < count && tries < count * 6; tries++) {
    const x = rr(PARK.x0, PARK.x1), z = rr(PARK.z0, PARK.z1);
    if (blocked(x, z)) continue;
    im.setMatrixAt(n, trs(x, 0, z, rnd() * Math.PI * 2, rr(0.38, 0.72)));
    tint.setHSL(rr(0.22, 0.3), rr(0.35, 0.6), rr(0.42, 0.6)); tint.multiplyScalar(1.7);
    im.setColorAt(n, tint);
    n++;
  }
  im.count = n;
  im.receiveShadow = true; im.castShadow = false;
  im.computeBoundingSphere();
  return im;
}

/** A procedural cherry tree: branches as tapered cylinders, blossom points at the twigs. */
function sakura(sd, s) {
  seed = sd * 7919;
  const parts = [], blooms = [];
  const up = new THREE.Vector3(0, 1, 0);
  const grow = (start, dir, len, rad, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.68, rad, len, 7, 1);
    g.translate(0, len / 2, 0);
    const m = new THREE.Matrix4().compose(start, new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, 1, 1));
    parts.push([g, m]);
    const end = start.clone().addScaledVector(dir, len);
    if (depth >= 4 || len < 0.35) {
      for (let k = 0; k < 3; k++) blooms.push({ p: end.clone().add(new THREE.Vector3(rr(-0.45, 0.45), rr(-0.15, 0.35), rr(-0.45, 0.45))), r: rr(0.34, 0.62) * s });
      return;
    }
    if (depth >= 2) blooms.push({ p: end.clone().add(new THREE.Vector3(rr(-0.3, 0.3), rr(0, 0.3), rr(-0.3, 0.3))), r: rr(0.4, 0.7) * s });
    const kids = depth === 0 ? 3 : 2 + (rnd() < 0.45 ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const a = (k / kids) * Math.PI * 2 + rr(-0.5, 0.5) + depth;
      const spread = depth === 0 ? 0.85 : 0.65;
      const nd = dir.clone().add(new THREE.Vector3(Math.cos(a) * spread, rr(0.15, 0.55), Math.sin(a) * spread)).normalize();
      grow(end, nd, len * rr(0.62, 0.8), rad * 0.62, depth + 1);
    }
  };
  grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(rr(-0.08, 0.08), 1, rr(-0.08, 0.08)).normalize(), 2.1 * s, 0.24 * s, 0);
  return { wood: compose(parts), blooms };
}

function petalCarpet() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 900; i++) {
    const r = Math.sqrt(Math.random()) * 124, a = Math.random() * Math.PI * 2;
    const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    g.fillStyle = ['#f7c6d9', '#f4a7c4', '#fbd9e6', '#ee9bbb', '#ffffff'][i % 5];
    g.globalAlpha = 0.55 + 0.45 * (1 - r / 124);
    g.beginPath(); g.ellipse(x, y, 2.6, 1.6, Math.random() * Math.PI, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Petals falling from the cherry trees, animated entirely on the GPU: each petal starts
 * in a canopy, drifts with the wind and flutters down, lies on the grass a moment, then
 * starts again.
 */
function fallingPetals(count) {
  const shape = new THREE.Shape(); shape.ellipse(0, 0, 0.05, 0.032, 0, Math.PI * 2);
  const geo = new THREE.ShapeGeometry(shape, 5);
  const a = new Float32Array(count * 4), b = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const [x, z, s] = SAKURA[i % SAKURA.length];
    const r = Math.sqrt(rnd()) * 2.8 * s, ang = rnd() * Math.PI * 2;
    a.set([x + Math.cos(ang) * r, z + Math.sin(ang) * r, rr(2.6, 4.8) * s, rnd()], i * 4);
    b.set([rr(0.05, 0.1), rnd()], i * 2);
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(a, 4));
  geo.setAttribute('aSpd', new THREE.InstancedBufferAttribute(b, 2));
  const mat = new THREE.MeshStandardMaterial({ color: 0xf8bfd4, roughness: 0.7, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = wind.uniforms.uTime;
    sh.vertexShader = 'uniform float uTime; attribute vec4 aSeed; attribute vec2 aSpd;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      float life = fract(uTime * aSpd.x + aSeed.w);
      float fall = clamp(life / 0.8, 0.0, 1.0);
      float y = mix(aSeed.z, 0.025, fall);
      vec2 drift = vec2(1.4, 0.6) * fall * 2.0 + vec2(sin(uTime * 1.7 + aSeed.w * 40.0), cos(uTime * 1.3 + aSeed.x * 7.0)) * 0.35 * (1.0 - fall);
      float spin = (uTime * (1.5 + aSpd.y * 3.0) + aSpd.y * 20.0) * (1.0 - step(1.0, fall));
      vec3 transformed = position;
      float c1 = cos(spin), s1 = sin(spin), c2 = cos(spin * 0.6 + aSpd.y * 6.0), s2 = sin(spin * 0.6 + aSpd.y * 6.0);
      transformed = vec3(transformed.x, transformed.y * c1, transformed.y * s1);
      transformed = vec3(transformed.x * c2 - transformed.z * s2, transformed.y, transformed.x * s2 + transformed.z * c2);
      if (fall >= 1.0) transformed = vec3(position.x, 0.0, position.y);       // lying on the grass
      transformed *= 1.0 - smoothstep(0.93, 1.0, life);
      transformed += vec3(aSeed.x + drift.x, y, aSeed.y + drift.y);`);
  };
  mat.customProgramCacheKey = () => 'park-petals';
  const im = new THREE.InstancedMesh(geo, mat, count);
  im.frustumCulled = false; im.castShadow = false;
  return im;
}

/** Bluebell stalks: an arching stem with three nodding bells. Bells glow at night. */
function bluebells(count) {
  const stemParts = [], bellParts = [];
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.22, 0.01), new THREE.Vector3(0.03, 0.36, 0.05), new THREE.Vector3(0.07, 0.4, 0.11)]);
  stemParts.push([new THREE.TubeGeometry(curve, 6, 0.007, 4, false), null]);
  const leaf = new THREE.PlaneGeometry(0.03, 0.26, 1, 3); leaf.translate(0, 0.13, 0);
  stemParts.push([leaf.clone(), trs(0.02, 0, 0, 0.6, 1, 0, 0.25)]);
  stemParts.push([leaf.clone(), trs(-0.02, 0, 0, -0.4, 1, 0, -0.3)]);
  const bell = new THREE.LatheGeometry([new THREE.Vector2(0.004, 0.0), new THREE.Vector2(0.02, -0.008), new THREE.Vector2(0.026, -0.03), new THREE.Vector2(0.034, -0.045), new THREE.Vector2(0.04, -0.05)], 8);
  for (const [t, s] of [[0.55, 0.85], [0.78, 1], [1, 1.1]]) {
    const p = curve.getPoint(t);
    bellParts.push([bell.clone(), trs(p.x + 0.01, p.y - 0.01, p.z, 0, s, 0.35, -0.2)]);
  }
  const stemGeo = compose(stemParts), bellGeo = compose(bellParts);
  const stemMat = sway(new THREE.MeshStandardMaterial({ color: 0x4f7f3a, roughness: 0.9, side: THREE.DoubleSide }), { strength: 0.22, height: 0.4, key: 'bstem' });
  const bellMat = sway(new THREE.MeshStandardMaterial({ color: 0x6a7ae8, emissive: 0x4f78ff, emissiveIntensity: 0.06, roughness: 0.5, side: THREE.DoubleSide }), { strength: 0.22, height: 0.4, key: 'bbell' });
  const ms = [];
  const stems = new THREE.InstancedMesh(stemGeo, stemMat, count), heads = new THREE.InstancedMesh(bellGeo, bellMat, count);
  const shade = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const [x, z, a, b] = BLUEBELL_BEDS[i % BLUEBELL_BEDS.length];
    const r = Math.sqrt(rnd()), ang = rnd() * Math.PI * 2;
    const m = trs(x + Math.cos(ang) * r * a, 0, z + Math.sin(ang) * r * b, rnd() * Math.PI * 2, rr(0.9, 1.5));
    stems.setMatrixAt(i, m); heads.setMatrixAt(i, m);
    shade.setHSL(rr(0.62, 0.72), rr(0.55, 0.8), rr(0.55, 0.72)); heads.setColorAt(i, shade);
  }
  for (const m of [stems, heads]) { m.castShadow = false; m.receiveShadow = true; m.computeBoundingSphere(); ms.push(m); }
  return { meshes: ms, glow: (n) => { bellMat.emissiveIntensity = 0.06 + n * 1.6; } };
}

/** The voxel garden: raised beds of cube grass and cube flowers, and cube topiary. */
function voxelGarden() {
  const cubes = [];
  const add = (x, y, z, s, hex) => cubes.push({ m: trs(x, y, z, 0, s), c: new THREE.Color(hex) });
  const greens = [0x5b9e3c, 0x6eb247, 0x4e8d34, 0x7fbf52, 0x5fa543];
  const petals = [0xffd23f, 0xff6b9a, 0xffffff, 0xe94b3c, 0xb388ff, 0xff9f1c, 0x64c8ff];
  for (const [bx, bz] of VOXEL_BEDS) {
    // stone kerb
    for (let i = -8; i <= 8; i++) for (const s of [-1, 1]) { add(bx + i * 0.25, 0.15, bz + s * 1.5, 0.25, 0xcfc6b6); }
    for (let j = -5; j <= 5; j++) for (const s of [-1, 1]) { add(bx + s * 2.0, 0.15, bz + j * 0.25, 0.25, 0xcfc6b6); }
    // cube grass with flowers
    for (let i = -7; i <= 7; i++) for (let j = -5; j <= 5; j++) {
      const x = bx + i * 0.25, z = bz + j * 0.25;
      add(x, 0.25 + rr(-0.03, 0.03), z, 0.25, greens[Math.floor(rnd() * greens.length)]);
      if (rnd() < 0.36) {
        const h = 1 + Math.floor(rnd() * 3);
        for (let k = 0; k < h; k++) add(x, 0.42 + k * 0.1, z, 0.08, 0x3f7d2a);
        add(x, 0.42 + h * 0.1 + 0.04, z, 0.14, petals[Math.floor(rnd() * petals.length)]);
      }
    }
  }
  // cube topiary trees at the garden's corners
  for (const [tx, tz] of [[-78.6, 31.6], [-78.6, 17.5]]) {
    for (let k = 0; k < 6; k++) add(tx, 0.15 + k * 0.3, tz, 0.3, 0x6b4a2f);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (let k = 0; k < 4; k++) {
      if (Math.abs(i) + Math.abs(j) + Math.abs(k - 1.5) > 4.2) continue;
      add(tx + i * 0.38, 2.1 + k * 0.38, tz + j * 0.38, 0.38, greens[Math.floor(rnd() * greens.length)]);
    }
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.85 }), cubes.length);
  cubes.forEach((c, i) => { im.setMatrixAt(i, c.m); im.setColorAt(i, c.c); });
  im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
  return { mesh: im };
}

/** Blocky clouds drifting slowly over the park. */
function voxelClouds() {
  const boxes = [], clouds = [];
  for (let c = 0; c < 6; c++) {
    const cx = rr(-110, -10), cy = rr(24, 34), cz = rr(-30, 40), n = 6 + Math.floor(rnd() * 7);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push([rr(-4, 4), rr(0, 1.6), rr(-2.2, 2.2), rr(2.2, 4.2)]);
    clouds.push({ x: cx, y: cy, z: cz, parts, v: rr(0.5, 0.9) });
    for (const p of parts) boxes.push([c, p]);
  }
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 1, transparent: true, opacity: 0.92 }), boxes.length);
  im.castShadow = false; im.frustumCulled = false;
  const place = () => boxes.forEach(([c, p], i) => { const k = clouds[c]; im.setMatrixAt(i, trs(k.x + p[0], k.y + p[1], k.z + p[2], 0, [p[3], p[3] * 0.55, p[3] * 0.8])); });
  place();
  return {
    mesh: im,
    update(dt) {
      for (const k of clouds) { k.x += k.v * dt; if (k.x > 0) k.x = -120; }
      place(); im.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A broad shade tree with a rope swing that rocks gently. */
function shadeTree() {
  const group = new THREE.Group();
  seed = 4242;
  const bark = new THREE.MeshStandardMaterial({ color: 0x5c4030, roughness: 1 });
  const trunk = new THREE.Mesh(compose([
    [new THREE.CylinderGeometry(0.32, 0.5, 3.4, 10), trs(0, 1.7, 0)],
    [new THREE.CylinderGeometry(0.12, 0.2, 2.6, 8), trs(1.0, 3.6, 0, 0, 1, 0, -0.9)],
    [new THREE.CylinderGeometry(0.12, 0.2, 2.4, 8), trs(-0.9, 3.6, 0.3, 0, 1, 0.3, 0.8)],
    [new THREE.CylinderGeometry(0.1, 0.18, 2.2, 8), trs(0.1, 3.8, -0.9, 0, 1, -0.8, 0)],
  ]), bark);
  trunk.castShadow = true; group.add(trunk);
  const leafMat = sway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), { strength: 0.05, height: 7, key: 'shade' });
  const blobs = [];
  for (let i = 0; i < 16; i++) blobs.push([rr(-2.6, 2.6), rr(4.2, 6.2), rr(-2.4, 2.4), rr(1.1, 1.8)]);
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leafMat, blobs.length);
  blobs.forEach(([x, y, z, r], i) => { im.setMatrixAt(i, trs(x, y, z, rnd() * 6, [r, r * 0.8, r])); im.setColorAt(i, new THREE.Color([0x3f7d34, 0x4b8f3c, 0x356f2d, 0x5a9a44][i % 4])); });
  im.castShadow = true; im.computeBoundingSphere(); group.add(im);
  // the swing hangs from the east branch
  const pivot = new THREE.Group(); pivot.position.set(1.85, 4.25, 0); group.add(pivot);
  const rope = new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 1 });
  for (const z of [-0.28, 0.28]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.6, 5), rope); r.position.set(0, -1.8, z); pivot.add(r); }
  const seatB = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.7), getMat('lightWood')); seatB.position.set(0, -3.6, 0); seatB.castShadow = true; pivot.add(seatB);
  return { group, position: group.position, update(t) { pivot.rotation.z = Math.sin(t * 1.4) * 0.12; } };
}

/** The Vortex: a funnel of glowing particle strands, racing comets and a climbing pulse. */
function makeVortex(q) {
  const S = 14, per = Math.round(300 * Math.max(0.6, q)), comets = 56;
  const n = S * per + comets;
  const strand = new Float32Array(n), t0 = new Float32Array(n), kind = new Float32Array(n), jit = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const c = i >= S * per;
    strand[i] = c ? Math.floor(rnd() * S) : i % S; t0[i] = rnd(); kind[i] = c ? 1 : 0; jit[i] = rr(-0.05, 0.05);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aStrand', new THREE.BufferAttribute(strand, 1));
  g.setAttribute('aT', new THREE.BufferAttribute(t0, 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  g.setAttribute('aJit', new THREE.BufferAttribute(jit, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 360 } },
    vertexShader: /* glsl */`
      attribute float aStrand, aT, aKind, aJit;
      uniform float uTime, uScale;
      varying vec3 vCol; varying float vA;
      void main() {
        float speed = aKind > 0.5 ? 0.2 : 0.055;
        float h = fract(aT + uTime * speed);
        float r = mix(0.3, 2.7, pow(h, 1.6)) + aJit * h;
        float ang = aStrand * 6.28318 / ${S.toFixed(1)} + h * 7.5 + uTime * (aKind > 0.5 ? 2.6 : 1.1) / (0.45 + r * 0.55);
        vec3 p = vec3(cos(ang) * r, 1.0 + h * 5.2, sin(ang) * r);
        // a pulse climbing the funnel
        float band = exp(-pow((h - fract(uTime * 0.28)) * 12.0, 2.0));
        vec3 teal = vec3(0.25, 0.95, 0.9), gold = vec3(1.0, 0.78, 0.42), rose = vec3(1.0, 0.55, 0.75);
        vCol = mix(mix(teal, rose, smoothstep(0.35, 0.7, h)), gold, smoothstep(0.7, 1.0, h)) + band * 0.9;
        if (aKind > 0.5) vCol = vec3(1.0, 0.96, 0.85);
        vA = (aKind > 0.5 ? 1.0 : 0.75) * smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.9, 1.0, h)) * (0.7 + band);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (aKind > 0.5 ? 0.18 : 0.085) * (1.0 + band * 1.2) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight;
      varying vec3 vCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vCol * a * vA * (1.15 + uNight * 0.7), 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/** Fireflies drifting over the bluebells and the meadow (they only show at night). */
function fireflies(count) {
  const p = new Float32Array(count * 3), ph = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const bed = BLUEBELL_BEDS[i % BLUEBELL_BEDS.length], meadow = i % 3 === 0;
    const x = meadow ? rr(-72, -48) : bed[0] + rr(-bed[2], bed[2]), z = meadow ? rr(-8, 22) : bed[1] + rr(-bed[3], bed[3]);
    p.set([x, rr(0.4, 1.8), z], i * 3); ph[i] = rnd() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: /* glsl */`
      attribute float aPh; uniform float uTime; varying float vB;
      void main() {
        vec3 q = position + vec3(sin(uTime * 0.4 + aPh) * 0.9, sin(uTime * 0.7 + aPh * 1.3) * 0.35, cos(uTime * 0.33 + aPh * 0.7) * 0.9);
        vB = 0.5 + 0.5 * sin(uTime * 2.2 + aPh * 3.0);
        vec4 mv = modelViewMatrix * vec4(q, 1.0);
        gl_PointSize = 0.12 * 360.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uNight; varying float vB;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * a * vB * uNight, 1.0);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/** A wooden gateway arch with the park's name on both faces. */
function arch(group, dyn, x, z, yaw, span, title, sub) {
  const wood = getMat('darkWood');
  const c = Math.cos(yaw), s = Math.sin(yaw);
  for (const side of [-1, 1]) {
    const px = x + c * side * span / 2, pz = z - s * side * span / 2;
    boxFromTo(group, wood, px - 0.14, 0, pz - 0.14, px + 0.14, 3.3, pz + 0.14);
    addBox(px - 0.16, px + 0.16, pz - 0.16, pz + 0.16);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 0.7, 0.62, 0.16), wood);
  beam.position.set(x, 3.4, z); beam.rotation.y = yaw; beam.castShadow = true; group.add(beam);
  const tex = signTexture(title, { w: 1024, h: 192, bg: '#2a3b2c', fg: '#f6efe2', font: '600 92px Marcellus, Georgia, serif', sub, subFont: '600 34px Manrope, sans-serif', subColor: '#e3b866' });
  const signM = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.12 });
  for (const f of [1, -1]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(span + 0.5, (span + 0.5) * 0.1875), signM);
    p.position.set(x + s * f * 0.09, 3.4, z + c * f * 0.09); p.rotation.y = yaw + (f < 0 ? Math.PI : 0);
    dyn.add(p);
  }
  // flower boxes at the posts
  for (const side of [-1, 1]) {
    const px = x + c * side * (span / 2 + 0.55), pz = z - s * side * (span / 2 + 0.55);
    const bx = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.7), getMat('terracotta')); bx.position.set(px, 0.2, pz); group.add(bx);
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0xe86a92, roughness: 0.8, flatShading: true }));
    bush.position.set(px, 0.62, pz); dyn.add(bush);
    addBox(px - 0.38, px + 0.38, pz - 0.38, pz + 0.38, { maxY: 0.9 });
  }
}
