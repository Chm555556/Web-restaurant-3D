// ui/chat.js — type to anyone in English. Opens when you press E next to a person
// (or "Chat" in their info card). Replies come from characters/dialogue.js and also
// appear as a speech bubble above the character's head.
import { reply, opening, suggestions } from '../characters/dialogue.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createChat({ getPlayer, getCtx, onAction }) {
  const box = $('chat'), log = $('chat-log'), form = $('chat-form'), input = $('chat-input'), chips = $('chat-chips');
  let npc = null;

  function bubble(who, text, actions = []) {
    const row = document.createElement('div');
    row.className = 'msg ' + who;
    row.innerHTML = `<p>${esc(text)}</p>`;
    if (actions.length) {
      const a = document.createElement('div'); a.className = 'msg-acts';
      for (const act of actions) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = act.label;
        b.onclick = () => onAction(act, npc, api);
        a.appendChild(b);
      }
      row.appendChild(a);
    }
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function say(text) {
    const secs = Math.min(9, 2.5 + text.length / 22);
    npc.ch.say(text, secs);
    npc.ch.setPose('talk', npc.ch.pose.sit > 0.5 || npc.ch.lie ? 0.5 : 1);
    clearTimeout(npc._talkT); const n = npc;
    npc._talkT = setTimeout(() => n.ch.setPose('talk', 0), secs * 700);
  }

  function renderChips() {
    chips.innerHTML = '';
    for (const s of suggestions(npc, getCtx(npc))) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = s;
      b.onclick = () => send(s);
      chips.appendChild(b);
    }
  }

  function send(text) {
    text = text.trim(); if (!text || !npc) return;
    bubble('me', text);
    input.value = '';
    const r = reply(npc, text, getCtx(npc));
    const n = npc;
    setTimeout(() => {
      if (npc !== n) return;
      bubble('them', r.text, r.actions); say(r.text);
      if (r.end) setTimeout(() => { if (npc === n) api.close(); }, 1600);
    }, 380 + Math.min(900, r.text.length * 6));
  }

  const api = {
    open(target) {
      if (npc && npc !== target) api.close();
      npc = target;
      const p = getPlayer();
      npc.startChat?.(p);
      $('chat-name').textContent = npc.name;
      $('chat-role').textContent = npc.role;
      log.innerHTML = '';
      const hi = opening(npc, getCtx(npc));
      bubble('them', hi); say(hi);
      renderChips();
      box.hidden = false; document.getElementById('hud').classList.add('chatting');
      setTimeout(() => input.focus(), 30);
    },
    close() {
      if (!npc) return;
      npc.endChat?.(); npc = null;
      box.hidden = true; input.blur(); document.getElementById('hud').classList.remove('chatting');
    },
    isOpen: () => !!npc,
    current: () => npc,
    /** Close automatically when the player walks away. */
    update() {
      const p = getPlayer();
      if (npc && p && Math.hypot(p.x - npc.x, p.z - npc.z) > 6.5 && !npc.following) api.close();
    },
  };

  form.addEventListener('submit', (e) => { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); api.close(); } e.stopPropagation(); });
  $('chat-close').onclick = () => api.close();
  return api;
}
