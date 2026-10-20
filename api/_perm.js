// Autorizime në server për detyrat (crmX.mt), shërbimet (crmX.sv) dhe historikun (crmX.hist). Admini lejohet gjithçka.
import { owners } from './_notify.js';
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const who = (t) => (t.us && t.us.length ? t.us : t.u ? [t.u] : []);
const STATUS = ['st', 'pend', 'doneAt', 'doneTs', 'doneBy', 'apprBy', 'mins', 'mp', 'at'];
const DEFN = ['title', 'desc', 'due', 'prio', 'cid', 'rec', 'u', 'us', 'rev', 'by'];
const arr = (x, k) => (x && Array.isArray(x[k]) ? x[k] : []);
const parse = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

// Ai që e ka caktuar (ose, pa përgjegjës, krijuesi) ndryshon statusin; vetëm krijuesi ndryshon përcaktimin; fshin vetëm krijuesi.
export function checkX(oldJson, newJson, u) {
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
  }
  const sm = new Map(arr(N, 'sv').map((s) => [s.id, s]));
  for (const o of arr(O, 'sv')) {
    const n = sm.get(o.id), mine = o.u === u.name || o.by === u.name;
    if (!n) { if (o.by !== u.name) v.push(`fshirja e shërbimit “${o.type}” (vetëm krijuesi ose administratori)`); continue; }
    if (!same(o, n) && !mine) v.push(`ndryshimi i shërbimit “${o.type}” (vetëm përgjegjësi ose krijuesi)`);
  }
  const nh = new Map(arr(N, 'hist').map((h) => [h.id, h]));   // historiku vetëm shtohet; s'ndryshohet e s'fshihet
  for (const o of arr(O, 'hist')) if (!same(o, nh.get(o.id))) { v.push('ndryshimi ose fshirja e historikut'); break; }
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
  const changes = [], patch = {};
  for (const k of new Set([...Object.keys(o), ...Object.keys(n)])) {
    if (SECRET.includes(k) || same(o[k], n[k])) continue;
    changes.push({ k, from: shortV(o[k]), to: shortV(n[k]) }); patch[k] = n[k] ?? null;
  }
  return { changes, patch };
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
    if (d.changes.length) requests.push({ kind: 'client', cid: o.id, label: o.emriKompanise || 'klient', changes: d.changes, patch: d.patch });
  }
  return { value: JSON.stringify(out), requests };
}

// Kontratat ekzistuese: modifikimi ose fshirja kërkojnë miratim. Kontratat e reja lejohen.
export function divertContracts(curJson, plainJson) {
  const O = parse(curJson), N = parse(plainJson), old = arr(O, 'k'), nw = arr(N, 'k'), nm = new Map(nw.map((k) => [k.id, k])), keep = [], requests = [];
  for (const o of old) {
    const n = nm.get(o.id); keep.push(o);
    if (!n) requests.push({ kind: 'contract', op: 'del', kid: o.id, cid: o.cid, label: o.lb || o.type, changes: [{ k: 'kontrata', from: o.lb || o.type, to: 'FSHIHET' }] });
    else if (!same(o, n)) { const d = diffFields(o, n); requests.push({ kind: 'contract', op: 'edit', kid: o.id, cid: o.cid, label: o.lb || o.type, changes: d.changes, patch: d.patch }); }
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

// D-01: NIPT unik (ndalohet krijimi i dublikatit të ri; dublikatet e vjetra ekzistuese nuk bllokojnë ruajtjen)
export function dupNipt(oldJson, newJson) {
  let o = [], n = [];
  try { o = JSON.parse(oldJson || '[]'); n = JSON.parse(newJson || '[]'); } catch { return ''; }
  const group = (l) => { const m = new Map(); for (const c of l) { const k = String(c.nipt || '').trim().toUpperCase(); if (k) m.set(k, [...(m.get(k) || []), c]); } return m; };
  const O = group(o), N = group(n);
  for (const [k, l] of N) if (l.length > 1 && l.length > (O.get(k) || []).length) return `Ekziston tashmë një klient me NIPT ${k}: ${l[0].emriKompanise}. Hape klientin ekzistues në vend që ta regjistrosh përsëri.`;
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
