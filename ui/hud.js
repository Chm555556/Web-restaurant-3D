// ui/hud.js — the 2D HTML layer over the 3D canvas (guide: "UI Design — The 2D Layer on Top of 3D").
import { CONFIG } from '../config.js';
import { colliders } from '../systems/collision.js';

const $ = (id) => document.getElementById(id);

const MENU = CONFIG.menu;

export function createHUD() {
  const hud = $('hud');
  const toastEl = $('toast');
  let toastTimer = 0;
  const api = {
    showIntroProgress(p, text) {
      $('bar').style.width = (p * 100).toFixed(0) + '%';
      $('bar').parentElement.setAttribute('aria-valuenow', Math.round(p * 100));
      $('progress-text').textContent = text ?? `Loading the resort… ${Math.round(p * 100)}%`;
    },
    ready(onPick) {
      api.showIntroProgress(1, 'Ready. Choose who you want to be.');
      $('intro').classList.remove('loading');   // reveal the live 3D fly-over behind the card
      document.querySelectorAll('.avatar').forEach((b) => { b.disabled = false; b.onclick = () => onPick(b.dataset.kind); });
      document.querySelector('.avatar').focus();
    },
    start() { $('intro').classList.add('gone'); hud.hidden = false; setTimeout(() => { $('intro').hidden = true; }, 800); },
    setZone(z) {
      $('zone-name').textContent = z ? z.name : 'Resort Gardens';
      $('zone-desc').textContent = z ? z.desc : 'Palm gardens around the building. The pool deck is round the back.';
      document.querySelectorAll('#travel-list button').forEach((b) => b.classList.toggle('here', z && b.dataset.zone === z.id));
    },
    buildTravel(onGo) {
      const list = $('travel-list');
      CONFIG.travel.forEach((id, i) => {
        const z = CONFIG.zones.find((q) => q.id === id);
        const b = document.createElement('button');
        b.dataset.zone = id;
        b.innerHTML = `<i style="background:${z.color}"></i>${z.name.split(' ·')[0]}<kbd>${i + 1}</kbd>`;
        b.onclick = () => onGo(z);
        list.appendChild(b);
      });
    },
    prompt(text, key = 'E') {
      const p = $('prompt');
      if (!text) { p.hidden = true; p._last = ''; return; }
      const html = `<kbd>${key}</kbd><span>${text}</span>`;
      if (p._last !== html) { p.innerHTML = html; p._last = html; }   // avoid re-layout every frame
      p.hidden = false;
    },
    toast(msg, secs = 3) {
      toastEl.textContent = msg; toastEl.classList.remove('out');
      clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.add('out'), secs * 1000);
    },
    fade(mid) {
      const f = $('fade'); f.classList.add('on');
      setTimeout(() => { mid(); setTimeout(() => f.classList.remove('on'), 120); }, 360);
    },
    showCharacter(npc, onTalk) {
      const p = $('panel');
      p.hidden = false;
      p.innerHTML = `<button class="close" aria-label="Close">✕</button>
        <div class="eyebrow">${zoneName(npc.zone)}</div>
        <h3>${npc.name}</h3><div class="role">${npc.role}</div>
        <div class="row"><span>Right now</span><span class="state" id="panel-state">${npc.activity}</span></div>
        ${npc.state ? `<div class="row"><span>State machine</span><span id="panel-fsm" style="font-variant-numeric:tabular-nums;font-weight:700">${npc.state}</span></div>` : ''}
        <div class="row"><span>Wearing</span><span>${outfitName(npc.ch.outfit)}</span></div>
        <button class="primary" id="panel-talk">Walk over and chat</button>`;
      p.querySelector('.close').onclick = api.closePanel;
      $('panel-talk').onclick = () => { api.closePanel(); onTalk(npc); };
      api.panelNPC = npc;
    },
    refreshPanel() {
      const n = api.panelNPC; if (!n) return;
      const s = $('panel-state'); if (s) s.textContent = n.activity;
      const f = $('panel-fsm'); if (f) f.textContent = n.state;
    },
    /** The menu; with { order } every dish gets an Order button, { only } filters sections. */
    showMenu({ order = null, only = null } = {}) {
      const p = $('panel'); p.hidden = false; api.panelNPC = null;
      p.innerHTML = `<button class="close" aria-label="Close">✕</button><div class="eyebrow">Café Azure</div><h3>${order ? 'What would you like?' : 'Today\'s menu'}</h3>${api.menuHTML(!!order, only)}`;
      p.querySelector('.close').onclick = api.closePanel;
      if (order) p.querySelectorAll('[data-order]').forEach((b) => { b.onclick = () => order(api.item(b.dataset.order)); });
    },
    menuHTML(withOrder = false, only = null) {
      return `<div class="menu-list">${MENU.filter(([h]) => !only || h.startsWith(only)).map(([h, items]) => `<h4>${h}</h4>${items.map(([n, d, pr]) => `<div><span>${n}<small>${d}</small></span><b>₹${pr}${withOrder ? `<button class="order" data-order="${n}">Order</button>` : ''}</b></div>`).join('')}`).join('')}</div>`;
    },
    item(name) { for (const [, items] of MENU) for (const [n, desc, price] of items) if (n === name) return { name: n, desc, price }; return null; },
    zones: () => CONFIG.travel.map((id) => CONFIG.zones.find((z) => z.id === id)),
    info: () => CONFIG.info,
    setTravel(fn) { api.travel = (id) => fn(CONFIG.zones.find((z) => z.id === id)); },
    travel() {},
    closePanel() { $('panel').hidden = true; api.panelNPC = null; },
    showEscort(options, onPick) {
      const e = $('escort'); e.hidden = false;
      e.innerHTML = `<div class="eyebrow">Priya can walk you to</div><div class="opts">${options.map((o, i) => `<button data-i="${i}">${o.label}</button>`).join('')}</div><button class="cancel">Not now</button>`;
      e.querySelectorAll('.opts button').forEach((b) => b.onclick = () => { e.hidden = true; onPick(options[+b.dataset.i]); });
      e.querySelector('.cancel').onclick = () => { e.hidden = true; };
      e.querySelector('.opts button').focus();
    },
    escortOpen() { return !$('escort').hidden; },
    closeEscort() { $('escort').hidden = true; },
    setFPS(f) { $('fps').textContent = `${Math.round(f)} fps`; },
  };
  function outfitName(o) {
    if (!o?.style) return 'Resort clothes';
    const m = { kurta: o.vest != null ? 'Kurta pyjama with a Nehru jacket' : 'Kurta pyjama', sherwani: o.safa === null ? 'Sherwani' : 'Sherwani and safa', dhoti: 'Dhoti kurta' + (o.shawl ? ' with a shawl' : ''), chef: 'Chef\'s whites', guard: 'Security uniform', tee: 'T-shirt and shorts', swim: 'Swimwear', saree: 'Silk saree', lehenga: 'Lehenga choli', anarkali: 'Anarkali suit', salwar: 'Salwar kameez' };
    return (m[o.style] || o.style) + (o.turban ? ' and a pagri' : '');
  }
  function zoneName(id) { return CONFIG.zones.find((z) => z.id === id)?.name || 'Azure Bay'; }

  // ---------- minimap ----------
  const cv = $('minimap'), g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  // world window (north up): the resort, or slid west when you are in Azure Gardens
  const WINDOWS = { resort: [-46, 46], park: [-86, 6] };
  let X0 = -46, X1 = 46;
  const Z0 = -76, Z1 = 54;
  const sx = (x) => (x - X0) / (X1 - X0) * W, sz = (z) => (z - Z0) / (Z1 - Z0) * H;
  const bases = {};
  let base = null;
  function drawBase(win = 'resort') {
    [X0, X1] = WINDOWS[win];
    base = document.createElement('canvas'); base.width = W; base.height = H;
    bases[win] = base;
    const b = base.getContext('2d');
    b.fillStyle = '#21452f'; b.fillRect(0, 0, W, H);
    b.fillStyle = '#e5d3a3'; b.fillRect(0, sz(-72.7), W, sz(-62) - sz(-72.7));
    b.fillStyle = '#1e6f8a'; b.fillRect(0, 0, W, sz(-72.7));
    b.fillStyle = '#3d4247'; b.fillRect(0, sz(38), W, sz(48) - sz(38));
    b.fillStyle = '#9f988d'; b.fillRect(0, sz(34), W, sz(38) - sz(34)); b.fillRect(0, sz(48), W, sz(52) - sz(48));
    for (const z of CONFIG.zones) {
      if (['street', 'beach'].includes(z.id)) continue;
      const [x0, z0, x1, z1] = z.rect;
      b.fillStyle = z.color + (z.id === 'pool' || z.id === 'poolbar' ? '55' : 'cc');
      b.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0));
    }
    b.fillStyle = '#d8ccb4'; b.fillRect(sx(-40), sz(-62), sx(40) - sx(-40), sz(-20.4) - sz(-62));
    b.fillStyle = '#3fc6e0'; b.fillRect(sx(-14), sz(-46), sx(14) - sx(-14), sz(-30) - sz(-46));
    for (const r of [['lobby'], ['cafe'], ['kitchen'], ['rooms']]) {
      const z = CONFIG.zones.find((q) => q.id === r[0]); const [x0, z0, x1, z1] = z.rect;
      b.fillStyle = z.color; b.fillRect(sx(x0), sz(z0), sx(x1) - sx(x0), sz(z1) - sz(z0));
    }
    b.fillStyle = '#132a30';
    for (const c of colliders) {
      if (!c.cam || c.minY > 0.5) continue;
      if (c.maxX - c.minX > 120 || c.maxZ - c.minZ > 120) continue;
      b.fillRect(sx(c.minX), sz(c.minZ), Math.max(1.5, sx(c.maxX) - sx(c.minX)), Math.max(1.5, sz(c.maxZ) - sz(c.minZ)));
    }
    b.font = '600 15px Manrope, sans-serif'; b.fillStyle = 'rgba(255,255,255,0.85)'; b.textAlign = 'center';
    // Azure Gardens: paths and the circle
    b.strokeStyle = 'rgba(216,204,180,0.9)'; b.lineWidth = 3;
    b.beginPath(); b.ellipse(sx(-60), sz(6.5), (sx(-48.5) - sx(-71.5)) / 2, (sz(22.5) - sz(-10)) / 2, 0, 0, Math.PI * 2); b.stroke();
    b.beginPath(); b.moveTo(sx(-41), sz(25.5)); b.lineTo(sx(-53.5), sz(17)); b.lineTo(sx(-60), sz(7)); b.moveTo(sx(-59), sz(33.5)); b.lineTo(sx(-60), sz(7)); b.stroke();
    b.fillStyle = '#d8ccb4'; b.beginPath(); b.arc(sx(-60), sz(7), sx(-53.6) - sx(-60), 0, Math.PI * 2); b.fill();
    b.fillStyle = '#4fd1c5'; b.beginPath(); b.arc(sx(-60), sz(7), 4, 0, Math.PI * 2); b.fill();
    b.fillStyle = '#f4a7c4'; for (const [x, z] of [[-64.2, -13.4], [-55.6, -14.6], [-60.4, -16.6]]) { b.beginPath(); b.arc(sx(x), sz(z), 7, 0, Math.PI * 2); b.fill(); }
    b.fillStyle = '#6a7ae8'; for (const [x, z] of [[-46.2, -11], [-49.5, -16.2], [-45.4, 2.2], [-65.2, 15.6]]) { b.beginPath(); b.arc(sx(x), sz(z), 5, 0, Math.PI * 2); b.fill(); }
    b.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [t, x, z] of [['Café', -21, 0], ['Lobby', 0, 1], ['Rooms', 23, 11], ['Pool', 0, -38], ['Bar', 25, -30], ['Beach', 0, -66], ['Street', 20, 43], ['Gardens', -60, 28]]) b.fillText(t, sx(x), sz(z) + 5);
  }
  api.drawMap = (player, npcs) => {
    const win = player && player.x < -41.5 ? 'park' : 'resort';
    [X0, X1] = WINDOWS[win];
    base = bases[win];
    if (!base) drawBase(win);
    g.drawImage(base, 0, 0);
    for (const n of npcs) {
      g.fillStyle = n.core ? '#e3b866' : 'rgba(243,230,207,0.75)';
      g.beginPath(); g.arc(sx(n.x), sz(n.z), 2.6, 0, Math.PI * 2); g.fill();
    }
    if (player) {
      const x = sx(player.x), y = sz(player.z), a = player.yaw;
      g.save(); g.translate(x, y); g.rotate(-a + Math.PI);
      g.fillStyle = '#4fd1c5'; g.strokeStyle = '#06201d'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
  };
  return api;
}
