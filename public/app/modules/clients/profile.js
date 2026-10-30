import { html, raw } from '../../core/html.js';
import { get, del, put } from '../../core/api.js';
import { actions, on } from '../../core/actions.js';
import { chip, confirmDialog, empty, toast } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { refresh } from '../../core/app.js';
import { DOC_CATS, KIND_LABELS, daysLeftChip, dateOnly, dateTime, daysFrom, money } from '../../core/format.js';
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
  if (tab === 'docs') return c.docs.length ? html`<ul class="doc-list">${c.docs.map((x) => html`<li>${x.archived ? '🗄' : '📎'} ${x.url ? html`<a href="${x.url}" target="_blank" rel="noopener">${x.name}</a>` : x.name} <small class="muted">${DOC_CATS[x.category] || x.category}${x.at ? ' · ' + dateOnly(x.at) : ''}${x.archived ? ' · arkivuar' : ''}${x.note ? ' · ' + x.note : ''}</small></li>`)}</ul>` : empty('Asnjë dokument tjetër i ngarkuar (ID-të e administratorit dhe ortakëve shihen më sipër).');
  if (tab === 'history') { const rows = [...d.history.map((h) => ({ at: h.at, by: h.by, text: h.text })), ...d.changes.map((h) => ({ at: h.data || h.at || '', by: h.by || '', text: `${h.fusha || ''}: ${h.vleraVjeter ?? ''} → ${h.vleraRe ?? ''}` }))]; return rows.length ? html`<ul class="timeline">${rows.map((h) => html`<li><b>${h.text}</b><small class="muted"> ${h.by} · ${dateTime(h.at)}</small></li>`)}</ul>` : empty('Asnjë ngjarje e regjistruar.'); }
  if (tab === 'secrets' && admin) return P.secrets ? html`<dl class="dl">${Object.entries(SECRET_LABELS).map(([k, l]) => html`<dt>${l}</dt><dd>${P.secrets[k] || raw('<span class="muted">—</span>')}</dd>`)}</dl><button class="btn small" data-action="client.secrets.hide">Fshih</button>` : html`<p class="muted">Kredencialet ruhen të enkriptuara dhe shfaqen vetëm me kërkesën tënde.</p><button class="btn" data-action="client.secrets.show">Shfaq kredencialet</button>`;
  if (tab === 'requests' && admin) return d.requests.length ? html`<p>${d.requests.length} kërkesë në pritje për këtë klient. <a href="#/approvals">Hap kërkesat për miratim →</a></p>` : empty('Asnjë kërkesë në pritje.');
  return '';
}

const group = (map, main) => {
  const by = new Map();
  for (const [kind, who] of Object.entries(map || {})) { if (!who) continue; if (!by.has(who)) by.set(who, []); by.get(who).push(KIND_LABELS[kind] || kind); }
  return [...by.entries()].map(([who, kinds]) => html`<div class="resp-line"><b>${who}${who === main ? '' : ''}</b><span class="muted">${kinds.join(' · ')}</span></div>`);
};
const docLink = (d, label) => (d ? (d.url ? html`<a href="${d.url}" target="_blank" rel="noopener">📎 ${d.name || label}</a>` : html`<span class="muted">📎 ${d.name || label} (arkivë e vjetër)</span>`) : raw('<span class="bad-text">mungon</span>'));
function deadlines(c, contracts) {
  const rows = [];
  if (c.certificate) rows.push(['Certifikata elektronike', c.certificate]);
  if (c.administratorDeadline) rows.push(['Afati i administratorit (QKB)', c.administratorDeadline]);
  for (const k of contracts.filter((q) => q.active && q.end)) rows.push([`Kontrata: ${k.label || k.type}`, k.end]);
  rows.sort((a, b) => a[1].localeCompare(b[1]));
  return rows.length ? rows.map(([l, d]) => { const c2 = daysLeftChip(d); return html`<div class="deadline"><span><b>${l}</b><small class="muted block">${dateOnly(d)}</small></span>${chip(c2.text, c2.kind)}</div>`; }) : raw('<p class="muted">Asnjë afat i regjistruar. Shto datën e certifikatës dhe afatin e administratorit te “Ndrysho”.</p>');
}

function page() {
  const { d } = P, c = d.client, admin = d.me.role === 'admin', open = d.tasks.filter(isOpen), late = open.filter(isLate), active = d.contracts.filter((k) => k.active);
  const req = c.requiredDocs || [], reqOk = req.filter((r) => r.ok).length;
  const tabs = [['tasks', `Detyra (${open.length})`], ['contracts', 'Kontrata'], ['docs', `Dokumente (${c.docs.length})`], ['history', 'Historiku'], ...(admin ? [['secrets', 'Kredencialet'], ['requests', `Kërkesa${d.requests.length ? ' (' + d.requests.length + ')' : ''}`]] : [])];
  return html`<a class="back" href="#/clients">← Kthehu te klientët</a>
  <div class="card profile-head"><div class="avatar">${initial(c.name)}</div><div class="grow"><h1>${c.name}</h1><div class="chips">${chip('NIPT ' + c.nipt)}${statusChip(c.status)}${chip(label(VAT, c.vat), 'info')}${chip(c.kind === 'individ' ? 'Individ' : 'Biznes' + (c.legalForm ? ' · ' + c.legalForm : ''))}${admin && d.requests.length ? chip(`${d.requests.length} kërkesë në pritje`, 'warn') : ''}</div></div>
    <div class="btn-row"><a class="btn primary" href="#/clients/${c.id}/edit">Ndrysho</a><button class="btn" data-action="client.task" data-id="${c.id}">+ Detyrë</button>${admin ? html`<button class="btn danger" data-action="client.delete" data-id="${c.id}">Fshi</button>` : ''}</div></div>
  <div class="kpis"><div class="kpi"><small>Tarifa mujore</small><b>${money(c.monthlyFee)}</b><span>${c.contractDate ? 'kontratë nga ' + dateOnly(c.contractDate) : ''}</span></div><div class="kpi"><small>Pagesa e studios</small><b>${paymentChip(c.paymentStatus)}</b></div>
  <div class="kpi"><small>Detyra të hapura</small><b>${open.length}</b><span class="${late.length ? 'bad-text' : ''}">${late.length ? late.length + ' me vonesë' : 'asnjë me vonesë'}</span></div><div class="kpi"><small>Kontrata aktive</small><b>${active.length}</b></div><div class="kpi"><small>Dosja e dokumenteve</small><b>${reqOk}/${req.length}</b><span class="${reqOk < req.length ? 'bad-text' : ''}">${reqOk < req.length ? req.length - reqOk + ' mungojnë' : 'e plotë'}</span></div></div>
  <div class="grid2">
    <div class="card"><h2>Afate dhe alarme</h2>${deadlines(c, d.contracts)}</div>
    <div class="card"><h2>Ekipi përgjegjës</h2><div class="resp-main"><small class="muted">Përgjegjësi kryesor</small><b>${c.responsible || raw('<span class="bad-text">pa caktuar</span>')}</b></div>${Object.keys(c.responsibles).length ? html`<small class="muted block" style="margin-top:12px">Detyrimet e caktuara veçmas</small>${group(c.responsibles, c.responsible)}` : raw('<p class="muted" style="margin-top:10px">Të gjitha detyrimet i ndjek përgjegjësi kryesor.</p>')}</div></div>
  <div class="grid2">
    <div class="card"><h2>Identiteti</h2>${dl([['Lloji', c.kind === 'individ' ? 'Individ' : `Biznes${c.legalForm ? ' · ' + c.legalForm : ''}`], ['Regjistruar në QKB', c.registeredAt ? dateOnly(c.registeredAt) : ''], ['Adresa', c.address]])}<h3>Kontakti</h3>${dl([['Administratori', c.administrator], ['Telefon', c.phone ? html`<a href="tel:${c.phone}">${c.phone}</a>` : ''], ['Email', c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : '']])}</div>
    <div class="card"><h2>Marrëdhënia me studion</h2>${dl([['Tarifa mujore', money(c.monthlyFee)], ['Kontratë nga', c.contractDate ? dateOnly(c.contractDate) : ''], ['Xhiro vjetore', c.annualTurnover != null ? money(c.annualTurnover) : ''], ['TVSH', label(VAT, c.vat)], ['Tatim fitimi', label(TAX, c.profitTax)]])}${c.notes ? html`<h3>Shënime</h3><p class="desc">${c.notes}</p>` : ''}</div></div>
  <div class="grid2">
    <div class="card"><h2>Administratori dhe ortakët</h2><div class="person"><div><b>${c.administrator || 'Administratori'}</b><small class="muted block">Administrator</small></div><div>${docLink(c.administratorDocument, 'ID e administratorit')}</div></div>${c.partners.length ? c.partners.map((p) => html`<div class="person"><div><b>${p.name}</b><small class="muted block">Ortak${p.share != null ? ' · ' + p.share + '%' : ''}${p.country ? ' · ' + p.country : ''}</small></div><div>${docLink(p.document, 'ID e ortakut')}</div></div>`) : raw('<p class="muted">Asnjë ortak i regjistruar.</p>')}</div>
    <div class="card"><h2>Dokumentet e kërkuara</h2><ul class="checklist">${req.map((r) => html`<li><span class="${r.ok ? 'ok' : 'no'}">${r.ok ? '✓' : '○'}</span> ${r.label}</li>`)}</ul></div></div>
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
