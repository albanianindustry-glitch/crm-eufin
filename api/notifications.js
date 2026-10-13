import { sql, ensure, me, wrap } from './_lib.js';
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') { await sql`UPDATE notifs SET read = true WHERE user_id = ${u.id} AND read = false`; return res.json({ ok: true }); }
  const items = await sql`SELECT text, read, at FROM notifs WHERE user_id = ${u.id} ORDER BY id DESC LIMIT 30`;
  res.json({ unread: items.filter((n) => !n.read).length, items });
});
