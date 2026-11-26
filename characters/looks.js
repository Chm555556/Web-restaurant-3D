// characters/looks.js — makes every real 3D person their own person.
//
// There are two real bodies: a man in a kurta-pyjama and a woman in a saree
// (CONFIG.people, base: 'm' / 'f'). Everyone is built from one of them, then changed:
//   • face: men get one of five real faces (heads taken from the other Nodeaxis models,
//     which share the kurta model's skeleton), and everyone's face is reshaped a little
//     (width, jaw, length, depth) so no two people look alike;
//   • skin tone, hair colour, lipstick, beard / moustache;
//   • clothes: saree, border and blouse colours / kurta and pyjama colours, recoloured
//     in the shader so the cloth pattern and folds stay;
//   • height and build;
//   • small things: bindi, nose ring, earrings, gajra flowers, glasses, turban, chef's cap.
// Staff all wear the Azure Bay uniform (teal and gold), guests wear their own colours.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { library, LOD } from './loader.js';

export const STAFF_ROLE = /receptionist|concierge|security|bellboy|waiter|waitress|buffet|chef|housekeeping|room service|lifeguard|bartender|pool server|patrol|gardener/i;
/** The staff uniform: teal kurta and cream pyjama, teal saree with a gold border and blouse. */
export const UNIFORM = { m: { main: 0x0f5c61, bottom: 0xefe7d6 }, f: { main: 0x0f5c61, border: 0xc9a13b, blouse: 0xc9a13b } };

const SKIN_TONE = { fair: 1.16, wheat: 1.0, medium: 0.87, dusky: 0.74, deep: 0.62 };
const LIPS = [0xa0303c, 0xb5485a, 0x8c2f39, 0xc0606a, 0x9a4a4a, 0x7d2a33];
const HAIR_F = [0x120c0a, 0x1d130e, 0x2b1a12, 0x3d1f14];
const BINDI = [0x9b0f1e, 0xb3122a, 0x6d0a1a, 0x8a1538];
const GOLD = 0xd4a53a;

// base-texture reference brightness (linear luminance, measured from the textures) so a
// new colour keeps the pattern: out = target × (texel brightness / reference)
const REF = { sareeMain: 0.098, sareeBorder: 0.125, sareeBlouse: 0.311, kurta: 0.0576, pyjama: 0.0318, hairF: 0.0226, hairM: 0.0077, lips: 0.07 };

const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function rng(seed) { let s = seed || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const between = (r, a, b) => a + (b - a) * r();

const faceTurn = { m: 0, f: 0 };   // hands out the real faces in turn, so they are spread evenly
const SAREE_COLOURS = [0x8b1538, 0x1565c0, 0x6a1b9a, 0xd35400, 0x00796b, 0xc2185b, 0xb8860b, 0x2e7d32];

/** The real faces for men or women: base bodies and face donors of one skeleton family. */
export function facesFor(sex) {
  return Object.values(library).filter((L) => L.real && L.rpm && L.sex === sex && (L.base || L.faceDonor)).sort((a, b) => a.order - b.order);
}

/** Work out how someone looks from their cast entry (name, role, costume notes). */
export function lookFor({ name = '', role = '', outfit: of = {}, sex, lib = null }) {
  const r = rng(hash(name + '|' + role));
  const staff = STAFF_ROLE.test(role);
  const grey = !!of.grey;
  const style = lib?.base || null;
  const L = { sex, staff, grey, name, style };
  L.tone = SKIN_TONE[of.skin] ?? between(r, 0.75, 1.12);
  const faces = facesFor(sex), own = Math.max(0, faces.indexOf(lib));
  if (sex === 'f') {
    // staff wear the resort's saree as made (teal with an orange print); guests their own colours
    L.main = staff ? null : of.main ?? SAREE_COLOURS[Math.floor(r() * SAREE_COLOURS.length)];
    L.border = of.border ?? of.dupatta ?? GOLD;
    L.blouse = of.blouse ?? of.second ?? of.dupatta ?? of.bottom ?? GOLD;
    L.bottom = of.bottom && of.bottom !== of.main ? of.bottom : [0xf3e5d0, 0xffffff, 0x1f2a44, 0xf8bbd0, 0xfff3c4][Math.floor(r() * 5)];
    L.dupatta = of.dupatta ?? of.border ?? L.bottom;
    L.pattern = Math.floor(r() * 4);                               // plain, bandhani, block print, checks
    L.accent = [GOLD, 0xffffff, L.bottom, L.dupatta][Math.floor(r() * 4)];
    if (L.accent === L.main) L.accent = GOLD;
    L.face = faces.length ? faceTurn.f++ % faces.length : own;
    L.hair = grey ? 0x8a8580 : HAIR_F[Math.floor(r() * HAIR_F.length)];
    L.hairMix = grey ? 0.85 : 0.6;
    L.lips = of.lips ?? LIPS[Math.floor(r() * LIPS.length)];
    L.bindi = of.bindi !== false && r() < 0.85 ? BINDI[Math.floor(r() * BINDI.length)] : null;
    L.nath = !!of.nath;
    L.earrings = of.jewel !== 'none';
    L.gajra = !staff && (of.hair === 'bun' || of.hair === 'braid') && r() < 0.7;
    L.glasses = grey || r() < 0.12;
  } else {
    const u = staff ? UNIFORM.m : null;
    const casual = style && style !== 'kurta';
    const TOPS = [0x1f4e79, 0x8b1e3f, 0x2e7d32, 0xf2f2ee, 0x37474f, 0xc0392b, 0x6d4c41, 0x00838f, 0xf9a825, 0x5d4037, 0x283593];
    L.main = u ? u.main : casual ? (of.main && r() < 0.5 ? of.main : TOPS[Math.floor(r() * TOPS.length)]) : of.main ?? 0xf2ead8;
    L.bottom = u ? u.bottom : of.bottom ?? 0xf3efe6;
    L.jeans = [0x22344f, 0x3d5a80, 0x5b7fa6, 0xc2ab7d, 0x1c1c1c, 0x5f6648, 0x8d8f91][Math.floor(r() * 7)];
    L.shorts = [0x9e9e9e, 0xc2ab7d, 0x1f3a5f, 0x556b2f, 0x2b2b2b][Math.floor(r() * 5)];
    // kurtas: plain, pin stripes, small checks or a fine print; some with a contrast churidar
    L.pattern = u ? 0 : [0, 0, 2, 3, 1][Math.floor(r() * 5)];
    L.accent = 0xffffff;
    if (!u && !of.bottom && r() < 0.35) L.bottom = [0xf3efe6, 0xffffff, 0x2b2b2b, 0xd7c9a7][Math.floor(r() * 4)];
    // the kurta model's own face is the older one, with its own hair mesh (so it can go grey)
    const kurtaFace = Math.max(0, faces.findIndex((f) => f.base === 'kurta'));
    L.face = grey || role === 'You' ? kurtaFace : faceTurn.m++ % Math.max(1, faces.length);
    L.hair = grey ? 0x9a948c : 0x120d0b;
    L.hairMix = grey ? 0.9 : 0;
    L.beard = of.beard ? 1 : 0;
    L.mustache = of.mustache && faces[L.face]?.base !== 'kurta' ? 1 : 0;   // the kurta man's face has a real one
    L.glasses = grey ? r() < 0.6 : r() < 0.15;
    L.turban = of.turban ?? null;
    L.chefCap = of.cap === 'chef' || /chef/i.test(role);
    L.tilak = !!of.tilak;
  }
  L.height = (grey ? between(r, 0.95, 1.0) : between(r, 0.95, 1.05));
  L.build = between(r, 0.96, 1.06) + (grey ? 0.03 : 0);
  L.faceShape = { width: between(r, 0.92, 1.08), jaw: between(r, -0.1, 0.1), len: between(r, 0.94, 1.06), depth: between(r, 0.95, 1.05) };
  return L;
}

// ------------------------------------------------------------------ shaders
const HSV = /* glsl */`
vec3 lkHsv(vec3 c) {
  vec3 s = pow(max(c, vec3(0.0)), vec3(1.0 / 2.2));
  float mx = max(s.r, max(s.g, s.b)), mn = min(s.r, min(s.g, s.b)), d = mx - mn, h = 0.0;
  if (d > 1e-4) {
    if (mx == s.r) h = mod((s.g - s.b) / d, 6.0); else if (mx == s.g) h = (s.b - s.r) / d + 2.0; else h = (s.r - s.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, mx > 0.0 ? d / mx : 0.0, mx);
}
vec3 lkRgb(vec3 k) {
  vec3 p = abs(fract(k.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return pow(k.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), k.y), vec3(2.2));
}
const vec3 LKW = vec3(0.2126, 0.7152, 0.0722);
// cloth prints on a plain colour: 1 dots (bandhani), 2 stripes with dots, 3 small checks
vec3 lkPrint(vec3 t, vec3 accent, float pat, vec2 uv) {
  vec2 q = uv * 70.0;
  if (pat > 0.5 && pat < 1.5) { vec2 f = fract(q + vec2(0.5 * floor(mod(q.y, 2.0)), 0.0)) - 0.5; return mix(t, accent, 1.0 - smoothstep(0.12, 0.2, length(f))); }
  if (pat > 1.5 && pat < 2.5) { float st = step(0.82, fract(uv.x * 24.0)); vec2 f = fract(q * 0.5) - 0.5; return mix(t, accent, max(st, 1.0 - smoothstep(0.1, 0.16, length(f)))); }
  if (pat > 2.5) { vec2 f = step(0.5, fract(q * 0.35)); return mix(t, mix(t, accent, 0.35), abs(f.x - f.y)); }
  return t;
}
`;
const FRAG = {
  // pink body, purple border, yellow blouse → this person's three colours
  saree: /* glsl */`{
    vec3 c = diffuseColor.rgb, k = lkHsv(c); float lum = dot(c, LKW);
    float col = smoothstep(0.12, 0.25, k.y) * smoothstep(0.08, 0.15, k.z);
    float wM = col * clamp(smoothstep(0.86, 0.9, k.x) + 1.0 - smoothstep(0.02, 0.05, k.x), 0.0, 1.0);
    float wB = col * smoothstep(0.64, 0.69, k.x) * (1.0 - smoothstep(0.86, 0.9, k.x));
    float wU = col * smoothstep(0.07, 0.09, k.x) * (1.0 - smoothstep(0.2, 0.23, k.x));
    c = mix(c, uMain * (lum / ${REF.sareeMain}), wM);
    c = mix(c, uBorder * (lum / ${REF.sareeBorder}), wB);
    c = mix(c, uBlouse * (lum / ${REF.sareeBlouse}), wU);
    diffuseColor.rgb = c;
  }`,
  // left half of the atlas is the kurta, right half the pyjama (and the near-black sandals)
  kurta: /* glsl */`{
    vec3 c = diffuseColor.rgb; float lum = dot(c, LKW);
    vec3 t = vMapUv.x < 0.5 ? lkPrint(uMain, mix(uMain, uAccent, 0.55), uPattern, vMapUv) * (lum / ${REF.kurta}) : uBottom * (lum / ${REF.pyjama});
    float keep = vMapUv.x < 0.5 ? 0.0 : 1.0 - smoothstep(0.013, 0.024, lum);
    diffuseColor.rgb = mix(t, c, keep);
  }`,
  // printed cloth: turn every colour of the print round the colour wheel (the print stays)
  hue: /* glsl */`{
    vec3 k = lkHsv(diffuseColor.rgb);
    k.x = fract(k.x + uHue); k.y = clamp(k.y * uSatK, 0.0, 1.0); k.z = min(1.0, k.z * uValK);
    diffuseColor.rgb = lkRgb(k);
  }`,
  // plain cloth: a new colour, keeping the weave and folds (only u < uMaskU when set)
  tint: /* glsl */`{
    vec3 c = diffuseColor.rgb; float lum = dot(c, LKW);
    float m = uMaskU > 0.0 ? 1.0 - step(uMaskU, vMapUv.x) : 1.0;
    vec3 t = lkPrint(uTint, uAccent, uPattern, vMapUv);
    diffuseColor.rgb = mix(c, t * (0.3 + 0.7 * lum / uRef), m);
  }`,
  hair: /* glsl */`{
    vec3 c = diffuseColor.rgb; float lum = dot(c, LKW);
    diffuseColor.rgb = mix(c, uHair * (0.35 + 0.65 * lum / uHairRef), uHairMix);
  }`,
  // skin tone, lipstick, and a beard / moustache painted by position on the face
  skin: /* glsl */`{
    vec3 c = diffuseColor.rgb;
    if (uLipOn > 0.5) {
      vec3 k = lkHsv(c); float lum = dot(c, LKW);
      float lip = smoothstep(0.42, 0.55, k.y) * clamp(smoothstep(0.92, 0.95, k.x) + 1.0 - smoothstep(0.01, 0.03, k.x), 0.0, 1.0);
      c = mix(c, uLip * (lum / ${REF.lips}), lip * 0.85);
    }
    c *= uTone;
    if (uLegOn > 0.5) {
      // churidar: the bare legs under a kameez become close-fitting gathered cloth
      float y = vBodyY, leg = smoothstep(0.085, 0.1, y) * (1.0 - smoothstep(uLegTop - 0.02, uLegTop, y));
      float gather = 0.82 + 0.18 * sin(y * 260.0) * smoothstep(0.1, 0.35, 0.45 - y);
      c = mix(c, uLegC * gather, leg);
    }
    if (uBeard + uMoust > 0.0) {
      vec3 p = vHeadP;   // metres, origin at the nose tip: x left, y up, z forward
      float n = fract(sin(dot(floor(p * 1400.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
      float front = smoothstep(-0.11, -0.075, p.z);
      float below = 1.0 - smoothstep(-0.03, -0.018, p.y);
      float chin = smoothstep(-0.115, -0.09, p.y);
      float side = 1.0 - smoothstep(0.062, 0.075, abs(p.x));
      float lips = (1.0 - smoothstep(0.02, 0.027, abs(p.x))) * (1.0 - smoothstep(0.005, 0.01, abs(p.y + 0.04)));
      float beard = uBeard * front * below * chin * side * (1.0 - lips);
      float must = uMoust * (1.0 - smoothstep(0.024, 0.032, abs(p.x))) * smoothstep(-0.04, -0.034, p.y) * (1.0 - smoothstep(-0.026, -0.02, p.y)) * smoothstep(-0.04, -0.02, p.z);
      float m = clamp(max(beard, must), 0.0, 1.0) * (0.6 + 0.4 * n);
      c = mix(c, uHairC, m * 0.88);
    }
    diffuseColor.rgb = c;
  }`,
};
const UNIFORMS = {
  saree: 'uniform vec3 uMain, uBorder, uBlouse;',
  kurta: 'uniform vec3 uMain, uBottom, uAccent; uniform float uPattern;',
  hair: 'uniform vec3 uHair; uniform float uHairMix, uHairRef;',
  skin: 'uniform vec3 uLip, uHairC, uLegC; uniform float uLipOn, uTone, uBeard, uMoust, uLegOn, uLegTop; varying vec3 vHeadP; varying float vBodyY;',
  hue: 'uniform float uHue, uSatK, uValK;',
  tint: 'uniform vec3 uTint, uAccent; uniform float uRef, uMaskU, uPattern;',
};

function patch(src, part, U, headM = null, bodyM = null) {
  const m = src.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = UNIFORMS[part] + '\n' + HSV + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG[part]);
    if (part === 'skin') {
      sh.uniforms.uHeadM = { value: headM || new THREE.Matrix4() };
      sh.uniforms.uBodyM = { value: bodyM || new THREE.Matrix4() };
      sh.vertexShader = 'uniform mat4 uHeadM, uBodyM; varying vec3 vHeadP; varying float vBodyY;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvHeadP = (uHeadM * vec4(transformed, 1.0)).xyz;\nvBodyY = (uBodyM * vec4(transformed, 1.0)).y;');
    }
  };
  m.customProgramCacheKey = () => 'look-' + part;
  return m;
}
const col = (hex) => new THREE.Color(hex);

// ------------------------------------------------------------------ geometry helpers
const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

/**
 * Geometry space → the model's own space, at the bind pose. glTF skins ignore the mesh
 * node's transform and Sketchfab exports add a rotation and scale above the skeleton, so
 * this is measured from a bone (bone world × its inverse bind matrix) rather than assumed.
 */
function toModel(mesh, model) {
  const sk = mesh.skeleton, i = Math.max(0, sk.bones.findIndex((b) => /Head$/.test(b.name)));
  return model.matrixWorld.clone().invert().multiply(sk.bones[i].matrixWorld).multiply(sk.boneInverses[i]).multiply(mesh.bindMatrix);
}

/** Weight of the head (and its child bones) on each vertex. */
function headWeights(mesh) {
  const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
  const isHead = bones.map((b) => /Head$|HeadTop|Eye/i.test(b.name));
  const out = new Float32Array(si.count);
  for (let i = 0; i < si.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (isHead[si.getComponent(i, k)]) w += sw.getComponent(i, k);
    out[i] = w;
  }
  return out;
}

/**
 * The head's own axes, in the skeleton's bind space ("S"): origin at the nose tip,
 * x to the person's left, y up, z forward. Measured from the face mesh, never guessed.
 */
function headFrame(model, faceMesh, unit) {
  const Minv = model.matrixWorld.clone().invert();
  const P = (n) => { const b = model.getObjectByName('mixamorig' + n); return b ? b.getWorldPosition(new THREE.Vector3()).applyMatrix4(Minv) : null; };
  const head = P('Head'), top = P('HeadTop_End'), neck = P('Neck');
  const up = (top ? top.clone().sub(head) : head.clone().sub(neck)).normalize();
  const le = P('LeftEye'), re = P('RightEye');
  const left = (le && re ? le.clone().sub(re) : P('LeftShoulder').sub(P('RightShoulder'))).normalize();
  left.addScaledVector(up, -left.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
  // nose tip: the most forward head vertex near the middle line
  const g = faceMesh.geometry, pos = g.attributes.position, hw = headWeights(faceMesh);
  let best = -Infinity; const tip = new THREE.Vector3(), G = toModel(faceMesh, model);
  for (let i = 0; i < pos.count; i++) {
    if (hw[i] < 0.6) continue;
    _v.fromBufferAttribute(pos, i).applyMatrix4(G);
    const d = _v.clone().sub(head);
    if (Math.abs(d.dot(left)) * unit > 0.012) continue;
    const f = d.dot(fwd);
    if (f > best) { best = f; tip.copy(_v); }
  }
  // head frame (metres) → S (the model's own units)
  const F = new THREE.Matrix4().makeBasis(left, up, fwd).scale(new THREE.Vector3(1 / unit, 1 / unit, 1 / unit)).setPosition(tip);
  return { F, Finv: F.clone().invert(), left, up, fwd, tip };
}

/** Reshape the face: wider / narrower, stronger or softer jaw, longer, deeper. */
const SKULL = new THREE.Vector3(0, 0.02, -0.085);   // roughly the middle of the skull, in the head frame
/** Move one head-frame point (metres) for this face shape; w = how much it belongs to the head. */
function deform(v, shape, w = 1) {
  v.sub(SKULL);
  const low = THREE.MathUtils.smoothstep(-v.y, 0.0, 0.09);              // 0 at the cheekbones → 1 at the chin
  const sx = shape.width * (1 + shape.jaw * low);
  v.x *= 1 + (sx - 1) * w; v.y *= 1 + (shape.len - 1) * w; v.z *= 1 + (shape.depth - 1) * w;
  return v.add(SKULL);
}

function reshape(mesh, frame, shape, model) {
  const g = mesh.geometry.clone();
  const src = g.attributes.position, pos = new THREE.Float32BufferAttribute(src.count * 3, 3);
  const hw = headWeights(mesh);
  const toH = new THREE.Matrix4().multiplyMatrices(frame.Finv, toModel(mesh, model)), fromH = toH.clone().invert();
  for (let i = 0; i < src.count; i++) {
    _v.fromBufferAttribute(src, i);
    if (hw[i] > 0.001) deform(_v.applyMatrix4(toH), shape, hw[i]).applyMatrix4(fromH);
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.setAttribute('position', pos);
  mesh.geometry = g;
}

// ------------------------------------------------------------------ accessories
let ACC = null;
function accMats() {
  if (ACC) return ACC;
  ACC = {
    gold: new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.28 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x1a1512, metalness: 0.3, roughness: 0.4 }),
    jasmine: new THREE.MeshStandardMaterial({ color: 0xfffbef, roughness: 0.7 }),
    white: new THREE.MeshStandardMaterial({ color: 0xfbfbf7, roughness: 0.85 }),
    tilak: new THREE.MeshStandardMaterial({ color: 0xe0621b, roughness: 0.8 }),
  };
  return ACC;
}
const solid = new Map();
const solidMat = (hex, rough = 0.6) => { const k = hex + ':' + rough; if (!solid.has(k)) solid.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: rough })); return solid.get(k); };

/** Build head accessories in the head frame (metres, origin at the nose tip). */
function accessories(L, sex) {
  const M = accMats(), out = [];
  const put = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    geo = geo.clone();
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
    out.push({ geo, mat });
  };
  const gold = [];
  if (sex === 'f') {
    if (L.bindi) put(new THREE.CircleGeometry(0.0042, 12), solidMat(L.bindi, 0.4), 0, 0.058, -0.022, -0.32);
    if (L.nath) gold.push(new THREE.TorusGeometry(0.0055, 0.0009, 5, 14).applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2)).translate(0.011, -0.012, -0.012));
    if (L.earrings) for (const sx of [1, -1]) {
      gold.push(new THREE.SphereGeometry(0.0032, 8, 6).translate(sx * 0.071, -0.034, -0.088));
      gold.push(new THREE.ConeGeometry(0.0062, 0.011, 10, 1, true).translate(sx * 0.071, -0.043, -0.088));
    }
    if (L.gajra) for (let i = 0; i < 11; i++) {
      const a = -0.9 + i * 0.18;
      put(new THREE.SphereGeometry(0.0072, 6, 5), M.jasmine, Math.sin(a) * 0.075, 0.03 - Math.abs(a) * 0.01, -0.17 + (1 - Math.cos(a)) * 0.05);
    }
  } else {
    if (L.tilak) put(new THREE.PlaneGeometry(0.004, 0.022), M.tilak, 0, 0.06, -0.02, -0.3);
    if (L.turban) {
      const t = solidMat(L.turban, 0.75);
      put(new THREE.SphereGeometry(0.108, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), t, 0, 0.085, -0.1, -0.25, 0, 0, 1.02, 0.95, 1.12);
      put(new THREE.TorusGeometry(0.098, 0.016, 8, 24), t, 0, 0.07, -0.098, Math.PI / 2 - 0.28, 0, 0, 1.0, 1.12, 1);
    }
    if (L.chefCap) {
      put(new THREE.CylinderGeometry(0.098, 0.096, 0.1, 22, 1, true), M.white, 0, 0.13, -0.1, -0.12);
      put(new THREE.SphereGeometry(0.115, 18, 10), M.white, 0, 0.19, -0.11, -0.12, 0, 0, 1, 0.55, 1);
    }
  }
  if (gold.length) out.push({ geo: mergeGeometries(gold.map((g) => g.index ? g.toNonIndexed() : g)), mat: M.gold });
  if (L.glasses) {
    const parts = [];
    for (const sx of [1, -1]) parts.push(new THREE.TorusGeometry(0.0175, 0.0017, 5, 18).scale(1, 0.8, 1).translate(sx * 0.032, 0.026, -0.016).toNonIndexed());
    parts.push(new THREE.CylinderGeometry(0.0013, 0.0013, 0.03, 5).rotateZ(Math.PI / 2).translate(0, 0.03, -0.014).toNonIndexed());
    for (const sx of [1, -1]) parts.push(new THREE.CylinderGeometry(0.0013, 0.0013, 0.095, 5).rotateX(Math.PI / 2).translate(sx * 0.066, 0.028, -0.065).toNonIndexed());
    out.push({ geo: mergeGeometries(parts), mat: M.frame });
  }
  return out;
}

// ------------------------------------------------------------------ build one person
// how each material is treated; a base body adds its clothing parts (CONFIG.people parts)
const COMMON = {
  mat0mat: 'hair', mat3mat: 'skin',                                       // Aditi's saree model
  AvatarBody: 'body', AvatarHead: 'skin', haircut: 'hair',                 // Nodeaxis avatars
};
const partOf = (mesh, lib) => lib?.parts?.[mesh.material?.name] ?? COMMON[mesh.material?.name] ?? null;
// measured from the textures: the print's average hue / saturation / value, and plain cloth brightness
const HUE_REF = { saree: { h: 0.07, s: 0.7, v: 0.55 }, kurti: { h: 0.068, s: 0.39, v: 0.4 } };
const TINT_REF = { kameez: { ref: 0.0118, mask: 0.5 }, leggings: { ref: 0.0215, mask: 0 } };

function hsvOf(hex) {
  const c = new THREE.Color(hex), r = c.r, g = c.g, b = c.b;      // linear → back to sRGB for HSV
  const sr = Math.pow(r, 1 / 2.2), sg = Math.pow(g, 1 / 2.2), sb = Math.pow(b, 1 / 2.2);
  const mx = Math.max(sr, sg, sb), mn = Math.min(sr, sg, sb), d = mx - mn;
  let h = 0;
  if (d > 1e-4) h = mx === sr ? ((sg - sb) / d + 6) % 6 : mx === sg ? (sb - sr) / d + 2 : (sr - sg) / d + 4;
  return { h: h / 6, s: mx ? d / mx : 0, v: mx };
}

/**
 * A dupatta worn round the neck: a soft V across the chest, over both shoulders, and the
 * two ends hanging down the back. Every point is fitted to this body's own surface (from
 * its mesh, at the bind pose), and it is skinned to the spine, shoulders and hips.
 */
const surfCache = new Map();
function bodySurface(ch, meshes, model) {
  if (surfCache.has(ch.lib)) return surfCache.get(ch.lib);
  const pts = [];
  for (const m of meshes) {
    const G = toModel(m, model), p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 2) pts.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(G));
  }
  surfCache.set(ch.lib, pts);
  return pts;
}
function dupatta(ch, host, colour, meshes) {
  const model = ch.model, Minv = model.matrixWorld.clone().invert(), u = 1 / ch.lib.scale;
  const P = (n) => model.getObjectByName('mixamorig' + n).getWorldPosition(new THREE.Vector3()).applyMatrix4(Minv);
  const hips = P('Hips'), s2 = P('Spine2'), neck = P('Neck');
  const up = neck.clone().sub(hips).normalize();
  const left = P('LeftUpLeg').sub(P('RightUpLeg')); left.addScaledVector(up, -left.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(left, up).normalize();
  const surf = bodySurface(ch, meshes, model);
  const axis = (h) => hips.clone().addScaledVector(up, h * u);
  // the body's outer surface along a direction (l: across, f: front/back) at height h (m above the hips)
  const fit = (l, h, dirF, gap = 0.014) => {
    const o = axis(h).addScaledVector(left, l * u), n = fwd.clone().multiplyScalar(dirF);
    let best = 0.06;
    for (const v of surf) {
      const d = v.clone().sub(o);
      if (Math.abs(d.dot(up)) > 0.035 * u || Math.abs(d.dot(left)) > 0.035 * u) continue;
      best = Math.max(best, d.dot(n) / u);
    }
    return o.addScaledVector(n, (best + gap) * u);
  };
  const shoulderTop = (l) => {                         // the top of the shoulder at side l
    const o = axis(0).addScaledVector(left, l * u);
    let best = 0;
    for (const v of surf) {
      const d = v.clone().sub(o);
      if (Math.abs(d.dot(left)) > 0.03 * u || Math.abs(d.dot(fwd)) > 0.05 * u) continue;
      best = Math.max(best, d.dot(up) / u);
    }
    return o.addScaledVector(up, (best + 0.016) * u).addScaledVector(fwd, -0.01 * u);
  };
  const sh = (s2.clone().sub(hips).dot(up) / u);       // chest height above the hips
  const pts = [
    fit(0.1, -0.12, -1), fit(0.1, sh * 0.45, -1), fit(0.1, sh + 0.08, -1),
    shoulderTop(0.11),
    fit(0.09, sh + 0.06, 1), fit(0.04, sh - 0.06, 1), fit(0, sh - 0.11, 1), fit(-0.04, sh - 0.06, 1), fit(-0.09, sh + 0.06, 1),
    shoulderTop(-0.11),
    fit(-0.1, sh + 0.08, -1), fit(-0.1, sh * 0.45, -1), fit(-0.1, -0.12, -1),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const N = 96, W = 0.125 * u, pos = [], uv = [], idx = [], si = [], sw = [];
  const bones = host.skeleton.bones, bi = (n) => Math.max(0, bones.findIndex((b) => b.name === 'mixamorig' + n));
  const iH = bi('Hips'), iS1 = bi('Spine1'), iS2 = bi('Spine2'), iL = bi('LeftShoulder'), iR = bi('RightShoulder');
  const T = new THREE.Vector3(), O = new THREE.Vector3(), Wd = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N, p = curve.getPoint(t);
    curve.getTangent(t, T);
    // outward = away from the spine axis (horizontal), or up over the shoulders
    const rel = p.clone().sub(hips); O.copy(rel).addScaledVector(up, -rel.dot(up)).normalize();
    const h = rel.dot(up) / u, overTop = THREE.MathUtils.smoothstep(h, sh + 0.1, sh + 0.17);
    O.lerp(up, overTop).normalize();
    Wd.crossVectors(T, O).normalize();
    const lside = rel.dot(left) / u;
    const wS2 = THREE.MathUtils.smoothstep(h, 0.1, sh), wSh = 0.4 * overTop;
    for (const side of [-0.5, 0.5]) {
      pos.push(p.clone().addScaledVector(Wd, side * W).addScaledVector(O, Math.abs(side) * 0.004 * u));
      uv.push(side + 0.5, t * 10);
      si.push(iH, iS1, iS2, lside > 0 ? iL : iR);
      sw.push((1 - wS2) * 0.6 * (1 - wSh), (1 - wS2) * 0.4 * (1 - wSh), wS2 * (1 - wSh), wSh);
    }
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const toGeo = toModel(host, model).invert();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flatMap((v) => v.applyMatrix4(toGeo).toArray()), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, dupattaMat(colour));
  mesh.castShadow = true; mesh.frustumCulled = false;
  host.parent.add(mesh);
  mesh.bind(host.skeleton, host.bindMatrix);
  return mesh;
}
const dupMats = new Map();
function dupattaMat(colour) {
  if (dupMats.has(colour)) return dupMats.get(colour);
  // chiffon with a woven gold border along both edges
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#' + new THREE.Color(colour).getHexString(); x.fillRect(0, 0, 64, 64);
  x.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 64; i += 4) x.fillRect(0, i, 64, 1);
  x.fillStyle = '#d4a53a'; x.fillRect(0, 0, 5, 64); x.fillRect(59, 0, 5, 64);
  x.fillStyle = '#f1d27a'; for (let i = 0; i < 64; i += 8) { x.fillRect(1, i, 3, 3); x.fillRect(60, i, 3, 3); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.DoubleSide });
  dupMats.set(colour, m);
  return m;
}

/**
 * Turn a freshly cloned real model into this person. Call in the Character constructor,
 * with the character at the origin and the skeleton still in its bind pose.
 */
export function personalize(ch, L) {
  const model = ch.model, lib = ch.lib;
  ch.root.updateMatrixWorld(true);
  const meshes = []; model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const bones = {}; model.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const drop = (test) => { for (const m of meshes.filter(test)) m.parent.remove(m); for (let i = meshes.length - 1; i >= 0; i--) if (!meshes[i].parent) meshes.splice(i, 1); };

  // ---- a different real face: swap in another model's head (same skeleton family)
  let bodyMat = null;
  const D = facesFor(L.sex)[L.face];
  if (D && D !== lib) {
    const keepFromBase = (m) => /^(AvatarBody|outfit)/i.test(m.material.name);
    const host = meshes.find((m) => m.material.name === 'AvatarBody') || meshes[0];
    drop((m) => !keepFromBase(m));
    D.gltf.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (/^AvatarBody/.test(o.material.name)) { bodyMat = o.material; return; }
      if (/^outfit/.test(o.material.name)) return;
      const m = new THREE.SkinnedMesh(o.geometry, o.material);
      m.name = o.name; m.castShadow = true; m.frustumCulled = false;
      host.parent.add(m);
      const sk = new THREE.Skeleton(o.skeleton.bones.map((b) => bones[b.name] || bones[o.skeleton.bones[0].name]), o.skeleton.boneInverses);
      m.bind(sk, o.bindMatrix);
      meshes.push(m);
    });
  }
  const hairRef = (D || lib).hairRef ?? 0.006;

  // ---- remember each mesh's low-detail geometry (before any reshaping)
  for (const m of meshes) { const low = LOD.get(m.geometry); if (low) m.userData.lod = low; }

  // ---- drop what nobody ever sees (teeth, cornea shells) and the models' own sunglasses
  drop((m) => /Teeth|Cornea|glasses/i.test(m.material.name));
  // small parts: no shadows, and hidden on people far from the camera (Character.setDetail)
  ch.detail = meshes.filter((m) => /Eyeball|Eyelash/i.test(m.material.name));
  for (const m of ch.detail) m.castShadow = false;

  // ---- face shape (all head meshes move together, so the eyes stay in their sockets)
  const faceMesh = meshes.find((m) => m.material.name === 'AvatarHead') || meshes.find((m) => partOf(m, lib) === 'skin');
  let frame = null;
  if (faceMesh) {
    frame = headFrame(model, faceMesh, lib.scale);
    for (const m of meshes) {
      const p = partOf(m, lib);
      if (p && p !== 'skin' && p !== 'hair') continue;    // clothes and body: nothing of the head in them
      reshape(m, frame, L.faceShape, model);
    }
  }

  // ---- materials
  for (const m of meshes) {
    const p = partOf(m, lib);
    if (p === 'saree') m.material = patch(m.material, 'saree', { uMain: { value: col(L.main ?? 0xb0123a) }, uBorder: { value: col(L.border) }, uBlouse: { value: col(L.blouse) } });
    else if (p === 'kurta') m.material = patch(m.material, 'kurta', { uMain: { value: col(L.main) }, uBottom: { value: col(L.bottom) }, uAccent: { value: col(L.accent ?? 0xffffff) }, uPattern: { value: L.pattern ?? 0 } });
    else if (p && typeof p === 'object' && p.tint) {
      // plain cloth part of a casual outfit: shirt / T-shirt in the top colour, jeans, chinos, shorts
      m.material = patch(m.material, 'tint', { uTint: { value: col(L[p.tint] ?? L.main) }, uRef: { value: p.ref }, uMaskU: { value: 0 }, uPattern: { value: 0 }, uAccent: { value: col(0xffffff) } });
    } else if (p && typeof p === 'object' && p.hue) {
      const t = hsvOf(L[p.hue] ?? L.main);
      m.material = patch(m.material, 'hue', { uHue: { value: t.h - p.h }, uSatK: { value: THREE.MathUtils.clamp(t.s / p.s, 0.45, 1.5) }, uValK: { value: THREE.MathUtils.clamp(t.v / p.v, 0.7, 2.2) } });
    }
    else if (p === 'hue' && L.main != null) {
      const ref = HUE_REF[L.style] || HUE_REF.saree, t = hsvOf(L.main);
      m.material = patch(m.material, 'hue', { uHue: { value: t.h - ref.h }, uSatK: { value: THREE.MathUtils.clamp(t.s / ref.s, 0.45, 1.5) }, uValK: { value: THREE.MathUtils.clamp(t.v / ref.v, 0.7, 2.2) } });
    } else if (p === 'kameez' || p === 'leggings') {
      const R = TINT_REF[p];
      m.material = patch(m.material, 'tint', { uTint: { value: col(p === 'kameez' ? L.main ?? 0x0f5c61 : L.bottom) }, uRef: { value: R.ref }, uMaskU: { value: R.mask },
        uPattern: { value: p === 'kameez' ? L.pattern ?? 0 : 0 }, uAccent: { value: col(L.accent ?? GOLD) } });
    } else if (p === 'hair') m.material = patch(m.material, 'hair', { uHair: { value: col(L.hair) }, uHairMix: { value: L.hairMix }, uHairRef: { value: hairRef } });
    else if (p === 'skin' || p === 'body') {
      const isFace = m === faceMesh;
      const headM = isFace && frame ? new THREE.Matrix4().multiplyMatrices(frame.Finv, toModel(m, model)) : null;
      const legs = p === 'body' && lib.legs;
      const bodyM = legs ? new THREE.Matrix4().makeScale(lib.scale, lib.scale, lib.scale).multiply(toModel(m, model)) : null;
      m.material = patch(p === 'body' && bodyMat ? bodyMat : m.material, 'skin', {
        uTone: { value: L.tone }, uLip: { value: col(L.lips ?? 0) }, uLipOn: { value: isFace && L.sex === 'f' ? 1 : 0 },
        uBeard: { value: isFace ? L.beard ?? 0 : 0 }, uMoust: { value: isFace ? L.mustache ?? 0 : 0 }, uHairC: { value: col(0x0e0a08) },
        uLegOn: { value: legs ? 1 : 0 }, uLegC: { value: col(L.bottom ?? 0xffffff) }, uLegTop: { value: 0.62 },
      }, headM, bodyM);
    }
  }

  // ---- a dupatta with a salwar suit
  if (lib.dupatta) {
    const host = meshes.find((m) => m.material.name === 'AvatarBody');
    const bodyParts = meshes.filter((m) => /^(AvatarBody|outfit)/.test(m.material.name));
    if (host) dupatta(ch, host, L.dupatta ?? GOLD, bodyParts);
  }

  // ---- accessories, fixed to the head bone
  const head = bones.mixamorigHead;
  if (head && frame) {
    const toWorld = new THREE.Matrix4().multiplyMatrices(model.matrixWorld, frame.F);
    for (const { geo, mat } of accessories(L, L.sex)) {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { deform(_v.fromBufferAttribute(p, i), L.faceShape); p.setXYZ(i, _v.x, _v.y, _v.z); }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false; mesh.frustumCulled = false;
      mesh.applyMatrix4(toWorld);
      head.attach(mesh);
      // a turban or chef's cap is seen from afar; jewellery and glasses only up close
      if (!L.turban && !L.chefCap || geo.attributes.position.count < 300) ch.detail.push(mesh);
    }
  }

  // ---- near / far geometry for Character.setDetail
  ch.lod = meshes.filter((m) => m.userData.lod).map((m) => ({ mesh: m, near: m.geometry, far: m.userData.lod }));

  // ---- height and build
  ch.build = L.build;
  return L;
}

/**
 * Let the saree flow like cloth instead of splitting into trouser legs: the parts of the
 * saree that follow a leg are shared out between both legs (and so follow their average).
 */
export function softenSkirt(scene, material) {
  scene.traverse((m) => {
    if (!m.isSkinnedMesh || m.material?.name !== material) return;
    const g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = m.skeleton.bones;
    const idx = {}; bones.forEach((b, i) => { idx[b.name] = i; });
    const mirror = bones.map((b) => {
      const n = b.name.includes('Left') ? b.name.replace('Left', 'Right') : b.name.includes('Right') ? b.name.replace('Right', 'Left') : null;
      return n && /UpLeg$|Leg$/.test(b.name) ? idx[n] ?? -1 : -1;
    });
    // feet keep their own weights (some models have the feet in the same mesh as the cloth)
    const share = bones.map((b) => (/UpLeg/.test(b.name) ? 0.38 : /Leg$/.test(b.name) ? 0.42 : 0));
    const nsi = new Uint16Array(si.count * 4), nsw = new Float32Array(si.count * 4);
    for (let i = 0; i < si.count; i++) {
      const acc = new Map();
      for (let k = 0; k < 4; k++) {
        const b = si.getComponent(i, k), w = sw.getComponent(i, k);
        if (w <= 0) continue;
        const mb = mirror[b], a = mb >= 0 ? share[b] : 0;
        acc.set(b, (acc.get(b) || 0) + w * (1 - a));
        if (a) acc.set(mb, (acc.get(mb) || 0) + w * a);
      }
      const top = [...acc.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const tot = top.reduce((s, e) => s + e[1], 0) || 1;
      top.forEach(([b, w], k) => { nsi[i * 4 + k] = b; nsw[i * 4 + k] = w / tot; });
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(nsi, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(nsw, 4));
  });
}
