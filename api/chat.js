import { sql, ensure, me, wrap } from './_lib.js';

// Chat i thjeshtë mes kolegëve: "Ekipi" (to_name = null) ose mesazh privat. Privatët i shohin vetëm dy palët.
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    const { to = null, text = '' } = req.body || {};
    const t = String(text).trim();
    if (!t || t.length > 2000) return res.status(400).json({ error: 'Mesazh i pavlefshëm (1–2000 shkronja).' });
    if (to && !(await sql`SELECT 1 FROM users WHERE name = ${String(to)}`).length) return res.status(404).json({ error: 'Nuk ekziston.' });
    const r = await sql`INSERT INTO chat(from_name, to_name, text) VALUES(${u.name}, ${to ? String(to) : null}, ${t}) RETURNING id`;
    return res.json({ id: r[0].id });
  }
  const after = Number(new URL(req.url, 'http://x').searchParams.get('after')) || 0;
  const rows = after
    ? await sql`SELECT id, from_name, to_name, text, at FROM chat WHERE id > ${after} AND (to_name IS NULL OR to_name = ${u.name} OR from_name = ${u.name}) ORDER BY id ASC LIMIT 200`
    : (await sql`SELECT id, from_name, to_name, text, at FROM chat WHERE (to_name IS NULL OR to_name = ${u.name} OR from_name = ${u.name}) ORDER BY id DESC LIMIT 100`).reverse();
  res.json(rows);
});
