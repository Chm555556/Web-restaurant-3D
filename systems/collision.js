// systems/collision.js — axis-aligned boxes on the floor plan.
// Walls and furniture register a box; the player (a circle) is pushed out of them,
// and the follow camera is pulled in front of any wall between it and the player.

export const colliders = [];   // { minX, maxX, minZ, maxZ, minY, maxY, cam }

export function addBox(minX, maxX, minZ, maxZ, { minY = 0, maxY = 5, cam = false } = {}) {
  const b = { minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minZ: Math.min(minZ, maxZ), maxZ: Math.max(minZ, maxZ), minY, maxY, cam };
  colliders.push(b);
  return b;
}

/** Box centred at (x,z) with size (w,d) — handy for furniture. */
export function addFootprint(x, z, w, d, opts) {
  return addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, opts);
}

/** Push a circle at pos (x,z) out of all boxes. Mutates and returns pos. */
export function resolveCircle(pos, r) {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of colliders) {
      if (b.minY > 1.2) continue; // lintels above doors don't block walking
      const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = (r - d) / d;
          pos.x += dx * push; pos.z += dz * push;
        } else {
          // centre is inside the box: leave by the nearest side
          const opts = [[pos.x - b.minX, -1, 0], [b.maxX - pos.x, 1, 0], [pos.z - b.minZ, 0, -1], [b.maxZ - pos.z, 0, 1]];
          opts.sort((a, c) => a[0] - c[0]);
          const [dist, sx, sz] = opts[0];
          pos.x += sx * (dist + r); pos.z += sz * (dist + r);
        }
      }
    }
  }
  return pos;
}

/** Ray (origin o, unit dir d, length len) vs camera-blocking boxes. Returns nearest hit distance or len. */
export function rayCast(o, d, len) {
  let best = len;
  for (const b of colliders) {
    if (!b.cam) continue;
    let tmin = 0, tmax = best;
    const ax = [['x', b.minX, b.maxX], ['y', b.minY, b.maxY], ['z', b.minZ, b.maxZ]];
    let hit = true;
    for (const [k, lo, hi] of ax) {
      const dv = d[k], ov = o[k];
      if (Math.abs(dv) < 1e-9) { if (ov < lo || ov > hi) { hit = false; break; } continue; }
      let t1 = (lo - ov) / dv, t2 = (hi - ov) / dv;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) { hit = false; break; }
    }
    if (hit && tmin < best) best = tmin;
  }
  return best;
}
