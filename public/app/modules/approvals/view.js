import { html } from '../../core/html.js';
import { get, post } from '../../core/api.js';
import { actions } from '../../core/actions.js';
import { confirmDialog, empty, promptDialog, toast } from '../../core/ui.js';
import { refresh } from '../../core/app.js';
import { dateTime, fieldLabel, fieldValue } from '../../core/format.js';

const row = (c) => html`<tr><th scope="row">${fieldLabel(c.field)}</th><td><span class="v old">${fieldValue(c.field, c.from)}</span></td><td class="ar">→</td><td><span class="v new">${fieldValue(c.field, c.to)}</span>${c.link ? html` <a class="btn small" href="${c.link}" target="_blank" rel="noopener">📎 Hap dokumentin</a>` : ''}</td></tr>`;
const head = (r) => html`<div class="rq-head"><span class="avatar sm">${String(r.requestedBy || '?').charAt(0).toUpperCase()}</span><div class="grow"><b>${r.requestedBy}</b> ${r.operation === 'del' ? 'kërkon të fshijë' : 'kërkon ndryshim te'} ${r.clientId ? html`<a href="#/clients/${r.clientId}"><b>${r.label}</b></a>` : html`<b>${r.label}</b>`}<small class="muted block">${dateTime(r.requestedAt)}</small></div></div>`;
const diff = (r) => html`<table class="diff"><thead><tr><th>Fusha</th><th>Tani</th><th></th><th>Kërkohet</th></tr></thead><tbody>${r.changes.map(row)}</tbody></table>`;
const pendingCard = (r) => html`<article class="rq">${head(r)}${diff(r)}<div class="btn-row top"><button class="btn small success" data-action="req.approve" data-id="${r.id}">Aprovo</button><button class="btn small danger" data-action="req.reject" data-id="${r.id}">Refuzo</button></div></article>`;
const decidedCard = (r) => html`<article class="rq ${r.status === 'approved' ? 'ok' : 'no'}">${head(r)}${r.changes.length ? diff(r) : ''}<p class="muted">${r.status === 'approved' ? '✓ Miratuar' : '✗ Refuzuar'} nga <b>${r.decidedBy}</b> · ${dateTime(r.decidedAt)}${r.reason ? html` — ${r.reason}` : ''}</p></article>`;

export async function renderApprovals() {
  const d = await get('/approvals');
  const auto = d.automatic.length;
  return html`<header class="page-head"><div><h1>Kërkesa për miratim</h1><p class="muted">Miratohen vetëm ndryshimet e vlerave ekzistuese. Plotësimet e para (fushë e zbrazët, dokument i ri) ruhen pa miratim.</p></div></header>
  ${auto ? html`<div class="notice warn"><span><b>${auto} kërkesa nuk kërkojnë miratim</b> (plotësime të para ose zhurmë automatike nga versioni i vjetër). Mund t’i zbatosh/pastrosh menjëherë.</span><button class="btn small" data-action="req.clear">Zbato dhe pastro ${auto}</button></div>` : ''}
  <div class="card"><h2>Në pritje (${d.pending.length})</h2>${d.pending.length ? d.pending.map(pendingCard) : empty('Asnjë kërkesë në pritje.')}</div>
  ${d.decided.length ? html`<div class="card"><h2>Vendimet e fundit</h2>${d.decided.map(decidedCard)}</div>` : ''}`;
}
actions({
  'req.approve': async (el) => { if (!await confirmDialog({ title: 'Aprovo ndryshimin', message: 'Ndryshimi do të zbatohet menjëherë te klienti.', confirmText: 'Aprovo' })) return; await post(`/approvals/${el.getAttribute('data-id')}/decision`, { decision: 'approved' }); toast('Ndryshimi u miratua.', 'success'); await refresh(); },
  'req.reject': async (el) => { const reason = await promptDialog({ title: 'Refuzo ndryshimin', label: 'Arsyeja (i shfaqet kontabilistit)', confirmText: 'Refuzo' }); if (reason === null) return; await post(`/approvals/${el.getAttribute('data-id')}/decision`, { decision: 'rejected', reason }); toast('Ndryshimi u refuzua.', 'success'); await refresh(); },
  'req.clear': async () => { const r = await post('/approvals/clear-automatic'); toast(`${r.applied} plotësime u zbatuan, ${r.dismissed} zhurma u pastrua.`, 'success'); await refresh(); },
});
