import { sql, ensure, me, audit, wrap, notify, KEYS, ARRAY_KEYS } from './_lib.js';
import { diffNotifs } from './_notify.js';
import { keepSecrets, encClients, decClients, blankClients } from './_crypto.js';
import { mergeJson } from './_merge.js';

export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const r = await sql`SELECT key, version FROM kv`;
    return res.json(Object.fromEntries(r.map((x) => [x.key, x.version])));
  }
  if (req.method !== 'PUT') return res.status(405).end();

  const { key, value, version = 0, base } = req.body || {};
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
    try {
      const m = mergeJson(base, value, theirs);
      plain = m.json; conflicts = m.conflicts; merged = true; baseVer = cur.version;
    } catch { return res.status(409).json({ error: 'conflict', version: cur.version }); }
  }

  let store = plain;
  if (key === 'crmClients') {
    if (u.role !== 'admin') store = keepSecrets(plain, cur && cur.value);
    store = encClients(store);
  }
  // Ruajtje atomike: pranohet vetëm nëse versioni nuk ka ndryshuar ndërkohë
  const r = await sql`INSERT INTO kv(key, value, version, updated_by) VALUES(${key}, ${store}, 1, ${u.email})
    ON CONFLICT (key) DO UPDATE SET value = ${store}, version = kv.version + 1, updated_by = ${u.email}, updated_at = now()
    WHERE kv.version = ${baseVer} RETURNING version`;
  if (!r.length) return res.status(409).json({ error: 'conflict' });
  await audit(u.email, merged ? 'save-merge' : 'save', `${key} v${r[0].version}${merged ? ' konflikte:' + conflicts : ''}`);
  if (key === 'crmX') { try { await notify(diffNotifs(cur && cur.value, store, u)); } catch (e) { console.error('notify', e); } }
  const out = { version: r[0].version, merged, conflicts };
  if (merged) out.value = key === 'crmClients' && u.role !== 'admin' ? blankClients(plain) : plain;
  res.json(out);
});
