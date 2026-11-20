// scene/furniture.js — chairs, desks, beds, kitchen, bar, loungers, props.
// Repeated items are InstancedMesh (one draw call each). Also exports "anchors":
// the exact seats and work spots the characters use.
import * as THREE from 'three';
import { getMat, signTexture } from './materials.js';
import { box, boxFromTo, cyl, instanced, trs, compose } from './helpers.js';
import { addBox, addFootprint } from '../systems/collision.js';

const BoxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CylG = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);

/** yaw so that a character at (x,z) faces (tx,tz). Characters face +Z at yaw 0. */
export const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);

export function buildFurniture(scene, profile) {
  const group = new THREE.Group(); group.name = 'furniture';
  const dyn = new THREE.Group(); dyn.name = 'furniture-dynamic';
  scene.add(group, dyn);
  const M = (k) => getMat(k);
  const anchors = { cafeSeats: [], sofaSeats: [], barStools: [], loungers: [], hotspots: [], lights: [], benchSeats: [], tvs: [], laptops: [] };

  // ---------- shared instanced geometries ----------
  const chairFrame = compose([
    [BoxG(0.46, 0.06, 0.46), trs(0, 0.46, 0)],
    [BoxG(0.46, 0.5, 0.05), trs(0, 0.74, -0.21)],
    ...[[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].map(([x, z]) => [BoxG(0.04, 0.46, 0.04), trs(x, 0.23, z)]),
  ]);
  const chairCushion = compose([[BoxG(0.42, 0.05, 0.42), trs(0, 0.51, 0.01)], [BoxG(0.4, 0.36, 0.04), trs(0, 0.77, -0.18)]]);
  const tableTop = compose([[CylG(0.62, 0.62, 0.05, 24), trs(0, 0.76, 0)]]);
  const tableBase = compose([[CylG(0.05, 0.05, 0.72, 8), trs(0, 0.38, 0)], [CylG(0.3, 0.34, 0.04, 16), trs(0, 0.02, 0)]]);
  const plateG = compose([[CylG(0.13, 0.1, 0.02, 16), trs(0, 0.795, 0)]]);
  const foodG = compose([[new THREE.SphereGeometry(0.07, 8, 6), trs(0, 0.82, 0, 0, [1, 0.45, 1])]]);
  const glassG = compose([[CylG(0.035, 0.03, 0.13, 8), trs(0.16, 0.85, 0.1)]]);

  // ---------- CAFÉ ----------
  const chairM = [], tableM = [], plateM = [], foodM = [], glassM = [];
  const tablesX = [-25, -19.5, -14], tablesZ = [-14.5, -8, 8, 14.5];
  for (const tx of tablesX) for (const tz of tablesZ) {
    tableM.push(trs(tx, 0, tz));
    addFootprint(tx, tz, 1.25, 1.25, { maxY: 0.8 });
    for (const [dx, dz] of [[0.85, 0], [-0.85, 0], [0, 0.85], [0, -0.85]]) {
      const cx = tx + dx, cz = tz + dz;
      const yaw = yawTo(cx, cz, tx, tz);
      chairM.push(trs(cx, 0, cz, yaw));
      const px = tx + dx * 0.45, pz = tz + dz * 0.45;
      plateM.push(trs(px, 0, pz)); foodM.push(trs(px, 0, pz, Math.random() * 6));
      glassM.push(trs(px, 0, pz, yaw));
      anchors.cafeSeats.push({ x: cx, z: cz, yaw, seatY: 0.5, table: { x: tx, z: tz } });
    }
  }
  instanced(group, [{ geometry: chairFrame, material: M('darkWood') }, { geometry: chairCushion, material: M('fabricTeal') }], chairM);
  instanced(group, [{ geometry: tableTop, material: M('marble') }, { geometry: tableBase, material: M('gold') }], tableM);
  instanced(group, [{ geometry: plateG, material: M('plate') }], plateM, { cast: false });
  instanced(group, [{ geometry: foodG, material: M('food') }], foodM.filter((_, i) => i % 2 === 0), { cast: false });
  instanced(group, [{ geometry: foodG, material: M('salad') }], foodM.filter((_, i) => i % 2 === 1), { cast: false });
  instanced(group, [{ geometry: glassG, material: M('glass') }], glassM, { cast: false });

  // pendant lamps above tables
  const pendant = compose([[CylG(0.005, 0.005, 1.6, 4), trs(0, 4.2, 0)], [new THREE.ConeGeometry(0.28, 0.3, 16, 1, true), trs(0, 3.3, 0)]]);
  const bulb = compose([[new THREE.SphereGeometry(0.09, 10, 8), trs(0, 3.2, 0)]]);
  const pm = []; for (const tx of tablesX) for (const tz of tablesZ) pm.push(trs(tx, 0, tz));
  instanced(group, [{ geometry: pendant, material: M('black') }], pm, { cast: false });
  const bulbs = instanced(dyn, [{ geometry: bulb, material: M('lampGlow') }], pm, { cast: false });

  // buffet counter on the west wall
  boxFromTo(group, M('darkWood'), -34.2, 0, 2, -32.8, 0.92, 16);
  boxFromTo(group, M('marble'), -34.3, 0.92, 1.9, -32.7, 0.97, 16.1);
  boxFromTo(group, M('glass'), -33.0, 1.25, 2, -32.95, 1.6, 16, { cast: false });
  boxFromTo(group, M('wallTeal'), -35.85, 1.4, 1.5, -35.82, 3.4, 16.5, { cast: false });
  const trayM = []; for (let z = 2.8; z < 15.5; z += 1.4) trayM.push(trs(-33.5, 0.98, z));
  instanced(group, [{ geometry: compose([[BoxG(0.9, 0.08, 1.1), null]]), material: M('steel') }], trayM);
  const dishM = []; for (let z = 2.8; z < 15.5; z += 1.4) dishM.push(trs(-33.5, 0.2, z, z, [3.4, 1, 4]));
  instanced(group, [{ geometry: foodG, material: M('food') }], dishM, { cast: false });
  addBox(-36, -32.7, 1.9, 16.1);
  // buffet sign
  {
    const tex = signTexture('Buffet', { w: 512, h: 128, bg: 'rgba(0,0,0,0)', fg: '#f3e3c0', font: '600 96px Marcellus, Georgia, serif' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    s.position.set(-35.78, 2.9, 9); s.rotation.y = Math.PI / 2; dyn.add(s);
  }

  // menu stand (clickable hotspot)
  {
    const g = new THREE.Group(); g.position.set(-11.6, 0, 4.2); g.rotation.y = Math.PI / 2 + 0.35;
    const pole = new THREE.Mesh(CylG(0.03, 0.03, 1.2, 8), M('gold')); pole.position.y = 0.6;
    const foot = new THREE.Mesh(CylG(0.22, 0.25, 0.04, 16), M('gold')); foot.position.y = 0.02;
    const tex = signTexture('MENU', { w: 512, h: 700, bg: '#173238', fg: '#f3e3c0', font: '600 120px Marcellus, Georgia, serif', sub: 'tap to read', subFont: '500 46px Manrope, sans-serif', subColor: '#9fd8cf' });
    const board = new THREE.Mesh(BoxG(0.62, 0.85, 0.04), [M('darkWood'), M('darkWood'), M('darkWood'), M('darkWood'), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.2 }), M('darkWood')]);
    board.position.y = 1.45; board.rotation.x = -0.15;
    g.add(pole, foot, board); g.traverse((o) => { o.castShadow = true; o.userData.dynamic = true; });
    dyn.add(g);
    board.userData.hotspot = 'menu';
    anchors.hotspots.push(board);
    addFootprint(-11.6, 4.2, 0.5, 0.5);
  }

  // ---------- KITCHEN ----------
  boxFromTo(group, M('steel'), -35.85, 0, -19.85, -29.8, 0.92, -18.5);
  const burnerM = []; for (let x = -35; x < -30; x += 0.9) burnerM.push(trs(x, 0.93, -19.15));
  instanced(group, [{ geometry: compose([[CylG(0.18, 0.18, 0.02, 16), null]]), material: M('black') }], burnerM);
  const potM = [trs(-34.1, 1.06, -19.15), trs(-32.3, 1.06, -19.15, 0, [0.8, 0.7, 0.8]), trs(-30.5, 1.0, -19.15, 0, [1.3, 0.3, 1.3])];
  instanced(group, [{ geometry: compose([[CylG(0.2, 0.18, 0.26, 16), null]]), material: M('steel') }], potM);
  boxFromTo(group, M('steel'), -35.85, 2.5, -19.85, -29.8, 3.1, -18.4); // hood
  boxFromTo(group, M('steel'), -35.85, 0, -16, -34.6, 0.92, -6.2);       // prep counter
  boxFromTo(group, M('lightWood'), -35.8, 0.92, -15, -34.65, 0.97, -11);  // chopping boards
  boxFromTo(group, M('steel'), -29.4, 0, -17, -28.2, 0.95, -9);          // pass counter
  const passPlates = []; for (let z = -16.3; z < -9.5; z += 1.1) passPlates.push(trs(-28.8, 0.16, z));
  instanced(group, [{ geometry: plateG, material: M('plate') }, { geometry: foodG, material: M('food') }], passPlates, { cast: false });
  boxFromTo(group, M('steel'), -35.85, 0, -5.4, -34.6, 2.3, -4.2);        // fridge
  boxFromTo(group, M('darkSteel'), -34.62, 1.0, -5.3, -34.58, 2.1, -5.2);
  addBox(-36, -29.8, -20, -18.4); addBox(-36, -34.6, -16, -6.2); addBox(-29.4, -28.2, -17, -9); addBox(-36, -34.6, -5.4, -4);
  anchors.kitchen = {
    stove: { x: -33.2, z: -17.9, yaw: Math.PI },
    prep: { x: -34.0, z: -13, yaw: -Math.PI / 2 },
    pass: { x: -29.9, z: -12.5, yaw: Math.PI / 2 },
    pickup: { x: -27.4, z: -12.5, yaw: -Math.PI / 2 },
  };

  // ---------- LOBBY ----------
  // reception desk
  boxFromTo(group, M('darkWood'), -3.2, 0, -6.6, 3.2, 0.9, -5.4);
  boxFromTo(group, M('marble'), -3.35, 0.9, -6.75, 3.35, 0.96, -5.25);
  boxFromTo(group, M('gold'), -3.2, 0.12, -5.39, 3.2, 0.18, -5.37, { cast: false });
  boxFromTo(group, M('gold'), -3.2, 0.76, -5.39, 3.2, 0.82, -5.37, { cast: false });
  boxFromTo(group, M('lightWood'), -3.0, 0.8, -7.1, 3.0, 0.84, -6.6); // inner worktop
  for (const x of [-1.6, 1.6]) {
    box(group, M('black'), x, 1.16, -6.3, 0.52, 0.32, 0.03);
    box(group, M('darkSteel'), x, 1.0, -6.3, 0.05, 0.1, 0.05);
  }
  for (const x of [-1.2, 1.2]) box(group, M('black'), x, 0.85, -6.85, 0.45, 0.02, 0.16);
  const screenMat = M('screen');
  for (const x of [-1.6, 1.6]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.28), screenMat); s.position.set(x, 1.16, -6.317); s.rotation.y = Math.PI; s.userData.dynamic = true; dyn.add(s); }
  cyl(group, M('gold'), 2.6, 0.99, -5.6, 0.07, 0.09, 0.07, 16); // bell
  addBox(-3.4, 3.4, -8.4, -5.25);
  // receptionist + concierge chairs
  const officeChair = compose([[CylG(0.24, 0.24, 0.08, 16), trs(0, 0.6, 0)], [BoxG(0.44, 0.5, 0.06), trs(0, 0.94, -0.22)], [CylG(0.03, 0.03, 0.56, 8), trs(0, 0.3, 0)], [CylG(0.28, 0.28, 0.03, 5), trs(0, 0.03, 0)]]);
  instanced(group, [{ geometry: officeChair, material: M('black') }], [trs(-1.2, 0, -7.45, 0), trs(1.2, 0, -7.45, 0)]);
  anchors.reception = { seat: { x: -1.2, z: -7.45, yaw: 0, seatY: 0.62 }, seat2: { x: 1.2, z: -7.45, yaw: 0, seatY: 0.62 }, front: { x: -1.2, z: -4.3 }, exitL: { x: -4.2, z: -7.4 }, exitR: { x: 4.2, z: -7.4 } };

  // feature wall with logo
  boxFromTo(group, M('wallTeal'), -4.5, 0, -11.3, 4.5, 4.2, -10.8);
  boxFromTo(group, M('gold'), -4.55, 4.2, -11.35, 4.55, 4.3, -10.75);
  addBox(-4.5, 4.5, -11.3, -10.8, { cam: true });
  {
    const tex = signTexture('AZURE BAY', { w: 1024, h: 300, bg: 'rgba(0,0,0,0)', fg: '#e8c98c', font: '600 150px Marcellus, Georgia, serif', sub: 'RESTAURANT & RESORT', subFont: '600 48px Manrope, sans-serif', subColor: '#f3e3c0' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.9), new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: 0xffe0a0, emissiveMap: tex, emissiveIntensity: 0.35, metalness: 0.4, roughness: 0.35 }));
    s.position.set(0, 2.7, -10.78); dyn.add(s);
  }

  // sofas + coffee tables (two groups)
  const sofaBase = compose([[BoxG(0.95, 0.42, 2.6), trs(0, 0.21, 0)], [BoxG(0.25, 0.85, 2.6), trs(-0.38, 0.42, 0)], [BoxG(0.95, 0.6, 0.2), trs(0, 0.3, -1.3)], [BoxG(0.95, 0.6, 0.2), trs(0, 0.3, 1.3)]]);
  const sofaCushion = compose([[BoxG(0.7, 0.12, 1.2), trs(0.06, 0.48, -0.62)], [BoxG(0.7, 0.12, 1.2), trs(0.06, 0.48, 0.62)]]);
  const sofaM = [trs(-8.6, 0, 9, 0), trs(8.6, 0, 9, Math.PI), trs(-8.6, 0, 14.5, 0), trs(8.6, 0, 14.5, Math.PI)];
  instanced(group, [{ geometry: sofaBase, material: M('fabricCream') }, { geometry: sofaCushion, material: M('fabricCoral') }], sofaM);
  for (const [x, z, s] of [[-8.6, 9, 1], [8.6, 9, -1], [-8.6, 14.5, 1], [8.6, 14.5, -1]]) {
    addFootprint(x, z, 1.0, 2.7);
    anchors.sofaSeats.push({ x: x + s * 0.12, z: z - 0.62, yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2, seatY: 0.48 });
    anchors.sofaSeats.push({ x: x + s * 0.12, z: z + 0.62, yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2, seatY: 0.48 });
    // coffee table
    boxFromTo(group, M('marble'), x + s * 1.2 - 0.45, 0.4, z - 0.8, x + s * 1.2 + 0.45, 0.45, z + 0.8);
    boxFromTo(group, M('gold'), x + s * 1.2 - 0.4, 0, z - 0.75, x + s * 1.2 + 0.4, 0.4, z + 0.75);
    addFootprint(x + s * 1.2, z, 0.9, 1.6, { maxY: 0.5 });
  }

  // chandelier
  {
    const g = new THREE.Group(); g.position.set(0, 4.1, 8);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.04, 8, 40), M('gold')); ring.rotation.x = Math.PI / 2;
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.03, 8, 32), M('gold')); ring2.rotation.x = Math.PI / 2; ring2.position.y = -0.35;
    const rod = new THREE.Mesh(CylG(0.02, 0.02, 0.9, 6), M('gold')); rod.position.y = 0.45;
    g.add(ring, ring2, rod);
    const bulbG = new THREE.SphereGeometry(0.07, 8, 6);
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const b = new THREE.Mesh(bulbG, M('lampGlow')); b.position.set(Math.cos(a) * 1.2, 0.06, Math.sin(a) * 1.2); g.add(b); }
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const b = new THREE.Mesh(bulbG, M('lampGlow')); b.position.set(Math.cos(a) * 0.7, -0.29, Math.sin(a) * 0.7); g.add(b); }
    dyn.add(g);
  }

  // luggage trolley
  {
    const g = new THREE.Group(); g.position.set(7.2, 0, 18.2); g.rotation.y = 0.3;
    box(g, M('gold'), 0, 0.2, 0, 1.2, 0.04, 0.6);
    for (const x of [-0.58, 0.58]) { box(g, M('gold'), x, 1.0, 0, 0.04, 1.6, 0.04); }
    box(g, M('gold'), 0, 1.8, 0, 1.2, 0.04, 0.04);
    box(g, M('fabricNavy'), -0.2, 0.55, 0, 0.6, 0.66, 0.4);
    box(g, M('terracotta'), 0.3, 0.45, 0.05, 0.42, 0.48, 0.3);
    group.add(g); addFootprint(7.2, 18.2, 1.3, 1);
  }

  // ---------- GUEST ROOMS ----------
  const bedFrame = compose([[BoxG(2.2, 0.45, 2.1), trs(1.1, 0.225, 0)], [BoxG(0.12, 1.2, 2.3), trs(0.06, 0.6, 0)]]);
  const bedLinen = compose([[BoxG(2.0, 0.2, 2.0), trs(1.15, 0.55, 0)], [BoxG(0.4, 0.14, 0.7), trs(0.35, 0.72, -0.48)], [BoxG(0.4, 0.14, 0.7), trs(0.35, 0.72, 0.48)]]);
  const bedThrow = compose([[BoxG(0.6, 0.22, 2.04), trs(1.8, 0.56, 0)]]);
  const nightstand = compose([[BoxG(0.5, 0.55, 0.45), trs(0, 0.275, 0)]]);
  const lampG = compose([[CylG(0.05, 0.08, 0.3, 10), trs(0, 0.7, 0)], [new THREE.ConeGeometry(0.18, 0.22, 16, 1, true), trs(0, 0.95, 0)]]);
  const tvG = compose([[BoxG(0.06, 0.75, 1.3), trs(0, 1.45, 0)]]);
  const standG = compose([[BoxG(0.5, 0.5, 1.8), trs(0, 0.25, 0)]]);
  const deskG = compose([[BoxG(1.6, 0.05, 0.65), trs(0, 0.76, 0)], [BoxG(0.05, 0.74, 0.6), trs(-0.77, 0.37, 0)], [BoxG(0.05, 0.74, 0.6), trs(0.77, 0.37, 0)]]);
  const wardrobeG = compose([[BoxG(0.6, 2.3, 1.6), trs(0, 1.15, 0)]]);
  const armchairG = compose([[BoxG(0.8, 0.42, 0.8), trs(0, 0.21, 0)], [BoxG(0.8, 0.5, 0.18), trs(0, 0.55, -0.32)], [BoxG(0.14, 0.3, 0.8), trs(-0.33, 0.5, 0)], [BoxG(0.14, 0.3, 0.8), trs(0.33, 0.5, 0)]]);
  const rugG = compose([[BoxG(3, 0.012, 2.2), trs(0, 0.006, 0)]]);
  const bedMs = [], nsMs = [], lampMs = [], tvMs = [], standMs = [], deskMs = [], wardMs = [], armMs = [], rugMs = [], chairMs2 = [];
  const roomXs = [[10, 18.67], [18.67, 27.33], [27.33, 36]];
  anchors.rooms = {};
  roomXs.forEach(([a, b], i) => {
    for (const side of [-1, 1]) { // -1 north (101-103), +1 south (104-106)
      const n = side < 0 ? 101 + i : 104 + i;
      const bz = side * 11; // bed centre z
      const ax = a + 0.15;
      bedMs.push(trs(ax, 0, bz));
      nsMs.push(trs(ax + 0.3, 0, bz - 1.45), trs(ax + 0.3, 0, bz + 1.45));
      lampMs.push(trs(ax + 0.3, 0.0, bz - 1.45), trs(ax + 0.3, 0.0, bz + 1.45));
      addBox(ax, ax + 2.2, bz - 1.7, bz + 1.7, { maxY: 0.9 });
      // TV on opposite wall
      tvMs.push(trs(b - 0.2, 0, bz)); standMs.push(trs(b - 0.42, 0, bz));
      addBox(b - 0.7, b - 0.15, bz - 0.9, bz + 0.9, { maxY: 1 });
      // desk under the window
      const wz = side * 19.4, cx = (a + b) / 2;
      deskMs.push(trs(cx + 0.2, 0, wz)); chairMs2.push(trs(cx + 0.2, 0, wz - side * 0.75, side < 0 ? Math.PI : 0));
      addBox(cx - 0.6, cx + 1.0, wz - 0.35, wz + 0.35, { maxY: 0.8 });
      // wardrobe near the door
      wardMs.push(trs(b - 0.45, 0, side * 4.2)); addBox(b - 0.75, b - 0.15, side * 4.2 - 0.8, side * 4.2 + 0.8);
      armMs.push(trs(cx - 2.2, 0, side * 16.5, side < 0 ? Math.PI * 0.85 : Math.PI * 0.15)); addFootprint(cx - 2.2, side * 16.5, 0.9, 0.9, { maxY: 0.7 });
      rugMs.push(trs(ax + 3.4, 0, bz));
      const armYaw = side < 0 ? Math.PI * 0.85 : Math.PI * 0.15;
      // laptop on the desk, screen turned toward the chair
      {
        const lg = new THREE.Group(); lg.position.set(cx + 0.2, 0.785, wz - side * 0.06); lg.rotation.y = side < 0 ? 0 : Math.PI;
        const base = new THREE.Mesh(BoxG(0.34, 0.018, 0.24), M('darkSteel')); base.position.y = 0.009;
        const lid = new THREE.Group(); lid.position.set(0, 0.018, -0.12); lid.rotation.x = -0.28;
        const back = new THREE.Mesh(BoxG(0.34, 0.23, 0.01), M('darkSteel')); back.position.y = 0.115;
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), M('screen')); scr.position.set(0, 0.115, 0.006);
        lid.add(back, scr); lg.add(base, lid); lg.traverse((o) => { o.castShadow = true; });
        group.add(lg);
        anchors.laptops.push({ room: n, x: cx + 0.2, z: wz - side * 0.75 });
      }
      anchors.rooms[n] = {
        bedEdge: { x: ax + 1.95, z: bz, yaw: Math.PI / 2, seatY: 0.62 },
        bedLie: { x: ax + 1.1, z: bz - 0.45, yaw: Math.PI / 2, pitch: -Math.PI / 2 + 0.12, h: 0.8, off: 0.95 },
        armchair: { x: cx - 2.2 + Math.sin(armYaw) * 0.06, z: side * 16.5 + Math.cos(armYaw) * 0.06, yaw: armYaw, seatY: 0.44 },
        desk: { x: cx + 0.2, z: wz - side * 0.75, yaw: side < 0 ? Math.PI : 0, seatY: 0.5 },
        door: { x: doorX(i), z: side * 2.0 },
        inside: { x: doorX(i), z: side * 4 },
        bedSide: { x: ax + 2.6, z: bz + 0.6, yaw: -Math.PI / 2 },
      };
    }
  });
  function doorX(i) { return [14.33, 23, 31.67][i]; }
  instanced(group, [{ geometry: bedFrame, material: M('darkWood') }, { geometry: bedLinen, material: M('linen') }, { geometry: bedThrow, material: M('fabricTeal') }], bedMs);
  instanced(group, [{ geometry: nightstand, material: M('lightWood') }], nsMs);
  instanced(group, [{ geometry: lampG, material: M('fabricCream') }], lampMs.map((m) => m.clone().multiply(trs(0, 0, 0))), { cast: false });
  instanced(group, [{ geometry: tvG, material: M('black') }], tvMs);
  instanced(group, [{ geometry: standG, material: M('darkWood') }], standMs);
  instanced(group, [{ geometry: deskG, material: M('lightWood') }], deskMs);
  instanced(group, [{ geometry: chairFrame, material: M('darkWood') }, { geometry: chairCushion, material: M('fabricNavy') }], chairMs2);
  instanced(group, [{ geometry: wardrobeG, material: M('lightWood') }], wardMs);
  instanced(group, [{ geometry: armchairG, material: M('fabricCoral') }], armMs);
  instanced(group, [{ geometry: rugG, material: M('fabricCream') }], rugMs, { cast: false });
  // TV screens: every room has its own set with power and channel (see drawChannel below)
  const tvOff = new THREE.MeshStandardMaterial({ color: 0x08090b, roughness: 0.18, metalness: 0.4 });
  roomXs.forEach(([a, b], i) => {
    for (const side of [-1, 1]) {
      const n = side < 0 ? 101 + i : 104 + i;
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.66), tvOff);
      mesh.position.set(b - 0.235, 1.45, side * 11); mesh.rotation.y = -Math.PI / 2; dyn.add(mesh);
      const tv = { room: n, x: b - 0.55, z: side * 11, mesh, cv, tex, on: false, channel: 0, mat: new THREE.MeshBasicMaterial({ map: tex }) };
      tv.setPower = (on) => { tv.on = on; mesh.material = on ? tv.mat : tvOff; };
      anchors.tvs.push(tv); anchors.rooms[n].tv = tv;
    }
  });

  // ---------- POOL DECK ----------
  const loungerFrame = compose([[BoxG(0.7, 0.08, 1.4), trs(0, 0.35, 0.3)], [BoxG(0.7, 0.08, 0.8), trs(0, 0.55, -0.68, 0, 1, 0.6)], ...[[-0.3, 0.9], [0.3, 0.9], [-0.3, -0.5], [0.3, -0.5]].map(([x, z]) => [BoxG(0.05, 0.33, 0.05), trs(x, 0.16, z)])]);
  const loungerPad = compose([[BoxG(0.62, 0.06, 1.35), trs(0, 0.42, 0.3)], [BoxG(0.62, 0.06, 0.75), trs(0, 0.61, -0.66, 0, 1, 0.6)]]);
  const lounM = [];
  const addLounger = (x, z, yaw) => { lounM.push(trs(x, 0, z, yaw)); anchors.loungers.push({ x, z, yaw }); addFootprint(x, z, 1.0, 1.0, { maxY: 0.7 }); };
  for (let x = -12; x <= 12; x += 3) addLounger(x, -50.5, 0);   // north side, feet toward pool
  for (let z = -33; z >= -44; z -= 2.6) addLounger(-19, z, Math.PI / 2);
  instanced(group, [{ geometry: loungerFrame, material: M('lightWood') }, { geometry: loungerPad, material: M('linen') }], lounM);
  // umbrellas
  const umbPole = compose([[CylG(0.04, 0.04, 2.6, 8), trs(0, 1.3, 0)], [CylG(0.3, 0.35, 0.08, 12), trs(0, 0.04, 0)]]);
  const umbTop = compose([[new THREE.ConeGeometry(1.5, 0.55, 12, 1, true), trs(0, 2.55, 0)]]);
  const umbM = []; for (let x = -10.5; x <= 12; x += 6) umbM.push(trs(x, 0, -51.6)); for (let z = -34.3; z >= -44; z -= 5.2) umbM.push(trs(-20.2, 0, z));
  instanced(group, [{ geometry: umbPole, material: M('lightWood') }], umbM);
  instanced(group, [{ geometry: umbTop, material: M('umbrellaWhite') }], umbM.filter((_, i) => i % 2 === 0));
  instanced(group, [{ geometry: umbTop, material: M('umbrellaTeal') }], umbM.filter((_, i) => i % 2 === 1));

  // lifeguard tower
  {
    const g = new THREE.Group(); g.position.set(-16.2, 0, -38);
    for (const [x, z] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) box(g, M('white'), x, 0.85, z, 0.08, 1.7, 0.08);
    box(g, M('fabricCoral'), 0, 1.72, 0, 1.0, 0.08, 1.0);
    box(g, M('fabricCoral'), -0.45, 2.15, 0, 0.08, 0.8, 1.0);
    for (let y = 0.35; y < 1.7; y += 0.35) box(g, M('white'), 0.5, y, 0, 0.06, 0.04, 0.9);
    group.add(g); addFootprint(-16.2, -38, 1.1, 1.1);
    anchors.lifeguard = { x: -16.25, z: -38, yaw: Math.PI / 2, seatY: 1.78 };
  }

  // pool bar with thatched roof
  {
    const g = group;
    boxFromTo(g, M('darkWood'), 21, 0, -33.5, 29, 1.1, -32.6);
    boxFromTo(g, M('lightWood'), 20.9, 1.1, -33.75, 29.1, 1.16, -32.5);
    boxFromTo(g, M('darkWood'), 21, 0, -33.5, 21.9, 1.1, -27);
    boxFromTo(g, M('darkWood'), 28.1, 0, -33.5, 29, 1.1, -27);
    boxFromTo(g, M('darkWood'), 21, 0, -27.6, 29, 2.4, -27.2); // back shelf
    for (const [x, z] of [[20.8, -33.8], [29.2, -33.8], [20.8, -26.9], [29.2, -26.9]]) cyl(g, M('trunk'), x, 1.6, z, 0.1, 0.12, 3.2, 8);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.2, 1.8, 4, 1), new THREE.MeshStandardMaterial({ color: 0xc7a46a, roughness: 1, flatShading: true }));
    roof.position.set(25, 4.0, -30.4); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.75); roof.castShadow = true; g.add(roof);
    const bottles = []; for (let x = 21.4; x < 28.8; x += 0.32) bottles.push(trs(x, 1.68, -27.4, 0, [1, 1 + ((x * 7) % 1) * 0.4, 1]));
    instanced(g, [{ geometry: compose([[CylG(0.04, 0.05, 0.3, 8), null]]), material: new THREE.MeshStandardMaterial({ color: 0x3a8f5c, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }) }], bottles, { cast: false });
    const stoolG = compose([[CylG(0.2, 0.2, 0.06, 14), trs(0, 0.78, 0)], [CylG(0.03, 0.03, 0.76, 6), trs(0, 0.38, 0)], [CylG(0.18, 0.2, 0.03, 12), trs(0, 0.015, 0)]]);
    const stools = [];
    for (const x of [22.2, 23.8, 25.4, 27, 28.4]) { stools.push(trs(x, 0, -34.3)); anchors.barStools.push({ x, z: -34.25, yaw: 0, seatY: 0.8 }); }
    instanced(g, [{ geometry: stoolG, material: M('gold') }], stools);
    addBox(20.7, 29.3, -33.8, -26.8);
    anchors.bartender = { x: 25, z: -31.7, yaw: Math.PI };
    const tex = signTexture('Pool Bar', { w: 512, h: 160, bg: '#173238', fg: '#f3e3c0', font: '600 96px Marcellus, Georgia, serif' });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
    s.position.set(25, 2.75, -33.86); s.rotation.y = Math.PI; dyn.add(s);
  }
  // stage
  {
    cyl(group, M('darkWood'), 31, 0.15, -44, 2.4, 2.5, 0.3, 32);
    cyl(group, M('gold'), 31, 0.31, -44, 2.42, 2.42, 0.02, 32);
    for (const [x, z] of [[29, -46.2], [33, -46.2]]) { box(group, M('black'), x, 0.6, z, 0.6, 1.2, 0.5); }
    addBox(28.6, 33.4, -46.5, -41.6, { maxY: 0.3 });
    anchors.stage = { x: 31, z: -44, yaw: -Math.PI / 4 * 3 };
  }
  // towel shelf + shower
  boxFromTo(group, M('lightWood'), -30, 0, -24, -27, 1.2, -23.4);
  const towels = []; for (let x = -29.6; x < -27.2; x += 0.5) for (let y = 0.3; y < 1.2; y += 0.38) towels.push(trs(x, y, -23.7));
  instanced(group, [{ geometry: compose([[BoxG(0.42, 0.14, 0.4), null]]), material: M('umbrellaTeal') }], towels, { cast: false });
  addBox(-30, -27, -24, -23.4);

  // ---------- PLAZA ----------
  // fountain
  {
    cyl(group, M('stone'), 0, 0.3, 29, 2.8, 3.0, 0.6, 40);
    cyl(group, M('stone'), 0, 1.1, 29, 0.25, 0.35, 1.8, 16);
    cyl(group, M('stone'), 0, 2.0, 29, 1.0, 0.4, 0.25, 24);
    cyl(group, M('stone'), 0, 2.7, 29, 0.12, 0.16, 1.2, 12);
    cyl(group, M('stone'), 0, 3.2, 29, 0.5, 0.2, 0.15, 20);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.04, 40), new THREE.MeshStandardMaterial({ color: 0x5fc6d8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85 }));
    water.position.set(0, 0.52, 29); group.add(water);
    addFootprint(0, 29, 5.6, 5.6, { maxY: 0.7 });
    anchors.fountain = { x: 0, z: 29 };
  }
  // benches
  const benchG = compose([[BoxG(1.8, 0.08, 0.5), trs(0, 0.45, 0)], [BoxG(1.8, 0.4, 0.06), trs(0, 0.7, -0.24)], [BoxG(0.08, 0.45, 0.5), trs(-0.8, 0.22, 0)], [BoxG(0.08, 0.45, 0.5), trs(0.8, 0.22, 0)]]);
  const benches = [trs(-6, 0, 30.5, 0), trs(6, 0, 30.5, 0), trs(-22, 0, -24.5, Math.PI), trs(-16, 0, 23.5, Math.PI)];
  instanced(group, [{ geometry: benchG, material: M('lightWood') }], benches);
  for (const [x, z] of [[-6, 30.5], [6, 30.5], [-22, -24.5], [-16, 23.5]]) addFootprint(x, z, 1.9, 0.6, { maxY: 0.8 });
  anchors.benches = [{ x: -6, z: 30.55, yaw: 0, seatY: 0.48 }, { x: 6, z: 30.55, yaw: 0, seatY: 0.48 }];
  for (const [x, z, yaw] of [[-6, 30.5, 0], [6, 30.5, 0], [-22, -24.5, Math.PI], [-16, 23.5, Math.PI]]) for (const dx of [-0.5, 0.5]) {
    anchors.benchSeats.push({ x: x + dx * Math.cos(yaw), z: z + Math.cos(yaw) * 0.05, yaw, seatY: 0.48 });
  }

  // guest computer in the lobby, against the east wall
  {
    boxFromTo(group, M('lightWood'), 8.95, 0.72, -9.3, 9.75, 0.77, -7.5);
    for (const z of [-9.2, -7.6]) boxFromTo(group, M('lightWood'), 9.0, 0, z - 0.04, 9.7, 0.72, z + 0.04);
    box(group, M('black'), 9.48, 1.08, -8.4, 0.04, 0.4, 0.62);
    box(group, M('darkSteel'), 9.5, 0.84, -8.4, 0.12, 0.14, 0.06);
    box(group, M('darkSteel'), 9.18, 0.78, -8.4, 0.16, 0.015, 0.45);
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.36), M('screen')); s.position.set(9.455, 1.08, -8.4); s.rotation.y = -Math.PI / 2; dyn.add(s);
    instanced(group, [{ geometry: chairFrame, material: M('darkWood') }, { geometry: chairCushion, material: M('fabricNavy') }], [trs(8.45, 0, -8.4, Math.PI / 2)]);
    addBox(8.95, 9.75, -9.3, -7.5, { maxY: 0.8 });
    const tex = signTexture('Guest computer', { w: 512, h: 96, bg: 'rgba(0,0,0,0)', fg: '#3a2b1c', font: '600 54px Manrope, sans-serif' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    sign.position.set(9.74, 1.75, -8.4); sign.rotation.y = -Math.PI / 2; dyn.add(sign);
    anchors.computer = { x: 8.45, z: -8.4, yaw: Math.PI / 2, seatY: 0.5 };
  }

  // ---------- framed art (photos and paintings in assets/images) ----------
  {
    const loader = new THREE.TextureLoader();
    const frameMat = M('gold'), backMat = M('darkWood');
    const hang = (file, x, y, z, yaw, w, h) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
      const back = new THREE.Mesh(BoxG(w + 0.12, h + 0.12, 0.04), backMat); back.position.z = 0.02;
      const tex = loader.load(`assets/images/${file}.jpg`, (t) => { t.needsUpdate = true; });
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
      art.position.z = 0.042;
      g.add(back, art);
      for (const [fx, fy, fw, fh] of [[0, h / 2 + 0.05, w + 0.14, 0.04], [0, -h / 2 - 0.05, w + 0.14, 0.04], [w / 2 + 0.05, 0, 0.04, h + 0.14], [-w / 2 - 0.05, 0, 0.04, h + 0.14]]) {
        const bar = new THREE.Mesh(BoxG(fw, fh, 0.05), frameMat); bar.position.set(fx, fy, 0.045); g.add(bar);
      }
      g.traverse((o) => { o.userData.dynamic = true; });
      dyn.add(g);
    };
    // lobby: one large painting above each pair of sofas
    hang('art-plaza', -9.83, 2.55, 11.75, Math.PI / 2, 1.5, 2.25);
    hang('art-tower', 9.83, 2.55, 11.75, -Math.PI / 2, 1.5, 2.25);
    // guest rooms: a picture above every bed
    const roomArt = ['photo-fountain', 'art-glass-towers', 'photo-plaza', 'art-park', 'photo-tower', 'art-tower'];
    roomXs.forEach(([a], i) => [-1, 1].forEach((side, k) => hang(roomArt[i * 2 + k], a + 0.17, 2.3, side * 11, Math.PI / 2, 0.9, 1.35)));
  }

  // ---------- PLANTS (instanced) ----------
  const potG = compose([[CylG(0.32, 0.24, 0.6, 14), trs(0, 0.3, 0)]]);
  const bushG = compose([[new THREE.IcosahedronGeometry(0.55, 1), trs(0, 1.0, 0, 0, [1, 1.2, 1])], [new THREE.IcosahedronGeometry(0.4, 1), trs(0.2, 1.5, 0.1)], [new THREE.IcosahedronGeometry(0.35, 1), trs(-0.2, 1.35, -0.15)]]);
  const plantSpots = [[-9.2, 18.8], [9.2, 18.8], [-9.2, -18.8], [9.2, -18.8], [-9.2, 4.5], [9.2, 4.5], [-11, -18.8], [-11, 18.8], [-35.3, 18.8], [-27, 18.8], [35.2, 1.5], [35.2, -1.5], [-3.6, 21.2], [3.6, 21.2], [-9.3, 21.4], [9.3, 21.4], [26, -21.3], [-26, -21.3], [11, -1.6], [11, 1.6]];
  const plantM = plantSpots.map(([x, z]) => trs(x, 0, z, x * z));
  instanced(group, [{ geometry: potG, material: M('pot') }], plantM);
  instanced(group, [{ geometry: bushG, material: M('leaf') }], plantM);
  for (const [x, z] of plantSpots) addFootprint(x, z, 0.7, 0.7, { maxY: 1.5 });

  // ceiling light discs (interiors)
  const discM = [];
  for (let x = -8; x <= 8; x += 4) for (let z = -16; z <= 18; z += 6) discM.push(trs(x, 4.98, z));
  for (let x = -33; x <= -12; x += 5) for (let z = -2; z <= 2; z += 4) discM.push(trs(x, 4.98, z));
  for (let x = 12; x <= 35; x += 3.5) discM.push(trs(x, 4.98, 0));
  roomXs.forEach(([a, b]) => { for (const s of [-1, 1]) discM.push(trs((a + b) / 2, 4.98, s * 9)); });
  for (let x = -34; x <= -30; x += 4) for (let z = -16; z <= -8; z += 4) discM.push(trs(x, 4.98, z));
  const discs = instanced(dyn, [{ geometry: compose([[CylG(0.35, 0.35, 0.03, 20), null]]), material: M('lampGlow') }], discM, { cast: false, receive: false });

  // interior point lights (balanced/high only) — fixed count so shaders never recompile
  if (profile.pointLights) {
    for (const [x, y, z, c, i, d] of [[0, 3.6, 8, 0xffd9a0, 6, 16], [-19.5, 3.4, -8, 0xffcf90, 5, 14], [-19.5, 3.4, 8, 0xffcf90, 5, 14], [0, -1.0, -38, 0x55e0ff, 0, 18], [25, 2.7, -30, 0xffc070, 0, 12]]) {
      const l = new THREE.PointLight(c, i, d, 1.6); l.position.set(x, y, z); scene.add(l);
      anchors.lights.push({ light: l, day: i, night: Math.max(i * 1.4, 7) });
    }
  }

  return {
    group, dyn, anchors,
    update(t) {
      for (const tv of anchors.tvs) if (tv.on) { drawChannel(tv.cv.getContext('2d'), tv.channel, t); tv.tex.needsUpdate = true; }
    },
    setNight(n) {
      M('lampGlow').emissiveIntensity = 1.0 + n * 2.2;
      for (const l of anchors.lights) l.light.intensity = THREE.MathUtils.lerp(l.day, l.night, n);
    },
    bulbs, discs,
  };
}

// ---------- TV channels (drawn into each room's 256×144 canvas) ----------
export const CHANNELS = ['Cricket Live', 'Bollywood Music', 'India News', 'Nature HD', 'Azure Bay TV'];
function drawChannel(g, ch, t) {
  const W = 256, H = 144;
  g.save();
  if (ch === 0) {            // cricket: green field, pitch, ball, scorecard
    g.fillStyle = '#2f8f3a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3aa346'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 18, W, 9);
    g.fillStyle = '#d9c38f'; g.fillRect(108, 20, 40, 100);
    g.fillStyle = '#fff'; g.fillRect(118, 26, 20, 2); g.fillRect(118, 112, 20, 2);
    const bx = 128 + Math.sin(t * 2.2) * 8, by = 30 + ((t * 70) % 85);
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(bx, by, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,40,0.85)'; g.fillRect(0, 118, W, 26);
    const runs = 186 + Math.floor(t / 7) % 60, balls = Math.floor(t / 3) % 6;
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif';
    g.fillText(`IND ${runs}/3  (32.${balls} ov)   vs AUS`, 8, 136);
    g.fillStyle = '#f1c40f'; g.fillText('LIVE', 214, 136);
  } else if (ch === 1) {     // music: colourful bars + song title
    const hue = (t * 30) % 360;
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, `hsl(${hue},70%,40%)`); gr.addColorStop(1, `hsl(${(hue + 120) % 360},70%,25%)`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) { const h = 20 + Math.abs(Math.sin(t * 6 + i * 0.7)) * 70; g.fillStyle = `hsla(${(hue + i * 20) % 360},90%,65%,0.9)`; g.fillRect(10 + i * 15, 112 - h, 10, h); }
    g.fillStyle = '#fff'; g.font = 'bold 15px sans-serif'; g.fillText('♪ Bollywood Hits — Non-stop', 10, 134);
  } else if (ch === 2) {     // news: studio, anchor silhouette, ticker
    g.fillStyle = '#12243f'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#1d3b66'; g.fillRect(150, 10, 96, 70);
    g.fillStyle = '#e8eef7'; g.font = 'bold 11px sans-serif'; g.fillText('MONSOON', 162, 40); g.fillText('UPDATE', 168, 56);
    g.fillStyle = '#c99a72'; g.beginPath(); g.arc(80, 52, 16, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(80, 46, 17, Math.PI, 0); g.fill();
    g.fillStyle = '#7a1f2b'; g.fillRect(56, 70, 48, 40);
    g.fillStyle = '#c0392b'; g.fillRect(0, 116, W, 28);
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif';
    g.fillText('INDIA NEWS · Sensex up 300 points · Goa tourism hits record high · Monsoon arrives in Kerala', W - ((t * 40) % 900), 135);
  } else if (ch === 3) {     // nature: sea, sun, flying birds
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#f6b36b'); gr.addColorStop(0.55, '#f08a5d'); gr.addColorStop(0.56, '#2a6f97'); gr.addColorStop(1, '#173f5f');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffe39a'; g.beginPath(); g.arc(128, 80, 22, Math.PI, 0); g.fill();
    g.strokeStyle = '#2b2b2b'; g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const x = (t * 20 + i * 60) % (W + 40) - 20, y = 30 + i * 8 + Math.sin(t * 3 + i) * 3; g.beginPath(); g.moveTo(x - 6, y); g.quadraticCurveTo(x - 3, y - 4, x, y); g.quadraticCurveTo(x + 3, y - 4, x + 6, y); g.stroke(); }
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.fillText('Nature HD · Konkan Coast', 8, 136);
  } else {                   // resort channel
    const h = (t * 20) % 360;
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, `hsl(${h},55%,40%)`); gr.addColorStop(1, `hsl(${(h + 80) % 360},55%,22%)`);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f3e3c0'; g.font = '600 26px Georgia, serif'; g.fillText('AZURE BAY', 58, 64);
    g.fillStyle = '#c0392b'; g.fillRect(0, 118, W, 26);
    g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif';
    g.fillText('Yoga on the beach 7 am · Bollywood night at the pool stage 8 pm · Try the mango lassi!', W - ((t * 40) % 820), 136);
  }
  g.restore();
}
