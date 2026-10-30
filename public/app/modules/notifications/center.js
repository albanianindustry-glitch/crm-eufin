// Njoftimet: zilja me panel dhe shirit i butë lart për njoftimet e reja; klikimi të çon direkt te detyra/kërkesa/klienti.
import { html } from '../../core/html.js';
import { actions } from '../../core/actions.js';
import { dateTime } from '../../core/format.js';
import { go } from '../../core/router.js';

const state = { items: [], unread: 0, known: new Set(), primed: false, queue: [], timer: null, open: false };
const request = async (method, body) => {
  const r = await fetch('/api/notifications', { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error('njoftimet');
  return r.json();
};
export function target(link) {
  let l = null; try { l = typeof link === 'string' ? JSON.parse(link) : link; } catch { l = null; }
  if (!l) return '/today';
  return { task: `/tasks?open=${encodeURIComponent(l.id)}`, client: `/clients/${l.id}`, req: '/approvals', today: '/today', mine: '/today' }[l.t] || '/today';
}

function paintBell() {
  const b = document.getElementById('bell-count'); if (b) { b.textContent = state.unread > 9 ? '9+' : String(state.unread); b.hidden = !state.unread; }
  const panel = document.getElementById('notif-panel'); if (!panel) return;
  panel.hidden = !state.open; if (!state.open) return;
  panel.innerHTML = html`<header><b>Njoftimet</b><button class="btn small" data-action="notif.readall">Shëno të gjitha si të lexuara</button></header>${state.items.length ? state.items.map((n) => html`<button class="notif ${n.read ? '' : 'unread'}" data-action="notif.open" data-id="${n.id}">${n.text}<small>${dateTime(n.at)}</small></button>`) : html`<p class="empty">Asnjë njoftim.</p>`}`.toString();
}
function showNext() {
  const host = document.getElementById('banner-root'); if (!host || host.firstChild || !state.queue.length) return;
  const n = state.queue.shift(), el = document.createElement('div'); el.className = 'banner'; el.setAttribute('role', 'status');
  el.innerHTML = html`<div class="grow"><b>Njoftim i ri</b><span class="t">${n.text}</span></div><button class="btn small primary" data-action="notif.open" data-id="${n.id}">Hap</button><button class="icon-btn" data-action="notif.dismiss" aria-label="Mbyll">×</button>`.toString();
  host.appendChild(el); clearTimeout(state.timer); state.timer = setTimeout(() => { el.remove(); showNext(); }, 9000);
}
export async function pollNotifications() {
  const d = await request('GET'); state.items = d.items; state.unread = d.unread;
  if (!state.primed) { d.items.forEach((n) => state.known.add(n.id)); state.primed = true; }
  else for (const n of [...d.items].reverse()) if (!state.known.has(n.id)) { state.known.add(n.id); if (!n.read) state.queue.push(n); }
  paintBell(); showNext(); return d;
}
export const bell = () => html`<div class="bellwrap"><button class="bell" data-action="notif.toggle" aria-label="Njoftimet" title="Njoftimet">🔔<span class="badge" id="bell-count" hidden></span></button></div><div class="notif-panel" id="notif-panel" hidden></div>`;
export function startNotifications({ poll = true } = {}) {
  state.primed = false; state.known = new Set(); state.queue = [];
  const first = pollNotifications().catch(() => {});
  if (poll) setInterval(() => { if (!document.hidden) pollNotifications().catch(() => {}); }, 20000);
  return first;
}
const dismissBanner = () => { const host = document.getElementById('banner-root'); if (host) host.innerHTML = ''; clearTimeout(state.timer); showNext(); };
actions({
  'notif.toggle': async () => { state.open = !state.open; paintBell(); },
  'notif.dismiss': () => dismissBanner(),
  'notif.readall': async () => { await request('POST', {}); await pollNotifications(); },
  'notif.open': async (el) => {
    const n = state.items.find((x) => String(x.id) === el.getAttribute('data-id')) || state.queue.find((x) => String(x.id) === el.getAttribute('data-id'));
    state.open = false; dismissBanner();
    if (!n) return;
    try { await request('POST', { id: n.id }); } catch { /* */ }
    go(target(n.link)); globalThis.dispatchEvent(new Event('app:rerender')); await pollNotifications().catch(() => {});
  },
});
