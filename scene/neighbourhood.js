// scene/neighbourhood.js — the outdoor world: ground, street, city across the road,
// palms with a wind shader, beach, ocean, street lamps and the fountain spray.
import * as THREE from 'three';
import { getMat, mat, textures } from './materials.js';
import { boxFromTo, box, instanced, trs, compose, worldUVBox } from './helpers.js';
import { addWind } from './environment.js';
import { addBox } from '../systems/collision.js';

export function buildNeighbourhood(scene, profile) {
  const group = new THREE.Group(); group.name = 'neighbourhood';
  const dyn = new THREE.Group(); dyn.name = 'neighbourhood-dynamic';
  scene.add(group, dyn);
  const M = (k) => getMat(k);

  // ---------- grass with a hole for the pool ----------
  const shape = new THREE.Shape();
  shape.moveTo(-500, -500); shape.lineTo(500, -500); shape.lineTo(500, 62); shape.lineTo(-500, 62); shape.lineTo(-500, -500);
  const hole = new THREE.Path();
  hole.moveTo(-14.6, 29.4); hole.lineTo(14.6, 29.4); hole.lineTo(14.6, 46.6); hole.lineTo(-14.6, 46.6); hole.lineTo(-14.6, 29.4);
  shape.holes.push(hole);
  const grass = new THREE.Mesh(new THREE.ShapeGeometry(shape), M('grass'));
  grass.rotation.x = -Math.PI / 2; grass.position.y = -0.03; grass.receiveShadow = true;
  grass.userData.dynamic = true;
  group.add(grass);

  // ---------- beach + ocean ----------
  const sandGeo = new THREE.PlaneGeometry(1000, 40, 1, 1);
  sandGeo.rotateX(-Math.PI / 2);
  const p = sandGeo.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setY(i, z < 0 ? -1.6 : 0); p.setZ(i, z < 0 ? -102 : -62); }
  const uv = sandGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1000, uv.getY(i) * 40);
  sandGeo.computeVertexNormals();
  const sand = new THREE.Mesh(sandGeo, M('sand')); sand.receiveShadow = true; sand.position.y = -0.01; sand.userData.dynamic = true;
  group.add(sand);

  const ocean = makeOcean();
  dyn.add(ocean);
  // islands on the horizon
  for (const [x, z, s] of [[-420, -900, 90], [380, -1100, 130], [80, -1300, 60]]) {
    const isl = new THREE.Mesh(new THREE.ConeGeometry(s, s * 0.45, 9, 1), new THREE.MeshStandardMaterial({ color: 0x4f6f55, roughness: 1, flatShading: true }));
    isl.position.set(x, s * 0.12, z); isl.scale.z = 0.6; group.add(isl);
  }

  // ---------- plaza, pavements, road ----------
  boxFromTo(group, M('paving'), -40, -0.05, 20.3, 40, 0.02, 34, { cast: false });
  boxFromTo(group, M('paving'), -400, -0.05, 34, 400, 0.12, 38, { cast: false });
  boxFromTo(group, M('stone'), -400, 0, 37.85, 400, 0.14, 38.05, { cast: false });
  boxFromTo(group, M('asphalt'), -400, -0.06, 38, 400, 0.01, 48, { cast: false });
  boxFromTo(group, M('stone'), -400, 0, 47.95, 400, 0.14, 48.15, { cast: false });
  boxFromTo(group, M('paving'), -400, -0.05, 48, 400, 0.12, 52, { cast: false });
  const lineMat = mat('roadLine', { color: 0xf2f2ea, roughness: 0.7 });
  const dash = []; for (let x = -396; x < 400; x += 6) if (Math.abs(x) > 5) dash.push(trs(x, 0.015, 43));
  instanced(group, [{ geometry: new THREE.BoxGeometry(3, 0.01, 0.15), material: lineMat }], dash, { cast: false });
  boxFromTo(group, lineMat, -400, 0.01, 38.35, 400, 0.02, 38.5, { cast: false });
  boxFromTo(group, lineMat, -400, 0.01, 47.5, 400, 0.02, 47.65, { cast: false });
  const stripes = []; for (let x = -2.75; x <= 2.75; x += 1.1) stripes.push(trs(x, 0.016, 43));
  instanced(group, [{ geometry: new THREE.BoxGeometry(0.55, 0.01, 8.6), material: lineMat }], stripes, { cast: false });
  // side paths from plaza to pool deck
  boxFromTo(group, M('paving'), -40, -0.05, -20.3, -36.5, 0.02, 20.3, { cast: false });
  boxFromTo(group, M('paving'), 36.5, -0.05, -20.3, 40, 0.02, 20.3, { cast: false });

  // ---------- city across the street ----------
  const facadeMat = mat('facade', { map: textures.facade('city', '#c6bcae', '#ffe2a0'), emissive: 0xffd28a, emissiveMap: textures.facade('city', '#c6bcae', '#ffe2a0'), emissiveIntensity: 0.0, roughness: 0.85 });
  const facadeMat2 = mat('facade2', { map: textures.facade('city2', '#8ea3ad', '#fff0c0'), emissive: 0xffe0a0, emissiveMap: textures.facade('city2', '#8ea3ad', '#fff0c0'), emissiveIntensity: 0.0, roughness: 0.7 });
  let r = 12345; const rnd = () => ((r = (r * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let x = -170; x < 170;) {
    const w = 12 + rnd() * 14, h = 9 + rnd() * 26, d = 14 + rnd() * 10;
    boxFromTo(group, rnd() > 0.5 ? facadeMat : facadeMat2, x, 0, 56, x + w, h, 56 + d);
    boxFromTo(group, M('darkSteel'), x - 0.2, h, 55.8, x + w + 0.2, h + 0.4, 56 + d + 0.2);
    x += w + 2 + rnd() * 3;
  }
  // garden hedges marking the resort boundary
  const hedge = M('leafDark');
  // the west hedge has a gap into Azure Gardens (scene/park.js)
  boxFromTo(group, hedge, -42, 0, -62, -41, 1.3, 22.7);
  boxFromTo(group, hedge, -42, 0, 28.3, -41, 1.3, 33.5);
  boxFromTo(group, hedge, 41, 0, -62, 42, 1.3, 33.5);
  boxFromTo(group, hedge, -42, 0, 33, -8, 0.9, 33.6);
  boxFromTo(group, hedge, 8, 0, 33, 42, 0.9, 33.6);

  // world limits
  addBox(-42, -41, -62, 22.7); addBox(-42, -41, 28.3, 33.5); addBox(41, 42, -62, 33.5);
  addBox(-42, -8, 33, 33.6, { maxY: 0.9 }); addBox(8, 42, 33, 33.6, { maxY: 0.9 });
  addBox(-500, 500, -600, -71.5);            // ocean
  addBox(-500, 500, 52.2, 600);              // buildings across the street
  addBox(-91, -90, 33.5, 52.2); addBox(90, 91, 33.5, 52.2);
  // fenced private land beside the resort (the west lawn north of z = -19.6 is the park)
  addBox(-91, -80.6, -72, 33.5); addBox(-80.6, -42, -72, -19.6); addBox(42, 91, -72, 33.5);
  // decorative fence along beach sides
  boxFromTo(group, M('lightWood'), -42, 0, -71.5, -41.8, 1.0, -62);
  boxFromTo(group, M('lightWood'), 41.8, 0, -71.5, 42, 1.0, -62);

  // ---------- palms (instanced + wind shader) ----------
  const palmSpots = [
    [-12, 22.5], [12, 22.5], [-20, 26], [20, 26], [-30, 23], [30, 23], [-38, 30], [38, 30], [-15, 32], [15, 32],
    [-39, 10], [-39, -5], [39, 10], [39, -5], [-38.5, 18], [38.5, 18],
    [-24, -26], [24, -24.5], [-33, -30], [34, -27], [-35, -48], [36, -52], [-26, -56], [20, -57], [-6, -56], [8, -58.5],
    [-30, -66], [-14, -67], [3, -66.5], [18, -66], [33, -67],
  ];
  const palmTrunk = palmTrunkGeo();
  const palmLeaves = palmLeavesGeo();
  const pm = palmSpots.map(([x, z], i) => trs(x, 0, z, i * 1.7, 0.85 + ((i * 37) % 10) / 30));
  const trunkMat = addWind(new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }), 0.06, 8);
  const leafMat = addWind(new THREE.MeshStandardMaterial({ color: 0x3e8a3a, roughness: 0.85, side: THREE.DoubleSide }), 0.1, 8);
  instanced(group, [{ geometry: palmTrunk, material: trunkMat }, { geometry: palmLeaves, material: leafMat }], pm);
  for (const [x, z] of palmSpots) addBox(x - 0.3, x + 0.3, z - 0.3, z + 0.3);

  // ---------- street lamps ----------
  const lampPole = new THREE.CylinderGeometry(0.07, 0.1, 5, 8); lampPole.translate(0, 2.5, 0);
  const lampArm = new THREE.BoxGeometry(0.08, 0.08, 1.2); lampArm.translate(0, 4.95, 0.55);
  const lampHead = new THREE.BoxGeometry(0.3, 0.12, 0.5); lampHead.translate(0, 4.88, 1.05);
  const lampM = []; for (let x = -84; x <= 84; x += 14) lampM.push(trs(x, 0, 37.3, 0));
  for (const [x, z] of [[-20, -22], [20, -22], [-28, -40], [-17, -55], [17, -55], [36, -38]]) lampM.push(trs(x, 0, z, Math.PI));
  instanced(group, [{ geometry: compose([[lampPole, null], [lampArm, null]]), material: M('darkSteel') }], lampM);
  instanced(dyn, [{ geometry: lampHead, material: M('lampGlow') }], lampM, { cast: false });
  for (const m of lampM) { const v = new THREE.Vector3().setFromMatrixPosition(m); addBox(v.x - 0.12, v.x + 0.12, v.z - 0.12, v.z + 0.12); }

  // flag poles at the entrance
  for (const x of [-9, -10.5, 9, 10.5]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 8, 8), M('steel')); pole.position.set(x, 4, 32.4); group.add(pole);
  }
  const flags = [];
  const flagGeo = new THREE.PlaneGeometry(1.4, 0.9, 10, 4); flagGeo.translate(0.7, 0, 0);
  [0x2a9d8f, 0xe9c46a, 0xe76f51, 0x264653].forEach((c, i) => {
    const f = new THREE.Mesh(flagGeo.clone(), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.9 }));
    f.position.set([-9, -10.5, 9, 10.5][i], 7.4, 32.4); f.userData.base = f.geometry.attributes.position.array.slice(); flags.push(f); dyn.add(f);
  });
  addBox(-10.7, -8.8, 32.2, 32.6); addBox(8.8, 10.7, 32.2, 32.6);

  // ---------- fountain spray ----------
  const N = profile.shadows ? 420 : 160;
  const sprayGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const respawn = (i) => {
    const a = Math.random() * Math.PI * 2, top = Math.random() < 0.4;
    pos[i * 3] = 0; pos[i * 3 + 1] = top ? 3.85 : 2.2; pos[i * 3 + 2] = 29;
    const sp = top ? 0.6 : 1.3;
    vel[i * 3] = Math.cos(a) * sp; vel[i * 3 + 1] = top ? 2.4 + Math.random() : 0.6 + Math.random() * 0.5; vel[i * 3 + 2] = Math.sin(a) * sp;
    life[i] = Math.random();
  };
  for (let i = 0; i < N; i++) respawn(i);
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  // round, soft water drops (a plain PointsMaterial draws hard white squares)
  const dropC = document.createElement('canvas'); dropC.width = dropC.height = 32;
  const dg = dropC.getContext('2d'), grad = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(235,248,255,0.8)'); grad.addColorStop(1, 'rgba(220,240,255,0)');
  dg.fillStyle = grad; dg.fillRect(0, 0, 32, 32);
  const dropT = new THREE.CanvasTexture(dropC); dropT.colorSpace = THREE.SRGBColorSpace;
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xe8f7ff, map: dropT, alphaMap: null, size: 0.07, transparent: true, opacity: 0.75, depthWrite: false, alphaTest: 0.02 }));
  spray.frustumCulled = false;
  dyn.add(spray);

  return {
    group, dyn, ocean,
    update(dt, t) {
      ocean.material.uniforms.uTime.value = t;
      for (let i = 0; i < N; i++) {
        vel[i * 3 + 1] -= 9.8 * dt;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        if (pos[i * 3 + 1] < 0.55) respawn(i);
      }
      sprayGeo.attributes.position.needsUpdate = true;
      for (const f of flags) {
        const a = f.geometry.attributes.position, b = f.userData.base;
        for (let i = 0; i < a.count; i++) { const x = b[i * 3]; a.setZ(i, Math.sin(x * 3 - t * 5 + f.position.x) * 0.12 * x); }
        a.needsUpdate = true;
      }
    },
    setNight(n) {
      facadeMat.emissiveIntensity = n * 1.4; facadeMat2.emissiveIntensity = n * 1.4;
      ocean.material.uniforms.uNight.value = n;
    },
  };
}

function palmTrunkGeo() {
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * 0.9, t * 7.5, 0)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.2, 7, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 7.5; const k = 1.25 - t * 0.45; const cx = Math.sin(t * 1.4) * 0.9; p.setX(i, cx + (p.getX(i) - cx) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g;
}
function palmLeavesGeo() {
  const parts = [];
  const top = new THREE.Vector3(Math.sin(1.4) * 0.9, 7.5, 0);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.PlaneGeometry(3.6, 0.7, 8, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) + 1.8; // 0..3.6 along the frond
      const w = Math.sin((x / 3.6) * Math.PI) * 0.9 + 0.1;
      p.setX(k, x); p.setY(k, p.getY(k) * w);
      p.setZ(k, -0.35 * x * x * 0.25 + 0.3 * x);
    }
    g.rotateX(-Math.PI / 2);
    g.rotateY(i / 9 * Math.PI * 2 + (i % 2) * 0.2);
    g.translate(top.x, top.y, top.z);
    g.computeVertexNormals();
    parts.push([g, null]);
  }
  parts.push([new THREE.SphereGeometry(0.35, 8, 6), new THREE.Matrix4().makeTranslation(top.x, top.y - 0.1, top.z)]);
  return compose(parts);
}

function makeOcean() {
  const geo = new THREE.PlaneGeometry(2400, 1300, 160, 80);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, -70 - 650);
  const m = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, fogColor: { value: new THREE.Color() } },
    vertexShader: `uniform float uTime; varying vec3 vW; varying float vH;
      void main(){ vec3 p = position;
        float h = sin(p.x*0.05 + uTime*0.9)*0.18 + sin(p.z*0.08 - uTime*1.3)*0.22 + sin((p.x+p.z)*0.13 + uTime*1.7)*0.08;
        p.y += h - 0.45; vH = h;
        vec4 w = modelMatrix * vec4(p,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform float uNight; varying vec3 vW; varying float vH;
      void main(){
        vec3 dx = dFdx(vW), dy = dFdy(vW); vec3 n = normalize(cross(dx, dy)); if (n.y < 0.0) n = -n;
        vec3 v = normalize(cameraPosition - vW);
        vec3 deep = mix(vec3(0.02,0.27,0.42), vec3(0.01,0.05,0.12), uNight);
        vec3 shallow = mix(vec3(0.12,0.62,0.68), vec3(0.03,0.15,0.22), uNight);
        float shore = smoothstep(-110.0, -73.0, vW.z);
        vec3 col = mix(deep, shallow, shore);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 sky = mix(vec3(0.75,0.86,0.95), vec3(0.08,0.12,0.22), uNight);
        col = mix(col, sky, fres * 0.7);
        vec3 sunD = normalize(vec3(-0.35, 0.6, -0.7));
        if (uNight > 0.5) sunD = normalize(vec3(0.2, 0.5, -0.9));
        float spec = pow(max(dot(reflect(-sunD, n), v), 0.0), 120.0);
        col += spec * mix(vec3(1.0,0.92,0.8), vec3(0.8,0.85,1.0)*0.6, uNight);
        float foam = smoothstep(-75.0, -72.5, vW.z) * (0.5 + 0.5*sin(uTime*1.5 + vW.x*0.3));
        col = mix(col, vec3(0.95), foam * 0.6 + smoothstep(0.25, 0.4, vH) * 0.25);
        float dist = length(cameraPosition.xz - vW.xz);
        float fogF = smoothstep(200.0, 1100.0, dist);
        col = mix(col, mix(vec3(0.81,0.88,0.92), vec3(0.04,0.08,0.14), uNight), fogF);
        gl_FragColor = vec4(col, 0.96);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const o = new THREE.Mesh(geo, m);
  o.userData.dynamic = true;
  return o;
}
