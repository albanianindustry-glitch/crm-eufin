import { sql, sqlTransaction, ensure, me, audit, wrap, notify, KEYS, ARRAY_KEYS } from './_lib.js';
import { randomUUID } from 'node:crypto';
import { diffNotifs, diffClients, diffDecl, diffReq } from './_notify.js';
import { checkX, events, divertClients, divertContracts, checkAssign, dupNipt, clientLines, clientReferences, forbiddenRemovals, isAutoDefaultRequest } from './_perm.js';
import { scopeX, unscopeX } from './_scope.js';
import { keepSecrets, encClients, decClients, blankClients } from './_crypto.js';
import { mergeJson } from './_merge.js';
import { resolveApprovalState } from './_approval.js';
import { prepareApplicationConversion } from './_workflow.js';

async function convertApplication(req, res, user, input) {
  const rows = await sql`SELECT key, value, version FROM kv WHERE key IN ('crmAplikime', 'crmClients')`;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const applicationsRow = byKey.get('crmAplikime');
  const clientsRow = byKey.get('crmClients');
  if (!applicationsRow) return res.status(404).json({ error: 'Nuk u gjetën aplikime.' });

  const clientsValue = clientsRow ? decClients(clientsRow.value) : '[]';
  const currentClients = JSON.parse(clientsValue);
  let nextId = Date.now();
  const ids = new Set(currentClients.map((client) => String(client.id)));
  while (ids.has(String(nextId))) nextId++;
  const conversion = prepareApplicationConversion({
    clientsValue,
    applicationsValue: applicationsRow.value,
    applicationId: input.applicationId,
    nipt: input.nipt,
    approvalDate: input.approvalDate,
    prepaid: input.prepaid,
    now: new Date().toISOString(),
    nextId: () => nextId,
  });
  if (conversion.error) return res.status(conversion.status).json({ error: conversion.error });

  const storedClients = encClients(conversion.clientsValue);
  const writes = [
    { key: 'crmAplikime', row: applicationsRow, value: conversion.applicationsValue },
    { key: 'crmClients', row: clientsRow, value: storedClients },
  ];
  const parameters = [];
  const guards = writes.map(({ key, row, value }) => {
    const start = parameters.length + 1;
    parameters.push(key, row ? row.version + 1 : 1, value);
    return `EXISTS (SELECT 1 FROM kv WHERE key = $${start} AND version = $${start + 1} AND value = $${start + 2})`;
  });

  try {
    await sqlTransaction((tx) => [
      ...writes.map(({ key, row, value }) => row
        ? tx`UPDATE kv SET value = ${value}, version = version + 1, updated_by = ${user.email}, updated_at = now() WHERE key = ${key} AND version = ${row.version} AND value = ${row.value} RETURNING key`
        : tx`INSERT INTO kv(key, value, version, updated_by) VALUES(${key}, ${value}, 1, ${user.email}) ON CONFLICT (key) DO NOTHING RETURNING key`),
      tx`INSERT INTO audit(user_email, action, detail) VALUES(${user.email}, 'application-convert', ${`Aplikimi ${input.applicationId} u konvertua në klient ${conversion.client.id} me NIPT ${conversion.client.nipt}`})`,
      tx(`SELECT CASE WHEN ${guards.join(' AND ')} THEN 1 ELSE 1 / (SELECT 0) END AS committed`, parameters),
    ], { isolationLevel: 'Serializable' });
  } catch (error) {
    if (['22012', '40001', '23505'].includes(error.code)) {
      return res.status(409).json({ error: 'Aplikimi ose klientët ndryshuan ndërkohë. Rifresko dhe provo përsëri.' });
    }
    throw error;
  }
  return res.json({ ok: true, clientId: conversion.client.id });
}

// Pastron kërkesat që janë vetëm plotësime automatike të vlerave default (krijuar nga versione të vjetra).
async function dismissAutoRequests(res, user) {
  const row = (await sql`SELECT value, version FROM kv WHERE key = 'crmReq'`)[0];
  if (!row) return res.json({ ok: true, dismissed: 0 });
  const list = JSON.parse(row.value), at = new Date().toISOString();
  let dismissed = 0;
  const next = list.map((r) => (isAutoDefaultRequest(r) ? (dismissed += 1, { ...r, st: 'rejected', dec: 'Sistemi', decAt: at, why: 'Plotësim automatik i vlerave default (jo ndryshim i përdoruesit)', auto: true }) : r));
  if (!dismissed) return res.json({ ok: true, dismissed: 0 });
  const value = JSON.stringify(next);
  const saved = await sql`WITH upd AS (UPDATE kv SET value = ${value}, version = version + 1, updated_by = ${user.email}, updated_at = now() WHERE key = 'crmReq' AND version = ${row.version} RETURNING version)
    , logged AS (INSERT INTO audit(user_email, action, detail) SELECT ${user.email}, 'request-auto-dismiss', ${`${dismissed} kërkesa automatike u pastruan`} FROM upd RETURNING id)
    SELECT upd.version FROM upd JOIN logged ON true`;
  if (!saved.length) return res.status(409).json({ error: 'Kërkesat ndryshuan ndërkohë. Rifresko dhe provo përsëri.' });
  return res.json({ ok: true, dismissed });
}

async function decideApproval(req, res, user, action) {
  if (user.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori mund të vendosë për kërkesat.' });
  if (!action || typeof action.id !== 'string' || !['approved', 'rejected'].includes(action.decision)) {
    return res.status(400).json({ error: 'Vendimi për miratim është i pavlefshëm.' });
  }

  const rows = await sql`SELECT key, value, version FROM kv WHERE key IN ('crmReq', 'crmClients', 'crmX')`;
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const requestRow = byKey.get('crmReq');
  if (!requestRow) return res.status(404).json({ error: 'Nuk ka kërkesa për miratim.' });
  const clientsRow = byKey.get('crmClients');
  const xRow = byKey.get('crmX');
  const clientsPlain = clientsRow ? decClients(clientsRow.value) : '[]';
  const result = resolveApprovalState({
    requestValue: requestRow.value,
    clientsValue: clientsPlain,
    crmXValue: xRow ? xRow.value : '{}',
    id: action.id,
    decision: action.decision,
    reason: action.reason,
    actor: user,
    now: new Date().toISOString(),
    documentId: randomUUID(),
  });
  if (result.error) return res.status(result.status).json({ error: result.error });

  const writes = [{ key: 'crmReq', row: requestRow, value: result.requestValue }];
  const approved = action.decision === 'approved';
  if (approved && result.clientsValue !== clientsPlain) {
    if (!clientsRow) return res.status(409).json({ error: 'Regjistri i klientëve nuk ekziston.' });
    writes.push({ key: 'crmClients', row: clientsRow, value: encClients(result.clientsValue) });
  }
  if (approved && result.crmXValue !== (xRow ? xRow.value : '{}')) {
    if (!xRow) return res.status(409).json({ error: 'Regjistri i punës nuk ekziston.' });
    writes.push({ key: 'crmX', row: xRow, value: result.crmXValue });
  }

  const params = [];
  const predicates = writes.map(({ key, row, value }) => {
    const start = params.length + 1;
    params.push(key, row.version + 1, value);
    return `EXISTS (SELECT 1 FROM kv WHERE key = $${start} AND version = $${start + 1} AND value = $${start + 2})`;
  });
  try {
    await sqlTransaction((tx) => [
      ...writes.map(({ key, row, value }) => tx`UPDATE kv SET value = ${value}, version = version + 1, updated_by = ${user.email}, updated_at = now() WHERE key = ${key} AND version = ${row.version} AND value = ${row.value} RETURNING key`),
      tx`INSERT INTO audit(user_email, action, detail) VALUES(${user.email}, ${result.auditAction}, ${result.auditDetail})`,
      tx`INSERT INTO notifs(user_id, text, link) SELECT id, ${`${user.name} ${action.decision === 'approved' ? 'miratoi' : 'refuzoi'} kërkesën: ${result.request.label || result.request.kind}`}, ${JSON.stringify({ t: result.request.cid ? 'client' : 'today', id: result.request.cid })} FROM users WHERE lower(trim(name)) = lower(trim(${result.request.by}))`,
      tx(`SELECT CASE WHEN ${predicates.join(' AND ')} THEN 1 ELSE 1 / (SELECT 0) END AS committed`, params),
    ], { isolationLevel: 'Serializable' });
  } catch (error) {
    if (['22012', '40001', '23505'].includes(error.code)) {
      return res.status(409).json({ error: 'Kërkesa ose të dhënat e lidhura ndryshuan ndërkohë. Rifresko dhe provo përsëri.' });
    }
    throw error;
  }

  return res.json({ ok: true, id: action.id, decision: action.decision });
}

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

  const { key, value, version = 0, base, action, workflow } = req.body || {};
  if (key === 'crmReq' && u.role !== 'admin') return res.status(403).json({ error: 'perm', message: 'Vetëm administratori miraton kërkesat.' });
  if (key === 'crmReq' && action && action.decision === 'dismiss_auto') {
    if (u.role !== 'admin') return res.status(403).json({ error: 'perm', message: 'Vetëm administratori.' });
    return dismissAutoRequests(res, u);
  }
  if (key === 'crmReq' && action) return decideApproval(req, res, u, action);
  if (key === 'crmAplikime' && workflow && workflow.type === 'convert') return convertApplication(req, res, u, workflow);
  if (!KEYS.includes(key) || typeof value !== 'string') return res.status(400).json({ error: 'Kërkesë e pavlefshme.' });
  if (value.length > 3500000) return res.status(413).json({ error: 'Të dhënat janë shumë të mëdha.' });
  let parsed;
  try { parsed = JSON.parse(value); } catch { return res.status(400).json({ error: 'JSON i pavlefshëm.' }); }
  if (ARRAY_KEYS.includes(key) && !Array.isArray(parsed)) return res.status(400).json({ error: 'Struktura e pavlefshme.' });
  if (key === 'crmClients') {   // çdo klient ka ID, dhe ID-të janë unike (përndryshe NIPT-i unik anashkalohet me një ID të përsëritur)
    const seen = new Set();
    for (const client of parsed) {
      const id = client && typeof client === 'object' ? client.id : undefined;
      if (id === undefined || id === null || id === '' || seen.has(String(id))) return res.status(400).json({ error: 'Struktura e pavlefshme: klientët duhet të kenë ID unike.' });
      seen.add(String(id));
    }
  }

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
  if (u.role !== 'admin' && cur && ['crmDeklarimeTVSH', 'crmNdryshime', 'crmAplikime'].includes(key)) {
    const bad = forbiddenRemovals(key, cur.value, plain);
    if (bad.length) return res.status(403).json({ error: 'perm', message: bad[0] });
  }
  if (key === 'crmClients' && cur) {
    let previous = [], next = [];
    try {
      previous = JSON.parse(decClients(cur.value));
      next = JSON.parse(plain);
    } catch { return res.status(400).json({ error: 'Struktura e klientëve është e pavlefshme.' }); }
    const nextIds = new Set(next.map((client) => String(client.id)));
    const removed = previous.filter((client) => !nextIds.has(String(client.id)));
    if (removed.length && u.role !== 'admin') {
      return res.status(403).json({ error: 'perm', message: 'Vetëm administratori mund të fshijë klientë.' });
    }
    if (removed.length) {
      const xJson = ((await sql`SELECT value FROM kv WHERE key = 'crmX'`)[0] || {}).value || '{}';
      const declarationsJson = ((await sql`SELECT value FROM kv WHERE key = 'crmDeklarimeTVSH'`)[0] || {}).value || '[]';
      const requestsJson = ((await sql`SELECT value FROM kv WHERE key = 'crmReq'`)[0] || {}).value || '[]';
      const changesJson = ((await sql`SELECT value FROM kv WHERE key = 'crmNdryshime'`)[0] || {}).value || '[]';
      const applicationsJson = ((await sql`SELECT value FROM kv WHERE key = 'crmAplikime'`)[0] || {}).value || '[]';
      for (const client of removed) {
        const refs = clientReferences(client, xJson, declarationsJson, requestsJson, changesJson, applicationsJson);
        if (refs.length) {
          return res.status(403).json({
            error: 'perm',
            message: `Klienti ${client.emriKompanise || client.id} ka të dhëna të lidhura (${refs.join(', ')}); arkivoji (status Inaktiv) ose hiqi lidhjet përpara fshirjes.`,
          });
        }
      }
    }
  }
  const saveRequests = async () => {
    const row = (await sql`SELECT value, version FROM kv WHERE key = 'crmReq'`)[0], at = new Date().toISOString();
    const existing = row ? JSON.parse(row.value) : [];
    // Kërkesë identike që pret ende vendim nuk shtohet përsëri (ruajtje e përsëritur = e njëjta kërkesë).
    const sig = (r) => JSON.stringify([r.kind, r.cid ?? null, r.kid ?? null, r.op ?? null, r.patch ?? null]);
    const pending = new Set(existing.filter((r) => r.st === 'pending').map(sig));
    const add = diverted.filter((r) => !pending.has(sig(r))).map((r) => ({ id: randomUUID(), by: u.name, at, st: 'pending', ...r }));
    if (!add.length) return true;
    const val = JSON.stringify([...existing, ...add]);
    const expectedVersion = row ? row.version : 0;
    const saved = await sql`WITH saved AS (
        INSERT INTO kv(key, value, version, updated_by) VALUES('crmReq', ${val}, 1, ${u.email})
        ON CONFLICT (key) DO UPDATE SET value = ${val}, version = kv.version + 1, updated_by = ${u.email}, updated_at = now()
        WHERE kv.version = ${expectedVersion} RETURNING version
      ), notified AS (
        INSERT INTO notifs(user_id, text, link)
        SELECT users.id, ${u.name} || ' kërkon miratim: ' || requests.label || CASE WHEN requests.op = 'del' THEN ' (fshirje)' ELSE '' END,
          jsonb_build_object('t', 'req', 'id', requests.id)::text
        FROM saved
        CROSS JOIN jsonb_to_recordset(${JSON.stringify(add)}::jsonb) AS requests(id text, label text, op text)
        CROSS JOIN users WHERE users.role = 'admin' RETURNING id
      ), logged AS (
        INSERT INTO audit(user_email, action, detail)
        SELECT ${u.email}, 'request', ${`${add.length} kërkesë/a (${key})`} FROM saved RETURNING id
      )
      SELECT saved.version FROM saved JOIN logged ON true`;
    return saved.length > 0;
  };
  let requestsSaved = false;
  if (diverted.length) {
    // Kërkesat ruhen të parat (me kontroll versioni dhe pa dublikatë). Nëse ruajtja e pjesës tjetër dështon
    // dhe përsëritet, kërkesa identike nuk shtohet dy herë.
    if (!await saveRequests()) return res.status(409).json({ error: 'Kërkesa ndryshoi ndërkohë. Rifresko dhe provo përsëri.' });
    requestsSaved = true;
    let same0 = false; try { const norm = (x) => JSON.stringify(JSON.parse(x)); same0 = norm(viewOf()) === norm(plain); } catch { /* vazhdo */ }
    if (same0) return res.json({ version: cur.version, merged: true, requests: diverted.length, value: plain });
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
    const cs = ((await sql`SELECT value FROM kv WHERE key = 'crmClients'`)[0] || {}).value || '[]';
    const admins = (await sql`SELECT name FROM users WHERE role = 'admin'`).map((x) => x.name);
    const viol = checkX(cur.value, plain, u, cs, admins);
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
  const auditRows = [{ action: merged ? 'save-merge' : 'save', detail: `${key} v${baseVer + 1}${merged ? ' konflikte:' + conflicts : ''}` }];
  if (key === 'crmX') auditRows.push(...events(cur ? (u.role === 'admin' ? cur.value : scopeX(cur.value, u)) : '', plain));
  if (key === 'crmClients' && cur) auditRows.push(...clientLines(viewOf(), plain).slice(0, 25).map((detail) => ({ action: 'client-change', detail })));
  if (key === 'crmReq') {
    try {
      const old = new Map(JSON.parse((cur && cur.value) || '[]').map((r) => [r.id, r]));
      for (const request of parsed) {
        const previous = old.get(request.id);
        if (previous && previous.st === 'pending' && request.st !== 'pending') {
          auditRows.push({
            action: request.st === 'approved' ? 'request-approved' : 'request-rejected',
            detail: `${request.label} (kërkuar nga ${request.by})${request.why ? ' – ' + request.why : ''}`,
          });
        }
      }
    } catch { return res.status(400).json({ error: 'Lista e kërkesave është e pavlefshme.' }); }
  }
  const r = await sql`WITH saved AS (
      INSERT INTO kv(key, value, version, updated_by) VALUES(${key}, ${store}, 1, ${u.email})
      ON CONFLICT (key) DO UPDATE SET value = ${store}, version = kv.version + 1, updated_by = ${u.email}, updated_at = now()
      WHERE kv.version = ${baseVer} RETURNING version
    ), logged AS (
      INSERT INTO audit(user_email, action, detail)
      SELECT ${u.email}, event.action, event.detail
      FROM saved CROSS JOIN jsonb_to_recordset(${JSON.stringify(auditRows)}::jsonb) AS event(action text, detail text)
      RETURNING id
    )
    SELECT saved.version FROM saved WHERE (SELECT count(*) FROM logged) = ${auditRows.length}`;
  if (!r.length) return res.status(409).json({ error: 'conflict' });
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
  if (merged || requestsSaved) out.value = key === 'crmClients' && u.role !== 'admin' ? blankClients(plain) : plain;
  if (requestsSaved) { out.merged = true; out.requests = diverted.length; }
  res.json(out);
});
