import { html, raw } from '../../core/html.js';
import { get } from '../../core/api.js';
import { money } from '../../core/format.js';
import { actions, on } from '../../core/actions.js';
import { chip, empty, select } from '../../core/ui.js';
import { PAYMENT, STATUS, paymentChip, statusChip } from './model.js';

const state = { clients: [], users: [], me: null, f: { q: '', status: 'aktiv', who: '', pay: '', sort: 'name' } };

function filtered() {
  const q = state.f.q.trim().toLowerCase(), { status, who, pay, sort } = state.f;
  const rows = state.clients.filter((c) => (!status || c.status === status) && (!who || (who === '__none' ? !c.responsible : c.responsible === who)) && (!pay || c.paymentStatus === pay)
    && (!q || [c.name, c.nipt, c.administrator, c.phone, c.email].join(' ').toLowerCase().includes(q)));
  const by = { name: (a, b) => a.name.localeCompare(b.name, 'sq'), fee: (a, b) => b.monthlyFee - a.monthlyFee, late: (a, b) => b.lateTasks - a.lateTasks || a.name.localeCompare(b.name, 'sq') }[sort] || (() => 0);
  return rows.sort(by);
}

function table() {
  const rows = filtered();
  if (!rows.length) return empty('Asnjë klient sipas filtrave të zgjedhur.');
  const admin = state.me.role === 'admin';
  return html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Klienti</th><th>Përgjegjës</th><th class="num">Tarifa mujore</th><th>Pagesa</th><th>Detyra</th><th>Statusi</th></tr></thead><tbody>${rows.map((c) => html`
    <tr class="row-link" data-action="nav" data-href="/clients/${c.id}"><td><a href="#/clients/${c.id}"><b>${c.name}</b></a><small class="sub">${c.nipt}${c.administrator ? ' · ' + c.administrator : ''}</small></td>
    <td>${c.responsible || raw('<span class="muted">pa caktuar</span>')}</td><td class="num">${money(c.monthlyFee)}</td><td>${paymentChip(c.paymentStatus)}</td>
    <td>${c.openTasks ? html`${c.openTasks}${c.lateTasks ? chip(`${c.lateTasks} me vonesë`, 'bad') : ''}` : raw('<span class="muted">—</span>')}</td>
    <td>${statusChip(c.status)}${admin && c.pendingRequests ? chip(`${c.pendingRequests} kërkesë`, 'warn') : ''}</td></tr>`)}</tbody></table></div><p class="muted count">${rows.length} nga ${state.clients.length} klientë</p>`;
}

export async function renderList() {
  const data = await get('/clients'); state.clients = data.clients; state.users = data.users; state.me = data.me;
  const f = state.f;
  return html`<header class="page-head"><div><h1>Klientët</h1><p class="muted">${state.clients.length} klientë gjithsej</p></div><a class="btn primary" href="#/clients/new">+ Klient i ri</a></header>
  <div class="filters"><input type="search" name="q" placeholder="Kërko emër, NIPT, administrator, telefon…" value="${f.q}" data-input="clients.filter" autocomplete="off">
  ${select('status', STATUS, f.status, { blank: 'Të gjithë statuset', attrs: 'data-change="clients.filter"' })}
  ${select('who', [...state.users.map((u) => [u, u]), ['__none', 'Pa përgjegjës']], f.who, { blank: 'Të gjithë përgjegjësit', attrs: 'data-change="clients.filter"' })}
  ${select('pay', PAYMENT, f.pay, { blank: 'Çdo pagesë', attrs: 'data-change="clients.filter"' })}
  ${select('sort', [['name', 'Rendit: emri'], ['fee', 'Rendit: tarifa'], ['late', 'Rendit: detyra me vonesë']], f.sort, { attrs: 'data-change="clients.filter"' })}</div>
  <div id="clients-table" class="card flush">${table()}</div>`;
}

const refresh = () => { const el = document.getElementById('clients-table'); if (el) el.innerHTML = table().toString(); };
const setFilter = (el) => { state.f[el.name] = el.value; refresh(); };
on('input', 'clients.filter', setFilter); on('change', 'clients.filter', setFilter);
actions({ nav: (el) => { globalThis.location.hash = '#' + el.getAttribute('data-href'); } });
