// scene/helpers.js — procedural geometry helpers + a static batcher.
// Hybrid approach from the guide: procedural code for the architectural shell,
// .glb files only for characters. Static meshes are merged per material at the
// end, so hundreds of boxes become a few dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Rescale a BoxGeometry's UVs so 1 UV unit = 1 metre on every face. */
export function worldUVBox(geo, w, h, d) {
  const uv = geo.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z ; each face 4 verts
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  uv.needsUpdate = true;
  return geo;
}

/** A static box in metres: from (x0,y0,z0) to (x1,y1,z1). */
export function boxFromTo(parent, material, x0, y0, z0, x1, y1, z1, { cast = true, receive = true, name } = {}) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  if (w < 1e-4 || h < 1e-4 || d < 1e-4) return null;
  const geo = worldUVBox(new THREE.BoxGeometry(w, h, d), w, h, d);
  const m = new THREE.Mesh(geo, material);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = cast; m.receiveShadow = receive;
  if (name) m.name = name;
  parent.add(m);
  return m;
}

/** A static box by centre + size. */
export function box(parent, material, x, y, z, w, h, d, opts) {
  return boxFromTo(parent, material, x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2, opts);
}

export function cyl(parent, material, x, y, z, rTop, rBot, h, seg = 16, opts = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg), material);
  m.position.set(x, y, z);
  m.castShadow = opts.cast ?? true; m.receiveShadow = opts.receive ?? true;
  parent.add(m);
  return m;
}

/**
 * Merge every plain Mesh under `root` into one mesh per material.
 * Meshes flagged userData.dynamic (doors, signs that change) are left alone.
 */
export function staticBatch(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(); // key: material.uuid + cast/receive
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.dynamic || Array.isArray(o.material)) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    // keep only the attributes every primitive shares
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
    if (!buckets.has(key)) buckets.set(key, { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] });
    buckets.get(key).geos.push(g);
    remove.push(o);
  });
  for (const o of remove) o.parent.remove(o);
  const out = new THREE.Group(); out.name = 'static-batch';
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    if (!merged) continue;
    merged.computeBoundingSphere();
    const m = new THREE.Mesh(merged, b.material);
    m.castShadow = b.cast; m.receiveShadow = b.receive;
    m.matrixAutoUpdate = false;
    out.add(m);
    for (const g of b.geos) g.dispose();
  }
  root.add(out);
  return out;
}

/**
 * Instanced helper — "Instanced Mesh: repeat objects efficiently".
 * parts: [{ geometry, material }] built once; transforms: array of Matrix4.
 */
export function instanced(parent, parts, matrices, { cast = true, receive = true } = {}) {
  const meshes = [];
  for (const p of parts) {
    const im = new THREE.InstancedMesh(p.geometry, p.material, matrices.length);
    matrices.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = receive;
    im.computeBoundingSphere();
    parent.add(im);
    meshes.push(im);
  }
  return meshes;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
export function trs(x, y, z, ry = 0, s = 1, rx = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
  _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Merge several (geometry, local matrix) pairs into one geometry. */
export function compose(list) {
  const geos = list.map(([g, m]) => {
    let gg = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    if (m) gg.applyMatrix4(m);
    return gg;
  });
  return mergeGeometries(geos, false);
}
