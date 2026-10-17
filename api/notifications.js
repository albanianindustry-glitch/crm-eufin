import { sql, ensure, me, wrap } from './_lib.js';
const LINK_TYPES = ['task', 'client', 'mine', 'today'];
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  res.setHeader('Cache-Control', 'no-store');
  const b = req.body || {};
  if (req.method === 'POST' && b.test) {
    if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
    await sql`INSERT INTO notifs(user_id, text, link) VALUES(${Number(b.test)}, ${'Njoftim provë nga ' + u.name}, ${JSON.stringify({ t: 'mine' })})`;
    return res.json({ ok: true });
  }
  // Rikujtesë e vetë përdoruesit (p.sh. përmbledhja ditore e detyrave standarde); "key" e bën të vetme.
  if (req.method === 'POST' && b.auto) {
    const { key, text, link } = b.auto;
    if (typeof key !== 'string' || !key || key.length > 80 || typeof text !== 'string' || !text || text.length > 400) return res.status(400).json({ error: 'Kërkesë e pavlefshme.' });
    const l = link && typeof link === 'object' && LINK_TYPES.includes(link.t) ? JSON.stringify(link).slice(0, 300) : null;
    await sql`INSERT INTO notifs(user_id, text, link, ukey) VALUES(${u.id}, ${text}, ${l}, ${key}) ON CONFLICT (user_id, ukey) WHERE ukey IS NOT NULL DO NOTHING`;
    return res.json({ ok: true });
  }
  // Njoftim për një koleg (p.sh. "e aprovova ndryshimin tënd")
  if (req.method === 'POST' && b.say) {
    const { name, text, link } = b.say;
    if (typeof name !== 'string' || typeof text !== 'string' || !text || text.length > 400) return res.status(400).json({ error: 'Kërkesë e pavlefshme.' });
    const t = await sql`SELECT id FROM users WHERE name = ${name}`;
    if (!t.length) return res.status(404).json({ error: 'Nuk ekziston.' });
    const l = link && typeof link === 'object' && LINK_TYPES.includes(link.t) ? JSON.stringify({ t: link.t, id: link.id }).slice(0, 300) : null;
    await sql`INSERT INTO notifs(user_id, text, link) VALUES(${t[0].id}, ${text}, ${l})`;
    return res.json({ ok: true });
  }
  if (req.method === 'POST' && b.id) { await sql`UPDATE notifs SET read = true WHERE user_id = ${u.id} AND id = ${Number(b.id)}`; return res.json({ ok: true }); }
  if (req.method === 'POST') { await sql`UPDATE notifs SET read = true WHERE user_id = ${u.id} AND read = false`; return res.json({ ok: true }); }
  const items = await sql`SELECT id, text, read, at, link FROM notifs WHERE user_id = ${u.id} ORDER BY id DESC LIMIT 30`;
  res.json({ unread: items.filter((n) => !n.read).length, items });
});
