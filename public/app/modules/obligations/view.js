import { html, raw } from '../../core/html.js';
import { get, post } from '../../core/api.js';
import { actions, on } from '../../core/actions.js';
import { empty, select, toast } from '../../core/ui.js';
import { refresh } from '../../core/app.js';
import { dateOnly, money } from '../../core/format.js';

const state = { tab: 'monthly', period: '' };

function cell(c) {
  if (!c.applicable) return html`<td class="cell na">·</td>`;
  const label = c.done ? '✓' : c.locked ? 'Kyçur' : c.late ? '!' : '○', cls = c.done ? 'done' : c.locked ? 'locked' : c.late ? 'late' : '';
  const title = c.locked ? 'Së pari mbyll librat e blerjeve dhe shitjeve' : `Afati ${dateOnly(c.due)}${c.done ? ' · e kryer' : ''}`;
  return html`<td class="cell"><button class="cellbtn ${cls}" data-action="ob.toggle" data-key="${c.key}" data-done="${c.done ? '0' : '1'}" title="${title}" aria-label="${title}">${label}</button>${c.responsible ? html`<small class="sub">${c.responsible.split(' ')[0]}</small>` : ''}</td>`;
}
const monthly = (m) => html`<div class="filters"><label class="inline-label">Periudha <small class="muted">(afatet bien në muajin pasardhës)</small>${select('period', m.periods.map((p) => [p.value, p.label]), m.period, { attrs: 'data-change="obl.period"' })}</label></div>
  <div class="card flush"><div class="table-wrap"><table class="tbl matrix"><thead><tr><th>Klienti</th><th>Përgjegjës</th>${m.types.map((t) => html`<th class="c">${t.label}<small class="sub">afati ${t.day}</small></th>`)}</tr></thead>
  <tbody>${m.rows.length ? m.rows.map((r) => html`<tr><td><a href="#/clients/${r.clientId}"><b>${r.clientName}</b></a></td><td>${r.responsible || raw('<small class="bad-text">pa caktuar</small>')}</td>${r.cells.map(cell)}</tr>`) : html`<tr><td colspan="${m.types.length + 2}">${empty('Shto klientë aktivë dhe plotëso profilin fiskal.')}</td></tr>`}</tbody></table></div><p class="legend">○ pa kryer · ! pas afatit · ✓ kryer · Kyçur = mbyll librat së pari · · nuk vlen për klientin</p></div>
  <div class="card"><h2>Plani i muajit – mbyll periudhën ${m.label}</h2>${m.plan.map((p) => html`<div class="plan"><b>${p.label}</b> <small class="muted">(afati ${p.day} · ${p.done}/${p.total} të kryer)</small><div class="bar"><span style="width:${p.total ? Math.round(100 * p.done / p.total) : 0}%"></span></div></div>`)}
  <h3>Pagesa të studios të pa arkëtuara për ${m.unpaidMonth} (${m.unpaid.length})</h3>${m.unpaid.length ? html`<ul class="plain">${m.unpaid.map((u) => html`<li><a href="#/clients/${u.clientId}">${u.clientName}</a> – ${money(u.amount)}</li>`)}</ul>` : raw('<p class="muted">Të gjitha janë arkëtuar.</p>')}</div>`;
const annualCell = (c) => (c.applicable ? html`<td class="cell"><button class="cellbtn ${c.done ? 'done' : ''}" data-action="ob.toggle" data-key="${c.key}" data-done="${c.done ? '0' : '1'}">${c.done ? '✓' : '○'}</button></td>` : html`<td class="cell na">·</td>`);
const annual = (a) => html`<div class="card flush"><div class="card-pad"><h2>Deklarime vjetore – afati ${dateOnly(a.due)}</h2></div><div class="table-wrap"><table class="tbl matrix"><thead><tr><th>Klienti</th><th>Forma</th><th class="c">Tatim fitimi</th><th class="c">Tatim-taksa vendore</th><th class="c">DIVA/DVAP</th></tr></thead>
  <tbody>${a.rows.length ? a.rows.map((r) => html`<tr><td><a href="#/clients/${r.clientId}"><b>${r.clientName}</b></a></td><td>${r.form}</td>${annualCell(r.fit)}${annualCell(r.vend)}${annualCell(r.diva)}</tr>`) : html`<tr><td colspan="5">${empty('Asnjë klient.')}</td></tr>`}</tbody></table></div></div>`;

export async function renderObligations({ query }) {
  if (query.tab) state.tab = query.tab; if (query.period) state.period = query.period;
  const data = state.tab === 'annual' ? await get('/obligations/annual') : await get(`/obligations/monthly${state.period ? '?period=' + state.period : ''}`);
  if (state.tab !== 'annual') state.period = data.period;
  return html`<header class="page-head"><div><h1>Detyrimet</h1><p class="muted">Matrica e detyrimeve të çdo klienti: kliko një qelizë për ta shënuar të kryer ose për ta zhbërë.</p></div></header>
  <div class="tabs"><button class="${state.tab === 'monthly' ? 'on' : ''}" data-action="obl.tab" data-tab="monthly">Mujore</button><button class="${state.tab === 'annual' ? 'on' : ''}" data-action="obl.tab" data-tab="annual">Vjetore</button></div>${state.tab === 'annual' ? annual(data) : monthly(data)}`;
}
on('change', 'obl.period', async (el) => { state.period = el.value; await refresh(); });
actions({
  'obl.tab': async (el) => { state.tab = el.getAttribute('data-tab'); await refresh(); },
  'ob.toggle': async (el) => { const done = el.getAttribute('data-done') === '1'; await post('/obligations/done', { key: el.getAttribute('data-key'), done }); toast(done ? 'U shënua si e kryer.' : 'U zhbë.', 'success', 2200); await refresh(); },
});
export { money };
