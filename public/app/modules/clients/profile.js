import { html, raw } from '../../core/html.js';
import { get, del, put } from '../../core/api.js';
import { actions, on } from '../../core/actions.js';
import { chip, confirmDialog, empty, toast } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { refresh } from '../../core/app.js';
import { dateOnly, dateTime, daysFrom, money } from '../../core/format.js';
import { KIND, TAX, VAT, initial, label, paymentChip, statusChip } from './model.js';
import { taskTable, isLate, isOpen } from '../tasks/table.js';
import { openTaskForm } from '../tasks/form.js';
import { setMe } from '../tasks/detail.js';

let P = { id: null, tab: 'tasks', d: null, secrets: null };
const dl = (rows) => html`<dl class="dl">${rows.map(([k, v]) => html`<dt>${k}</dt><dd>${v === '' || v == null ? raw('<span class="muted">—</span>') : v}</dd>`)}</dl>`;
const SECRET_LABELS = { eAlbaniaUser: 'e-Albania (përdoruesi)', eAlbaniaPassword: 'e-Albania (fjalëkalimi)', eFilingUser: 'e-Filing (përdoruesi)', eFilingPassword: 'e-Filing (fjalëkalimi)', fiscalUser: 'Programi fiskal (përdoruesi)', fiscalPassword: 'Programi fiskal (fjalëkalimi)', certificatePassword: 'Certifikata (fjalëkalimi)' };

function tabBody() {
  const { d, tab } = P, c = d.client, admin = d.me.role === 'admin';
  if (tab === 'tasks') { const list = [...d.tasks].sort((a, b) => (isOpen(a) === isOpen(b) ? (a.due || '9999').localeCompare(b.due || '9999') : isOpen(a) ? -1 : 1)); return list.length ? taskTable(list, d.me, { showClient: false }) : empty('Asnjë detyrë për këtë klient.'); }
  if (tab === 'contracts') return d.contracts.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Kontrata</th><th>Lloji</th><th>Vlera / qiraja</th><th>Mbaron</th><th>Statusi</th></tr></thead><tbody>${d.contracts.map((k) => html`<tr><td>${k.label || '—'}</td><td>${k.type || '—'}</td><td>${money(k.rent ?? k.value)}</td><td>${dateOnly(k.end)}</td><td>${k.active ? chip('Aktive', 'ok') : chip('Jo aktive')}</td></tr>`)}</tbody></table></div>` : empty('Asnjë kontratë e regjistruar.');
  if (tab === 'docs') return c.docs.length ? html`<ul class="doc-list">${c.docs.map((x) => html`<li>${x.archived ? '🗄' : '📎'} ${x.url ? html`<a href="${x.url}" target="_blank" rel="noopener">${x.name}</a>` : x.name} <small class="muted">${x.category}${x.at ? ' · ' + dateOnly(x.at) : ''}${x.archived ? ' · arkivuar' : ''}</small></li>`)}</ul>` : empty('Asnjë dokument i ngarkuar.');
  if (tab === 'history') { const rows = [...d.history.map((h) => ({ at: h.at, by: h.by, text: h.text })), ...d.changes.map((h) => ({ at: h.data || h.at || '', by: h.by || '', text: `${h.fusha || ''}: ${h.vleraVjeter ?? ''} → ${h.vleraRe ?? ''}` }))]; return rows.length ? html`<ul class="timeline">${rows.map((h) => html`<li><b>${h.text}</b><small class="muted"> ${h.by} · ${dateTime(h.at)}</small></li>`)}</ul>` : empty('Asnjë ngjarje e regjistruar.'); }
  if (tab === 'secrets' && admin) return P.secrets ? html`<dl class="dl">${Object.entries(SECRET_LABELS).map(([k, l]) => html`<dt>${l}</dt><dd>${P.secrets[k] || raw('<span class="muted">—</span>')}</dd>`)}</dl><button class="btn small" data-action="client.secrets.hide">Fshih</button>` : html`<p class="muted">Kredencialet ruhen të enkriptuara dhe shfaqen vetëm me kërkesën tënde.</p><button class="btn" data-action="client.secrets.show">Shfaq kredencialet</button>`;
  if (tab === 'requests' && admin) return d.requests.length ? html`<p>${d.requests.length} kërkesë në pritje për këtë klient. <a href="#/approvals">Hap kërkesat për miratim →</a></p>` : empty('Asnjë kërkesë në pritje.');
  return '';
}

function page() {
  const { d } = P, c = d.client, admin = d.me.role === 'admin', open = d.tasks.filter(isOpen), late = open.filter(isLate), active = d.contracts.filter((k) => k.active);
  const tabs = [['tasks', `Detyra (${open.length})`], ['contracts', 'Kontrata'], ['docs', `Dokumente (${c.docs.length})`], ['history', 'Historiku'], ...(admin ? [['secrets', 'Kredencialet'], ['requests', `Kërkesa${d.requests.length ? ' (' + d.requests.length + ')' : ''}`]] : [])];
  return html`<a class="back" href="#/clients">← Kthehu te klientët</a>
  <div class="card profile-head"><div class="avatar">${initial(c.name)}</div><div class="grow"><h1>${c.name}</h1><div class="chips">${chip('NIPT ' + c.nipt)}${statusChip(c.status)}${chip(label(VAT, c.vat), 'info')}${chip(c.kind === 'individ' ? 'Individ' : 'Biznes' + (c.legalForm ? ' · ' + c.legalForm : ''))}</div></div>
    <div class="btn-row"><a class="btn primary" href="#/clients/${c.id}/edit">Ndrysho</a><button class="btn" data-action="client.task" data-id="${c.id}">+ Detyrë</button>${admin ? html`<button class="btn danger" data-action="client.delete" data-id="${c.id}">Fshi</button>` : ''}</div></div>
  <div class="kpis"><div class="kpi"><small>Tarifa mujore</small><b>${money(c.monthlyFee)}</b><span>${c.contractDate ? 'kontratë nga ' + dateOnly(c.contractDate) : ''}</span></div><div class="kpi"><small>Pagesa e studios</small><b>${paymentChip(c.paymentStatus)}</b></div>
  <div class="kpi"><small>Detyra të hapura</small><b>${open.length}</b><span class="${late.length ? 'bad-text' : ''}">${late.length ? late.length + ' me vonesë' : 'asnjë me vonesë'}</span></div><div class="kpi"><small>Kontrata aktive</small><b>${active.length}</b></div><div class="kpi"><small>Dokumente</small><b>${c.docs.filter((x) => !x.archived).length}</b></div></div>
  <div class="grid2"><div class="card"><h2>Të dhënat e klientit</h2>${dl([['Administratori', c.administrator], ['Telefon', c.phone ? html`<a href="tel:${c.phone}">${c.phone}</a>` : ''], ['Email', c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : ''], ['Adresa', c.address], ['Xhiro vjetore', c.annualTurnover != null ? money(c.annualTurnover) : ''], ['Regjistruar në QKB', c.registeredAt ? dateOnly(c.registeredAt) : ''], ['Tatim fitimi', label(TAX, c.profitTax)]])}</div>
  <div class="card"><h2>Përgjegjësit dhe ortakët</h2>${dl([['Përgjegjësi kryesor', c.responsible ? html`<b>${c.responsible}</b>` : raw('<b class="bad-text">pa caktuar</b>')], ...Object.entries(c.responsibles).map(([k, v]) => [k, v])])}<h3>Ortakët</h3>${c.partners.length ? dl(c.partners.map((p) => [p.name, `${p.share ?? ''}${p.share != null ? '%' : ''}${p.country ? ' · ' + p.country : ''}`])) : raw('<p class="muted">Asnjë ortak i regjistruar.</p>')}${c.notes ? html`<h3>Shënime</h3><p class="desc">${c.notes}</p>` : ''}</div></div>
  <div class="tabs">${tabs.map(([k, l]) => html`<button class="${P.tab === k ? 'on' : ''}" data-action="client.tab" data-tab="${k}">${l}</button>`)}</div><div class="card flush" id="profile-tab"><div class="card-pad">${tabBody()}</div></div>`;
}

export async function renderProfile({ params, query }) {
  const d = await get(`/clients/${params.id}`); setMe(d.me);
  P = { id: params.id, tab: query.tab || P.tab || 'tasks', d, secrets: P.id === params.id ? P.secrets : null };
  if (query.tab === undefined && P.id !== params.id) P.tab = 'tasks';
  return page();
}
const repaintTab = () => { const el = document.getElementById('profile-tab'); if (el) el.innerHTML = html`<div class="card-pad">${tabBody()}</div>`.toString(); document.querySelectorAll('.tabs button[data-tab]').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === P.tab)); };
actions({
  'client.tab': (el) => { P.tab = el.getAttribute('data-tab'); repaintTab(); },
  'client.task': () => openTaskForm({ clientId: P.d.client.id }),
  'client.delete': async () => {
    const c = P.d.client;
    if (!await confirmDialog({ title: 'Fshi klientin', message: `Të fshihet klienti “${c.name}”? Fshirja lejohet vetëm kur nuk ka të dhëna të lidhura (detyra, deklarime, kontrata…). Përndryshe arkivoje (statusi Inaktiv).`, confirmText: 'Fshi', danger: true })) return;
    await del(`/clients/${c.id}`); toast('Klienti u fshi.', 'success'); go('/clients');
  },
  'client.secrets.show': async () => { const r = await get(`/clients/${P.id}/secrets`); P.secrets = r.secrets; repaintTab(); },
  'client.secrets.hide': () => { P.secrets = null; repaintTab(); },
});
export { put, on };
