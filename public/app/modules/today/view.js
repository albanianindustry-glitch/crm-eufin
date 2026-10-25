import { html, raw } from '../../core/html.js';
import { get, post } from '../../core/api.js';
import { actions, on } from '../../core/actions.js';
import { chip, empty, select, toast } from '../../core/ui.js';
import { refresh } from '../../core/app.js';
import { dateOnly } from '../../core/format.js';
import { taskTable } from '../tasks/table.js';
import { setMe } from '../tasks/detail.js';

const state = { d: null, who: 'all' };
const CAT = { monthly: 'Mujore', annual: 'Vjetore', turnover: 'Xhiro', suspension: 'Pezullim', payment: 'Pagesë', expiry: 'Skadim', contract: 'Kontratë', followup: 'Rikujtesë', onboarding: 'Regjistrim' };

const badge = (i) => (i.late ? chip(`${-i.daysLeft} ditë me vonesë`, 'bad') : i.daysLeft === 0 ? chip('sot', 'warn') : chip(`pas ${i.daysLeft} ditësh`, i.daysLeft <= 3 ? 'warn' : 'info'));

function actionControls(i) {
  return html`<div class="ob-actions">${i.actions.map((a, n) => {
    const base = html`data-action="ob.act" data-i="${i.key || i.clientId + i.kind + i.due}" data-n="${n}"`;
    if (a.type === 'done') return html`<button class="btn small success" ${base}>${a.label}</button>`;
    if (a.type === 'turnover') return html`<input type="number" min="0" class="inline" value="${a.value}" id="ob-in-${i.clientId}"><button class="btn small primary" ${base}>${a.label}</button>`;
    if (a.type === 'renew' || a.type === 'contract-renew') return html`<input type="date" class="inline" value="${a.suggested}" id="ob-in-${i.clientId}-${a.id || a.field}"><button class="btn small success" ${base}>${a.label}</button>`;
    if (a.type === 'contract-expire') return html`<button class="btn small danger" ${base}>${a.label}</button>`;
    return html`<button class="btn small" ${base}>${a.label}</button>`;
  })}</div>`;
}
const card = (i) => html`<article class="ob ${i.late ? 'late' : i.daysLeft <= 3 ? 'soon' : ''}"><div class="ob-main"><div class="ob-title">${i.clientId ? html`<a href="#/clients/${i.clientId}"><b>${i.clientName}</b></a>` : html`<b>${i.clientName}</b>`} <span class="muted">– ${i.title}</span></div>
  <p class="ob-note">${i.note}</p><small class="muted">Përgjegjës: ${i.responsible ? html`<b>${i.responsible}</b>` : raw('<b class="bad-text">pa caktuar</b>')} · ${CAT[i.category] || ''}</small>${actionControls(i)}</div>
  <div class="ob-due"><b>${dateOnly(i.due)}</b>${badge(i)}</div></article>`;

const visible = () => {
  const { who } = state, me = state.d.me.name;
  return state.d.items.filter((i) => (who === 'all' ? true : who === 'mine' ? i.responsible === me : who === '__none' ? !i.responsible : i.responsible === who));
};
const section = (title, list, cls = '') => (list.length ? html`<div class="card ${cls}"><h2>${title} <small class="muted">(${list.length})</small></h2>${list.map(card)}</div>` : '');

function body() {
  const list = visible(), late = list.filter((i) => i.late), today = list.filter((i) => !i.late && i.daysLeft === 0), soon = list.filter((i) => i.daysLeft > 0 && i.daysLeft <= 3), week = list.filter((i) => i.daysLeft > 3 && i.daysLeft <= 7), later = list.filter((i) => i.daysLeft > 7);
  const first = late[0] || today[0] || soon[0] || list[0];
  const myTasks = state.d.tasks.filter((t) => state.who === 'all' || (state.who === 'mine' ? t.assignees.includes(state.d.me.name) : state.who === '__none' ? !t.assignees.length : t.assignees.includes(state.who)));
  return html`<div class="summary ${late.length ? 'bad' : ''}">${list.length ? html`<b>Përmbledhje:</b> ${late.length ? html`<b class="bad-text">${late.length} me vonesë</b>, ` : ''}${today.length + soon.length ? `${today.length + soon.length} me afat brenda 3 ditësh, ` : ''}${list.length} detyrime gjithsej.${first ? html` <b>Fillo me:</b> ${first.clientName || '—'} – ${first.title}.` : ''}` : raw('Gjithçka është në rregull. Nuk ka detyrime të hapura.')}</div>
  ${section('Me vonesë', late, 'danger')}${section('Sot', today)}${section('Brenda 3 ditëve', soon)}${section('Këtë javë', week)}${section('Më vonë (deri në 14 ditë)', later)}
  ${myTasks.length ? html`<div class="card flush"><div class="card-pad"><h2>Detyra manuale me afat të afërt <small class="muted">(${myTasks.length})</small></h2></div>${taskTable(myTasks, state.d.me)}</div>` : ''}`;
}

export async function renderToday() {
  state.d = await get('/obligations/today'); setMe(state.d.me);
  const users = state.d.users;
  return html`<header class="page-head"><div><h1>Sot</h1><p class="muted">${dateOnly(state.d.today)} · çfarë kërkon vëmendjen tënde: detyrimet e klientëve, pagesat, skadimet dhe detyrat manuale.</p></div></header>
  <div class="filters">${select('who', [['mine', 'Të miat'], ...users.map((u) => [u, u]), ['__none', 'Pa përgjegjës']], state.who, { blank: 'Të gjithë', attrs: 'data-change="today.filter"' })}</div><div id="today-body">${body()}</div>`;
}

on('change', 'today.filter', (el) => { state.who = el.value || 'all'; const b = document.getElementById('today-body'); if (b) b.innerHTML = body().toString(); });
const lookup = (key) => state.d.items.find((i) => (i.key || i.clientId + i.kind + i.due) === key);
const ask = (res) => { if (res.status === 'pending_approval') toast('Ndryshimi u dërgua te administratori për miratim.', 'info', 6000); else toast('U ruajt.', 'success'); };
actions({
  'ob.act': async (el) => {
    const i = lookup(el.getAttribute('data-i')), a = i && i.actions[Number(el.getAttribute('data-n'))]; if (!a) return;
    const val = (sfx) => document.getElementById(`ob-in-${i.clientId}${sfx}`).value;
    if (a.type === 'done') { await post('/obligations/done', { key: i.key, done: true }); toast('U shënua si e kryer.', 'success'); }
    else if (a.type === 'turnover') ask(await post('/obligations/action', { type: 'turnover', clientId: i.clientId, value: Number(val('')) }));
    else if (a.type === 'notified' || a.type === 'prepaid') ask(await post('/obligations/action', { type: a.type, clientId: i.clientId }));
    else if (a.type === 'renew') ask(await post('/obligations/action', { type: 'renew', clientId: i.clientId, field: a.field, date: val('-' + a.field) }));
    else if (a.type === 'contract-renew') ask(await post('/obligations/action', { type: 'contract-renew', id: a.id, end: val('-' + a.id) }));
    else if (a.type === 'contract-expire') { await post('/obligations/action', { type: 'contract-expire', id: a.id }); toast('Kontrata u shënua si e pa-rinovuar.', 'success'); }
    else if (a.type === 'followup') { await post('/obligations/action', { type: 'followup', clientId: i.clientId, option: a.option }); toast('U regjistrua.', 'success'); }
    await refresh();
  },
});
export { empty };
