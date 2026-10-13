import { sql, ensure, me, wrap } from './_lib.js';
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST' && (req.body || {}).test) {
    if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
    await sql`INSERT INTO notifs(user_id, text) VALUES(${Number(req.body.test)}, ${'Njoftim provë nga ' + u.name})`;
    return res.json({ ok: true });
  }
  if (req.method === 'POST') { await sql`UPDATE notifs SET read = true WHERE user_id = ${u.id} AND read = false`; return res.json({ ok: true }); }
  const items = await sql`SELECT text, read, at FROM notifs WHERE user_id = ${u.id} ORDER BY id DESC LIMIT 30`;
  res.json({ unread: items.filter((n) => !n.read).length, items });
});
