import { html, raw } from '../../core/html.js';
import { get, post, patch } from '../../core/api.js';
import { on } from '../../core/actions.js';
import { field, select, toast } from '../../core/ui.js';
import { go } from '../../core/router.js';
import { KIND, LEGAL, PAYMENT, STATUS, TAX, VAT } from './model.js';

const EMPTY = { name: '', nipt: '', kind: 'biznes', legalForm: 'SHPK', registeredAt: '', administrator: '', phone: '', email: '', address: '', monthlyFee: '', annualTurnover: '', contractDate: '', status: 'aktiv', paymentStatus: 'paguan', vat: 'me_tvsh', profitTax: 'me_tatim', responsible: '', notes: '', partners: [] };
let ctx = { id: null, users: [], me: null };

const partnerRow = (p = { name: '', share: '', country: '' }) => html`<div class="partner-row"><input name="p_name" placeholder="Emri i ortakut" value="${p.name}"><input name="p_share" type="number" min="0" max="100" step="0.01" placeholder="%" value="${p.share ?? ''}"><input name="p_country" placeholder="Shteti" value="${p.country}"><button type="button" class="icon-btn" data-action="client.partner.remove" aria-label="Hiq ortakun">×</button></div>`;

export async function renderForm({ params }) {
  let client = { ...EMPTY }, users = [], me;
  if (params.id) { const d = await get(`/clients/${params.id}`); client = d.client; users = d.users; me = d.me; } else { const s = await get('/session'); users = s.users; me = s.me; }
  ctx = { id: params.id || null, users, me };
  const admin = me.role === 'admin', editing = !!params.id;
  return html`<header class="page-head"><div><a class="back" href="#/clients${editing ? '/' + client.id : ''}">← Kthehu</a><h1>${editing ? 'Ndrysho klientin' : 'Klient i ri'}</h1></div></header>
  ${editing && !admin ? html`<div class="notice">Ndryshimet që bën te një klient ekzistues dërgohen te administratori për miratim. Të dhënat ndryshojnë pasi ai t’i aprovojë.</div>` : ''}
  <form id="client-form" class="card form" data-submit="client.save" novalidate>
    <div id="form-error" class="notice error" hidden></div>
    <section><h2>Identifikimi</h2><div class="grid2">
      ${field('Emri i kompanisë *', html`<input name="name" required maxlength="200" value="${client.name}">`)}
      ${field('NIPT *', html`<input name="nipt" required maxlength="10" placeholder="L12345678M" value="${client.nipt}" style="text-transform:uppercase">`, '', 'Shkronjë + 8 shifra + shkronjë')}
      ${field('Lloji', select('kind', KIND, client.kind))}
      ${field('Forma ligjore', html`<input name="legalForm" list="legal-list" maxlength="40" value="${client.legalForm}"><datalist id="legal-list">${LEGAL.map((l) => html`<option value="${l}">`)}</datalist>`)}
      ${field('Regjistruar në QKB', html`<input type="date" name="registeredAt" value="${client.registeredAt}">`)}</div></section>
    <section><h2>Kontakti</h2><div class="grid2">
      ${field('Administratori', html`<input name="administrator" maxlength="200" value="${client.administrator}">`)}
      ${field('Telefoni', html`<input name="phone" maxlength="40" value="${client.phone}">`)}
      ${field('Email', html`<input type="email" name="email" maxlength="200" value="${client.email}">`)}
      ${field('Adresa', html`<input name="address" maxlength="300" value="${client.address}">`)}</div></section>
    <section><h2>Marrëdhënia me studion</h2><div class="grid2">
      ${field('Tarifa mujore (Lekë)', html`<input type="number" name="monthlyFee" min="0" step="1" value="${client.monthlyFee ?? ''}">`)}
      ${field('Xhiro vjetore (Lekë)', html`<input type="number" name="annualTurnover" min="0" step="1" value="${client.annualTurnover ?? ''}">`)}
      ${field('Data e kontratës', html`<input type="date" name="contractDate" value="${client.contractDate}">`)}
      ${field('Statusi i klientit', select('status', STATUS, client.status))}
      ${field('Statusi i pagesës', select('paymentStatus', PAYMENT, client.paymentStatus))}
      ${field('TVSH', select('vat', VAT, client.vat))}
      ${field('Tatim fitimi', select('profitTax', TAX, client.profitTax))}
      ${field('Përgjegjësi kryesor', select('responsible', users.map((u) => [u, u]), client.responsible, { blank: '— pa caktuar —' }))}</div></section>
    <section><h2>Ortakët</h2><div id="partners">${client.partners.map(partnerRow)}</div><button type="button" class="btn small" data-action="client.partner.add">+ Shto ortak</button></section>
    <section><h2>Shënime</h2>${field('Shënime të brendshme', html`<textarea name="notes" rows="4" maxlength="4000">${client.notes}</textarea>`)}</section>
    <div class="form-actions"><a class="btn" href="#/clients${editing ? '/' + client.id : ''}">Anulo</a><button class="btn primary" type="submit">${editing && !admin ? 'Dërgo për miratim' : 'Ruaj'}</button></div>
  </form>`;
}

function collect(form) {
  const fd = new FormData(form), v = Object.fromEntries(fd.entries());
  const names = fd.getAll('p_name'), shares = fd.getAll('p_share'), countries = fd.getAll('p_country');
  const partners = names.map((name, i) => ({ name, share: shares[i] === '' ? null : Number(shares[i]), country: countries[i] })).filter((p) => p.name.trim() || p.country.trim() || p.share !== null);
  const out = { ...Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('p_'))), partners };
  for (const k of ['monthlyFee', 'annualTurnover']) out[k] = out[k] === '' ? null : Number(out[k]);
  out.nipt = String(out.nipt || '').trim().toUpperCase();
  return out;
}
function showError(form, e) {
  form.querySelectorAll('.has-error').forEach((l) => { l.classList.remove('has-error'); const m = l.querySelector('em.err'); if (m) m.remove(); });
  const banner = form.querySelector('#form-error'); banner.hidden = false; banner.textContent = e.message;
  const f = e.details && e.details.field, input = f && form.querySelector(`[name="${f}"]`);
  if (input) { const label = input.closest('label'); if (label) { label.classList.add('has-error'); const m = document.createElement('em'); m.className = 'err'; m.textContent = e.message; label.appendChild(m); } input.focus(); }
  banner.scrollIntoView && banner.scrollIntoView({ block: 'nearest' });
}

on('submit', 'client.save', async (form) => {
  const data = collect(form), btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    if (ctx.id) {
      const r = await patch(`/clients/${ctx.id}`, data);
      toast(r.status === 'pending_approval' ? 'Ndryshimet u dërguan te administratori për miratim.' : 'Klienti u ruajt.', r.status === 'pending_approval' ? 'info' : 'success');
      go(`/clients/${ctx.id}`);
    } else { const r = await post('/clients', data); toast('Klienti u krijua.', 'success'); go(`/clients/${r.client.id}`); }
  } catch (e) { showError(form, e); } finally { btn.disabled = false; }
});
on('click', 'client.partner.add', (el) => { el.closest('section').querySelector('#partners').insertAdjacentHTML('beforeend', partnerRow().toString()); });
on('click', 'client.partner.remove', (el) => el.closest('.partner-row').remove());
export { raw };
