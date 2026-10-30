import { html, raw } from '../../core/html.js';
import { get, post, patch, put } from '../../core/api.js';
import { on } from '../../core/actions.js';
import { field, select, toast } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { uploadPdf } from '../../core/files.js';
import { KIND, LEGAL, PAYMENT, STATUS, TAX, VAT } from './model.js';

const EMPTY = { name: '', nipt: '', kind: 'biznes', legalForm: 'SHPK', registeredAt: '', administrator: '', phone: '', email: '', address: '', monthlyFee: '', annualTurnover: '', contractDate: '', status: 'aktiv', paymentStatus: 'paguan', vat: 'me_tvsh', profitTax: 'me_tatim', responsible: '', notes: '', partners: [], certificate: '', administratorDeadline: '', administratorDocument: null };
const SECRETS = [['eAlbaniaUser', 'e-Albania: përdoruesi'], ['eAlbaniaPassword', 'e-Albania: fjalëkalimi'], ['eFilingUser', 'e-Filing: përdoruesi'], ['eFilingPassword', 'e-Filing: fjalëkalimi'], ['fiscalUser', 'Programi fiskal: përdoruesi'], ['fiscalPassword', 'Programi fiskal: fjalëkalimi'], ['certificatePassword', 'Certifikata elektronike: fjalëkalimi']];
const NAMES = { name: 'emri', nipt: 'NIPT', kind: 'lloji', legalForm: 'forma ligjore', registeredAt: 'data e regjistrimit', administrator: 'administratori', phone: 'telefoni', email: 'email', address: 'adresa', monthlyFee: 'tarifa mujore', annualTurnover: 'xhiroja', contractDate: 'data e kontratës', status: 'statusi', paymentStatus: 'statusi i pagesës', vat: 'TVSH', profitTax: 'tatim fitimi', responsible: 'përgjegjësi', notes: 'shënimet', partners: 'ortakët', responsibles: 'përgjegjësit sipas llojit', certificate: 'certifikata elektronike', administratorDeadline: 'afati i administratorit', administratorDocument: 'dokumenti i administratorit' };
let ctx = { id: null, users: [], me: null, secrets: null };

const docNote = (d) => (d ? (d.url ? html`<a href="${d.url}" target="_blank" rel="noopener">📎 ${d.name}</a>` : html`<span class="muted">📎 ${d.name} (ruajtur në versionin e vjetër)</span>`) : '');
const partnerRow = (p = { ref: '', name: '', share: '', country: '', document: null }) => html`<div class="partner-card"><input type="hidden" name="p_ref" value="${p.ref ?? ''}">
  <div class="partner-row"><input name="p_name" placeholder="Emri i ortakut" value="${p.name}"><input name="p_share" type="number" min="0" max="100" step="0.01" placeholder="%" value="${p.share ?? ''}"><input name="p_country" placeholder="Shteti" value="${p.country}"><button type="button" class="icon-btn" data-action="client.partner.remove" aria-label="Hiq ortakun">×</button></div>
  <div class="doc-row"><span class="muted">ID / pasaporta e ortakut (PDF):</span> ${docNote(p.document)} <input type="file" name="p_file" accept="application/pdf,.pdf"></div></div>`;

export async function renderForm({ params }) {
  let client = { ...EMPTY }, users = [], me, secrets = null;
  if (params.id) { const d = await get(`/clients/${params.id}`); client = d.client; users = d.users; me = d.me; } else { const s = await get('/session'); users = s.users; me = s.me; }
  const admin = me.role === 'admin', editing = !!params.id;
  if (admin && editing) secrets = (await get(`/clients/${params.id}/secrets`)).secrets;
  ctx = { id: params.id || null, users, me, secrets };
  const locked = (k) => !admin && editing && client[k] != null && client[k] !== '' && !(Array.isArray(client[k]) && !client[k].length);
  const F = (k, label, control, hint = '') => field(label, control, '', hint || (locked(k) ? 'Ndryshimi kërkon miratim' : ''));
  return html`<header class="page-head"><div><a class="back" href="#/clients${editing ? '/' + client.id : ''}">← Kthehu</a><h1>${editing ? 'Ndrysho klientin' : 'Klient i ri'}</h1></div></header>
  ${editing && !admin ? html`<div class="notice">Fushat e zbrazëta që plotëson dhe dokumentet e para ruhen menjëherë. Ndryshimi i një vlere ekzistuese (shënuar me “kërkon miratim”) dërgohet te administratori dhe zbatohet pasi ai ta aprovojë. Caktimi i përgjegjësit kërkon gjithmonë miratim.</div>` : ''}
  <form id="client-form" class="card form" data-submit="client.save" novalidate>
    <div id="form-error" class="notice error" hidden></div>
    <section><h2>Identifikimi</h2><div class="grid2">
      ${F('name', 'Emri i kompanisë *', html`<input name="name" required maxlength="200" value="${client.name}">`)}
      ${F('nipt', 'NIPT *', html`<input name="nipt" required maxlength="10" placeholder="L12345678M" value="${client.nipt}" style="text-transform:uppercase">`, 'Shkronjë + 8 shifra + shkronjë')}
      ${F('kind', 'Lloji', select('kind', KIND, client.kind))}
      ${F('legalForm', 'Forma ligjore', html`<input name="legalForm" list="legal-list" maxlength="40" value="${client.legalForm}"><datalist id="legal-list">${LEGAL.map((l) => html`<option value="${l}">`)}</datalist>`)}
      ${F('registeredAt', 'Regjistruar në QKB', html`<input type="date" name="registeredAt" value="${client.registeredAt}">`)}</div></section>
    <section><h2>Kontakti</h2><div class="grid2">
      ${F('administrator', 'Administratori', html`<input name="administrator" maxlength="200" value="${client.administrator}">`)}
      ${F('phone', 'Telefoni', html`<input name="phone" maxlength="40" value="${client.phone}">`)}
      ${F('email', 'Email', html`<input type="email" name="email" maxlength="200" value="${client.email}">`)}
      ${F('address', 'Adresa', html`<input name="address" maxlength="300" value="${client.address}">`)}</div></section>
    <section><h2>Administratori dhe ortakët</h2>
      <div class="doc-row"><b>ID / pasaporta e administratorit (PDF)</b> ${docNote(client.administratorDocument)} <input type="file" name="admin_file" accept="application/pdf,.pdf"></div>
      <div id="partners">${client.partners.map(partnerRow)}</div><button type="button" class="btn small" data-action="client.partner.add">+ Shto ortak</button></section>
    <section><h2>Certifikata elektronike dhe afatet</h2><div class="grid2">
      ${F('certificate', 'Certifikata elektronike skadon më', html`<input type="date" name="certificate" value="${client.certificate}">`, 'Sistemi të kujton 60 ditë përpara')}
      ${F('administratorDeadline', 'Afati i administratorit (QKB)', html`<input type="date" name="administratorDeadline" value="${client.administratorDeadline}">`, 'Sistemi të kujton 60 ditë përpara')}</div></section>
    <section><h2>Marrëdhënia me studion</h2><div class="grid2">
      ${F('monthlyFee', 'Tarifa mujore (Lekë)', html`<input type="number" name="monthlyFee" min="0" step="1" value="${client.monthlyFee ?? ''}">`)}
      ${F('annualTurnover', 'Xhiro vjetore (Lekë)', html`<input type="number" name="annualTurnover" min="0" step="1" value="${client.annualTurnover ?? ''}">`)}
      ${F('contractDate', 'Data e kontratës', html`<input type="date" name="contractDate" value="${client.contractDate}">`)}
      ${F('status', 'Statusi i klientit', select('status', STATUS, client.status))}
      ${F('paymentStatus', 'Statusi i pagesës', select('paymentStatus', PAYMENT, client.paymentStatus))}
      ${F('vat', 'TVSH', select('vat', VAT, client.vat))}
      ${F('profitTax', 'Tatim fitimi', select('profitTax', TAX, client.profitTax))}
      ${F('responsible', 'Përgjegjësi kryesor', select('responsible', users.map((u) => [u, u]), client.responsible, { blank: '— pa caktuar —' }))}</div></section>
    ${admin ? html`<section><h2>Kredencialet <small class="muted">(vetëm administratori; ruhen të enkriptuara)</small></h2><div class="grid2">${SECRETS.map(([k, l]) => field(l, html`<span class="secret"><input name="s_${k}" type="password" autocomplete="off" value="${secrets ? secrets[k] : ''}" data-orig="${secrets ? secrets[k] : ''}"><button type="button" class="btn small" data-action="client.secret.toggle">Shfaq</button></span>`))}</div></section>` : ''}
    <section><h2>Shënime</h2>${F('notes', 'Shënime të brendshme', html`<textarea name="notes" rows="4" maxlength="4000">${client.notes}</textarea>`)}</section>
    <div class="form-actions"><a class="btn" href="#/clients${editing ? '/' + client.id : ''}">Anulo</a><button class="btn primary" type="submit">Ruaj</button></div>
  </form>`;
}

const fileOf = (root, sel) => { const f = root.querySelector(sel); return f && f.files && f.files[0]; };
async function collect(form) {
  const fd = new FormData(form), v = Object.fromEntries(fd.entries());
  const out = {};
  for (const [k, val] of Object.entries(v)) if (!/^(p_|s_|admin_file)/.test(k)) out[k] = val;
  for (const k of ['monthlyFee', 'annualTurnover']) out[k] = out[k] === '' ? null : Number(out[k]);
  out.nipt = String(out.nipt || '').trim().toUpperCase();
  // dokumentet ngarkohen vetëm kur zgjidhet skedar i ri; pa skedar, dokumenti ekzistues mbetet i pandryshuar
  const adminFile = fileOf(form, 'input[name=admin_file]'); if (adminFile) out.administratorDocument = await uploadPdf(adminFile);
  const partners = [];
  for (const row of form.querySelectorAll('.partner-card')) {
    const name = row.querySelector('[name=p_name]').value, share = row.querySelector('[name=p_share]').value, country = row.querySelector('[name=p_country]').value, ref = row.querySelector('[name=p_ref]').value, file = fileOf(row, 'input[type=file]');
    if (!name.trim() && !country.trim() && share === '' && !file) continue;
    const p = { name, share: share === '' ? null : Number(share), country, ...(ref !== '' ? { ref: Number(ref) } : {}) };
    if (file) p.document = await uploadPdf(file);
    partners.push(p);
  }
  out.partners = partners;
  return out;
}
const secretsChanged = (form) => Object.fromEntries([...form.querySelectorAll('input[name^="s_"]')].filter((i) => i.value !== i.getAttribute('data-orig')).map((i) => [i.name.slice(2), i.value]));
function showError(form, e) {
  form.querySelectorAll('.has-error').forEach((l) => { l.classList.remove('has-error'); const m = l.querySelector('em.err'); if (m) m.remove(); });
  const banner = form.querySelector('#form-error'); banner.hidden = false; banner.textContent = e.message;
  const f = e.details && e.details.field, input = f && form.querySelector(`[name="${f}"]`);
  if (input) { const label = input.closest('label'); if (label) { label.classList.add('has-error'); const m = document.createElement('em'); m.className = 'err'; m.textContent = e.message; label.appendChild(m); } input.focus(); }
  banner.scrollIntoView && banner.scrollIntoView({ block: 'nearest' });
}

on('submit', 'client.save', async (form) => {
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; form.querySelector('#form-error').hidden = true;
  try {
    const data = await collect(form), secrets = ctx.me.role === 'admin' ? secretsChanged(form) : {};
    let id = ctx.id;
    if (id) {
      const r = await patch(`/clients/${id}`, data), names = (list) => list.map((k) => NAMES[k] || k).join(', ');
      if (Object.keys(secrets).length) await put(`/clients/${id}/secrets`, secrets);
      if (r.status === 'unchanged' && !Object.keys(secrets).length) toast('Asnjë ndryshim për t’u ruajtur.', 'info');
      else if (r.status === 'pending_approval') toast((r.saved.length ? `U ruajtën: ${names(r.saved)}. ` : '') + `Për miratim te administratori: ${names(r.pending)}.`, 'info', 7000);
      else toast('Klienti u ruajt.', 'success');
    } else {
      if (Object.keys(secrets).length) data.secrets = secrets;
      const r = await post('/clients', data); id = r.client.id; toast('Klienti u krijua.', 'success');
    }
    go(`/clients/${id}`);
  } catch (e) { showError(form, e); } finally { btn.disabled = false; }
});
on('click', 'client.partner.add', (el) => { el.closest('section').querySelector('#partners').insertAdjacentHTML('beforeend', partnerRow().toString()); });
on('click', 'client.partner.remove', (el) => el.closest('.partner-card').remove());
on('click', 'client.secret.toggle', (el) => { const i = el.previousElementSibling; i.type = i.type === 'password' ? 'text' : 'password'; el.textContent = i.type === 'password' ? 'Shfaq' : 'Fshih'; });
export { raw };
