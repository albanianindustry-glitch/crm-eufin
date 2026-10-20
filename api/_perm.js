// Autorizime në server për detyrat (crmX.mt), shërbimet (crmX.sv) dhe historikun (crmX.hist). Admini lejohet gjithçka.
import { owners } from './_notify.js';
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const who = (t) => (t.us && t.us.length ? t.us : t.u ? [t.u] : []);
const STATUS = ['st', 'pend', 'doneAt', 'doneTs', 'doneBy', 'apprBy', 'mins', 'mp', 'at', 'late'];
const DEFN = ['title', 'desc', 'due', 'prio', 'cid', 'rec', 'u', 'us', 'rev', 'by'];
const TASK_FIELDS = new Set([...STATUS, ...DEFN, 'cm']);
const arr = (x, k) => (x && Array.isArray(x[k]) ? x[k] : []);
const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// Ai që e ka caktuar (ose, pa përgjegjës, krijuesi) ndryshon statusin; vetëm krijuesi ndryshon përcaktimin; fshin vetëm krijuesi.
export function checkX(oldJson, newJson, u, clientsJson = '[]', admins = []) {
  if (u.role === 'admin') return [];
  const O = parse(oldJson), N = parse(newJson), v = [];
  const nm = new Map(arr(N, 'mt').map((t) => [t.id, t]));
  for (const o of arr(O, 'mt')) {
    const n = nm.get(o.id), isC = o.by === u.name, isA = who(o).includes(u.name) || (!who(o).length && isC);
    if (!n) { if (!isC) v.push(`fshirja e detyrës “${o.title}” (vetëm krijuesi ose administratori)`); continue; }
    if (same(o, n)) continue;
    if (STATUS.some((k) => !same(o[k], n[k])) && !isA) v.push(`ndryshimi i statusit të detyrës “${o.title}” (vetëm përgjegjësi)`);
    if (DEFN.some((k) => !same(o[k], n[k])) && !isC) v.push(`modifikimi i detyrës “${o.title}” (vetëm krijuesi ose administratori)`);
    if (!same(o.cm, n.cm) && !isA && !isC) v.push(`komenti te detyra “${o.title}”`);
    const unsupported = [...new Set([...Object.keys(o), ...Object.keys(n)])]
      .filter((key) => !TASK_FIELDS.has(key) && !same(o[key], n[key]));
    if (unsupported.length) v.push(`ndryshimi i fushës së pambështetur te detyra “${o.title}”: ${unsupported.join(', ')}`);
  }
  const sm = new Map(arr(N, 'sv').map((s) => [s.id, s]));
  for (const o of arr(O, 'sv')) {
    const n = sm.get(o.id), mine = o.u === u.name || o.by === u.name;
    if (!n) { if (o.by !== u.name) v.push(`fshirja e shërbimit “${o.type}” (vetëm krijuesi ose administratori)`); continue; }
    if (!same(o, n) && !mine) v.push(`ndryshimi i shërbimit “${o.type}” (vetëm përgjegjësi ose krijuesi)`);
  }
  const nh = new Map(arr(N, 'hist').map((h) => [h.id, h]));   // historiku vetëm shtohet; s'ndryshohet e s'fshihet
  for (const o of arr(O, 'hist')) if (!same(o, nh.get(o.id))) { v.push('ndryshimi ose fshirja e historikut'); break; }
  const oldHistIds = new Set(arr(O, 'hist').map((h) => h.id));
  if (arr(N, 'hist').some((h) => !oldHistIds.has(h.id) && h.by !== u.name)) v.push('shtimi i historikut nën autor tjetër');
  v.push(...checkDone(JSON.stringify(O.done || {}), JSON.stringify(N.done || {}), clientsJson, newJson, u, admins));
  return v;
}

// Veprime që regjistrohen në regjistrin e auditimit (fshirjet e detyrave, shërbimeve dhe kontratave).
export function events(oldJson, newJson) {
  const O = parse(oldJson), N = parse(newJson), out = [];
  for (const [k, lab, f] of [['mt', 'task-delete', (t) => t.title], ['sv', 'service-delete', (s) => s.type], ['k', 'contract-delete', (c) => `${c.type} ${c.lb || ''}`.trim()]]) {
    const ids = new Set(arr(N, k).map((x) => x.id));
    for (const o of arr(O, k)) if (!ids.has(o.id)) out.push({ action: lab, detail: String(f(o)).slice(0, 120) });
  }
  return out;
}

// ---- Çdo ndryshim nga përdoruesi i zakonshëm kthehet në kërkesë për miratim (admini zbaton) ----
const SECRET = ['passwordEAlbania', 'passwordEFiling', 'passwordProgramiFiskal', 'passwordCertifikata'];
const shortV = (v) => { const s = v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 70 ? s.slice(0, 70) + '…' : s; };
const diffFields = (o, n) => {
  const changes = [], patch = {}, base = {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
    if (SECRET.includes(k) || same(o[k], n[k])) continue;
    changes.push({ k, from: shortV(o[k]), to: shortV(n[k]) }); patch[k] = n[k] ?? null; base[k] = o[k] ?? null;
  }
  return { changes, patch, base };
};

// Klientët ekzistues nuk ndryshohen: ruhet versioni i miratuar + kërkesë. Klientët e rinj lejohen.
export function divertClients(curJson, plainJson, u) {
  let cur = [], nw = [];
  try { cur = JSON.parse(curJson || '[]'); nw = JSON.parse(plainJson || '[]'); } catch { return { value: plainJson, requests: [] }; }
  const byId = new Map(cur.map((c) => [c.id, c])), out = [], requests = [];
  for (const c of nw) {
    const o = byId.get(c.id);
    if (!o) { out.push(c); continue; }
    const d = diffFields(o, c); out.push(o);
    if (d.changes.length) requests.push({ kind: 'client', cid: o.id, label: o.emriKompanise || 'klient', changes: d.changes, patch: d.patch, base: d.base });
  }
  return { value: JSON.stringify(out), requests };
}

// Kontratat ekzistuese: modifikimi ose fshirja kërkojnë miratim. Kontratat e reja lejohen.
export function divertContracts(curJson, plainJson) {
  const O = parse(curJson), N = parse(plainJson), old = arr(O, 'k'), nw = arr(N, 'k'), nm = new Map(nw.map((k) => [k.id, k])), keep = [], requests = [];
  for (const o of old) {
    const n = nm.get(o.id); keep.push(o);
    if (!n) requests.push({ kind: 'contract', op: 'del', kid: o.id, cid: o.cid, label: o.lb || o.type, changes: [{ k: 'kontrata', from: o.lb || o.type, to: 'FSHIHET' }], base: o });
    else if (!same(o, n)) { const d = diffFields(o, n); requests.push({ kind: 'contract', op: 'edit', kid: o.id, cid: o.cid, label: o.lb || o.type, changes: d.changes, patch: d.patch, base: d.base }); }
  }
  const ids = new Set(old.map((k) => k.id)); for (const n of nw) if (!ids.has(n.id)) keep.push(n);
  return { value: JSON.stringify({ ...N, k: keep }), requests };
}

// Detyra me klient mund t'i caktohet vetëm përgjegjësit të atij klienti (ose administratorit)
export function checkAssign(oldJson, newJson, clientsJson, admins = []) {
  let cs = []; try { cs = JSON.parse(clientsJson || '[]'); } catch { return []; }
  const O = new Map(arr(parse(oldJson), 'mt').map((t) => [t.id, t])), v = [];
  for (const t of arr(parse(newJson), 'mt')) {
    if (t.cid === undefined || t.cid === null || t.cid === '') continue;
    const o = O.get(t.id); if (o && same(o.cid, t.cid) && same(who(o), who(t))) continue;
    const c = cs.find((x) => String(x.id) === String(t.cid)); if (!c) continue;
    const ok = new Set([...Object.keys(owners(c)), ...admins]);
    for (const w of who(t)) if (!ok.has(w)) v.push(`detyra “${t.title}”: ${w} nuk është përgjegjës për klientin ${c.emriKompanise}`);
  }
  return v;
}

function doneKind(suffix, x) {
  const standard = ['lpfinal', 'tvsh', 'pay', 'fit', 'vend', 'diva', 'lib', 'fat', 'f5', 'lp', 'mag', 'qera'];
  const kind = standard.find((value) => suffix.startsWith(value));
  if (kind) return kind;
  if (suffix.startsWith('onb')) return 'onb';
  if (suffix.startsWith('xh')) return 'xhiro';
  if (suffix.startsWith('fp')) return 'fonde';

  const categories = arr(x, 'cat');
  const category = categories
    .map((item) => String(item.id || ''))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find((id) => suffix.startsWith(id) || suffix.startsWith(`ca${id}`));
  return category ? category : '';
}

export function checkDone(oldJson, newJson, clientsJson, xJson, user, admins = []) {
  if (user.role === 'admin' || admins.includes(user.name)) return [];
  const before = parse(oldJson), after = parse(newJson), clients = (() => {
    try { const value = JSON.parse(clientsJson || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
  })();
  const x = parse(xJson), errors = [];

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue;
    const client = clients
      .filter((item) => key.startsWith(String(item.id)))
      .sort((a, b) => String(b.id).length - String(a.id).length)[0];
    if (!client) {
      errors.push(`ndryshimi i detyrimit “${key}” (klienti nuk u identifikua)`);
      continue;
    }
    const kind = doneKind(key.slice(String(client.id).length), x);
    const assigned = (client.fx || {}).resps || {};
    const owner = assigned[kind] || (client.fx || {}).resp;
    if (!kind || owner !== user.name) errors.push(`ndryshimi i detyrimit “${key}” (vetëm përgjegjësi ose administratori)`);
  }
  return errors;
}

export function clientReferences(client, xJson, declarationsJson, requestsJson = '[]', changesJson = '[]', applicationsJson = '[]', linkedNotifications = false) {
  const clientId = String(client && client.id);
  const X = parse(xJson), refs = [];
  const add = (items, field, label) => {
    if (Array.isArray(items) && items.some((item) => String(item && item[field]) === clientId)) refs.push(label);
  };
  add(X.mt, 'cid', 'detyra');
  add(X.sv, 'cid', 'shërbime');
  add(X.k, 'cid', 'kontrata');
  add(X.fat, 'cid', 'faturime');
  add(X.dg, 'cid', 'dogana');
  add(X.det, 'cid', 'detyrime');
  add(X.fl, 'cid', 'fonde');
  if (X.fu && Object.prototype.hasOwnProperty.call(X.fu, clientId)) refs.push('rikujtesa');
  if (X.hist && Array.isArray(X.hist) && X.hist.some((item) => String(item.cid) === clientId)) refs.push('historik');
  const customCategories = arr(X, 'cat').map((category) => String(category.id || '')).filter(Boolean);
  const dutyPrefix = /^(fat|lp|f5|tvsh|lib|mag|qera|fit|vend|diva|pay|onb|ca|xh|lpfinal)/;
  const customPrefix = new RegExp(`^(?:${customCategories.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`);
  if (X.done && typeof X.done === 'object' && Object.keys(X.done).some((key) => key.startsWith(clientId) && (dutyPrefix.test(key.slice(clientId.length)) || customPrefix.test(key.slice(clientId.length))))) refs.push('detyrime të përfunduara');

  try {
    const declarations = JSON.parse(declarationsJson || '[]');
    add(declarations, 'clientId', 'deklarime TVSH');
  } catch { refs.push('deklarime TVSH me strukturë të pavlefshme'); }
  try {
    const requests = JSON.parse(requestsJson || '[]');
    add(requests, 'cid', 'kërkesa miratimi');
  } catch { refs.push('kërkesa miratimi me strukturë të pavlefshme'); }
  try {
    const changes = JSON.parse(changesJson || '[]');
    add(changes, 'clientId', 'ndryshime klienti');
  } catch { refs.push('ndryshime klienti me strukturë të pavlefshme'); }
  try {
    const applications = JSON.parse(applicationsJson || '[]');
    if (Array.isArray(applications) && client.nipt && applications.some((item) => String(item.niptAprovuar || '').trim().toUpperCase() === String(client.nipt).trim().toUpperCase())) refs.push('aplikim i konvertuar');
  } catch { refs.push('aplikime me strukturë të pavlefshme'); }
  if (linkedNotifications) refs.push('njoftime me link te klienti');

  const hasDocuments = Boolean(client && (
    client.dokumentiAdmin
    || (client.docs || []).length
    || (client.adresat || []).some((item) => item.dokument)
    || (client.ortaket || []).some((item) => item.dokument)
  ));
  if (hasDocuments) refs.push('dokumente');
  return [...new Set(refs)];
}

// D-01: NIPT unik (ndalohet krijimi i dublikatit të ri; dublikatet e vjetra ekzistuese nuk bllokojnë ruajtjen)
export function dupNipt(oldJson, newJson) {
  let o = [], n = [];
  try { o = JSON.parse(oldJson || '[]'); n = JSON.parse(newJson || '[]'); } catch { return ''; }
  const group = (list) => {
    const result = new Map();
    for (const client of list) {
      const nipt = String(client.nipt || '').trim().toUpperCase();
      if (nipt) result.set(nipt, [...(result.get(nipt) || []), client]);
    }
    return result;
  };
  const oldGroups = group(o), newGroups = group(n);
  for (const [nipt, clients] of newGroups) {
    const existingIds = new Set((oldGroups.get(nipt) || []).map((client) => String(client.id)));
    const newOwners = clients.filter((client) => !existingIds.has(String(client.id)));
    const duplicateNewNipt = clients.length > 1 && !existingIds.size;
    if (newOwners.length && existingIds.size || duplicateNewNipt) {
      const existing = (oldGroups.get(nipt) || [])[0];
      return `Ekziston tashmë një klient me NIPT ${nipt}: ${(existing || clients[0]).emriKompanise || 'klient'}. Hape klientin ekzistues në vend që ta regjistrosh përsëri.`;
    }
  }
  return '';
}

// D-03: rreshta të qartë auditimi për çdo ndryshim te klientët (fusha, vlera e vjetër → e reja); pa fjalëkalime
const LBL = { nrKontakti: 'numri i kontaktit', emailBiznes: 'email-i', tarifaMujore: 'tarifa mujore', xhiroBiznes: 'xhiroja', statusKlient: 'statusi', statusPagese: 'statusi i pagesës', administratori: 'administratori', emriKompanise: 'emri', nipt: 'NIPT', afatiAdministratori: 'afati i administratorit', certifikataElektronike: 'certifikata elektronike', statusTVSH: 'statusi TVSH' };
export function clientLines(oldJson, newJson) {
  let o = [], n = []; try { o = JSON.parse(oldJson || '[]'); n = JSON.parse(newJson || '[]'); } catch { return []; }
  const old = new Map(o.map((c) => [c.id, c])), out = [], show = (x) => (x !== null && typeof x === 'object' ? 'ndryshuar' : x === undefined || x === '' ? '—' : String(x).slice(0, 60));
  for (const c of n) {
    const p = old.get(c.id); if (!p) { out.push(`Klient i ri: ${c.emriKompanise}${c.nipt ? ' (' + c.nipt + ')' : ''}`); continue; }
    for (const k of new Set([...Object.keys(p), ...Object.keys(c)])) if (!SECRET.includes(k) && !same(p[k], c[k])) out.push(`${c.emriKompanise}: ${LBL[k] || k} ${show(p[k])} → ${show(c[k])}`);
  }
  return out;
}
