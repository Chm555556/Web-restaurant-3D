// systems/interact.js — everything the player can use: every chair, sofa, stool, bench,
// bed, sun lounger, armchair, the TVs, the laptops and the lobby guest computer.
// Walk up, press E (or click the prompt) to sit / lie / switch on; while seated, the
// activity bar offers what makes sense there (order food, use the laptop, watch TV…).
import * as THREE from 'three';
import { CHANNELS } from '../scene/furniture.js';

const $ = (id) => document.getElementById(id);

export function createInteractions({ scene, furn, hud, getPlayer, getNpcs, toggleNight, isNight }) {
  const A = furn.anchors;
  const items = [];
  const add = (it) => { it.x ??= it.a.x; it.z ??= it.a.z; items.push(it); return it; };

  for (const a of A.cafeSeats) add({ type: 'seat', a, where: 'cafe', label: 'Sit at the table' });
  for (const a of A.sofaSeats) add({ type: 'seat', a, where: 'sofa', label: 'Sit on the sofa' });
  for (const a of A.barStools) add({ type: 'seat', a, where: 'bar', label: 'Sit at the bar' });
  for (const a of A.benchSeats) add({ type: 'seat', a, where: 'bench', label: 'Sit on the bench' });
  for (const a of A.loungers) add({ type: 'lie', a, where: 'lounger', label: 'Lie on the sun lounger' });
  if (A.computer) add({ type: 'seat', a: A.computer, where: 'computer', label: 'Sit at the guest computer' });
  for (const [n, R] of Object.entries(A.rooms)) {
    add({ type: 'seat', a: R.bedEdge, where: 'bed', room: n, label: `Sit on the bed · Room ${n}` });
    add({ type: 'seat', a: R.desk, where: 'desk', room: n, label: 'Sit at the desk and use the laptop' });
    add({ type: 'seat', a: R.armchair, where: 'armchair', room: n, label: 'Sit in the armchair' });
    if (R.tv) add({ type: 'tv', tv: R.tv, room: n, x: R.tv.x, z: R.tv.z, get label() { return R.tv.on ? `Turn off the TV (${CHANNELS[R.tv.channel]})` : 'Turn on the TV'; } });
  }

  const radius = (it) => (it.type === 'tv' ? 1.3 : it.type === 'lie' ? 1.3 : 0.95);

  function isFree(a) {
    if (a.occupant) return false;
    for (const n of getNpcs()) {
      if (n.ch.root.position.y < -0.2) continue;
      if (Math.hypot(n.x - a.x, n.z - a.z) < 0.45) return false;
    }
    return true;
  }

  /** Closest usable thing within reach of the player (or null). */
  function nearest(p) {
    let best = null, bd = 1e9;
    for (const it of items) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d > radius(it) || d >= bd) continue;
      if (it.type !== 'tv' && !isFree(it.a)) continue;
      best = it; bd = d;
    }
    return best ? { item: best, d: bd } : null;
  }

  // ---------------- using things ----------------
  let current = null;          // the item the player is sitting / lying on
  let props = [];              // plates and cups that arrived with an order
  const orders = [];

  function use(it) {
    const p = getPlayer(); if (!p) return;
    if (it.type === 'tv') {
      it.tv.setPower(!it.tv.on);
      hud.toast(it.tv.on ? `TV on: ${CHANNELS[it.tv.channel]}` : 'TV off');
      return;
    }
    hud.fade(() => {
      p.sitOn(it.a, it.type === 'lie');
      current = it;
      showBar();
    }, 0.6);
  }

  function roomTV() { return current?.room ? A.rooms[current.room].tv : null; }

  function actionsFor(it) {
    const p = getPlayer(), list = [];
    const tv = roomTV();
    const tvBtns = () => tv ? [
      { label: tv.on ? 'TV off' : 'TV on', run: () => { tv.setPower(!tv.on); hud.toast(tv.on ? `TV on: ${CHANNELS[tv.channel]}` : 'TV off'); showBar(); } },
      ...(tv.on ? [{ label: 'Next channel', run: () => { tv.channel = (tv.channel + 1) % CHANNELS.length; hud.toast(`Channel ${tv.channel + 1}: ${CHANNELS[tv.channel]}`); p.ch.setPose('look', 0); } }] : []),
    ] : [];
    switch (it.where) {
      case 'cafe':
        list.push({ label: 'Order food', run: () => hud.showMenu({ order: (item) => placeOrder(item) }) });
        list.push({ label: p.ch.poseT.eat ? 'Stop eating' : 'Eat', run: () => { p.ch.setPose('eat', p.ch.poseT.eat ? 0 : 1); showBar(); } });
        break;
      case 'bar':
        list.push({ label: 'Order a drink', run: () => hud.showMenu({ order: (item) => placeOrder(item), only: 'Drinks' }) });
        list.push({ label: p.ch.poseT.eat ? 'Put the glass down' : 'Sip your drink', run: () => { p.ch.setPose('eat', p.ch.poseT.eat ? 0 : 1); showBar(); } });
        break;
      case 'desk':
        list.push({ label: 'Use the laptop', run: () => openDevice('laptop') });
        break;
      case 'computer':
        list.push({ label: 'Use the computer', run: () => openDevice('computer') });
        break;
      case 'bed':
        if (p.mode === 'lying') {
          list.push({ label: 'Sleep', run: sleep });
          list.push(...tvBtns());
          list.push({ label: 'Sit up', run: () => { p.sitOn(A.rooms[it.room].bedEdge); showBar(); } });
        } else {
          list.push({ label: 'Lie down', run: () => { const bl = A.rooms[it.room].bedLie; if (isFree(bl)) { p.sitOn(bl, true); showBar(); } else hud.toast('Someone is already lying there'); } });
          list.push(...tvBtns());
        }
        break;
      case 'armchair':
        list.push(...tvBtns());
        list.push({ label: p.ch.poseT.phone ? 'Put the phone away' : 'Use your phone', run: () => { p.ch.setPose('phone', p.ch.poseT.phone ? 0 : 1); showBar(); } });
        break;
      case 'lounger':
        list.push({ label: 'Order a tender coconut', run: () => placeOrder({ name: 'Tender coconut', price: 150 }) });
        break;
      default:
        list.push({ label: p.ch.poseT.phone ? 'Put the phone away' : 'Use your phone', run: () => { p.ch.setPose('phone', p.ch.poseT.phone ? 0 : 1); showBar(); } });
    }
    list.push({ label: 'Wave', run: () => p.wave() });
    list.push({ label: p.mode === 'lying' ? 'Get up' : 'Stand up', primary: true, run: () => p.standUp() });
    return list;
  }

  function showBar() {
    const bar = $('activity'), p = getPlayer();
    if (!current || !p || p.mode === 'free') { bar.hidden = true; return; }
    const acts = actionsFor(current);
    const where = { cafe: 'At a table in Café Azure', bar: 'At the pool bar', desk: `At the desk · Room ${current.room}`, computer: 'At the guest computer', bed: p.mode === 'lying' ? `In bed · Room ${current.room}` : `On the bed · Room ${current.room}`, armchair: `In the armchair · Room ${current.room}`, lounger: 'On a sun lounger', sofa: 'On the lobby sofa', bench: 'On a bench' }[current.where] || 'Sitting';
    bar.innerHTML = `<div class="eyebrow">${where}</div><div class="acts">${acts.map((a, i) => `<button data-i="${i}" class="${a.primary ? 'primary' : ''}">${a.label}</button>`).join('')}</div>`;
    bar.querySelectorAll('button').forEach((b) => { b.onclick = () => acts[+b.dataset.i].run(); });
    bar.hidden = false;
  }

  function sleep() {
    hud.fade(() => {
      if (isNight()) toggleNight();
      hud.toast('You slept well. Good morning!', 4);
    }, 1.6);
  }

  // ---------------- orders ----------------
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf5f3ee, roughness: 0.4 });
  const foodMat = new THREE.MeshStandardMaterial({ color: 0xd9822b, roughness: 0.8 });
  const drinkMat = new THREE.MeshStandardMaterial({ color: 0xf3c04f, roughness: 0.3, transparent: true, opacity: 0.9 });
  function placeOrder(item) {
    const isDrink = /lassi|chai|soda|coconut|cooler/i.test(item.name);
    orders.push({ item, t: isDrink ? 6 : 10, isDrink });
    hud.toast(`Order placed: ${item.name} · ₹${item.price}. ${isDrink ? 'Coming right up!' : 'It will be with you shortly.'}`, 4);
    hud.closePanel();
  }
  function deliver(o) {
    const p = getPlayer();
    hud.toast(`Your ${o.item.name.toLowerCase()} has arrived. Enjoy!`, 4);
    if (!p || p.mode === 'free' || !current) return;
    const a = current.a;
    const surf = { cafe: 0.79, bar: 1.17, desk: 0.79, computer: 0.78 }[current.where];
    const g = new THREE.Group();
    if (o.isDrink) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.034, 0.13, 12), drinkMat); cup.position.y = 0.065; g.add(cup);
    } else {
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.02, 18), plateMat); plate.position.y = 0.01;
      const food = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), foodMat); food.scale.y = 0.45; food.position.y = 0.04;
      g.add(plate, food);
    }
    g.traverse((m) => { m.castShadow = true; });
    if (surf) {
      const reach = current.where === 'bar' ? 0.5 : 0.42;
      g.position.set(a.x + Math.sin(a.yaw) * reach, surf, a.z + Math.cos(a.yaw) * reach);
    } else g.position.set(a.x + Math.sin(a.yaw + 1.4) * 0.5, 0.45, a.z + Math.cos(a.yaw + 1.4) * 0.5);
    scene.add(g); props.push(g);
    p.ch.setPose('eat', 1); showBar();
  }

  // ---------------- laptop / computer ----------------
  let notes = '';
  try { notes = localStorage.getItem('azure-notes') || ''; } catch { /* storage blocked */ }
  function openDevice(kind) {
    const p = getPlayer(); p.ch.setPose('type', 1);
    const d = $('device');
    const title = kind === 'laptop' ? `Laptop · Room ${current.room}` : 'Lobby guest computer';
    d.innerHTML = `<div class="dev-bar"><span>${title}</span><button class="close" aria-label="Close">✕</button></div>
      <div class="dev-body">
        <nav class="dev-apps" role="tablist">
          <button data-app="guide" class="on">Resort guide</button>
          <button data-app="service">Room service</button>
          <button data-app="today">Weather &amp; events</button>
          <button data-app="cricket">Cricket score</button>
          <button data-app="notes">Notes</button>
        </nav>
        <section class="dev-view" id="dev-view"></section>
      </div>`;
    d.hidden = false;
    const close = () => { d.hidden = true; p.ch.setPose('type', 0); };
    d.querySelector('.close').onclick = close;
    d.closeDevice = close;
    const view = $('dev-view');
    const apps = {
      guide: () => `<h3>Azure Bay guide</h3><p class="muted">Pick a place and you'll be taken there.</p>
        <div class="dev-list">${hud.zones().map((z) => `<button data-go="${z.id}"><b>${z.name}</b><small>${z.desc}</small></button>`).join('')}</div>`,
      service: () => `<h3>Room service</h3><p class="muted">Delivered to ${kind === 'laptop' ? `Room ${current.room}` : 'the lobby'} · 24 hours</p>${hud.menuHTML(true)}`,
      today: () => `<h3>Today in Goa</h3><p>${isNight() ? '🌙' : '☀️'} ${hud.info().weather[isNight() ? 'night' : 'day']}</p><h4>Events</h4><ul>${hud.info().events.map((e) => `<li>${e}</li>`).join('')}</ul><h4>Wi-Fi</h4><p>${hud.info().wifi.network} · password <b>${hud.info().wifi.password}</b></p>`,
      cricket: () => `<h3>India vs Australia · ODI</h3><p class="score">IND 214/3 <small>(36.2 ov)</small></p><p>Kohli 88* · Gill 61 · Target 289</p><p class="muted">Room TVs show it live on channel 1.</p>`,
      notes: () => `<h3>Notes</h3><textarea id="dev-notes" rows="8" placeholder="Write something…">${notes.replace(/</g, '&lt;')}</textarea><p class="muted">Saved in this browser.</p>`,
    };
    const show = (k) => {
      d.querySelectorAll('.dev-apps button').forEach((b) => b.classList.toggle('on', b.dataset.app === k));
      view.innerHTML = apps[k]();
      view.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { close(); hud.travel(b.dataset.go); }; });
      view.querySelectorAll('[data-order]').forEach((b) => { b.onclick = () => placeOrder(hud.item(b.dataset.order)); });
      const ta = $('dev-notes');
      if (ta) ta.oninput = () => { notes = ta.value; try { localStorage.setItem('azure-notes', notes); } catch { /* ignore */ } };
    };
    d.querySelectorAll('.dev-apps button').forEach((b) => { b.onclick = () => show(b.dataset.app); });
    show('guide');
  }

  // after standing up: clear the bar, close the laptop, take the plates away
  function onStand() {
    current = null; $('activity').hidden = true;
    const d = $('device'); if (!d.hidden) d.closeDevice?.();
    for (const g of props) scene.remove(g); props = [];
  }

  return {
    nearest, use, onStand, showBar,
    seated: () => current,
    closeDevice: () => { const d = $('device'); if (!d.hidden) { d.closeDevice?.(); return true; } return false; },
    order: placeOrder,
    update(dt) {
      for (let i = orders.length - 1; i >= 0; i--) { orders[i].t -= dt; if (orders[i].t <= 0) { deliver(orders[i]); orders.splice(i, 1); } }
    },
  };
}
