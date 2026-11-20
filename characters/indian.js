// characters/indian.js — builds every person in Azure Bay from scratch, in traditional Indian dress.
//
// The X-Bot glTF supplies only its skeleton and animations. For each outfit we generate ONE
// smooth skinned mesh in code: body, face, hair, clothes and jewellery, with skin weights on
// the same Mixamo bones, so walking, sitting, waving and dancing bend the saree pleats, the
// kurta hem and the braid along with the body. Women use the same skeleton scaled to 1.65 m.
//
//   Face: sculpted skull and jaw, almond eyes with lids, kajal and a winged liner, arched brows,
//         a defined nose, shaped lips, blush; stubble, moustache or beard for men.
//   Hair: centre parting (with sindoor), bun with a jasmine gajra, long braid with a paranda,
//         open hair; men side-parted, or a Sikh pagri / Rajasthani safa.
//   Dress: saree with front pleats, zari border and pallu; lehenga choli; anarkali; salwar
//         kameez with dupatta; kurta pyjama (with side slits), Nehru jacket, sherwani,
//         dhoti-kurta; mojaris and juttis.
//   Jewellery: jhumkas, necklace, maang tikka, nath, bindi, bangles, payal, kada.
//
// Identical outfits share one geometry. Each person is 2 draw calls (cloth/skin + gold).
import * as THREE from 'three';

// ---------- palettes ----------
export const SKIN = { fair: 0xe2a27a, wheat: 0xcf8657, medium: 0xb56f43, dusky: 0x955738, deep: 0x744227 };
const GOLD = 0xe3b33f, HAIR = 0x15100d, JASMINE = 0xfffbef, SINDOOR = 0xc0141e, KAJAL = 0x0c0807;

/** Costume builders: everything a cast list needs to say. */
export const dress = {
  // women
  saree: (o = {}) => ({ sex: 'f', style: 'saree', main: 0xb0123a, border: GOLD, blouse: 0xe3b33f, hair: 'bun', jewel: 'full', bindi: true, ...o }),
  lehenga: (o = {}) => ({ sex: 'f', style: 'lehenga', main: 0xd81b60, second: 0xf8bbd0, border: GOLD, blouse: 0xd81b60, dupatta: 0xffd54f, hair: 'braid', jewel: 'bridal', bindi: true, ...o }),
  anarkali: (o = {}) => ({ sex: 'f', style: 'anarkali', main: 0x00796b, border: GOLD, bottom: 0xf5e6c8, dupatta: 0xf5e6c8, hair: 'open', jewel: 'full', bindi: true, ...o }),
  salwar: (o = {}) => ({ sex: 'f', style: 'salwar', main: 0x3949ab, border: GOLD, bottom: 0xf3e5d0, dupatta: 0xf3e5d0, hair: 'braid', jewel: 'light', bindi: true, ...o }),
  swimF: (o = {}) => ({ sex: 'f', style: 'swim', main: 0x00838f, hair: 'bun', jewel: 'none', shoes: null, ...o }),
  // men
  kurta: (o = {}) => ({ sex: 'm', style: 'kurta', main: 0xf2ead8, bottom: 0xf7f3ea, shoes: 0x7a3b1e, ...o }),
  sherwani: (o = {}) => ({ sex: 'm', style: 'sherwani', main: 0xf1dfb8, border: GOLD, bottom: 0xf6efe1, shoes: 0xa0522d, safa: 0xd84315, ...o }),
  dhoti: (o = {}) => ({ sex: 'm', style: 'dhoti', main: 0xf4ecd8, bottom: 0xfbf8f0, border: GOLD, shoes: 0x6d3b1f, ...o }),
  chef: (o = {}) => ({ sex: 'm', style: 'chef', main: 0xfbfbf8, bottom: 0x26272b, shoes: 0x161616, cap: 'chef', ...o }),
  guard: (o = {}) => ({ sex: 'm', style: 'guard', main: 0x2f4468, bottom: 0x2a3550, shoes: 0x111111, ...o }),
  tee: (o = {}) => ({ sex: 'm', style: 'tee', main: 0xd32f2f, bottom: 0x1f2a44, shoes: null, ...o }),
  swim: (o = {}) => ({ sex: 'm', style: 'swim', bottom: 0x1565c0, shoes: null, ...o }),
};

// ---------- materials (shared by everyone) ----------
let MATS = null;
function materials() {
  return (MATS ||= [
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.66, metalness: 0, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.75, side: THREE.DoubleSide, envMapIntensity: 1.2 }),
  ]);
}

const colorCache = new Map();
const C = (v) => { if (v?.isColor) return v; let c = colorCache.get(v); if (!c) { c = new THREE.Color(v); colorCache.set(v, c); } return c; };
const shade = (hex, k) => C(hex).clone().multiplyScalar(k);
const mixC = (a, b, t) => C(a).clone().lerp(C(b), t);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// =====================================================================
// Geometry builder: positions, colours and skin weights in the body frame
// (origin between the hips, +X = character's left, +Y up, +Z forward).
// =====================================================================
class Builder {
  constructor(boneIndex) { this.bi = boneIndex; this.P = []; this.Cl = []; this.SI = []; this.SW = []; this.I = [[], []]; this.g = 0; }
  vert(p, col, w) {
    const e = Object.entries(w).filter(([n, x]) => this.bi[n] !== undefined && x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0; for (const [, x] of e) s += x;
    const i = this.P.length / 3;
    this.P.push(p.x, p.y, p.z);
    const c = C(col); this.Cl.push(c.r, c.g, c.b);
    for (let k = 0; k < 4; k++) { this.SI.push(e[k] ? this.bi[e[k][0]] : 0); this.SW.push(e[k] ? e[k][1] / (s || 1) : 0); }
    return i;
  }
  tri(a, b, c) { this.I[this.g].push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  /** grid of rings → faces (rings closed around); skip(k, j) leaves holes (slits). */
  stitch(rings, segs, skip) {
    for (let k = 0; k < rings.length - 1; k++) for (let j = 0; j < segs; j++) {
      if (skip && skip(k, j)) continue;
      const j2 = (j + 1) % segs;
      this.quad(rings[k][j], rings[k][j2], rings[k + 1][j2], rings[k + 1][j]);
    }
  }
  cap(ring, centre, col, w) {
    const c = this.vert(centre, col, w);
    for (let j = 0; j < ring.length; j++) this.tri(c, ring[j], ring[(j + 1) % ring.length]);
  }
  /**
   * Vertical column of horizontal ellipses (torso, skirts, hems).
   * rings: [{ y, rx, rzF, rzB, cx, cz }]; col(a, p, k, f), w(a, p, k, f), disp(a, k, f) → extra radius
   */
  column(rings, segs, { col, w, disp, skip, capTop, capBottom } = {}) {
    const out = [];
    rings.forEach((r, k) => {
      const f = k / (rings.length - 1), ring = [];
      for (let j = 0; j < segs; j++) {
        const a = (j / segs) * Math.PI * 2, s = Math.sin(a), cA = Math.cos(a);
        const d = disp ? disp(a, k, f, r) : 0;
        const p = V((r.cx || 0) + (r.rx + d) * cA, r.y, (r.cz || 0) + ((s > 0 ? r.rzF : r.rzB) + d) * s);
        ring.push(this.vert(p, col(a, p, k, f), w(a, p, k, f)));
      }
      out.push(ring);
    });
    this.stitch(out, segs, skip);
    if (capBottom) { const r = rings[0], c = V(r.cx || 0, r.y, r.cz || 0); this.cap(out[0], c, col(Math.PI / 2, c, 0, 0), w(0, c, 0, 0)); }
    if (capTop) { const r = rings[rings.length - 1], n = rings.length - 1, c = V(r.cx || 0, r.y, r.cz || 0); this.cap(out[n], c, col(Math.PI / 2, c, n, 1), w(0, c, n, 1)); }
    return out;
  }
  /**
   * Tube along a polyline (limbs, fingers, chains). pts: [{ p, r1, r2, w, col? }]
   * r1 runs across the limb sideways, r2 front-to-back. Rings interpolated `sub` times per segment.
   */
  tube(pts, segs, { sub = 4, col, capEnd = true, capStart = false } = {}) {
    const rings = [], cen = [];
    const ref = new THREE.Vector3();
    for (let k = 0; k < pts.length - 1; k++) {
      const A = pts[k], B = pts[k + 1];
      for (let q = 0; q < sub || (k === pts.length - 2 && q === sub); q++) {
        const t = q / sub, p = A.p.clone().lerp(B.p, t);
        const r1 = A.r1 + (B.r1 - A.r1) * t, r2 = A.r2 + (B.r2 - A.r2) * t;
        const w = {}; for (const [n, x] of Object.entries(A.w)) w[n] = (w[n] || 0) + x * (1 - t); for (const [n, x] of Object.entries(B.w)) w[n] = (w[n] || 0) + x * t;
        const tan = B.p.clone().sub(A.p).normalize();
        ref.set(0, 0, 1); if (Math.abs(tan.dot(ref)) > 0.85) ref.set(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(tan, ref).normalize(), fwd = new THREE.Vector3().crossVectors(side, tan).normalize();
        const u = (k + t) / (pts.length - 1), ring = [];
        for (let j = 0; j < segs; j++) {
          const a = (j / segs) * Math.PI * 2;
          const v = p.clone().addScaledVector(side, Math.cos(a) * r1).addScaledVector(fwd, Math.sin(a) * r2);
          ring.push(this.vert(v, col ? col(u, a, v) : A.col, w));
        }
        rings.push(ring); cen.push({ p, w });
      }
    }
    this.stitch(rings, segs);
    const last = cen[cen.length - 1], first = cen[0];
    if (capEnd) this.cap(rings[rings.length - 1], last.p, col ? col(1, 0, last.p) : pts[pts.length - 1].col, last.w);
    if (capStart) this.cap(rings[0], first.p, col ? col(0, 0, first.p) : pts[0].col, first.w);
  }
  /** Smooth tube along a curve with a radius profile (brows, kajal, moustache, chains). */
  curve(points, rad, colr, w, { segs = 6, n = 14 } = {}) {
    const cv = new THREE.CatmullRomCurve3(points);
    const pts = [];
    for (let i = 0; i <= n; i++) { const u = i / n; pts.push({ p: cv.getPoint(u), r1: typeof rad === 'function' ? rad(u) : rad, r2: typeof rad === 'function' ? rad(u) : rad, w, col: colr }); }
    this.tube(pts, segs, { sub: 1, capStart: true });
  }
  /** Ellipsoid (optionally deformed / masked / partial) — heads, eyes, buns, buttons. */
  ellipsoid(c, r, { col, w, rot = null, deform = null, mask = null, segW = 14, segH = 10, theta = [0, Math.PI] } = {}) {
    const q = rot ? new THREE.Quaternion().setFromEuler(rot) : null;
    const grid = [];
    for (let i = 0; i <= segH; i++) {
      const th = theta[0] + (theta[1] - theta[0]) * (i / segH), row = [];
      for (let j = 0; j < segW; j++) {
        const ph = (j / segW) * Math.PI * 2;
        const u = V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        const p = deform ? deform(u.clone()) : V(u.x * r[0], u.y * r[1], u.z * r[2]);
        if (q) p.applyQuaternion(q);
        p.add(c);
        row.push({ i: this.vert(p, typeof col === 'function' ? col(u, p) : col, typeof w === 'function' ? w(u, p) : w), u });
      }
      grid.push(row);
    }
    for (let i = 0; i < segH; i++) for (let j = 0; j < segW; j++) {
      const j2 = (j + 1) % segW, A = grid[i][j], B = grid[i][j2], Cc = grid[i + 1][j2], D = grid[i + 1][j];
      if (mask && !(mask(A.u) && mask(B.u) && mask(Cc.u) && mask(D.u))) continue;
      this.quad(A.i, B.i, Cc.i, D.i);
    }
  }
  torus(c, axis, R, r, { col, w, segs = 20, tubeSegs = 6, squash = 1 } = {}) {
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), axis.clone().normalize());
    const rings = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2, ring = [];
      for (let j = 0; j < tubeSegs; j++) {
        const bb = (j / tubeSegs) * Math.PI * 2;
        const p = V((R + r * Math.cos(bb)) * Math.cos(a), (R + r * Math.cos(bb)) * Math.sin(a) * squash, r * Math.sin(bb)).applyQuaternion(q).add(c);
        ring.push(this.vert(p, col, w));
      }
      rings.push(ring);
    }
    rings.push(rings[0]);
    this.stitch(rings, tubeSegs);
  }
  /** Flat drape following a path over the body (pallu, dupatta, safa tail, open hair). */
  ribbon(points, width, { centre, col, w, n = 40, flare = 0, up = null }) {
    const cv = new THREE.CatmullRomCurve3(points), rows = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, p = cv.getPoint(u), t = cv.getTangent(u);
      const nrm = centre.top != null
        ? V(p.x - Math.sign(p.x) * Math.min(Math.abs(p.x), centre.sx ?? 0.06), p.y - Math.min(p.y, centre.top), p.z - centre.z).normalize()
        : V(p.x - centre.x, 0, p.z - centre.z).normalize();
      if (up && up(u) > 0 && centre.top == null) nrm.lerp(V(0, 1, 0), up(u)).normalize();
      const s = new THREE.Vector3().crossVectors(t, nrm).normalize();
      const half = (width + flare * u) / 2, row = [];
      for (let k = 0; k <= 4; k++) {
        const v = k / 4, q = p.clone().addScaledVector(s, (v - 0.5) * 2 * half).addScaledVector(nrm, 0.004);
        row.push(this.vert(q, col(u, v), w(u, q)));
      }
      rows.push(row);
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) this.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
  }
  build(toChar) {
    const g = new THREE.BufferGeometry();
    const P = new Float32Array(this.P), v = new THREE.Vector3();
    for (let i = 0; i < P.length; i += 3) { v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(toChar); P[i] = v.x; P[i + 1] = v.y; P[i + 2] = v.z; }
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.Cl, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.SI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.SW, 4));
    g.setIndex([...this.I[0], ...this.I[1]]);
    g.addGroup(0, this.I[0].length, 0); g.addGroup(this.I[0].length, this.I[1].length, 1);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// =====================================================================
// The person
// =====================================================================
function buildPerson(o, bones, boneIndex) {
  const F = o.sex === 'f';
  const b = new Builder(boneIndex);
  const B = (n) => bones[n];
  const skin = C(SKIN[o.skin] ?? o.skin ?? SKIN.wheat);
  const skinD = skin.clone().multiplyScalar(0.86);
  const hairC = o.grey ? 0x9a948e : (o.hairColor ?? HAIR);
  const st = o.style;
  const gold = (fn) => { const g = b.g; b.g = 1; fn(); b.g = g; };

  const Hp = B('Hips'), Sp = B('Spine'), S1 = B('Spine1'), S2 = B('Spine2'), Nk = B('Neck'), Hd = B('Head');
  const A = B('LeftArm').y, UL = B('LeftUpLeg').y, ground = Math.min(B('LeftToeBase').y, B('RightToeBase').y);
  const waistY = S1.y - 0.02, Lk = B('LeftLeg').y;

  // spine centre line (z) and skin weights for any height
  const spineZ = (y) => {
    const pts = [[UL - 0.1, Hp.z], [Hp.y, Hp.z], [Sp.y, Sp.z], [S1.y, S1.z], [S2.y, S2.z], [Nk.y, Nk.z], [Hd.y, Hd.z]];
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) if (y <= pts[i + 1][0]) { const t = (y - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; }
    return pts[pts.length - 1][1];
  };
  const spineW = (y) => {
    const pts = [[UL - 0.05, 'Hips'], [Hp.y, 'Hips'], [Sp.y, 'Spine'], [S1.y, 'Spine1'], [S2.y, 'Spine2'], [A + 0.02, 'Spine2'], [Nk.y + 0.01, 'Neck'], [Hd.y, 'Head']];
    if (y <= pts[0][0]) return { Hips: 1 };
    for (let i = 0; i < pts.length - 1; i++) if (y <= pts[i + 1][0]) {
      const t = smooth(pts[i][0], pts[i + 1][0], y), w = {};
      w[pts[i][1]] = (w[pts[i][1]] || 0) + 1 - t; w[pts[i + 1][1]] = (w[pts[i + 1][1]] || 0) + t;
      return w;
    }
    return { Head: 1 };
  };

  // ---------- torso profile: [y, half-width, front depth, back depth] ----------
  const prof = F ? [
    [UL - 0.075, 0.06, 0.05, 0.06], [UL - 0.035, 0.15, 0.1, 0.115], [Hp.y, 0.183, 0.105, 0.138], [Sp.y, 0.158, 0.095, 0.108],
    [waistY, 0.13, 0.086, 0.09], [S2.y - 0.01, 0.142, 0.105, 0.094], [S2.y + 0.04, 0.152, 0.136, 0.094], [A - 0.015, 0.15, 0.098, 0.088],
    [A + 0.022, 0.126, 0.076, 0.07], [Nk.y - 0.005, 0.07, 0.054, 0.056], [Nk.y + 0.015, 0.047, 0.045, 0.046],
  ] : [
    [UL - 0.075, 0.06, 0.05, 0.06], [UL - 0.035, 0.14, 0.095, 0.1], [Hp.y, 0.164, 0.1, 0.115], [Sp.y, 0.156, 0.1, 0.1],
    [waistY, 0.152, 0.104, 0.098], [S2.y, 0.168, 0.116, 0.1], [S2.y + 0.05, 0.175, 0.12, 0.098], [A, 0.162, 0.1, 0.09],
    [A + 0.03, 0.134, 0.08, 0.075], [Nk.y, 0.074, 0.06, 0.06], [Nk.y + 0.02, 0.054, 0.052, 0.052],
  ];
  const torsoAt = (y) => {
    if (y <= prof[0][0]) return prof[0];
    for (let i = 0; i < prof.length - 1; i++) if (y <= prof[i + 1][0]) { const t = (y - prof[i][0]) / (prof[i + 1][0] - prof[i][0]); return prof[i].map((v, k) => v + (prof[i + 1][k] - v) * t); }
    return prof[prof.length - 1];
  };
  const bustK = (a) => { const d = a - Math.PI / 2; return Math.exp(-(((d - 0.5) / 0.3) ** 2)) + Math.exp(-(((d + 0.5) / 0.3) ** 2)); };

  // ---------- garment colouring of the torso ----------
  const scoop = (x, front) => (front ? A - 0.06 + 7 * x * x : A - 0.035 + 5 * x * x);  // neckline height
  function torsoColour(a, p) {
    const front = Math.sin(a) > 0, x = p.x, y = p.y;
    if (st === 'saree' || st === 'lehenga') {
      if (y < waistY - 0.03) return o.main;
      if (y < S2.y - 0.035) return skin;                                   // midriff
      if (y > scoop(x, front)) return skin;
      if (y > scoop(x, front) - 0.008) return o.border;                    // neckline trim
      if (y < S2.y - 0.022) return o.border;                               // blouse hem trim
      return o.blouse;
    }
    if (st === 'anarkali' || st === 'salwar') {
      if (y > scoop(x, front) + 0.02) return skin;
      if (y > scoop(x, front) + 0.008) return o.border;
      if (front && Math.abs(x) < 0.055 && y > S2.y + 0.02 && Math.round(y * 160) % 4 === 0) return o.border; // yoke embroidery
      return o.main;
    }
    if (st === 'swim') {
      if (F) return y > scoop(x, front) + 0.02 || y < UL - 0.06 ? (y < UL - 0.06 ? o.main : skin) : o.main;
      return y < Hp.y + 0.04 ? o.bottom : skin;
    }
    if (st === 'tee') return y < Hp.y + 0.02 ? o.bottom : y > A + 0.045 ? skin : o.main;
    // men: kurta / sherwani / chef / guard / dhoti
    if (y > A + 0.04 && Math.abs(x) < 0.07 && !['kurta', 'sherwani', 'dhoti', 'chef', 'guard'].includes(st)) return skin;   // collared garments cover the neckline
    if (st === 'guard') {
      if (Math.abs(y - (Hp.y + 0.05)) < 0.018) return 0x1b1b1b;            // belt
      if (y < Hp.y + 0.03) return o.bottom;
      if (front && Math.abs(Math.abs(x) - 0.07) < 0.035 && y > S2.y + 0.01 && y < S2.y + 0.07) return shade(o.main, 0.82); // pockets
      return o.main;
    }
    if (o.vest != null && y > Hp.y - 0.04) return o.vest;
    if (front && Math.abs(x) < 0.009 && y > S2.y - 0.02) return o.border ?? shade(o.main, 0.85);     // placket
    return o.main;
  }

  // ---------- TORSO ----------
  const tRings = [];
  for (let i = 0; i < prof.length - 1; i++) for (let q = 0; q < 3; q++) {
    const y = prof[i][0] + (prof[i + 1][0] - prof[i][0]) * (q / 3);
    const [, rx, rzF, rzB] = torsoAt(y);
    tRings.push({ y, rx, rzF, rzB, cz: spineZ(y) });
  }
  { const L = prof[prof.length - 1]; tRings.push({ y: L[0], rx: L[1], rzF: L[2], rzB: L[3], cz: spineZ(L[0]) }); }
  b.column(tRings, 28, {
    capBottom: true,
    col: (a, p) => torsoColour(a, p),
    w: (a, p) => {
      const w = spineW(p.y), ax = Math.abs(p.x);
      if (p.y > S2.y + 0.03 && ax > 0.09) { const k = Math.min(0.6, (ax - 0.09) / 0.06); for (const n in w) w[n] *= 1 - k; w[p.x > 0 ? 'LeftShoulder' : 'RightShoulder'] = k * 0.7; w[p.x > 0 ? 'LeftArm' : 'RightArm'] = k * 0.3; }
      if (p.y < UL && ax > 0.03) { const k = Math.min(0.5, (UL - p.y) / 0.06) * Math.min(1, ax / 0.08); for (const n in w) w[n] *= 1 - k; w[p.x > 0 ? 'LeftUpLeg' : 'RightUpLeg'] = k; }
      return w;
    },
    disp: (a, k) => (F && Math.abs(tRings[k].y - (S2.y + 0.04)) < 0.05 && Math.sin(a) > 0 ? 0.022 * bustK(a) * (1 - Math.abs(tRings[k].y - (S2.y + 0.04)) / 0.05) : 0),
  });

  // ---------- NECK ----------
  const nR = F ? 0.043 : 0.052;
  b.tube([
    { p: V(0, Nk.y - 0.01, spineZ(Nk.y)), r1: nR * 1.08, r2: nR * 1.05, w: { Neck: 0.8, Spine2: 0.2 }, col: skin },
    { p: V(0, Hd.y + 0.02, Hd.z + 0.005), r1: nR, r2: nR, w: { Neck: 0.4, Head: 0.6 }, col: skin },
    { p: V(0, Hd.y + 0.05, Hd.z + 0.01), r1: nR * 0.9, r2: nR * 0.9, w: { Head: 1 }, col: skin },
  ], 16, { sub: 3, capEnd: false });

  // ---------- ARMS + HANDS ----------
  for (const s of ['Left', 'Right']) {
    const Sh = B(s + 'Shoulder'), Ar = B(s + 'Arm'), Fa = B(s + 'ForeArm'), Ha = B(s + 'Hand');
    const k = F ? 0.84 : 1;
    const sleeve = { saree: 0.26, lehenga: 0.26, anarkali: 0.94, salwar: 0.62, kurta: 0.95, sherwani: 0.96, dhoti: 0.95, chef: 0.9, guard: 0.38, tee: 0.3, swim: 0 }[st] ?? 0.9;
    const sleeveC = st === 'saree' || st === 'lehenga' ? o.blouse : o.main;
    const loose = ['kurta', 'dhoti', 'salwar'].includes(st) ? 1.12 : 1;
    const armCol = (u) => (u < sleeve - 0.035 ? sleeveC : u < sleeve ? (o.border ?? shade(sleeveC, 0.85)) : skin);
    b.tube([
      { p: Sh.clone().lerp(Ar, 0.35), r1: 0.058 * k, r2: 0.058 * k, w: { [s + 'Shoulder']: 0.6, [s + 'Arm']: 0.4 } },
      { p: Ar, r1: 0.054 * k, r2: 0.056 * k, w: { [s + 'Arm']: 0.85, [s + 'Shoulder']: 0.15 } },
      { p: Ar.clone().lerp(Fa, 0.45), r1: 0.047 * k * loose, r2: 0.05 * k * loose, w: { [s + 'Arm']: 1 } },
      { p: Fa, r1: 0.036 * k * loose, r2: 0.039 * k * loose, w: { [s + 'Arm']: 0.5, [s + 'ForeArm']: 0.5 } },
      { p: Fa.clone().lerp(Ha, 0.4), r1: 0.035 * k * loose, r2: 0.038 * k * loose, w: { [s + 'ForeArm']: 1 } },
      { p: Ha.clone().lerp(Fa, 0.04), r1: 0.026 * k, r2: 0.03 * k, w: { [s + 'ForeArm']: 0.6, [s + 'Hand']: 0.4 } },
    ], 14, { sub: 4, col: (u) => armCol(u), capEnd: false });

    // hand: a flat palm with fingers, and a thumb
    const M1 = B(s + 'HandMiddle1'), M2 = B(s + 'HandMiddle2'), M3 = B(s + 'HandMiddle3');
    const tip = M3.clone().addScaledVector(M3.clone().sub(M2).normalize(), 0.026);
    const hk = F ? 0.88 : 1;
    const hand = o.mehndi ? mixC(skin, 0x9c3d12, 0.45) : skin;
    b.tube([
      { p: Ha.clone().lerp(Fa, 0.02), r1: 0.016 * hk, r2: 0.03 * hk, w: { [s + 'Hand']: 1 } },
      { p: Ha.clone().lerp(M1, 0.5), r1: 0.016 * hk, r2: 0.042 * hk, w: { [s + 'Hand']: 1 } },
      { p: M1, r1: 0.013 * hk, r2: 0.04 * hk, w: { [s + 'Hand']: 0.5, [s + 'HandMiddle1']: 0.5 } },
      { p: M2, r1: 0.011 * hk, r2: 0.034 * hk, w: { [s + 'HandMiddle1']: 0.5, [s + 'HandMiddle2']: 0.5 } },
      { p: M3, r1: 0.0095 * hk, r2: 0.03 * hk, w: { [s + 'HandMiddle2']: 0.5, [s + 'HandMiddle3']: 0.5 } },
      { p: tip, r1: 0.008 * hk, r2: 0.02 * hk, w: { [s + 'HandMiddle3']: 1 } },
    ], 10, { sub: 2, col: (u) => (u > 0.35 ? hand : skin) });
    const T1 = B(s + 'HandThumb1'), T2 = B(s + 'HandThumb2'), T3 = B(s + 'HandThumb3');
    b.tube([
      { p: T1.clone().lerp(Ha, 0.3), r1: 0.012 * hk, r2: 0.013 * hk, w: { [s + 'Hand']: 0.6, [s + 'HandThumb1']: 0.4 } },
      { p: T2, r1: 0.0105 * hk, r2: 0.011 * hk, w: { [s + 'HandThumb1']: 0.5, [s + 'HandThumb2']: 0.5 } },
      { p: T3, r1: 0.0095 * hk, r2: 0.0095 * hk, w: { [s + 'HandThumb2']: 0.5, [s + 'HandThumb3']: 0.5 } },
      { p: T3.clone().addScaledVector(T3.clone().sub(T2).normalize(), 0.018), r1: 0.007, r2: 0.007, w: { [s + 'HandThumb3']: 1 } },
    ], 8, { sub: 2, col: () => hand });

    // bangles (women), a kada (Sikh men) or a watch
    const axis = Ha.clone().sub(Fa).normalize();
    if (F && o.jewel !== 'none') gold(() => {
      const cols = o.jewel === 'bridal' ? [0xb71c1c, GOLD, 0xb71c1c, GOLD, 0xb71c1c, GOLD] : [GOLD, o.bangle ?? 0xc62828, GOLD];
      cols.forEach((c, i) => b.torus(Ha.clone().addScaledVector(axis, -0.028 - i * 0.0072), axis, 0.03 * hk, 0.0028, { col: c, w: { [s + 'ForeArm']: 0.7, [s + 'Hand']: 0.3 }, segs: 18, tubeSegs: 5 }));
    });
    if (!F && o.kada && s === 'Right') gold(() => b.torus(Ha.clone().addScaledVector(axis, -0.035), axis, 0.035, 0.004, { col: 0xd0d0d0, w: { [s + 'ForeArm']: 1 }, segs: 18, tubeSegs: 5 }));
    if (!F && o.watch && s === 'Left') b.torus(Ha.clone().addScaledVector(axis, -0.035), axis, 0.033, 0.006, { col: 0x2a2a2a, w: { [s + 'ForeArm']: 1 }, segs: 16, tubeSegs: 4 });
  }

  // ---------- LEGS + FEET ----------
  const legStyle = {
    saree: { col: o.main, r: 1 }, lehenga: { col: o.main, r: 1 }, anarkali: { col: o.bottom, r: 0.92, gather: true }, salwar: { col: o.bottom, r: 1.25, gather: true },
    kurta: { col: o.bottom, r: 1.12 }, sherwani: { col: o.bottom, r: 0.95, gather: true }, dhoti: { col: o.bottom, r: 1.45 }, chef: { col: o.bottom, r: 1.12 },
    guard: { col: o.bottom, r: 1.1 }, tee: { col: o.bottom, r: 1.15, shorts: 0.48 }, swim: { col: F ? o.main : o.bottom, r: 1.0, shorts: F ? 0.12 : 0.22 },
  }[st] || { col: o.bottom, r: 1 };
  const shoe = 'shoes' in o ? o.shoes : (F ? (o.jutti ?? 0xa31545) : null);
  for (const s of ['Left', 'Right']) {
    const sx = s === 'Left' ? 1 : -1;
    const Ul = B(s + 'UpLeg'), Lg = B(s + 'Leg'), Ft = B(s + 'Foot'), Tb = B(s + 'ToeBase'), Te = B(s + 'Toe_End');
    const k = F ? 0.98 : 1, R = legStyle.r;
    const legCol = (u, a, v) => {
      if (legStyle.shorts != null && u > legStyle.shorts) return skin;
      if (st === 'dhoti' && Math.sin(a) > 0.7 && Math.round(v.y * 40) % 2 === 0) return shade(o.bottom, 0.9);
      return legStyle.col;
    };
    b.tube([
      { p: Ul.clone().add(V(-sx * 0.012, 0.04, 0)), r1: 0.095 * k * Math.max(1, R * 0.9), r2: 0.098 * k, w: { Hips: 0.5, [s + 'UpLeg']: 0.5 } },
      { p: Ul.clone().lerp(Lg, 0.35), r1: 0.084 * k * R, r2: 0.088 * k * R, w: { [s + 'UpLeg']: 1 } },
      { p: Lg.clone().add(V(0, 0.03, 0)), r1: 0.056 * k * R, r2: 0.06 * k * R, w: { [s + 'UpLeg']: 0.6, [s + 'Leg']: 0.4 } },
      { p: Lg.clone().lerp(Ft, 0.3), r1: 0.056 * k * R, r2: 0.062 * k * R, w: { [s + 'Leg']: 1 } },
      { p: Lg.clone().lerp(Ft, 0.8), r1: 0.038 * k * (legStyle.gather ? 1 : R), r2: 0.04 * k * (legStyle.gather ? 1 : R), w: { [s + 'Leg']: 1 } },
      { p: Ft.clone().add(V(0, 0.015, 0)), r1: 0.034 * k * (legStyle.gather ? 0.95 : Math.min(R, 1.3)), r2: 0.036 * k, w: { [s + 'Leg']: 0.5, [s + 'Foot']: 0.5 } },
    ], 16, { sub: 4, col: legCol, capEnd: false });
    // foot: mojari / jutti (pointed tip) or bare
    const footC = shoe ?? skin;
    const fwd = Te.clone().sub(Ft).setY(0).normalize();
    const fk = F ? 0.9 : 1;
    const footPts = [
      { p: V(Ft.x, ground + 0.035, Ft.z).addScaledVector(fwd, -0.045), r1: 0.032 * fk, r2: 0.034, w: { [s + 'Foot']: 1 } },
      { p: V(Ft.x, ground + 0.045, Ft.z).addScaledVector(fwd, 0.02), r1: 0.04 * fk, r2: 0.04, w: { [s + 'Foot']: 1 } },
      { p: V(Tb.x, ground + 0.026, Tb.z), r1: 0.045 * fk, r2: 0.024, w: { [s + 'Foot']: 0.4, [s + 'ToeBase']: 0.6 } },
      { p: V(Te.x, ground + 0.018, Te.z).addScaledVector(fwd, 0.005), r1: 0.033 * fk, r2: 0.016, w: { [s + 'ToeBase']: 1 } },
    ];
    const pointed = shoe != null && (F || ['sherwani', 'kurta', 'dhoti'].includes(st));
    if (pointed) footPts.push({ p: V(Te.x, ground + 0.034, Te.z).addScaledVector(fwd, 0.04), r1: 0.006, r2: 0.006, w: { [s + 'ToeBase']: 1 } });
    b.tube(footPts, 12, { sub: 3, capStart: true, col: (u) => (pointed && u > 0.2 && u < 0.72 ? mixC(footC, GOLD, 0.4) : footC) });
    if (F && o.payal) gold(() => b.torus(Ft.clone().add(V(0, 0.01, 0)), V(0, 1, 0), 0.04, 0.003, { col: 0xd8d8d8, w: { [s + 'Leg']: 0.5, [s + 'Foot']: 0.5 }, segs: 18, tubeSegs: 5 }));
  }

  // ---------- SKIRTS, HEMS, DRAPES ----------
  // weights: the waist rides on the hips; lower down each side follows its own leg
  // (thigh above the knee, shin below), so skirts swing when walking and fold when sitting.
  const skirtW = (a, p) => {
    const below = smooth(UL - 0.02, UL - 0.18, p.y);
    const left = Math.min(1, Math.max(0, 0.5 + p.x / 0.16));
    const knee = smooth(Lk + 0.12, Lk - 0.15, p.y);
    return {
      Hips: 1 - below,
      LeftUpLeg: below * left * (1 - knee), RightUpLeg: below * (1 - left) * (1 - knee),
      LeftLeg: below * left * knee, RightLeg: below * (1 - left) * knee,
    };
  };
  const skirt = (topY, botY, rTop, rBot, { segs = 44, pleats = 0, border = o.border, borderH = 0.06, motif = null, panels = 0, panelC = null, slits = 0, col = o.main, flareF = 1 }) => {
    const n = 16, rings = [];
    for (let k = 0; k <= n; k++) {
      const f = k / n, y = topY + (botY - topY) * f, base = torsoAt(Math.max(y, prof[1][0])), tt = Math.pow(f, flareF);
      rings.push({
        y, cz: spineZ(Math.max(y, UL)) * (1 - f),
        rx: Math.max(base[1] + 0.01, rTop[0] + (rBot[0] - rTop[0]) * tt),
        rzF: Math.max(base[2] + 0.012, rTop[1] + (rBot[1] - rTop[1]) * tt),
        rzB: Math.max(base[3] + 0.012, rTop[2] + (rBot[2] - rTop[2]) * tt),
      });
    }
    const front = (a) => Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2));
    b.column(rings, segs, {
      w: skirtW,
      col: (a, p, k, f) => {
        const up = p.y - botY;
        if (border != null && up < borderH) return up < borderH * 0.18 ? shade(border, 0.78) : (up > borderH * 0.55 && up < borderH * 0.68 ? shade(col, 0.7) : border);
        if (border != null && up < borderH + 0.01) return shade(col, 0.62);
        const dA = front(a), seg = Math.floor((a / (Math.PI * 2)) * segs);
        if (pleats && Math.abs(dA) < 0.42 && f > 0.06) return Math.sin(dA * pleats * 2.4) > 0 ? col : shade(col, 0.78);
        if (panels && panelC != null && Math.floor((a / (Math.PI * 2)) * panels) % 2 === 1) return panelC;
        if (motif && f > 0.5 && f < 0.56) return mixC(col, motif, 0.55);   // a fine zari band above the border
        return col;
      },
      disp: (a, k, f) => {
        const dA = front(a);
        let d = 0;
        if (pleats && Math.abs(dA) < 0.42) d += Math.abs(Math.sin(dA * pleats * 2.4)) * 0.011 * f;
        if (panels) d += Math.abs(Math.sin((a * panels) / 2)) * 0.012 * f;
        return d;
      },
      skip: slits ? (k, j) => { const a = ((j + 0.5) / segs) * Math.PI * 2; return k / n > slits && Math.abs(Math.cos(a)) > 0.965; } : null,
    });
  };

  const sole = ground + 0.012;
  if (st === 'saree') skirt(waistY - 0.02, sole + 0.01, [0.14, 0.098, 0.1], [0.205, 0.17, 0.17], { pleats: 7, borderH: 0.075, motif: GOLD, flareF: 0.8 });
  else if (st === 'lehenga') skirt(waistY - 0.02, sole + 0.008, [0.14, 0.098, 0.1], [0.31, 0.28, 0.28], { borderH: 0.12, panels: 16, panelC: o.second, motif: GOLD, flareF: 0.75 });
  else if (st === 'anarkali') skirt(S2.y - 0.035, Lk - 0.2, [0.135, 0.1, 0.1], [0.26, 0.23, 0.23], { borderH: 0.075, panels: 20, panelC: shade(o.main, 0.86), motif: GOLD, flareF: 0.8 });
  else if (st === 'salwar') skirt(waistY, Lk, [0.15, 0.1, 0.1], [0.19, 0.15, 0.16], { borderH: 0.05, motif: GOLD, slits: 0.45 });
  else if (st === 'kurta' || st === 'dhoti') skirt(waistY, st === 'dhoti' ? Lk + 0.12 : Lk + 0.04, [0.16, 0.11, 0.105], [0.2, 0.16, 0.16], { border: o.border ?? null, borderH: 0.03, slits: 0.45, col: o.main });
  else if (st === 'sherwani') skirt(waistY, Lk - 0.08, [0.16, 0.11, 0.105], [0.21, 0.17, 0.17], { borderH: 0.045, slits: 0.62, col: o.main });
  else if (st === 'chef') skirt(Hp.y + 0.02, Lk + 0.12, [0.17, 0.115, 0.12], [0.19, 0.14, 0.14], { border: null, col: o.main });

  // mandarin collar and buttons for the men's tailoring
  if (!F && ['kurta', 'sherwani', 'dhoti', 'chef', 'guard'].includes(st)) {
    const collarC = st === 'sherwani' ? o.border : o.vest ?? o.main;
    b.tube([
      { p: V(0, Nk.y - 0.012, spineZ(Nk.y) + 0.002), r1: nR + 0.012, r2: nR + 0.012, w: { Neck: 0.4, Spine2: 0.6 }, col: collarC },
      { p: V(0, Nk.y + 0.022, spineZ(Nk.y) + 0.006), r1: nR + 0.008, r2: nR + 0.009, w: { Neck: 0.7, Spine2: 0.3 }, col: collarC },
    ], 18, { sub: 1, capEnd: false });
    const zf = (x, y) => spineZ(y) + torsoAt(y)[2] * Math.sqrt(Math.max(0, 1 - (x / torsoAt(y)[1]) ** 2));
    const nb = st === 'chef' ? 0 : st === 'sherwani' ? 7 : 4;
    gold(() => {
      for (let i = 0; i < nb; i++) { const y = A - 0.03 - i * 0.055; b.ellipsoid(V(0, y, zf(0, y) + 0.005), [0.0065, 0.0065, 0.004], { col: GOLD, w: spineW(y), segW: 8, segH: 6 }); }
      if (st === 'chef') for (const x of [-0.05, 0.05]) for (let i = 0; i < 4; i++) { const y = A - 0.04 - i * 0.06; b.ellipsoid(V(x, y, zf(x, y) + 0.005), [0.007, 0.007, 0.004], { col: 0xf0f0f0, w: spineW(y), segW: 8, segH: 6 }); }
      if (st === 'guard') for (const x of [-0.07, 0.07]) { const y = S2.y + 0.07; b.ellipsoid(V(x, y, zf(x, y) + 0.004), [0.005, 0.005, 0.003], { col: GOLD, w: spineW(y), segW: 6, segH: 4 }); }
    });
  }

  // pallu (saree / lehenga dupatta) and dupatta: cloth draped over the body
  const centre = Object.assign(V(0, 0, spineZ(S2.y)), { top: A - 0.07, sx: 0.07 });
  const surf = (ang, y, out = 0.012) => {
    const [, rx, rzF, rzB] = torsoAt(y), s = Math.sin(ang);
    const bust = F && s > 0 && y > S2.y - 0.02 && y < S2.y + 0.1 ? 0.022 * bustK(ang) : 0;
    return V(Math.cos(ang) * (rx + out), y, spineZ(y) + (s > 0 ? rzF + bust : rzB) * s + Math.sign(s) * out);
  };
  const drapeW = (u, q) => {
    const w = spineW(Math.max(q.y, Hp.y));
    if (q.y > A - 0.02 && q.x > 0.07) { for (const n in w) w[n] *= 0.6; w.LeftShoulder = 0.4; }
    return w;
  };
  if (st === 'saree' || (st === 'lehenga' && o.dupatta != null)) {
    const c = st === 'saree' ? o.main : o.dupatta;
    const path = [
      surf(Math.PI * 0.86, waistY - 0.015), surf(Math.PI * 0.62, S2.y - 0.035, 0.016), surf(Math.PI * 0.42, S2.y + 0.06, 0.02),
      surf(Math.PI * 0.2, A + 0.01, 0.014), V(0.11, A + 0.058, spineZ(A) - 0.005), surf(-Math.PI * 0.25, A - 0.02, 0.012),
      surf(-Math.PI * 0.3, S2.y - 0.05, 0.016), surf(-Math.PI * 0.32, Hp.y, 0.03), surf(-Math.PI * 0.32, Lk + 0.16, 0.06),
    ];
    b.ribbon(path, 0.19, {
      centre, n: 48, flare: 0.15,
      up: (u) => (u > 0.4 && u < 0.6 ? 1 - Math.abs(u - 0.5) * 10 : 0),
      col: (u, v) => ((v < 0.12 || v > 0.88) ? o.border : u > 0.86 ? (u > 0.95 ? shade(o.border, 0.85) : o.border) : c),
      w: drapeW,
    });
  }
  if ((st === 'anarkali' || st === 'salwar') && o.dupatta != null) {
    // over both shoulders, a soft V in front, both ends hanging down the back
    const path = [
      surf(-Math.PI * 0.2, Lk + 0.25, 0.05), surf(-Math.PI * 0.18, S2.y, 0.016), V(0.11, A + 0.055, spineZ(A)), surf(Math.PI * 0.32, A - 0.02, 0.014),
      surf(Math.PI * 0.5, S2.y + 0.04, 0.03), surf(Math.PI * 0.68, A - 0.02, 0.014), V(-0.11, A + 0.055, spineZ(A)), surf(-Math.PI * 0.82, S2.y, 0.016), surf(-Math.PI * 0.8, Lk + 0.25, 0.05),
    ];
    b.ribbon(path, 0.13, {
      centre, n: 64,
      up: (u) => Math.max(0, 1 - Math.abs(u - 0.25) * 14) + Math.max(0, 1 - Math.abs(u - 0.75) * 14),
      col: (u, v) => (v < 0.1 || v > 0.9 || u < 0.04 || u > 0.96 ? o.border : o.dupatta),
      w: (u, q) => { const w = spineW(Math.max(q.y, Hp.y)); if (q.y > A - 0.02 && Math.abs(q.x) > 0.07) { for (const n in w) w[n] *= 0.6; w[q.x > 0 ? 'LeftShoulder' : 'RightShoulder'] = 0.4; } return w; },
    });
  }
  if (!F && o.shawl != null) {
    const path = [surf(Math.PI * 0.3, Hp.y + 0.05, 0.02), surf(Math.PI * 0.28, A - 0.02, 0.014), V(0.12, A + 0.058, spineZ(A)), surf(-Math.PI * 0.3, A - 0.02, 0.014), surf(-Math.PI * 0.3, Hp.y, 0.025)];
    b.ribbon(path, 0.11, { centre, n: 36, up: (u) => (u > 0.4 && u < 0.6 ? 1 - Math.abs(u - 0.5) * 10 : 0), col: (u, v) => (v < 0.12 || v > 0.88 ? GOLD : o.shawl), w: drapeW });
  }

  // ---------- HEAD (stylised, big expressive eyes — a warm animated-film look) ----------
  const hr = F ? [0.083, 0.115, 0.1] : [0.087, 0.121, 0.104];
  const hc = V(Hd.x, Hd.y + 0.078, Hd.z + 0.03);
  const headDeform = (scale = 1, extra = 0) => (u) => {
    let { x, y, z } = u;
    if (z < 0) z *= 1.06;
    if (y < 0) {
      const t = -y;
      x *= 1 - (F ? 0.3 : 0.24) * Math.pow(t, 1.6);
      if (z < 0) z *= 1 - 0.55 * Math.pow(t, 1.3); else z *= 1 - 0.08 * t * t;
      if (z > 0 && y < -0.6) z += 0.03 * smooth(-0.6, -0.95, y) * (1 - Math.min(1, Math.abs(x) * 2.2));
    }
    if (z > 0.25 && y > -0.55 && y < 0.0) x *= 1 + 0.035 * (1 - Math.abs(y + 0.27) / 0.28);   // full cheeks
    return V(x * (hr[0] * scale + extra), y * (hr[1] * scale + extra), z * (hr[2] * scale + extra));
  };
  const face = [];
  { const d = headDeform(); for (let i = 0; i <= 64; i++) for (let j = 0; j <= 64; j++) { const th = (i / 64) * Math.PI, ph = (j / 64) * Math.PI; face.push(d(V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)))); } }
  const fz = (x, y) => { let best = null, bd = 1e9; for (const p of face) { const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } } return best.z; };
  const at = (x, y, dz = 0) => V(hc.x + x, hc.y + y, hc.z + fz(x, y) + dz);
  const HW = { Head: 1 };
  const stub = !F && !o.beard && o.stubble;
  b.ellipsoid(hc, hr, {
    deform: headDeform(), segW: 36, segH: 26, w: (u) => (u.y < -0.75 && u.z < 0.3 ? { Head: 0.75, Neck: 0.25 } : HW),
    col: (u, p) => {
      const c = skin.clone(), lx = p.x - hc.x, ly = p.y - hc.y;
      if (u.z > 0.3) { const d = Math.hypot(Math.abs(lx) - 0.046, ly + 0.03); const R = 0.03; if (d < R) c.lerp(C(0xe0605a), (F ? 0.34 : 0.14) * (1 - d / R) ** 1.3); }
      if (stub && u.z > -0.1 && ly < -0.03) c.lerp(C(0x4a3a30), 0.22 * smooth(-0.03, -0.07, ly));
      return c;
    },
  });
  for (const sx of [1, -1]) b.ellipsoid(V(hc.x + sx * (hr[0] * 0.96), hc.y - 0.014, hc.z - 0.008), [0.01, 0.026, 0.017], { col: skinD, w: HW, rot: new THREE.Euler(0, sx * 0.3, sx * 0.08), segW: 10, segH: 8 });

  // big eyes: white, brown iris with a dark rim, pupil, two catch-lights, a soft upper lid
  const ex = F ? 0.034 : 0.035, ey = -0.006;
  for (const sx of [1, -1]) {
    const er = F ? [0.0185, 0.0165, 0.0125] : [0.0165, 0.0138, 0.0115];
    const ec = at(sx * ex, ey, -er[2] * 0.62);
    const yaw = sx * 0.26, tilt = sx * (F ? 0.06 : 0.02);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt));
    const L = (x, y, z) => ec.clone().add(V(x, y, z).applyQuaternion(q));
    const R = new THREE.Euler(0, yaw, tilt);
    b.ellipsoid(ec, er, { col: 0xfbf8f3, w: HW, rot: R, segW: 18, segH: 12 });
    const ir = F ? 0.0112 : 0.0098;
    b.ellipsoid(L(0, -0.0005, er[2] * 0.86), [ir + 0.0011, ir + 0.0011, 0.0028], { col: 0x24120a, w: HW, rot: R, segW: 16, segH: 10 });
    b.ellipsoid(L(0, -0.0005, er[2] * 0.86 + 0.0012), [ir, ir, 0.0028], { col: o.eyes ?? 0x6b3a1a, w: HW, rot: R, segW: 16, segH: 10 });
    b.ellipsoid(L(0, -0.0005, er[2] * 0.86 + 0.0024), [ir * 0.62, ir * 0.62, 0.002], { col: 0x8a4e22, w: HW, rot: R, segW: 12, segH: 8 });
    b.ellipsoid(L(0, -0.0005, er[2] * 0.86 + 0.0032), [ir * 0.44, ir * 0.44, 0.0016], { col: 0x070403, w: HW, rot: R, segW: 12, segH: 8 });
    b.ellipsoid(L(ir * 0.38, ir * 0.42, er[2] * 0.86 + 0.0046), [0.0026, 0.0026, 0.0008], { col: 0xffffff, w: HW, segW: 8, segH: 6 });
    b.ellipsoid(L(-ir * 0.4, -ir * 0.35, er[2] * 0.86 + 0.0044), [0.0012, 0.0012, 0.0005], { col: 0xffffff, w: HW, segW: 6, segH: 4 });
    b.ellipsoid(L(0, 0.0006, 0.0005), [er[0] * 1.06, er[1] * 1.08, er[2] * 1.06], { col: mixC(skin, 0x6b4234, 0.12), w: HW, rot: new THREE.Euler(0.18, yaw, tilt), theta: [0, Math.PI * 0.3], segW: 18, segH: 5 });
    // lash line (kajal), thicker for women with a little wing
    const ts = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((t) => t * sx);
    const lash = ts.map((t) => L(t * er[0] * 0.98, er[1] * 0.8 * Math.sqrt(Math.max(0, 1 - t * t * 0.92)) + 0.0006, er[2] * 0.7 * Math.sqrt(Math.max(0.1, 1 - t * t * 0.9)) + 0.0006));
    if (F) lash.push(L(sx * er[0] * 1.35, er[1] * 0.72, er[2] * 0.15));
    b.curve(lash, (u) => (F ? 0.0013 + 0.0011 * Math.sin(Math.min(1, u * 1.1) * Math.PI) : 0.0008 + 0.0005 * Math.sin(u * Math.PI)), KAJAL, HW, { segs: 5, n: 14 });
    // brows: thick and expressive
    const bx0 = 0.014, bx1 = F ? 0.058 : 0.06;
    const bp = [0, 0.3, 0.62, 1].map((t) => { const x = bx0 + (bx1 - bx0) * t; const y = ey + er[1] + (F ? 0.015 + 0.007 * Math.sin(t * Math.PI * 0.8) - 0.005 * t : 0.014 + 0.004 * Math.sin(t * Math.PI * 0.8) - 0.004 * t); return at(sx * x, y, 0.0018); });
    b.curve(bp, (u) => (F ? 0.0028 * (1 - 0.55 * u) + 0.001 : 0.0042 * (1 - 0.35 * u) + 0.0012), o.grey ? 0x8f8a84 : 0x1a110b, HW, { segs: 6, n: 14 });
  }
  // small rounded nose
  b.ellipsoid(at(0, -0.024, -0.0075), [0.0055, 0.014, 0.0072], { col: skin, w: HW, rot: new THREE.Euler(-0.25, 0, 0), segW: 10, segH: 8 });
  b.ellipsoid(at(0, -0.04, -0.0035), F ? [0.0105, 0.0085, 0.0085] : [0.0125, 0.0098, 0.0098], { col: skin, w: HW, segW: 14, segH: 10 });
  for (const sx of [1, -1]) b.ellipsoid(at(sx * (F ? 0.0085 : 0.0098), -0.0425, -0.0072), [0.0058, 0.0048, 0.0058], { col: skin, w: HW, segW: 10, segH: 6 });
  // soft smile
  const lipC = F ? (o.lips ?? 0xc4505a) : mixC(skin, 0x7a3028, 0.45);
  const my = -0.066;
  const smile = [-1.08, -0.5, 0, 0.5, 1.08].map((t) => at(t * (F ? 0.019 : 0.021), my + 0.0085 * t * t - 0.001, -0.0025));
  if (F) {
    b.ellipsoid(at(0, my + 0.0032, -0.0042), [0.0125, 0.0034, 0.0055], { col: lipC, w: HW, segW: 14, segH: 6 });
    b.ellipsoid(at(0, my - 0.0042, -0.0045), [0.0118, 0.0052, 0.0062], { col: shade(lipC, 1.06), w: HW, segW: 14, segH: 8 });
  } else b.ellipsoid(at(0, my - 0.0045, -0.0032), [0.0118, 0.0042, 0.0056], { col: lipC, w: HW, segW: 12, segH: 6 });
  b.curve(smile.map((p) => p.clone().add(V(0, 0, F ? 0 : 0.0012))), F ? 0.00085 : 0.0011, 0x4a1c18, HW, { segs: 4, n: 12 });

  // facial hair
  const fh = o.grey ? 0xc9c3bb : HAIR;
  if (!F && o.mustache) {
    const m = o.mustache === 'royal'
      ? [at(-0.044, my + 0.024, -0.002), at(-0.034, my + 0.013, 0.001), at(-0.018, my + 0.012, 0.003), at(0, my + 0.0135, 0.004), at(0.018, my + 0.012, 0.003), at(0.034, my + 0.013, 0.001), at(0.044, my + 0.024, -0.002)]
      : [at(-0.024, my + 0.004, -0.001), at(-0.013, my + 0.0095, 0.0015), at(0, my + 0.011, 0.0025), at(0.013, my + 0.0095, 0.0015), at(0.024, my + 0.004, -0.001)];
    b.curve(m, (u) => 0.002 + 0.0036 * Math.sin(u * Math.PI), fh, HW, { segs: 6, n: 16 });
  }
  if (!F && o.beard) {
    // a smooth cap over the jaw and chin (tilted so it sits below the lips in front), plus sideburns
    const bq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.3);
    const bd = headDeform(1.0, 0.0065);
    b.ellipsoid(hc, hr, {
      theta: [Math.PI * 0.66, Math.PI * 0.97], segW: 36, segH: 10, w: (u) => (u.y < -0.9 ? { Head: 0.8, Neck: 0.2 } : HW),
      deform: (u) => bd(u.clone().applyQuaternion(bq)), col: (u) => C(fh).clone().multiplyScalar(0.9 + 0.1 * Math.sin(u.x * 40)),
    });
    for (const sx of [1, -1]) b.curve([V(hc.x + sx * hr[0] * 0.93, hc.y + 0.0, hc.z + 0.0), V(hc.x + sx * hr[0] * 0.9, hc.y - 0.04, hc.z + 0.012), V(hc.x + sx * hr[0] * 0.8, hc.y - 0.075, hc.z + 0.028)], 0.0075, fh, HW, { segs: 8, n: 10 });
  }

  // ---------- HAIR (smooth cap tilted back: hairline high in front, low at the nape) ----------
  const hairCol = (u) => C(hairC).clone().multiplyScalar(0.8 + 0.2 * Math.max(0, Math.sin(Math.atan2(u.z, u.x) * 38 + u.y * 4)) + (u.y > 0.6 ? 0.12 : 0));
  const capHair = (T, tilt, extra, colFn, puff = 0) => {
    const rx = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -tilt);
    const d = headDeform(1.0, extra);
    b.ellipsoid(hc, hr, {
      theta: [0, T], segW: 40, segH: 20, w: HW,
      deform: (u) => { const v = u.clone().applyQuaternion(rx); const p = d(v); if (puff && v.y > 0.2) p.multiplyScalar(1 + puff * smooth(0.2, 0.85, v.y) * (v.z > 0.2 ? 1.2 : 0.8)); return p; },
      col: (u) => colFn(u.clone().applyQuaternion(rx)),
    });
  };
  if (o.turban == null && o.safa == null && o.cap !== 'chef') {
    if (F) {
      capHair(1.62, 0.66, 0.0055, (v) => hairCol(v), 0.035);
      // the centre parting, filled with sindoor for married women
      const pd = headDeform(1.0, 0.0072), pq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0);
      const partPts = [0.95, 0.85, 0.72, 0.6].map((y) => { const z = Math.sqrt(1 - y * y); return hc.clone().add(pd(V(0, y, z)).applyQuaternion(pq).multiplyScalar(1 + 0.035 * smooth(0.2, 0.85, y) * 1.2 + 0.004)); });
      b.curve(partPts, o.sindoor ? 0.0016 : 0.0011, o.sindoor ? SINDOOR : skinD, HW, { segs: 5, n: 10 });
      const nape = hc.clone().add(V(0, -0.06, -hr[2] * 1.03));
      if (o.hair === 'bun') {
        const bc = nape.clone().add(V(0, 0.012, -0.026));
        b.ellipsoid(bc, [0.052, 0.044, 0.038], { col: hairCol(V(1, 0, 0)), w: HW, segW: 18, segH: 12 });
        for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; b.ellipsoid(bc.clone().add(V(Math.cos(a) * 0.054, Math.sin(a) * 0.046, -0.014)), [0.0078, 0.0078, 0.0078], { col: JASMINE, w: HW, segW: 7, segH: 5 }); }
      } else if (o.hair === 'braid') {
        const steps = 12;
        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1), y = nape.y - t * (nape.y - (waistY - 0.04));
          const z = y > A ? nape.z - 0.012 * t : spineZ(y) - torsoAt(y)[3] - 0.022;
          const r = 0.032 - 0.013 * t;
          b.ellipsoid(V(i % 2 ? 0.007 : -0.007, y, z), [r, 0.032, r * 0.85], { col: hairCol(V(i % 2, 0, 1)), w: y > Nk.y + 0.04 ? HW : spineW(y), rot: new THREE.Euler(0, 0, i % 2 ? 0.38 : -0.38), segW: 10, segH: 7 });
        }
        const ty = waistY - 0.06, tz = spineZ(ty) - torsoAt(ty)[3] - 0.022;
        gold(() => b.ellipsoid(V(0, ty, tz), [0.012, 0.016, 0.012], { col: GOLD, w: spineW(ty), segW: 8, segH: 6 }));
        for (let i = 0; i < 3; i++) b.ellipsoid(V((i - 1) * 0.008, ty - 0.03, tz), [0.005, 0.02, 0.005], { col: o.paranda ?? 0xc62828, w: spineW(ty), segW: 6, segH: 6 });
        if (o.gajra !== false) for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.ellipsoid(nape.clone().add(V(Math.cos(a) * 0.038, Math.sin(a) * 0.032 - 0.004, -0.018)), [0.0068, 0.0068, 0.0068], { col: JASMINE, w: HW, segW: 6, segH: 5 }); }
      } else {
        const path = [hc.clone().add(V(0, 0.03, -hr[2] * 1.06)), nape.clone().add(V(0, -0.03, 0.004)), V(0, Nk.y - 0.02, spineZ(Nk.y) - 0.085), V(0, S2.y + 0.02, spineZ(S2.y) - torsoAt(S2.y)[3] - 0.018), V(0, S2.y - 0.1, spineZ(S2.y - 0.1) - torsoAt(S2.y - 0.1)[3] - 0.016)];
        b.ribbon(path, 0.16, { centre: V(0, 0, spineZ(S2.y)), n: 26, flare: 0.04, col: (u, v) => hairCol(V(v * 2 - 1, u, 0.3)), w: (u, q) => (q.y > Nk.y + 0.03 ? HW : spineW(q.y)) });
      }
    } else {
      capHair(1.5, 0.62, 0.006, (v) => (Math.abs(v.x - 0.4) < 0.025 && v.y > 0.5 && v.z > 0 ? shade(hairC, 0.6) : hairCol(v)), 0.06);
      // wavy quiff on top
      if (!o.grey) {
        b.ellipsoid(hc.clone().add(V(0.008, hr[1] * 0.74, hr[2] * 0.5)), [0.062, 0.026, 0.05], { col: hairCol(V(0.5, 1, 0.5)), w: HW, rot: new THREE.Euler(0.55, 0, -0.12), segW: 20, segH: 10 });
        b.ellipsoid(hc.clone().add(V(-0.022, hr[1] * 0.8, hr[2] * 0.3)), [0.045, 0.024, 0.045], { col: hairCol(V(0.2, 1, 0.2)), w: HW, rot: new THREE.Euler(0.35, 0, 0.15), segW: 16, segH: 8 });
      }
      for (const sx of [1, -1]) b.ellipsoid(hc.clone().add(V(sx * hr[0] * 0.95, -0.022, 0.022)), [0.006, 0.02, 0.011], { col: hairC, w: HW, segW: 8, segH: 6 });
    }
  }
  // turban (Sikh pagri), safa (Rajasthani) or chef's toque
  const wrap = o.turban ?? o.safa;
  if (wrap != null) {
    const tq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -0.55);
    b.ellipsoid(hc.clone().add(V(0, 0.016, -0.004)), hr, {
      theta: [0, 1.32], segW: 36, segH: 14, w: HW,
      deform: (u) => headDeform(1.13, 0.012)(u.clone().applyQuaternion(tq)),
      col: (u) => C(wrap).clone().multiplyScalar(0.84 + 0.16 * Math.sin(u.y * 22 + u.x * 5)),
    });
    for (let i = 0; i < 3; i++) {
      const tl = 0.55 - i * 0.07;
      b.torus(hc.clone().add(V(0, 0.05 + i * 0.026, -0.008 - i * 0.004)), V(0, Math.cos(tl), -Math.sin(tl)), hr[0] * (1.15 - i * 0.13), 0.014, { col: shade(wrap, 0.92 + i * 0.05), w: HW, segs: 28, tubeSegs: 7, squash: 1.18 - i * 0.05 });
    }
    if (o.safa != null) {
      gold(() => { const k = at(0, 0.088, 0.034); b.ellipsoid(k, [0.012, 0.014, 0.006], { col: GOLD, w: HW, segW: 10, segH: 8 }); b.ellipsoid(k.clone().add(V(0.004, 0.035, -0.01)), [0.006, 0.032, 0.004], { col: 0xf5f0e6, w: HW, rot: new THREE.Euler(-0.3, 0, -0.2), segW: 8, segH: 8 }); });
      b.ribbon([hc.clone().add(V(0.02, 0.0, -hr[2] * 1.15)), hc.clone().add(V(0.035, -0.09, -hr[2] * 1.2)), V(0.05, S2.y + 0.04, spineZ(S2.y) - torsoAt(S2.y)[3] - 0.02)], 0.07, { centre: V(0, 0, spineZ(S2.y)), n: 16, col: (u) => (u > 0.85 ? GOLD : wrap), w: (u, q) => (q.y > Nk.y + 0.03 ? HW : spineW(q.y)) });
    } else {
      b.ellipsoid(hc.clone().add(V(0, 0.125, 0.04)), [0.03, 0.022, 0.03], { col: shade(wrap, 0.95), w: HW, segW: 12, segH: 8 });
    }
  }
  if (o.cap === 'chef') {
    capHair(1.5, 0.62, 0.006, (v) => hairCol(v));
    b.column([0, 0.05, 0.1, 0.15].map((dy, i) => ({ y: hc.y + 0.09 + dy, rx: 0.09 + i * 0.006, rzF: 0.096 + i * 0.006, rzB: 0.096 + i * 0.006, cz: hc.z - 0.01 })), 22, { col: () => 0xffffff, w: () => HW });
    b.ellipsoid(V(hc.x, hc.y + 0.26, hc.z - 0.01), [0.12, 0.062, 0.125], { col: 0xffffff, w: HW, segW: 20, segH: 10 });
  }

  // ---------- JEWELLERY & MARKS ----------
  if (F && o.jewel !== 'none') gold(() => {
    for (const sx of [1, -1]) {
      const lobe = V(hc.x + sx * (hr[0] * 0.98), hc.y - 0.038, hc.z - 0.002);
      b.ellipsoid(lobe, [0.0045, 0.0045, 0.0045], { col: GOLD, w: HW, segW: 8, segH: 6 });
      if (o.jewel !== 'light') {
        b.ellipsoid(lobe.clone().add(V(0, -0.016, 0)), [0.011, 0.011, 0.011], { col: GOLD, w: HW, theta: [0, Math.PI * 0.55], segW: 12, segH: 6 });   // jhumka bell
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; b.ellipsoid(lobe.clone().add(V(Math.cos(a) * 0.01, -0.024, Math.sin(a) * 0.01)), [0.0022, 0.0022, 0.0022], { col: 0xfffbf0, w: HW, segW: 5, segH: 4 }); }
      }
    }
    // necklace on the collarbones (+ pendant); a longer rani-haar for bridal
    const neckY = Nk.y - 0.02;
    const chain = (depth, spread) => [-1, -0.6, -0.25, 0, 0.25, 0.6, 1].map((t) => surf(Math.PI / 2 - t * spread, neckY - depth * (1 - t * t) + 0.012 * t * t, 0.006));
    b.curve(chain(0.045, 1.1), 0.0032, GOLD, spineW(neckY - 0.02), { segs: 5, n: 22 });
    const pend = surf(Math.PI / 2, neckY - 0.052, 0.01);
    b.ellipsoid(pend, [0.011, 0.014, 0.004], { col: GOLD, w: spineW(pend.y), segW: 10, segH: 8 });
    b.ellipsoid(pend.clone().add(V(0, 0, 0.004)), [0.0055, 0.0065, 0.003], { col: o.stone ?? 0xc2185b, w: spineW(pend.y), segW: 8, segH: 6 });
    if (o.jewel === 'bridal') b.curve(chain(0.11, 1.2), 0.004, GOLD, spineW(neckY - 0.06), { segs: 5, n: 24 });
    if (o.jewel === 'bridal' || o.tikka) {
      b.curve([hc.clone().add(V(0, 0.105, 0.03)), at(0, 0.085, 0.009), at(0, 0.052, 0.004)], 0.0012, GOLD, HW, { segs: 4, n: 10 });
      b.ellipsoid(at(0, 0.044, 0.006), [0.0065, 0.0085, 0.003], { col: GOLD, w: HW, segW: 10, segH: 8 });
      b.ellipsoid(at(0, 0.044, 0.008), [0.003, 0.004, 0.002], { col: 0xc62828, w: HW, segW: 6, segH: 6 });
    }
    if (o.nath) b.torus(at(0.012, -0.05, 0.002), V(1, 0, 0.2), 0.008, 0.0011, { col: GOLD, w: HW, segs: 16, tubeSegs: 4 });
    if (o.mangalsutra) b.curve(chain(0.09, 1.0), 0.0022, 0x161616, spineW(neckY - 0.05), { segs: 4, n: 22 });
  });
  if (F && o.bindi) b.ellipsoid(at(0, 0.036, 0.001), [0.0045, 0.0045, 0.0012], { col: o.bindiC ?? 0x9b0d1b, w: HW, segW: 10, segH: 6 });
  if (!F && o.tilak) b.ellipsoid(at(0, 0.035, 0.001), [0.0025, 0.012, 0.001], { col: 0xd84315, w: HW, segW: 8, segH: 6 });
  if (!F && o.mala) b.curve([-1, -0.5, 0, 0.5, 1].map((t) => surf(Math.PI / 2 - t * 1.1, Nk.y - 0.03 - 0.07 * (1 - t * t), 0.006)), 0.0045, 0x5d3a1a, spineW(Nk.y - 0.06), { segs: 5, n: 20 });

  return b;
}

// =====================================================================
// Attach to a Character
// =====================================================================
const geoCache = new Map();

/** Women share the X-Bot skeleton, scaled to 1.65 m. */
export const sizeOf = (o) => (o?.sex === 'f' ? 0.93 : 1);

/**
 * Replace the rig's own mesh with the generated person. Call straight after cloning,
 * while the skeleton is still in its bind pose and the character stands at the origin.
 */
export function applyDress(ch, o) {
  if (!o || !o.sex) return;
  ch.root.updateMatrixWorld(true);
  let src = null;
  ch.model.traverse((m) => { if (m.isSkinnedMesh && !src) src = m; });
  if (!src) return;
  const bones = src.skeleton.bones;
  const key = JSON.stringify(o);
  if (!geoCache.has(key)) {
    const index = {}; bones.forEach((bn, i) => { index[bn.name.replace('mixamorig', '')] = i; });
    // body frame: origin between the hips, +X toward the left hip, +Z forward
    const get = (n) => ch.model.getObjectByName('mixamorig' + n).getWorldPosition(new THREE.Vector3());
    const L = get('LeftUpLeg'), R = get('RightUpLeg'), H = get('Hips');
    const th = Math.atan2(-(L.z - R.z), L.x - R.x);
    const toChar = new THREE.Matrix4().makeRotationY(th).setPosition(H.x, 0, H.z);
    const toBody = toChar.clone().invert();
    const k = sizeOf(o);
    const pos = {}; bones.forEach((bn) => { pos[bn.name.replace('mixamorig', '')] = bn.getWorldPosition(new THREE.Vector3()).applyMatrix4(toBody).multiplyScalar(1 / k); });
    const builder = buildPerson(o, pos, index);
    geoCache.set(key, builder.build(toChar.clone().multiply(new THREE.Matrix4().makeScale(k, k, k))));
  }
  const mesh = new THREE.SkinnedMesh(geoCache.get(key), materials());
  mesh.castShadow = true; mesh.receiveShadow = false; mesh.frustumCulled = false;
  ch.root.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld);
  ch.body = mesh;
  // drop the rig's own meshes (the skeleton stays)
  const old = []; ch.model.traverse((m) => { if (m.isMesh) old.push(m); });
  for (const m of old) m.parent.remove(m);
}
