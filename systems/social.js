// systems/social.js — gestures between you and the people around you.
// Solo gestures (wave, namaste, clap, dance…) are answered by whoever you are facing.
// Partner gestures (handshake, high five) bring you to arm's length, turn you both to
// face each other and drive both right hands to the same point with arm IK, so the
// hands really meet.
import * as THREE from 'three';
import { GESTURES } from '../characters/character.js';
import { walkable } from './nav.js';

const $ = (id) => document.getElementById(id);
const MENU = ['wave', 'namaste', 'handshake', 'highfive', 'bow', 'clap', 'cheer', 'dance', 'laugh', 'nod', 'headshake', 'think'];
const CHAT = ['namaste', 'handshake', 'highfive', 'wave', 'laugh'];

export function createSocial({ getPlayer, getNpcs, hud, chat }) {
  const _a = new THREE.Vector3(), _b = new THREE.Vector3();

  /** The person you mean: who you're chatting with, else the closest one in front of you. */
  function partner(max = 3.4) {
    const c = chat.current(); if (c) return c;
    const p = getPlayer(); if (!p) return null;
    let best = null, bd = max;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    for (const n of getNpcs()) {
      if (n.ch.root.position.y < -0.3 || !n.ch.root.visible) continue;
      const tp = n.talkPos(), dx = tp.x - p.x, dz = tp.z - p.z, d = Math.hypot(dx, dz);
      if (d > bd || d < 0.05) continue;
      if ((dx * fx + dz * fz) / d < -0.2 && d > 1.2) continue;     // behind you
      bd = d; best = n;
    }
    return best;
  }

  function chest(ch, out) { return ch.bones.Spine2 ? ch.bones.Spine2.getWorldPosition(out) : out.set(ch.x, 1.3, ch.z); }

  function perform(kind) {
    const p = getPlayer(); if (!p || p.busy) return;
    const G = GESTURES[kind]; if (!G) return;
    closeMenu();
    const npc = partner();
    if (!G.partner) {
      p.gesture(kind);
      if (npc && Math.hypot(npc.x - p.x, npc.z - p.z) < 4.2) npc.react(kind, p);
      return;
    }
    if (!npc) { p.gesture(kind === 'handshake' ? 'namaste' : 'wave'); hud.toast(`Walk up to someone first to ${G.label.toLowerCase()}`, 3); return; }
    if (!npc.canPartner()) { p.gesture('namaste'); npc.react('namaste', p); return; }
    npc.hold(p, 6);
    const go = () => {
      const d = Math.hypot(npc.x - p.x, npc.z - p.z);
      if (d > 1.45) {               // a counter or a table between you: greet instead
        p.gesture('namaste'); npc.react('namaste', p);
        hud.toast(`${npc.name} is too far across the counter, so you greet with a namaste`, 3);
        return;
      }
      const high = kind === 'highfive';
      const point = (out) => {
        chest(p.ch, _a); chest(npc.ch, _b);
        out.addVectors(_a, _b).multiplyScalar(0.5);
        // a seated partner can't reach down to waist height: meet higher, between both chests
        const seated = npc.ch.pose.sit > 0.5 || p.ch.pose.sit > 0.5;
        out.y = high ? Math.max(_a.y, _b.y) + 0.36 : seated ? (_a.y + _b.y) / 2 - 0.12 : Math.min(_a.y, _b.y) - 0.36;
        return out;
      };
      p.gesture(kind, { point });
      npc.react(kind, p, { point, dur: G.dur });
    };
    // step to arm's length, facing them (unless you are sitting)
    const tp = npc.talkPos();
    const reach = npc.ch.pose.sit > 0.5 ? 0.78 : kind === 'highfive' ? 0.85 : 0.82 * (p.ch.k + npc.ch.k) / 2 + 0.12;
    if (p.mode === 'free') {
      const dx = p.x - npc.x, dz = p.z - npc.z, d = Math.hypot(dx, dz) || 1;
      let tx = npc.x + dx / d * reach, tz = npc.z + dz / d * reach;
      if (!walkable(tx, tz)) { tx = p.x; tz = p.z; }
      p.walkTo(tx, tz, go, 2.2, Math.atan2(npc.x - tx, npc.z - tz));
    } else if (Math.hypot(tp.x - p.x, tp.z - p.z) < 1.5) go();
    else { p.gesture('namaste'); npc.react('namaste', p); }
  }

  // ---------------- menu ----------------
  const menu = $('gestures'), btn = $('btn-gest');
  menu.innerHTML = `<div class="eyebrow"><span>Gestures</span><em>G to close</em></div>` +
    MENU.map((k) => `<button type="button" data-g="${k}" role="menuitem" title="${GESTURES[k].label}"><span>${GESTURES[k].icon}</span>${GESTURES[k].label}</button>`).join('');
  menu.querySelectorAll('button').forEach((b) => { b.onclick = () => perform(b.dataset.g); });
  function openMenu() { menu.hidden = false; btn.setAttribute('aria-pressed', 'true'); }
  function closeMenu() { menu.hidden = true; btn.setAttribute('aria-pressed', 'false'); }
  btn.onclick = () => (menu.hidden ? openMenu() : closeMenu());

  const row = $('chat-gest');
  row.innerHTML = CHAT.map((k) => `<button type="button" data-g="${k}">${GESTURES[k].icon} ${GESTURES[k].label}</button>`).join('');
  row.querySelectorAll('button').forEach((b) => { b.onclick = () => perform(b.dataset.g); });

  return {
    perform, partner,
    toggleMenu: () => (menu.hidden ? openMenu() : closeMenu()),
    closeMenu, menuOpen: () => !menu.hidden,
  };
}
