import { sql, ensure, me, wrap } from './_lib.js';
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(await sql`SELECT at, user_email, action, detail FROM audit ORDER BY id DESC LIMIT 300`);
});
