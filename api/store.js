import { sql, ensure, me, audit, keep, removed, enc, mapSecrets, KEYS } from './_lib.js';

export default async function handler(req, res) {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (req.method === 'GET') {
    const r = await sql`SELECT key, version FROM kv`;
    return res.json(Object.fromEntries(r.map((x) => [x.key, x.version])));
  }
  if (req.method !== 'PUT') return res.status(405).end();
  const { key, value, version = 0 } = req.body || {};
  if (!KEYS.includes(key) || typeof value !== 'string') return res.status(400).json({ error: 'bad request' });
  if (value.length > 4000000) return res.status(413).json({ error: 'Të dhënat janë shumë të mëdha.' });
  let parsed;
  try { parsed = JSON.parse(value); } catch { return res.status(400).json({ error: 'JSON i pavlefshëm' }); }
  if ((key === 'crmX') !== (!Array.isArray(parsed) && parsed && typeof parsed === 'object')) return res.status(400).json({ error: 'Formë e pavlefshme' });
  let v = value;
  if (key === 'crmClients' && u.role !== 'admin') {
    const o = await sql`SELECT value FROM kv WHERE key = ${key}`;
    if (removed(v, o[0] && o[0].value)) return res.status(403).json({ error: 'Vetëm administratori fshin klientë.' });
    v = keep(v, o[0] && o[0].value);
  }
  if (key === 'crmClients') { try { v = mapSecrets(v, enc); } catch { return res.status(500).json({ error: 'Konfigurimi i enkriptimit (DATA_KEY) mungon.' }); } }
  // Ruajtje atomike: pranohet vetëm nëse versioni përputhet (mbron nga mbishkrimi i punës së kolegut)
  const r = await sql`INSERT INTO kv(key, value, version, updated_by) VALUES(${key}, ${v}, 1, ${u.email})
    ON CONFLICT (key) DO UPDATE SET value = ${v}, version = kv.version + 1, updated_by = ${u.email}, updated_at = now()
    WHERE kv.version = ${version} RETURNING version`;
  if (!r.length) return res.status(409).json({ error: 'conflict' });
  await audit(u.email, 'save', `${key} v${r[0].version}`);
  res.json({ version: r[0].version });
}
