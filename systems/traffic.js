// systems/traffic.js — vehicles, airplane, boats, birds (guide: "Making the World Feel Alive").
// Cars follow lane paths at randomised speeds, keep distance from the car ahead,
// yield to anyone on the zebra crossing and respawn off-screen.
import * as THREE from 'three';
import { getMat } from '../scene/materials.js';
import { rand, pick } from './routes.js';

const CAR_COLORS = [0xd94f4f, 0x2f6fb5, 0xf2f2f2, 0x1d1d1f, 0xe8b84a, 0x3c8d5a, 0x9aa3ab, 0x7a3fa0, 0xff8a3d];
const carMats = new Map();
const carMat = (c) => { if (!carMats.has(c)) carMats.set(c, new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.6 })); return carMats.get(c); };

function buildCar(type) {
  const g = new THREE.Group();
  const body = carMat(pick(CAR_COLORS));
  const glass = new THREE.MeshStandardMaterial({ color: 0x1c2a33, roughness: 0.05, metalness: 0.9 });
  const dims = type === 'van' ? [4.8, 1.25, 1.9, 1.4, 3.6] : type === 'suv' ? [4.4, 0.95, 1.85, 0.8, 2.4] : [4.2, 0.7, 1.8, 0.62, 2.1];
  const [L, h, W, ch, cl] = dims;
  const b = new THREE.Mesh(new THREE.BoxGeometry(L, h, W), body); b.position.y = 0.35 + h / 2; g.add(b);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(cl, ch, W * 0.92), glass); cab.position.set(type === 'van' ? 0.4 : -0.2, 0.35 + h + ch / 2, 0); g.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(cl * 0.9, 0.06, W * 0.9), body); roof.position.set(cab.position.x, 0.35 + h + ch + 0.02, 0); g.add(roof);
  const wheelG = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14); wheelG.rotateX(Math.PI / 2);
  const wm = getMat('rubber');
  for (const [x, z] of [[L * 0.32, W / 2], [-L * 0.32, W / 2], [L * 0.32, -W / 2], [-L * 0.32, -W / 2]]) { const w = new THREE.Mesh(wheelG, wm); w.position.set(x, 0.34, z); g.add(w); }
  const lightM = getMat('lampGlow');
  for (const z of [-W * 0.35, W * 0.35]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.3), lightM); l.position.set(L / 2, 0.75, z); g.add(l); }
  const tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2222, emissiveIntensity: 0.6 });
  for (const z of [-W * 0.38, W * 0.38]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.25), tail); l.position.set(-L / 2, 0.8, z); g.add(l); }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData.len = L;
  return g;
}

export function createTraffic(scene, profile) {
  const group = new THREE.Group(); group.name = 'traffic'; scene.add(group);
  const lanes = [{ z: 40.6, dir: 1 }, { z: 45.4, dir: -1 }];
  const X0 = -160, X1 = 160;
  const cars = [];
  const perLane = profile.npcScale >= 1 ? 6 : 3;
  for (const lane of lanes) {
    for (let i = 0; i < perLane; i++) {
      const car = buildCar(pick(['sedan', 'sedan', 'suv', 'van']));
      car.rotation.y = lane.dir > 0 ? 0 : Math.PI;
      const c = { mesh: car, lane, x: X0 + (i + Math.random() * 0.5) * (X1 - X0) / perLane, v: 0, vmax: rand(8, 13) };
      car.position.set(c.x, 0, lane.z);
      group.add(car); cars.push(c);
    }
  }

  // airplane (every 60–90 s) — rhythm + randomness
  const plane = new THREE.Group();
  const pm = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4, metalness: 0.3 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 16, 12), pm); fus.rotation.z = Math.PI / 2; plane.add(fus);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 22), pm); plane.add(wing);
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 7), pm); tailW.position.x = -7; plane.add(tailW);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), new THREE.MeshStandardMaterial({ color: 0x2a9d8f })); fin.position.set(-7, 1.6, 0); plane.add(fin);
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 120, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, fog: false }));
  trail.rotation.z = Math.PI / 2; trail.position.x = -68; plane.add(trail);
  plane.visible = false; scene.add(plane);
  const planeState = { t: rand(8, 20), active: false, x: 0, z: 0, dir: 1, speed: 70 };

  // boats on the bay
  const boats = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: i === 1 ? 0x1d3557 : 0xf1faee, roughness: 0.5 }));
    hull.position.y = 0.3; b.add(hull);
    const sail = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 3), new THREE.MeshStandardMaterial({ color: 0xfefae0, side: THREE.DoubleSide }));
    sail.position.set(0.4, 4.4, 0); sail.scale.z = 0.08; b.add(sail);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8), getMat('lightWood')); mast.position.y = 4.2; b.add(mast);
    b.position.set(rand(-300, 300), -0.5, -130 - i * 70);
    scene.add(b);
    boats.push({ mesh: b, v: rand(3, 6) * (i % 2 ? -1 : 1), phase: Math.random() * 6 });
  }

  // seagulls
  const birds = [];
  const birdGeo = new THREE.BufferGeometry();
  birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 0, 0.9, 0.2, 0, 0, 0, 0, 0, -0.5, 0, -0.9, 0.2, 0, 0], 3));
  birdGeo.computeVertexNormals();
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x333a40, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(birdGeo.clone(), birdMat);
    scene.add(m);
    birds.push({ mesh: m, r: rand(25, 60), h: rand(14, 26), w: rand(0.12, 0.22) * (i % 2 ? 1 : -1), a: Math.random() * 6, cx: rand(-30, 30), cz: rand(-90, -50) });
  }

  return {
    group, cars,
    update(dt, t, walkers) {
      // anyone on the crossing?
      let crossingBusy = false;
      for (const w of walkers) if (w.x > -3.6 && w.x < 3.6 && w.z > 37.6 && w.z < 48.4) { crossingBusy = true; break; }
      for (const lane of lanes) {
        const lc = cars.filter((c) => c.lane === lane).sort((a, b) => (a.x - b.x) * lane.dir);
        for (let i = 0; i < lc.length; i++) {
          const c = lc[i];
          const ahead = lc[(i + 1) % lc.length];
          let gap = (ahead.x - c.x) * lane.dir; if (gap <= 0) gap += (X1 - X0);
          let target = c.vmax;
          if (gap < 14) target = Math.min(target, Math.max(0, (gap - 6.5) * 1.4));
          // yield at the zebra crossing (stop line 6 m before it)
          const stopX = lane.dir > 0 ? -4.2 - 2.4 : 4.2 + 2.4;
          const toStop = (stopX - c.x) * lane.dir;
          if (crossingBusy && toStop > -0.5 && toStop < 22) target = Math.min(target, Math.max(0, toStop * 0.9));
          // and for anyone standing on the road in front
          for (const w of walkers) {
            if (Math.abs(w.z - lane.z) < 2.2) { const d = (w.x - c.x) * lane.dir; if (d > 0 && d < 12) target = Math.min(target, Math.max(0, (d - 4) * 1.2)); }
          }
          c.v += THREE.MathUtils.clamp(target - c.v, -9 * dt, 3 * dt);
          c.x += c.v * dt * lane.dir;
          if (lane.dir > 0 && c.x > X1) { c.x = X0; c.vmax = rand(8, 13); }
          if (lane.dir < 0 && c.x < X0) { c.x = X1; c.vmax = rand(8, 13); }
          c.mesh.position.x = c.x;
          c.mesh.children.forEach((w) => { if (w.geometry?.type === 'CylinderGeometry') w.rotation.z -= c.v * dt / 0.34 * lane.dir; });
        }
      }
      // airplane
      const ps = planeState;
      if (!ps.active) {
        ps.t -= dt;
        if (ps.t <= 0) { ps.active = true; ps.dir = Math.random() < 0.5 ? 1 : -1; ps.x = -ps.dir * 700; ps.z = rand(-260, 80); ps.y = rand(85, 120); plane.visible = true; }
      } else {
        ps.x += ps.dir * ps.speed * dt;
        plane.position.set(ps.x, ps.y, ps.z);
        plane.rotation.y = ps.dir > 0 ? 0 : Math.PI;
        if (Math.abs(ps.x) > 720) { ps.active = false; plane.visible = false; ps.t = rand(60, 90); }
      }
      for (const b of boats) {
        b.mesh.position.x += b.v * dt;
        if (b.mesh.position.x > 420) b.mesh.position.x = -420; if (b.mesh.position.x < -420) b.mesh.position.x = 420;
        b.mesh.rotation.y = b.v > 0 ? 0 : Math.PI;
        b.mesh.position.y = -0.45 + Math.sin(t * 1.2 + b.phase) * 0.15;
        b.mesh.rotation.x = Math.sin(t * 0.9 + b.phase) * 0.05;
      }
      for (const b of birds) {
        b.a += b.w * dt;
        b.mesh.position.set(b.cx + Math.cos(b.a) * b.r, b.h + Math.sin(t * 0.7 + b.r) * 1.5, b.cz + Math.sin(b.a) * b.r);
        b.mesh.rotation.y = -b.a + (b.w > 0 ? 0 : Math.PI);
        const flap = Math.sin(t * 8 + b.r) * 0.5;
        const p = b.mesh.geometry.attributes.position;
        p.setY(1, flap); p.setY(4, flap); p.needsUpdate = true;
      }
    },
    setNight(n) { for (const c of cars) c.mesh.children.forEach((m) => { if (m.material?.emissive && m.material !== getMat('lampGlow')) m.material.emissiveIntensity = 0.6 + n * 1.5; }); },
  };
}
