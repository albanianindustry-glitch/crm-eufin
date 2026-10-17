// Autorizime në server për detyrat (crmX.mt), shërbimet (crmX.sv) dhe historikun (crmX.hist). Admini lejohet gjithçka.
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
