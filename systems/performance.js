// systems/performance.js — quality profiles, device detection, FPS meter,
// pause-when-hidden (guide, chapter 5).
import { CONFIG } from '../config.js';

const KEY = 'azurebay.quality';

/** Detect device capability and choose the right quality profile automatically. */
export function detectQuality() {
  try { const saved = localStorage.getItem(KEY); if (saved && CONFIG.quality[saved]) return saved; } catch (e) { /* storage blocked */ }
  const ram = navigator.deviceMemory;                       // GB — Chrome/Edge only
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const isLowRAM = ram && ram <= 4;
  if (isMobile && isLowRAM) return 'low';                  // weak phone
  if (isMobile) return 'balanced';                          // average phone
  return 'high';                                            // desktop / laptop
}

export function saveQuality(q) { try { localStorage.setItem(KEY, q); return localStorage.getItem(KEY) === q; } catch (e) { return false; } }

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGL2RenderingContext && c.getContext('webgl2')) || !!c.getContext('webgl');
  } catch (e) { return false; }
}

export class FPSMeter {
  constructor() { this.frames = 0; this.acc = 0; this.fps = 60; }
  tick(dt) { this.frames++; this.acc += dt; if (this.acc >= 0.5) { this.fps = this.frames / this.acc; this.frames = 0; this.acc = 0; return true; } return false; }
}

/** Stop the loop while the tab is hidden — saves battery. */
export function pauseWhenHidden(renderer, loop, clock) {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) renderer.setAnimationLoop(null);
    else { clock.getDelta(); renderer.setAnimationLoop(loop); }
  });
}
