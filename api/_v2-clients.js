// Moduli Klientët (API v2): DTO të pastra mbi objektin ekzistues të klientit. Fushat e panjohura ruhen të paprekura,
// ndaj moduli i vjetër dhe i riu punojnë mbi të njëjtat të dhëna pa humbur asgjë.
import { ApiError, mutateKey, readState, parse, isDay, pick } from './_v2-http.js';
import { toDto as taskDto } from './_v2-tasks.js';

const NIPT = /^[A-Z][0-9]{8}[A-Z]$/;
const ENUM = {
  status: ['aktiv', 'inaktiv'], paymentStatus: ['paguan', 'vonese', 'spaguan'], vat: ['me_tvsh', 'pa_tvsh'], profitTax: ['me_tatim', 'pa_tatim'], kind: ['biznes', 'individ'],
};
export const WRITABLE = ['name', 'nipt', 'administrator', 'phone', 'email', 'address', 'monthlyFee', 'annualTurnover', 'contractDate', 'status', 'paymentStatus', 'vat', 'profitTax', 'notes', 'kind', 'legalForm', 'registeredAt', 'responsible', 'responsibles', 'partners'];
export const SECRET_FIELDS = { eAlbaniaUser: 'usernameEAlbania', eAlbaniaPassword: 'passwordEAlbania', eFilingUser: 'usernameEFiling', eFilingPassword: 'passwordEFiling', fiscalUser: 'usernameProgramiFiskal', fiscalPassword: 'passwordProgramiFiskal', certificatePassword: 'passwordCertifikata' };
const num = (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v));

export function toDto(c, extra = {}) {
  const f = c.fx || {};
  return {
    id: c.id, name: c.emriKompanise || '', nipt: c.nipt || '', administrator: c.administratori || '', phone: c.nrKontakti || '', email: c.emailBiznes || '', address: c.adresaBiznes || '',
    monthlyFee: num(c.tarifaMujore) ?? 0, annualTurnover: num(c.xhiroBiznes), contractDate: c.dataKontrate || '', status: c.statusKlient || 'aktiv', paymentStatus: c.statusPagese || 'paguan',
    vat: c.statusTVSH || 'me_tvsh', profitTax: c.statusTatimFitim || 'me_tatim', notes: c.shenimet || '', kind: f.lloji || 'biznes', legalForm: f.forma || '', registeredAt: f.regj || '',
    responsible: f.resp || '', responsibles: { ...(f.resps || {}) },
    partners: (c.ortaket || []).map((o) => ({ name: o.emri || '', share: num(o.perqindja), country: o.shtet || '' })),
    certificate: c.certifikataElektronike || '', administratorDeadline: c.afatiAdministratori || '',
    ...extra,
  };
}
const docDto = (d, i) => ({ index: i, id: d.id || null, name: d.name || 'Dokument', category: d.cat || '', url: typeof d.data === 'string' && d.data.startsWith('/api/file') ? d.data : '', archived: !!d.archived, note: d.note || '', at: d.at || '' });

function validate(patch, { users, partial }) {
  const errors = {}, out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
  const text = (k, label, max, required = false) => {
    if (!has(k) && partial) return;
    const v = String(patch[k] ?? '').trim();
    if (required && !v) errors[k] = `${label} është i detyrueshëm.`; else if (v.length > max) errors[k] = `${label} është shumë i gjatë (max. ${max}).`; else out[k] = v;
  };
  text('name', 'Emri i kompanisë', 200, true); if (out.name !== undefined && out.name.length < 2) errors.name = 'Emri i kompanisë është shumë i shkurtër.';
  if (has('nipt') || !partial) { const v = String(patch.nipt ?? '').trim().toUpperCase(); if (!NIPT.test(v)) errors.nipt = 'NIPT i pavlefshëm. Formati: shkronjë + 8 shifra + shkronjë (p.sh. L12345678M).'; else out.nipt = v; }
  text('administrator', 'Administratori', 200); text('phone', 'Telefoni', 40); text('address', 'Adresa', 300); text('notes', 'Shënimet', 4000); text('legalForm', 'Forma ligjore', 40);
  if (has('email')) { const v = String(patch.email ?? '').trim(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors.email = 'Email i pavlefshëm.'; else out.email = v; }
  for (const k of ['monthlyFee', 'annualTurnover']) if (has(k)) { const v = patch[k] === '' || patch[k] == null ? null : Number(patch[k]); if (v !== null && (!Number.isFinite(v) || v < 0 || v > 1e10)) errors[k] = 'Shuma e pavlefshme.'; else out[k] = v; }
  for (const k of ['contractDate', 'registeredAt']) if (has(k)) { const v = String(patch[k] ?? ''); if (v && !isDay(v)) errors[k] = 'Data e pavlefshme (VVVV-MM-DD).'; else out[k] = v; }
  for (const k of Object.keys(ENUM)) if (has(k)) { if (!ENUM[k].includes(patch[k])) errors[k] = `Vlerë e pavlefshme për ${k}.`; else out[k] = patch[k]; }
  if (has('responsible')) { const v = String(patch.responsible ?? '').trim(); if (v && !users.includes(v)) errors.responsible = 'Përgjegjës që nuk ekziston në ekip.'; else out.responsible = v; }
  if (has('responsibles')) {
    const r = patch.responsibles && typeof patch.responsibles === 'object' ? patch.responsibles : {}, clean = {};
    for (const [k, v] of Object.entries(r)) { if (!/^[a-z0-9_]{1,20}$/i.test(k)) { errors.responsibles = 'Çelës i pavlefshëm.'; break; } if (v) { if (!users.includes(v)) { errors.responsibles = 'Përgjegjës që nuk ekziston në ekip.'; break; } clean[k] = v; } }
    out.responsibles = clean;
  }
  if (has('partners')) {
    const list = Array.isArray(patch.partners) ? patch.partners : [];
    if (list.length > 20) errors.partners = 'Shumë ortakë.';
    else { out.partners = list.map((p) => ({ name: String(p.name ?? '').trim().slice(0, 200), share: num(p.share), country: String(p.country ?? '').trim().slice(0, 80) })); if (out.partners.some((p) => !p.name)) errors.partners = 'Çdo ortak duhet të ketë emër.'; else if (out.partners.some((p) => p.share !== null && (p.share < 0 || p.share > 100))) errors.partners = 'Përqindja e ortakut duhet të jetë 0–100.'; }
  }
  const first = Object.entries(errors)[0];
  if (first) throw new ApiError(422, 'invalid', first[1], { field: first[0], errors });
  return out;
}

export function applyPatch(legacy, p) {
  const c = { ...legacy, fx: { ...(legacy.fx || {}) } };
  const map = { name: 'emriKompanise', nipt: 'nipt', administrator: 'administratori', phone: 'nrKontakti', email: 'emailBiznes', address: 'adresaBiznes', contractDate: 'dataKontrate', status: 'statusKlient', paymentStatus: 'statusPagese', vat: 'statusTVSH', profitTax: 'statusTatimFitim', notes: 'shenimet' };
  for (const [k, legacyKey] of Object.entries(map)) if (k in p) c[legacyKey] = p[k];
  if ('monthlyFee' in p) c.tarifaMujore = p.monthlyFee == null ? '' : String(p.monthlyFee);
  if ('annualTurnover' in p) c.xhiroBiznes = p.annualTurnover == null ? '' : String(p.annualTurnover);
  if ('kind' in p) c.fx.lloji = p.kind; if ('legalForm' in p) c.fx.forma = p.legalForm; if ('registeredAt' in p) c.fx.regj = p.registeredAt;
  if ('responsible' in p) c.fx.resp = p.responsible; if ('responsibles' in p) c.fx.resps = p.responsibles;
  if ('partners' in p) { const old = c.ortaket || []; c.ortaket = p.partners.map((o, i) => ({ ...(old[i] || {}), emri: o.name, perqindja: o.share == null ? '' : o.share, shtet: o.country })); }
  return c;
}

const find = (list, id) => list.findIndex((c) => String(c.id) === String(id));

export async function listClients(req) {
  const state = await readState(req), list = parse(state.data.crmClients, []), x = parse(state.data.crmX, { mt: [] }), today = new Date().toISOString().slice(0, 10);
  const open = new Map();
  for (const t of x.mt || []) if (t.st !== 'done' && t.cid !== '' && t.cid != null) { const e = open.get(String(t.cid)) || { open: 0, late: 0 }; e.open += 1; if (t.due && t.due < today) e.late += 1; open.set(String(t.cid), e); }
  const pending = state.me.role === 'admin' ? parse(state.data.crmReq, []).filter((r) => r.st === 'pending') : [];
  return { clients: list.map((c) => { const t = open.get(String(c.id)) || { open: 0, late: 0 }; return toDto(c, { openTasks: t.open, lateTasks: t.late, pendingRequests: pending.filter((r) => String(r.cid) === String(c.id)).length }); }), users: state.users, me: state.me };
}

export async function getClient(req, id) {
  const state = await readState(req), list = parse(state.data.crmClients, []), i = find(list, id);
  if (i < 0) throw new ApiError(404, 'not_found', 'Klienti nuk ekziston.');
  const c = list[i], x = parse(state.data.crmX, { mt: [], k: [], hist: [] });
  const tasks = (x.mt || []).filter((t) => String(t.cid) === String(c.id)).map((t) => taskDto(t, state.me, c.emriKompanise));
  const contracts = (x.k || []).filter((k) => String(k.cid) === String(c.id)).map((k) => ({ id: k.id, label: k.lb || '', type: k.type || '', value: num(k.val), rent: num(k.rent), end: k.end || '', active: k.st === 'a' }));
  const history = (x.hist || []).filter((h) => String(h.cid) === String(c.id)).slice(-100).reverse().map((h) => ({ at: h.at || '', by: h.by || '', text: h.t || h.tx || '' }));
  const changes = parse(state.data.crmNdryshime, []).filter((h) => String(h.clientId) === String(c.id)).slice(-50).reverse();
  const requests = state.me.role === 'admin' ? parse(state.data.crmReq, []).filter((r) => r.st === 'pending' && String(r.cid) === String(c.id)) : [];
  return { client: toDto(c, { docs: (c.docs || []).map(docDto) }), tasks, contracts, history, changes, requests, users: state.users, me: state.me };
}

export async function createClient(req, input) {
  const state = await readState(req);
  if (Object.keys(input || {}).some((k) => !WRITABLE.includes(k))) throw new ApiError(422, 'invalid', 'Fushë e panjohur në kërkesë.');
  const p = validate({ kind: 'biznes', status: 'aktiv', ...input }, { users: state.users, partial: false });
  const { result } = await mutateKey(req, 'crmClients', (list) => {
    if (list.some((c) => String(c.nipt || '').trim().toUpperCase() === p.nipt)) throw new ApiError(409, 'duplicate_nipt', `Ekziston një klient me NIPT ${p.nipt}.`);
    let id = Date.now(); while (find(list, id) >= 0) id += 1;
    const created = applyPatch({ id, statusKlient: 'aktiv', statusPagese: 'paguan', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', docs: [], ortaket: [], adresat: [], fx: { lloji: 'biznes', resp: '', resps: {} } }, p);
    return { next: [...list, created], result: created };
  }, []);
  return { client: toDto(result) };
}

export async function updateClient(req, id, input) {
  if (Object.keys(input || {}).some((k) => !WRITABLE.includes(k))) throw new ApiError(422, 'invalid', 'Fushë e panjohur ose e palejuar në kërkesë.');
  const state = await readState(req), p = validate(input || {}, { users: state.users, partial: true });
  if (!Object.keys(p).length) throw new ApiError(422, 'invalid', 'Asnjë ndryshim për t’u ruajtur.');
  const sameVal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const { result, store } = await mutateKey(req, 'crmClients', (list) => {
    const i = find(list, id); if (i < 0) throw new ApiError(404, 'not_found', 'Klienti nuk ekziston.');
    // Vetëm fushat që ndryshojnë vërtet (formulari dërgon të gjitha fushat; të pandryshuarat nuk bëhen kërkesë miratimi)
    const before = toDto(list[i]), eff = Object.fromEntries(Object.entries(p).filter(([k, v]) => !sameVal(v, before[k])));
    if (!Object.keys(eff).length) return { next: list, result: { noop: true, legacy: list[i] } };
    if (eff.nipt && list.some((c, j) => j !== i && String(c.nipt || '').trim().toUpperCase() === eff.nipt)) throw new ApiError(409, 'duplicate_nipt', `Ekziston një klient me NIPT ${eff.nipt}.`);
    const next = list.slice(); next[i] = applyPatch(list[i], eff); return { next, result: { noop: false, legacy: next[i] } };
  }, []);
  if (result.noop) return { status: 'unchanged', client: toDto(result.legacy) };
  // Kontabilisti: ndryshimi i klientit ekzistues bëhet kërkesë miratimi (rregull i serverit); admini e ruan menjëherë.
  if (store.requests) return { status: 'pending_approval', requests: store.requests, client: toDto(list0(store, id) || result.legacy) };
  return { status: 'saved', client: toDto(result.legacy) };
}
const list0 = (store, id) => { try { return JSON.parse(store.value || '[]').find((c) => String(c.id) === String(id)); } catch { return null; } };

export async function deleteClient(req, id) {
  await mutateKey(req, 'crmClients', (list) => {
    const i = find(list, id); if (i < 0) throw new ApiError(404, 'not_found', 'Klienti nuk ekziston.');
    return { next: list.filter((_, j) => j !== i), result: null };
  }, []);
  return { status: 'deleted' };
}

export async function getSecrets(req, id) {
  const state = await readState(req);
  if (state.me.role !== 'admin') throw new ApiError(403, 'forbidden', 'Vetëm administratori i sheh kredencialet.');
  const c = parse(state.data.crmClients, []).find((x) => String(x.id) === String(id)); if (!c) throw new ApiError(404, 'not_found', 'Klienti nuk ekziston.');
  return { secrets: Object.fromEntries(Object.entries(SECRET_FIELDS).map(([k, legacy]) => [k, c[legacy] || ''])) };
}

export async function setSecrets(req, id, input) {
  const state = await readState(req);
  if (state.me.role !== 'admin') throw new ApiError(403, 'forbidden', 'Vetëm administratori i ndryshon kredencialet.');
  const clean = pick(input || {}, Object.keys(SECRET_FIELDS));
  for (const [k, v] of Object.entries(clean)) if (typeof v !== 'string' || v.length > 300) throw new ApiError(422, 'invalid', `Vlerë e pavlefshme për ${k}.`);
  await mutateKey(req, 'crmClients', (list) => {
    const i = find(list, id); if (i < 0) throw new ApiError(404, 'not_found', 'Klienti nuk ekziston.');
    const next = list.slice(); next[i] = { ...list[i], ...Object.fromEntries(Object.entries(clean).map(([k, v]) => [SECRET_FIELDS[k], v])) }; return { next, result: null };
  }, []);
  return { status: 'saved' };
}
