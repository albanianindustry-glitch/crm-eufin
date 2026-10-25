// Guaska e aplikacionit: autentikimi, navigimi, rruget dhe rifreskimi. Çdo modul regjistron veprimet e veta.
import { html, raw } from './core/html.js';
import { get } from './core/api.js';
import { setUnauthenticatedHandler } from './core/api.js';
import { attach, actions, setErrorReporter } from './core/actions.js';
import { clearRoutes, route, parseHash, match } from './core/router.js';
import { setRerender } from './core/app.js';
import { closeModal, toast } from './core/ui.js';
import { renderList } from './modules/clients/list.js';
import { renderForm } from './modules/clients/form.js';
import { renderProfile } from './modules/clients/profile.js';
import { renderTasks } from './modules/tasks/view.js';
import { renderApprovals } from './modules/approvals/view.js';
import { renderToday } from './modules/today/view.js';
import { renderObligations } from './modules/obligations/view.js';
import { isLate, isOpen } from './modules/tasks/table.js';

const TITLES = { '/today': 'Sot', '/obligations': 'Detyrimet', '/tasks': 'Detyrat', '/clients': 'Klientët', '/approvals': 'Miratime' };
let session = null, token = 0, root = null, timer = null;

const shell = (me) => html`<div class="app-shell"><aside class="sidebar"><div class="brand">CRM Studio</div>
  <nav class="nav" aria-label="Navigimi kryesor"><a href="#/today" data-nav="/today">Sot <span class="badge" id="badge-today" hidden></span></a><a href="#/obligations" data-nav="/obligations">Detyrimet</a><a href="#/tasks" data-nav="/tasks">Detyrat <span class="badge" id="badge-tasks" hidden></span></a><a href="#/clients" data-nav="/clients">Klientët</a>${me.role === 'admin' ? html`<a href="#/approvals" data-nav="/approvals">Miratime <span class="badge warn" id="badge-approvals" hidden></span></a>` : ''}</nav>
  <div class="nav-foot"><a class="legacy" href="/">Module të tjera (TVSH, faturim, dogana…) →</a></div></aside>
  <div class="main"><header class="topbar"><div class="grow"></div><div class="user"><span class="avatar sm">${String(me.name || '?').charAt(0).toUpperCase()}</span><span><b>${me.name}</b><small>${me.role === 'admin' ? 'Administrator' : 'Kontabilist'}</small></span><button class="btn small" data-action="app.logout">Dil</button></div></header>
  <main id="view" class="view" tabindex="-1" aria-live="polite"></main></div></div>`;

function markNav(path) { root.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', path === a.getAttribute('data-nav') || path.startsWith(a.getAttribute('data-nav') + '/'))); }

async function renderRoute() {
  const my = ++token, { path, query } = parseHash(), view = document.getElementById('view'); if (!view) return;
  const found = match(path === '/' ? '/today' : path);
  markNav(path === '/' ? '/today' : path);
  if (!found) { view.innerHTML = '<div class="card"><h1>Faqja nuk u gjet</h1><p><a href="#/tasks">Kthehu te detyrat</a></p></div>'; return; }
  const keep = view.scrollTop;
  try {
    const out = await found.handler({ params: found.params, query });
    if (my !== token) return;
    view.innerHTML = out.toString(); view.scrollTop = keep; document.title = `${TITLES['/' + path.split('/')[1]] || 'CRM'} · CRM Studio`;
  } catch (e) {
    if (my !== token) return;
    view.innerHTML = html`<div class="card"><h1>Nuk u ngarkua</h1><p>${e.message}</p><button class="btn" data-action="app.reload">Provo përsëri</button></div>`.toString();
  }
  updateBadges();
}

async function updateBadges() {
  try {
    const t = await get('/tasks'), mine = t.tasks.filter((x) => isOpen(x) && (x.assignees.includes(session.me.name))), late = mine.filter(isLate).length, el = document.getElementById('badge-tasks');
    if (el) { el.textContent = late || mine.length; el.hidden = !mine.length; el.className = 'badge' + (late ? ' bad' : ''); el.title = late ? `${late} me vonesë` : `${mine.length} të hapura`; }
    const o = await get('/obligations/today'), mineO = o.items.filter((x) => x.responsible === session.me.name), lateO = mineO.filter((x) => x.late).length, bt = document.getElementById('badge-today');
    if (bt) { bt.textContent = lateO || mineO.length; bt.hidden = !mineO.length; bt.className = 'badge' + (lateO ? ' bad' : ''); bt.title = lateO ? `${lateO} me vonesë` : `${mineO.length} detyrime`; }
    if (session.me.role === 'admin') { const a = await get('/approvals'), b = document.getElementById('badge-approvals'); if (b) { b.textContent = a.pending.length; b.hidden = !a.pending.length; } }
  } catch { /* badge-et nuk janë kritike */ }
}

export async function start({ mount = document.getElementById('app'), poll = true } = {}) {
  root = mount;
  setUnauthenticatedHandler(() => { if (globalThis.location && !globalThis.__TEST__) globalThis.location.href = '/login.html'; });
  setErrorReporter((e) => toast(e && e.message ? e.message : 'Ndodhi një gabim i papritur.', 'error'));
  session = await get('/session');
  root.innerHTML = shell(session.me).toString();
  attach(document.body);
  clearRoutes();
  route('/today', renderToday); route('/obligations', renderObligations); route('/tasks', renderTasks); route('/clients', renderList); route('/clients/new', renderForm); route('/clients/:id', renderProfile); route('/clients/:id/edit', renderForm);
  route('/approvals', async (ctx) => (session.me.role === 'admin' ? renderApprovals(ctx) : html`<div class="card"><h1>Nuk ke leje</h1><p>Vetëm administratori i sheh kërkesat për miratim.</p></div>`));
  setRerender(renderRoute);
  globalThis.addEventListener('hashchange', renderRoute); globalThis.addEventListener('app:rerender', renderRoute);
  if (poll) { clearInterval(timer); timer = setInterval(() => { if (!document.hidden && !document.querySelector('.modal-backdrop') && !(document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))) renderRoute(); }, 60000); }
  await renderRoute();
  return { render: renderRoute, session };
}

actions({
  'modal.close': (el) => closeModal(el),
  'app.reload': () => renderRoute(),
  'app.logout': async () => { await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'crm' } }); ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX', 'crmReq'].forEach((k) => { try { localStorage.removeItem(k); } catch { /* */ } }); globalThis.location.href = '/login.html'; },
});
export { raw };
