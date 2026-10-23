import { html } from '../../core/html.js';
import { get, post } from '../../core/api.js';
import { actions } from '../../core/actions.js';
import { chip, confirmDialog, empty, promptDialog, toast } from '../../core/ui.js';
import { refresh } from '../../core/app.js';
import { dateTime, fieldLabel, fieldValue } from '../../core/format.js';

const change = (c) => html`<div class="rq-ch"><span class="rq-f">${fieldLabel(c.field)}</span><span class="rq-old">${fieldValue(c.field, c.from)}</span><span class="rq-ar">→</span><span class="rq-new">${fieldValue(c.field, c.to)}</span></div>`;
const card = (r, decided) => html`<div class="rq ${r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'no' : ''}"><div class="rq-h"><b>${r.requestedBy}</b> ${r.operation === 'del' ? 'kërkon të fshijë' : 'kërkon ndryshim te'} ${r.clientId ? html`<a href="#/clients/${r.clientId}"><b>${r.label}</b></a>` : html`<b>${r.label}</b>`}<small class="muted">${dateTime(r.requestedAt)}</small></div>
  ${r.changes.map(change)}
  ${decided ? html`<small class="muted">${r.status === 'approved' ? '✓ miratuar' : '✗ refuzuar'} nga ${r.decidedBy} · ${dateTime(r.decidedAt)}${r.reason ? ' — ' + r.reason : ''}</small>` : html`<div class="btn-row top"><button class="btn small success" data-action="req.approve" data-id="${r.id}">Aprovo</button><button class="btn small danger" data-action="req.reject" data-id="${r.id}">Refuzo</button></div>`}</div>`;

export async function renderApprovals() {
  const d = await get('/approvals');
  return html`<header class="page-head"><div><h1>Kërkesa për miratim</h1><p class="muted">Ndryshimet që kontabilistët kërkojnë te klientët ekzistues.</p></div></header>
  ${d.automatic.length ? html`<div class="notice warn"><span><b>${d.automatic.length} plotësime automatike</b> të vlerave default nga një version i vjetër. Nuk janë ndryshime të kontabilistëve.</span><button class="btn small" data-action="req.clear">Pastro ${d.automatic.length} plotësimet</button></div>` : ''}
  <div class="card"><h2>Në pritje (${d.pending.length})</h2>${d.pending.length ? d.pending.map((r) => card(r, false)) : empty('Asnjë kërkesë në pritje.')}</div>
  ${d.decided.length ? html`<div class="card"><h2>Vendimet e fundit</h2>${d.decided.map((r) => card(r, true))}</div>` : ''}`;
}
actions({
  'req.approve': async (el) => { if (!await confirmDialog({ title: 'Aprovo ndryshimin', message: 'Ndryshimi do të zbatohet menjëherë te klienti.', confirmText: 'Aprovo' })) return; await post(`/approvals/${el.getAttribute('data-id')}/decision`, { decision: 'approved' }); toast('Ndryshimi u miratua.', 'success'); await refresh(); },
  'req.reject': async (el) => { const reason = await promptDialog({ title: 'Refuzo ndryshimin', label: 'Arsyeja (i shfaqet kontabilistit)', confirmText: 'Refuzo' }); if (reason === null) return; await post(`/approvals/${el.getAttribute('data-id')}/decision`, { decision: 'rejected', reason }); toast('Ndryshimi u refuzua.', 'success'); await refresh(); },
  'req.clear': async () => { const r = await post('/approvals/clear-automatic'); toast(`${r.dismissed} plotësime u pastruan.`, 'success'); await refresh(); },
});
export { chip };
