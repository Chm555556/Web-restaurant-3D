// systems/nav.js — a walkable grid baked from the collision boxes, with A* path finding
// and string-pulling, so people (waiters, room service) can walk anywhere in the resort
// without cutting through tables, chairs or walls. Doors count as walkable: the door
// gate in scene/architecture.js makes people stop and open them.
import { colliders } from './collision.js';

const CELL = 0.35, R = 0.3;                         // cell size, body radius
const X0 = -82, X1 = 40, Z0 = -62, Z1 = 40;          // includes Azure Gardens on the west lawn
const NX = Math.ceil((X1 - X0) / CELL), NZ = Math.ceil((Z1 - Z0) / CELL);

let blocked = null;
const cache = new Map();

export function buildNav() {
  blocked = new Uint8Array(NX * NZ);
  for (const b of colliders) {
    if (b.minY > 1.2 || b.door) continue;
    const i0 = Math.max(0, Math.floor((b.minX - R - X0) / CELL)), i1 = Math.min(NX - 1, Math.ceil((b.maxX + R - X0) / CELL));
    const j0 = Math.max(0, Math.floor((b.minZ - R - Z0) / CELL)), j1 = Math.min(NZ - 1, Math.ceil((b.maxZ + R - Z0) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = X0 + (i + 0.5) * CELL, z = Z0 + (j + 0.5) * CELL;
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) blocked[j * NX + i] = 1;
    }
  }
  cache.clear();
}

const cellOf = (x, z) => [Math.floor((x - X0) / CELL), Math.floor((z - Z0) / CELL)];
const inGrid = (i, j) => i >= 0 && j >= 0 && i < NX && j < NZ;
const free = (i, j) => inGrid(i, j) && !blocked[j * NX + i];
export const walkable = (x, z) => { if (!blocked) return true; const [i, j] = cellOf(x, z); return free(i, j); };

/** Walkable, or within ~0.7 m of walkable floor (standing right against furniture). */
const nearWalkable = (x, z) => !!nearestFree(...cellOf(x, z), 2);

/** Is the straight line a→b walkable? */
export function clearLine(ax, az, bx, bz) {
  if (!blocked) return true;
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (CELL * 0.5)));
  for (let s = 0; s <= n; s++) { const t = s / n; if (!walkable(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
  return true;
}

function nearestFree(i, j, max = 6) {
  if (free(i, j)) return [i, j];
  for (let r = 1; r <= max; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
    if (free(i + di, j + dj)) return [i + di, j + dj];
  }
  return null;
}

/** A* on the grid (8-connected, no corner cutting) + string pulling. Returns [[x,z],…] or null. */
export function findPath(ax, az, bx, bz) {
  if (!blocked) return [[bx, bz]];
  if (clearLine(ax, az, bx, bz)) return [[ax, az], [bx, bz]];
  const s = nearestFree(...cellOf(ax, az)), g = nearestFree(...cellOf(bx, bz));
  if (!s || !g) return null;
  const key = `${s[0]},${s[1]}>${g[0]},${g[1]}`;
  if (cache.has(key)) { const c = cache.get(key); return c && [[ax, az], ...c.slice(1, -1), [bx, bz]]; }
  const N = NX * NZ, start = s[1] * NX + s[0], goal = g[1] * NX + g[0];
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = []; // [f, idx]
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const h = (i) => { const dx = Math.abs(i % NX - g[0]), dz = Math.abs(((i / NX) | 0) - g[1]); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  gs[start] = 0; push(h(start), start);
  let found = false, iter = 0;
  while (heap.length && iter++ < 120000) {
    const [, cur] = pop();
    if (cur === goal) { found = true; break; }
    if (closed[cur]) continue; closed[cur] = 1;
    const ci = cur % NX, cj = (cur / NX) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (!free(ni, nj)) continue;
      if (di && dj && (!free(ci + di, cj) || !free(ci, cj + dj))) continue;
      const n = nj * NX + ni, cost = gs[cur] + (di && dj ? Math.SQRT2 : 1);
      if (cost < gs[n]) { gs[n] = cost; from[n] = cur; push(cost + h(n), n); }
    }
  }
  if (!found) { cache.set(key, null); return null; }
  const cells = []; for (let c = goal; c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => [X0 + (c % NX + 0.5) * CELL, Z0 + (((c / NX) | 0) + 0.5) * CELL]);
  // string pulling: keep only the corners we cannot see past
  const out = [pts[0]];
  let a = 0;
  while (a < pts.length - 1) {
    let b = pts.length - 1;
    while (b > a + 1 && !clearLine(pts[a][0], pts[a][1], pts[b][0], pts[b][1])) b--;
    out.push(pts[b]); a = b;
  }
  cache.set(key, out);
  return [[ax, az], ...out.slice(1, -1), [bx, bz]];
}

/**
 * Make a scripted route safe: any leg that would cut through furniture is replaced by a
 * found path. Legs that start or end inside a collider on purpose (staff behind a
 * counter, a seat) are left as written.
 */
export function refinePath(path) {
  if (!blocked || path.length < 2) return path;
  const out = [path[0]];
  for (let k = 1; k < path.length; k++) {
    const [ax, az] = out[out.length - 1], [bx, bz] = path[k];
    if (nearWalkable(ax, az) && nearWalkable(bx, bz) && !clearLine(ax, az, bx, bz)) {
      const p = findPath(ax, az, bx, bz);
      if (p) { out.push(...p.slice(1)); continue; }
    }
    out.push([bx, bz]);
  }
  return out;
}
