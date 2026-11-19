// scene/environment.js — sky, the guide's three-light setup, fog, day/night.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CONFIG } from '../config.js';
import { allMaterials } from './materials.js';

export function createEnvironment(scene, renderer, profile) {
  // 1. Directional light (sun) — warm #ffefd7, intensity ~2, the ONLY shadow caster
  const sun = new THREE.DirectionalLight(CONFIG.palette.sun, 2.2);
  sun.castShadow = profile.shadows;
  if (profile.shadows) {
    sun.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
    const s = sun.shadow.camera; // tight frustum that follows the player
    s.left = -34; s.right = 34; s.top = 34; s.bottom = -34; s.near = 1; s.far = 160;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  }
  scene.add(sun, sun.target);
  const sunDir = new THREE.Vector3(0.45, 0.78, 0.42).normalize();

  // 2. Hemisphere light (sky) — warm white from above, muted green from below
  const hemi = new THREE.HemisphereLight(CONFIG.palette.sky, CONFIG.palette.ground, 1.1);
  scene.add(hemi);

  // 3. Fill light — cool, low intensity, opposite side, no shadows
  const fill = new THREE.DirectionalLight(CONFIG.palette.fill, 0.5);
  fill.position.set(-40, 30, -30);
  scene.add(fill);

  // Physical sky
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.5; u.rayleigh.value = 1.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
  scene.add(sky);

  // Stars (only visible at night)
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 1500; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.45;
    sp.push(Math.cos(th) * Math.sin(ph) * 1500, Math.cos(ph) * 1500, Math.sin(th) * Math.sin(ph) * 1500);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  scene.add(stars);

  scene.fog = new THREE.Fog(0xcfe0ea, 90, 420);

  // Environment map for reflections (balanced/high)
  if (profile.env) {
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.35;
    pm.dispose();
  }

  const night = { t: 0, target: 0 };   // 0 = day, 1 = night
  const nightListeners = [];
  const daySky = new THREE.Color(0xcfe0ea), nightSky = new THREE.Color(0x0b1424);
  const sunPos = new THREE.Vector3();

  function applyNight(t) {
    const elev = THREE.MathUtils.lerp(38, -8, t) * Math.PI / 180;
    const az = 210 * Math.PI / 180;
    sunPos.setFromSphericalCoords(1, Math.PI / 2 - elev, az);
    u.sunPosition.value.copy(sunPos);
    sun.intensity = THREE.MathUtils.lerp(2.2, 0.0, t);
    hemi.intensity = THREE.MathUtils.lerp(1.1, 0.28, t);
    hemi.color.setHex(CONFIG.palette.sky).lerp(new THREE.Color(0x6f86b8), t);
    fill.intensity = THREE.MathUtils.lerp(0.5, 0.35, t);
    fill.color.setHex(CONFIG.palette.fill).lerp(new THREE.Color(0x5a74b8), t);
    scene.fog.color.copy(daySky).lerp(nightSky, t);
    stars.material.opacity = Math.max(0, t * 1.2 - 0.2);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(0.95, 0.85, t);
    if (scene.environmentIntensity !== undefined && profile.env) scene.environmentIntensity = THREE.MathUtils.lerp(0.35, 0.12, t);
    for (const f of nightListeners) f(t);
  }
  applyNight(0);

  return {
    sun, hemi, fill, sky,
    onNight(fn) { nightListeners.push(fn); },
    toggleNight() { night.target = night.target ? 0 : 1; return night.target; },
    isNight() { return night.target === 1; },
    /** keep the shadow frustum centred on the player, snapped to texels to avoid shimmer */
    update(dt, focus) {
      if (Math.abs(night.t - night.target) > 0.001) {
        night.t += Math.sign(night.target - night.t) * Math.min(Math.abs(night.target - night.t), dt * 0.6);
        applyNight(night.t);
      }
      const snap = profile.shadowSize ? 68 / profile.shadowSize : 0.1;
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.target.position.set(fx, 0, fz);
      sun.position.set(fx + sunDir.x * 70, sunDir.y * 70, fz + sunDir.z * 70);
    },
  };
}

/** Wind shader for foliage (guide: "Foliage swaying via a simple wind shader"). */
export const wind = { uniforms: { uTime: { value: 0 } } };
export function addWind(material, strength = 0.18, height = 6) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uniforms.uTime;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       float hgt = clamp(position.y / ${height.toFixed(1)}, 0.0, 1.0);
       vec3 ip = vec3(0.0);
       #ifdef USE_INSTANCING
         ip = instanceMatrix[3].xyz;
       #endif
       float w = sin(uTime * 1.3 + ip.x * 0.3 + ip.z * 0.2) * 0.6 + sin(uTime * 2.7 + ip.z) * 0.4;
       transformed.x += w * ${strength.toFixed(3)} * hgt * hgt * ${height.toFixed(1)} * 0.3;
       transformed.z += w * ${(strength * 0.6).toFixed(3)} * hgt * hgt * ${height.toFixed(1)} * 0.3;`
    );
  };
  material.customProgramCacheKey = () => 'wind' + strength + height;
  return material;
}
