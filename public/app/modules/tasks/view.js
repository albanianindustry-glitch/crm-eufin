import { html, raw } from '../../core/html.js';
import { get } from '../../core/api.js';
import { actions, on } from '../../core/actions.js';
import { select } from '../../core/ui.js';
import { daysFrom, duration, today } from '../../core/format.js';
import { isLate, isOpen, taskTable } from './table.js';
import { openTaskForm } from './form.js';
import { setMe, showTask } from './detail.js';
import { registerTasks, taskById } from './table.js';
import { onRendered } from '../../core/app.js';

const state = { team: null, tasks: [], users: [], me: { name: '', role: 'accountant' }, f: { scope: 'mine', q: '', who: '', st: 'open', when: '' } };
const mineOf = (t) => t.assignees.includes(state.me.name) || (!t.assignees.length && t.createdBy === state.me.name);

function filtered() {
  const { scope, q, who, st, when } = state.f, needle = q.trim().toLowerCase();
  return state.tasks.filter((t) => {
    if (scope === 'mine' && !mineOf(t)) return false;
    if (st === 'open' && !isOpen(t)) return false; if (st === 'late' && !isLate(t)) return false; if (['todo', 'prog', 'done'].includes(st) && t.status !== st) return false;
    if (who === '__none') { if (t.assignees.length) return false; } else if (who && !t.assignees.includes(who)) return false;
    if (when === 'today' && t.due !== today()) return false;
    if (when === 'week') { const d = t.due ? daysFrom(t.due) : 999; if (!(d >= 0 && d <= 7)) return false; }
    if (needle && ![t.title, t.clientName, t.assignees.join(' '), t.createdBy].join(' ').toLowerCase().includes(needle)) return false;
    return true;
  }).sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    if (!isOpen(a)) return (b.doneTs || b.doneAt) > (a.doneTs || a.doneAt) ? 1 : -1;
    return (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : 0;
  });
}

const kpis = () => {
  const pool = state.f.scope === 'mine' ? state.tasks.filter(mineOf) : state.tasks, open = pool.filter(isOpen), late = open.filter(isLate), done30 = pool.filter((t) => t.status === 'done' && t.doneAt && daysFrom(t.doneAt) >= -30);
  const timed = pool.filter((t) => t.status === 'done' && t.minutes), avg = timed.length ? timed.reduce((s, t) => s + t.minutes, 0) / timed.length : null;
  return html`<div class="kpis"><div class="kpi"><small>Të hapura</small><b>${open.length}</b></div><div class="kpi"><small>Me vonesë</small><b class="${late.length ? 'bad-text' : 'ok-text'}">${late.length}</b></div>
  <div class="kpi"><small>Afati sot</small><b>${open.filter((t) => t.due === today()).length}</b></div><div class="kpi"><small>Kryer (30 ditë)</small><b>${done30.length}</b></div><div class="kpi"><small>Koha mesatare e kryerjes</small><b>${avg == null ? '—' : duration(avg)}</b></div></div>`;
};

const people = () => {
  const names = [...new Set([...state.users, ...state.tasks.flatMap((t) => t.assignees)])];
  const rows = names.map((n) => {
    const mine = state.tasks.filter((t) => t.assignees.includes(n)), o = mine.filter(isOpen), late = o.filter(isLate), done = mine.filter((t) => t.status === 'done'), timed = done.filter((t) => t.minutes), total = timed.reduce((s, t) => s + t.minutes, 0);
    return html`<tr><td><b>${n}</b></td><td>${o.length}</td><td>${late.length ? html`<b class="bad-text">${late.length}</b>` : '0'}</td><td>${done.length}</td><td>${timed.length ? duration(total) : '—'}</td><td>${timed.length ? duration(total / timed.length) : '—'}</td></tr>`;
  });
  return html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Anëtari</th><th>Të hapura</th><th>Me vonesë</th><th>Të kryera</th><th>Koha totale</th><th>Koha mesatare</th></tr></thead><tbody>${rows}</tbody></table></div>`;
};

const obligationsTeam = () => {
  const t = state.team; if (!t) return '';
  const row = (name, p) => html`<tr><td><b>${name}</b></td><td>${p.open}</td><td>${p.late ? html`<b class="bad-text">${p.late}</b>` : '0'}</td><td>${p.soon ?? '—'}</td><td>${p.next.length ? p.next.map((n) => html`<div>${n.clientId ? html`<a href="#/clients/${n.clientId}">${n.clientName}</a>` : ''} <span class="muted">– ${n.title}</span> <small class="${n.late ? 'bad-text' : 'muted'}">${n.due}</small></div>`) : raw('<span class="muted">—</span>')}</td></tr>`;
  return html`<div class="card flush"><div class="card-pad"><h2>Detyrimet e klientëve sipas anëtarit <small class="muted">(mujore, vjetore, pagesa, skadime)</small></h2></div><div class="table-wrap"><table class="tbl"><thead><tr><th>Anëtari</th><th>Të hapura</th><th>Me vonesë</th><th>Brenda 3 ditëve</th><th>Më të afërtat</th></tr></thead><tbody>${t.people.map((p) => row(p.name, p))}${t.unassigned.open ? row('Pa përgjegjës', { ...t.unassigned, soon: undefined }) : ''}</tbody></table></div></div>`;
};
const body = () => { const rows = filtered(); return html`${kpis()}${state.f.scope === 'team' ? html`<div class="card"><h2>Ngarkesa e detyrave manuale sipas anëtarit</h2>${people()}</div>${obligationsTeam()}` : ''}<div class="card flush"><div class="card-pad"><h2>Detyrat <small class="muted">(${rows.length})</small></h2></div>${taskTable(rows, state.me)}</div>`; };

let pendingOpen = null;
onRendered(() => {
  if (!pendingOpen) return;
  const t = taskById(pendingOpen); pendingOpen = null;
  if (globalThis.history && /[?&]open=/.test(globalThis.location.hash)) globalThis.history.replaceState(null, '', globalThis.location.pathname + globalThis.location.search + '#/tasks');   // lidhja përdoret një herë
  if (t) showTask(t);
});
export async function renderTasks({ query = {} } = {}) {
  pendingOpen = query.open || null;
  const d = await get('/tasks'); registerTasks(d.tasks); state.team = state.f.scope === 'team' ? await get('/obligations/team') : null; state.tasks = d.tasks; state.users = d.users; state.me = d.me; setMe(d.me);
  const f = state.f;
  return html`<header class="page-head"><div><h1>Detyrat</h1><p class="muted">Detyrat manuale të studios: kush është përgjegjës, afati, koha dhe kush e ka kryer.</p></div><button class="btn primary" data-action="task.new">+ Detyrë e re</button></header>
  <div class="tabs"><button class="${f.scope === 'mine' ? 'on' : ''}" data-action="tasks.scope" data-scope="mine">Të miat</button><button class="${f.scope === 'team' ? 'on' : ''}" data-action="tasks.scope" data-scope="team">Ekipi</button></div>
  <div class="filters"><input type="search" name="q" placeholder="Kërko detyrë, klient, person…" value="${f.q}" data-input="tasks.filter" autocomplete="off">
  ${f.scope === 'team' ? select('who', [...state.users.map((u) => [u, u]), ['__none', 'Pa caktuar']], f.who, { blank: 'Të gjithë anëtarët', attrs: 'data-change="tasks.filter"' }) : ''}
  ${select('st', [['open', 'Të hapura'], ['late', 'Me vonesë'], ['todo', 'Për t’u bërë'], ['prog', 'Në proces'], ['done', 'Të kryera'], ['', 'Të gjitha']], f.st, { attrs: 'data-change="tasks.filter"' })}
  ${select('when', [['', 'Çdo afat'], ['today', 'Afati sot'], ['week', 'Brenda 7 ditëve']], f.when, { attrs: 'data-change="tasks.filter"' })}</div><div id="tasks-body">${body()}</div>`;
}

const repaint = () => { const el = document.getElementById('tasks-body'); if (el) el.innerHTML = body().toString(); };
const setFilter = (el) => { state.f[el.name] = el.value; repaint(); };
on('input', 'tasks.filter', setFilter); on('change', 'tasks.filter', setFilter);
actions({
  'tasks.scope': (el) => { state.f.scope = el.getAttribute('data-scope'); if (state.f.scope === 'mine') state.f.who = ''; globalThis.dispatchEvent(new Event('app:rerender')); },
  'task.new': () => openTaskForm(),
});
export { raw };
