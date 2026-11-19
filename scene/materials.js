// scene/materials.js — one shared cache for every material and procedural texture.
// Guide rule: "Never create the same material twice". All textures are drawn on
// <canvas> at start-up, so the site ships zero image files for surfaces.
import * as THREE from 'three';

const matCache = new Map();
const texCache = new Map();
let maxAniso = 4;

export function setAnisotropy(n) { maxAniso = n; }

/** Get or create a MeshStandardMaterial by a key. */
export function mat(key, params) {
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(params);
  m.name = key;
  matCache.set(key, m);
  return m;
}
export function getMat(key) { return matCache.get(key); }
export function allMaterials() { return [...matCache.values()]; }

function canvasTex(key, size, draw, repeat = [1, 1], srgb = true) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// small deterministic random so textures look the same every load
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function noise(g, size, alpha, seed, colorA = '0,0,0', count = 6000, maxR = 2) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(${colorA},${r() * alpha})`;
    const s = r() * maxR + 0.5;
    g.fillRect(r() * size, r() * size, s, s);
  }
}

export const textures = {
  marble: () => canvasTex('marble', 512, (g, s) => {
    g.fillStyle = '#efe9df'; g.fillRect(0, 0, s, s);
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(150,140,128,${0.08 + r() * 0.18})`;
      g.lineWidth = 0.6 + r() * 2.2;
      g.beginPath();
      let x = r() * s, y = r() * s; g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 140; y += (r() - 0.3) * 90; g.lineTo(x, y); }
      g.stroke();
    }
    g.strokeStyle = 'rgba(120,108,92,0.35)'; g.lineWidth = 2;
    g.strokeRect(0, 0, s / 2, s / 2); g.strokeRect(s / 2, 0, s / 2, s / 2);
    g.strokeRect(0, s / 2, s / 2, s / 2); g.strokeRect(s / 2, s / 2, s / 2, s / 2);
  }, [0.42, 0.42]),

  wood: () => canvasTex('wood', 512, (g, s) => {
    const r = rng(3);
    const plank = s / 8;
    for (let i = 0; i < 8; i++) {
      const base = 120 + r() * 40;
      g.fillStyle = `rgb(${base + 40},${base - 5},${base - 50})`;
      g.fillRect(0, i * plank, s, plank);
      for (let k = 0; k < 40; k++) {
        g.strokeStyle = `rgba(70,40,20,${0.05 + r() * 0.12})`;
        g.lineWidth = 0.5 + r();
        const y = i * plank + r() * plank;
        g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 6, s * 0.6, y + (r() - 0.5) * 6, s, y); g.stroke();
      }
      g.fillStyle = 'rgba(40,22,10,0.55)'; g.fillRect(0, i * plank, s, 2);
      const cut = r() * s; g.fillRect(cut, i * plank, 2, plank);
    }
  }, [0.5, 0.5]),

  carpet: () => canvasTex('carpet', 256, (g, s) => {
    g.fillStyle = '#3b4a6b'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.25, 11, '255,255,255', 5000, 1.5);
    g.strokeStyle = 'rgba(214,180,110,0.55)'; g.lineWidth = 3;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(s / 2, s / 2, 20 + i * 26, 0, Math.PI * 2); g.stroke(); }
    g.strokeRect(6, 6, s - 12, s - 12);
  }, [0.33, 0.33]),

  roomCarpet: () => canvasTex('roomCarpet', 256, (g, s) => {
    g.fillStyle = '#b8a48a'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.18, 5, '60,40,20', 9000, 1.5);
  }, [0.5, 0.5]),

  deck: () => canvasTex('deck', 512, (g, s) => {
    g.fillStyle = '#d8ccb4'; g.fillRect(0, 0, s, s);
    const r = rng(17);
    const t = s / 4;
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
      const v = 200 + r() * 25;
      g.fillStyle = `rgb(${v},${v - 10},${v - 30})`;
      g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
    noise(g, s, 0.12, 9, '80,60,40', 7000, 2);
  }, [0.42, 0.42]),

  poolTile: () => canvasTex('poolTile', 256, (g, s) => {
    g.fillStyle = '#e8f6fa'; g.fillRect(0, 0, s, s);
    const t = s / 8;
    const r = rng(23);
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      const v = r() * 25;
      g.fillStyle = `rgb(${40 + v},${150 + v},${190 + v})`;
      g.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
    }
  }, [0.62, 0.62]),

  grass: () => canvasTex('grass', 512, (g, s) => {
    g.fillStyle = '#5f8a3f'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.35, 29, '30,60,10', 20000, 2.5);
    noise(g, s, 0.25, 31, '170,200,90', 12000, 1.5);
  }, [0.25, 0.25]),

  sand: () => canvasTex('sand', 256, (g, s) => {
    g.fillStyle = '#e6d3a3'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.3, 41, '150,120,70', 9000, 1.5);
    noise(g, s, 0.4, 43, '255,250,230', 4000, 1);
  }, [0.25, 0.25]),

  asphalt: () => canvasTex('asphalt', 512, (g, s) => {
    g.fillStyle = '#3c4045'; g.fillRect(0, 0, s, s);
    noise(g, s, 0.35, 51, '0,0,0', 22000, 2);
    noise(g, s, 0.15, 53, '255,255,255', 8000, 1.2);
  }, [0.17, 0.17]),

  paving: () => canvasTex('paving', 256, (g, s) => {
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, s, s);
    const r = rng(61); const b = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) {
      const v = 165 + r() * 30;
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.fillRect(x * s / 2 + (y % 2) * s / 4 + 2, y * b + 2, s / 2 - 4, b - 4);
      g.fillRect(x * s / 2 + (y % 2) * s / 4 - s + 2, y * b + 2, s / 2 - 4, b - 4);
    }
    noise(g, s, 0.15, 63, '0,0,0', 3000, 1.5);
  }, [0.5, 0.5]),

  tilesKitchen: () => canvasTex('tilesKitchen', 256, (g, s) => {
    g.fillStyle = '#9aa3a6'; g.fillRect(0, 0, s, s);
    const t = s / 4;
    for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#e9ecec' : '#3e4447';
      g.fillRect(x * t + 1, y * t + 1, t - 2, t - 2);
    }
  }, [0.62, 0.62]),

  plaster: (key, color) => canvasTex('plaster_' + key, 256, (g, s) => {
    g.fillStyle = color; g.fillRect(0, 0, s, s);
    noise(g, s, 0.06, key.length * 13, '0,0,0', 6000, 2);
  }, [0.33, 0.33]),

  facade: (key, base, win) => canvasTex('facade_' + key, 256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    const r = rng(key.length * 77);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
      const lit = r() > 0.55;
      g.fillStyle = lit ? win : 'rgba(30,45,60,0.9)';
      g.fillRect(x * 64 + 14, y * 32 + 8, 36, 18);
    }
  }, [1 / 12, 1 / 24]),
};

/** Text sign drawn on a canvas — used for every label in the world. */
export function signTexture(text, opts = {}) {
  const { w = 1024, h = 256, bg = 'rgba(0,0,0,0)', fg = '#f6efe2', font = '600 120px Marcellus, Georgia, serif', sub = null, subFont = '500 44px Manrope, sans-serif', subColor = null } = opts;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = font;
  g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
  if (sub) { g.font = subFont; g.fillStyle = subColor || fg; g.fillText(sub, w / 2, h * 0.8); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  return t;
}

/** Standard materials used across the whole scene. */
export function initMaterials() {
  mat('marble', { map: textures.marble(), roughness: 0.25, metalness: 0.05 });
  mat('wood', { map: textures.wood(), roughness: 0.55 });
  mat('carpet', { map: textures.carpet(), roughness: 0.95 });
  mat('roomCarpet', { map: textures.roomCarpet(), roughness: 1 });
  mat('deck', { map: textures.deck(), roughness: 0.85 });
  mat('poolTile', { map: textures.poolTile(), roughness: 0.35 });
  mat('grass', { map: textures.grass(), roughness: 1 });
  mat('sand', { map: textures.sand(), roughness: 1 });
  mat('asphalt', { map: textures.asphalt(), roughness: 0.92 });
  mat('paving', { map: textures.paving(), roughness: 0.9 });
  mat('kitchenFloor', { map: textures.tilesKitchen(), roughness: 0.4 });
  mat('wallWarm', { map: textures.plaster('warm', '#efe4d2'), roughness: 0.9 });
  mat('wallWhite', { map: textures.plaster('white', '#f4f1ec'), roughness: 0.9 });
  mat('wallCafe', { map: textures.plaster('cafe', '#d9b48e'), roughness: 0.9 });
  mat('wallRoom', { map: textures.plaster('room', '#e3e6ea'), roughness: 0.9 });
  mat('wallTeal', { map: textures.plaster('teal', '#2f6f73'), roughness: 0.85 });
  mat('exterior', { map: textures.plaster('ext', '#f3ede3'), roughness: 0.85 });
  mat('stone', { color: 0xcfc6b6, roughness: 0.8 });
  mat('darkWood', { color: 0x4a2f1f, roughness: 0.5 });
  mat('lightWood', { color: 0xc49a6c, roughness: 0.55 });
  mat('fabricCream', { color: 0xe9dcc4, roughness: 1 });
  mat('fabricTeal', { color: 0x2e7f7b, roughness: 1 });
  mat('fabricCoral', { color: 0xd9765b, roughness: 1 });
  mat('fabricNavy', { color: 0x2b3a5c, roughness: 1 });
  mat('linen', { color: 0xf7f5f0, roughness: 1 });
  mat('steel', { color: 0xc8ccd0, roughness: 0.25, metalness: 0.85 });
  mat('darkSteel', { color: 0x34393d, roughness: 0.4, metalness: 0.7 });
  mat('gold', { color: 0xd8b26a, roughness: 0.3, metalness: 1 });
  mat('black', { color: 0x15181b, roughness: 0.6 });
  mat('white', { color: 0xffffff, roughness: 0.6 });
  mat('glass', { color: 0xbfe6f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false });
  mat('frame', { color: 0x2a2e31, roughness: 0.5, metalness: 0.6 });
  mat('leaf', { color: 0x3f7d3a, roughness: 0.9 });
  mat('leafDark', { color: 0x2d5e2c, roughness: 0.9 });
  mat('trunk', { color: 0x7a5a3a, roughness: 1 });
  mat('pot', { color: 0xc9bba3, roughness: 0.8 });
  mat('terracotta', { color: 0xb8643f, roughness: 0.9 });
  mat('lampGlow', { color: 0xfff1d0, emissive: 0xffd99a, emissiveIntensity: 1.2 });
  mat('screen', { color: 0x111418, emissive: 0x335577, emissiveIntensity: 0.6, roughness: 0.3 });
  mat('umbrellaWhite', { color: 0xf6f1e8, roughness: 1, side: THREE.DoubleSide });
  mat('umbrellaTeal', { color: 0x2a9d8f, roughness: 1, side: THREE.DoubleSide });
  mat('food', { color: 0xe0a24a, roughness: 0.7 });
  mat('salad', { color: 0x6aa84f, roughness: 0.8 });
  mat('plate', { color: 0xfafafa, roughness: 0.3 });
  mat('rubber', { color: 0x1b1b1b, roughness: 0.9 });
  mat('windowLit', { map: textures.facade('lit', '#cbbfae', '#ffe7a8'), roughness: 0.8 });
}
