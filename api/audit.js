import { sql, ensure, me } from './_lib.js';

export default async function handler(req, res) {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  res.json(await sql`SELECT at, user_email, action, detail FROM audit ORDER BY id DESC LIMIT 200`);
}
