import { sql, ensure, me, audit, wrap, notify, KEYS, ARRAY_KEYS } from './_lib.js';
import { diffNotifs, diffClients, diffDecl, diffReq } from './_notify.js';
import { checkX, events, divertClients, divertContracts, checkAssign, dupNipt, clientLines } from './_perm.js';
import { scopeX, unscopeX } from './_scope.js';
import { keepSecrets, encClients, decClients, blankClients } from './_crypto.js';
import { mergeJson } from './_merge.js';

export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const r = await sql`SELECT k.key, k.version, u.name AS by FROM kv k LEFT JOIN users u ON u.email = k.updated_by`;
    return res.json({ ...Object.fromEntries(r.map((x) => [x.key, x.version])), _by: Object.fromEntries(r.map((x) => [x.key, x.by])) });
  }
  if (req.method !== 'PUT') return res.status(405).end();

  const { key, value, version = 0, base } = req.body || {};
  if (key === 'crmReq' && u.role !== 'admin') return res.status(403).json({ error: 'perm', message: 'Vetëm administratori miraton kërkesat.' });
  if (!KEYS.includes(key) || typeof value !== 'string') return res.status(400).json({ error: 'Kërkesë e pavlefshme.' });
  if (value.length > 3500000) return res.status(413).json({ error: 'Të dhënat janë shumë të mëdha.' });
  let parsed;
  try { parsed = JSON.parse(value); } catch { return res.status(400).json({ error: 'JSON i pavlefshëm.' }); }
  if (ARRAY_KEYS.includes(key) && !Array.isArray(parsed)) return res.status(400).json({ error: 'Struktura e pavlefshme.' });

  const cur = (await sql`SELECT value, version FROM kv WHERE key = ${key}`)[0];
  let plain = value, baseVer = version, merged = false, conflicts = 0;

  if (cur && cur.version !== version) {
    // Dikush tjetër ka ruajtur ndërkohë. Pa bazë nuk mund të bashkojmë; me bazë bashkojmë për rekord.
    if (typeof base !== 'string') return res.status(409).json({ error: 'conflict', version: cur.version });
    let theirs = cur.value;
    if (key === 'crmClients') theirs = u.role === 'admin' ? decClients(theirs) : blankClients(theirs);
    if (key === 'crmX') theirs = scopeX(theirs, u);
    try {
      const m = mergeJson(base, value, theirs);
      plain = m.json; conflicts = m.conflicts; merged = true; baseVer = cur.version;
    } catch { return res.status(409).json({ error: 'conflict', version: cur.version }); }
  }

  // Politika: asgjë nuk ndryshon pa miratimin e administratorit (klientët ekzistues, kontratat ekzistuese)
  let diverted = [];
  const viewOf = () => (key === 'crmClients' ? (u.role === 'admin' ? decClients(cur.value) : blankClients(cur.value)) : cur.value);
  if (u.role !== 'admin' && cur) {
    if (key === 'crmClients') { const d = divertClients(blankClients(cur.value), plain, u); if (d.requests.length) { plain = d.value; diverted = d.requests; } }
    if (key === 'crmX') { const d = divertContracts(cur.value, plain); if (d.requests.length) { plain = d.value; diverted = d.requests; } }
  }
  const saveRequests = async () => {
    const row = (await sql`SELECT value FROM kv WHERE key = 'crmReq'`)[0], at = new Date().toISOString();
    const add = diverted.map((r) => ({ id: Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4), by: u.name, at, st: 'pending', ...r }));
    const val = JSON.stringify([...(row ? JSON.parse(row.value) : []), ...add]);
    await sql`INSERT INTO kv(key, value, version, updated_by) VALUES('crmReq', ${val}, 1, ${u.email}) ON CONFLICT (key) DO UPDATE SET value = ${val}, version = kv.version + 1, updated_by = ${u.email}, updated_at = now()`;
    for (const a of add) await sql`INSERT INTO notifs(user_id, text, link) SELECT id, ${`${u.name} kërkon miratim: ${a.label}${a.op === 'del' ? ' (fshirje)' : ''}`}, ${JSON.stringify({ t: 'req', id: a.id })} FROM users WHERE role = 'admin'`;
    await audit(u.email, 'request', `${diverted.length} kërkesë/a (${key})`);
  };
  if (diverted.length) {   // asgjë tjetër për të ruajtur: vetëm kërkesat
    let same0 = false; try { const norm = (x) => JSON.stringify(JSON.parse(x)); same0 = norm(viewOf()) === norm(plain); } catch { /* vazhdo */ }
    if (same0) { await saveRequests(); return res.json({ version: cur.version, merged: true, requests: diverted.length, value: plain }); }
  }
  if (key === 'crmClients') {   // D-01: NIPT unik edhe në server (mbulon edhe dy kërkesa njëkohësisht pas bashkimit)
    const dup = dupNipt(cur ? viewOf() : '[]', plain);
    if (dup) return res.status(403).json({ error: 'perm', message: dup });
  }
  let store = plain;
  if (key === 'crmClients') {
    if (u.role !== 'admin') store = keepSecrets(plain, cur && cur.value);
    store = encClients(store);
  }
  if (key === 'crmX') store = unscopeX(store, cur && cur.value, u);
  if (key === 'crmX' && u.role !== 'admin' && cur) {   // lejet zbatohen këtu, jo vetëm në ndërfaqe
    const viol = checkX(cur.value, plain, u);
    if (viol.length) return res.status(403).json({ error: 'perm', message: 'Nuk ke autorizim për: ' + viol.slice(0, 3).join('; ') + '.', violations: viol });
  }
  if (key === 'crmX' && cur) {   // detyra me klient: vetëm përgjegjësi i klientit (ose admini) mund të jetë përgjegjës
    const cs = ((await sql`SELECT value FROM kv WHERE key = 'crmClients'`)[0] || {}).value || '';
    const adm = (await sql`SELECT name FROM users WHERE role = 'admin'`).map((x) => x.name);
    const bad = checkAssign(cur.value, plain, cs, adm);
    if (bad.length) return res.status(403).json({ error: 'perm', message: 'Caktimi nuk lejohet: ' + bad.slice(0, 3).join('; ') + '.', violations: bad });
  }
  // Pa ndryshim real (p.sh. saveData() i shkruan të katër çelësat sa herë ruan diçka): mos rrit versionin, mos njofto, mos regjistro
  if (cur && !merged && cur.version === baseVer) {
    try {
      const view = key === 'crmClients' ? (u.role === 'admin' ? decClients(cur.value) : blankClients(cur.value)) : key === 'crmX' ? scopeX(cur.value, u) : cur.value;
      const norm = (s) => JSON.stringify(JSON.parse(s));
      if (norm(view) === norm(plain)) return res.json({ version: cur.version, merged: false, conflicts: 0, unchanged: true });
    } catch { /* ruaj normalisht */ }
  }
  // Ruajtje atomike: pranohet vetëm nëse versioni nuk ka ndryshuar ndërkohë
  const r = await sql`INSERT INTO kv(key, value, version, updated_by) VALUES(${key}, ${store}, 1, ${u.email})
    ON CONFLICT (key) DO UPDATE SET value = ${store}, version = kv.version + 1, updated_by = ${u.email}, updated_at = now()
    WHERE kv.version = ${baseVer} RETURNING version`;
  if (!r.length) return res.status(409).json({ error: 'conflict' });
  await audit(u.email, merged ? 'save-merge' : 'save', `${key} v${r[0].version}${merged ? ' konflikte:' + conflicts : ''}`);
  if (key === 'crmX') for (const ev of events(cur ? (u.role === 'admin' ? cur.value : scopeX(cur.value, u)) : '', plain)) await audit(u.email, ev.action, ev.detail);
  if (diverted.length) await saveRequests();
  if (key === 'crmClients' && cur) for (const l of clientLines(viewOf(), plain).slice(0, 25)) await audit(u.email, 'client-change', l);
  if (key === 'crmReq') {
    try {
      const old = new Map(JSON.parse((cur && cur.value) || '[]').map((r) => [r.id, r]));
      for (const r of parsed) { const p0 = old.get(r.id); if (p0 && p0.st === 'pending' && r.st !== 'pending') await audit(u.email, r.st === 'approved' ? 'request-approved' : 'request-rejected', `${r.label} (kërkuar nga ${r.by})${r.why ? ' – ' + r.why : ''}`); }
    } catch { /* auditimi nuk e prish ruajtjen */ }
  }
  if (key === 'crmX' || key === 'crmClients' || key === 'crmDeklarimeTVSH' || key === 'crmReq') {
    try {
      const admins = (await sql`SELECT name FROM users WHERE role = 'admin'`).map((x) => x.name);
      const cs = key === 'crmClients' ? '' : ((await sql`SELECT value FROM kv WHERE key = 'crmClients'`)[0] || {}).value || '';
      const items = (key === 'crmX' ? diffNotifs : key === 'crmClients' ? diffClients : key === 'crmReq' ? diffReq : diffDecl)(cur && cur.value, store, u, admins, cs);
      if (items.length) { await notify(items); await audit(u.email, 'notify', items.map((i) => i.name).join(', ')); }
    } catch (e) {
      console.error('notify', e);
      try { await audit(u.email, 'notify-error', String(e.message || e).slice(0, 200)); } catch { /* ignore */ }
    }
  }
  const out = { version: r[0].version, merged, conflicts };
  if (merged) out.value = key === 'crmClients' && u.role !== 'admin' ? blankClients(plain) : plain;
  res.json(out);
});
