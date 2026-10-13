import bcrypt from 'bcryptjs';
import { sql, ensure, me, audit } from './_lib.js';

export default async function handler(req, res) {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  if (req.method === 'GET') return res.json(await sql`SELECT id, email, name, role FROM users ORDER BY name`);
  const b = req.body || {};
  if (req.method === 'POST') {
    const email = String(b.email || '').toLowerCase().trim();
    if (!b.name || !email || String(b.password || '').length < 8) return res.status(400).json({ error: 'Plotëso emrin, email-in dhe fjalëkalimin (min. 8 karaktere).' });
    const role = b.role === 'admin' ? 'admin' : 'accountant';
    try {
      await sql`INSERT INTO users(email, name, role, hash) VALUES(${email}, ${b.name}, ${role}, ${await bcrypt.hash(String(b.password), 10)})`;
    } catch { return res.status(409).json({ error: 'Ky email ekziston.' }); }
    await audit(u.email, 'user-create', email);
    return res.json({ ok: true });
  }
  if (req.method === 'PATCH') {
    if (String(b.password || '').length < 8) return res.status(400).json({ error: 'Fjalëkalimi duhet të ketë min. 8 karaktere.' });
    await sql`UPDATE users SET hash = ${await bcrypt.hash(String(b.password), 10)} WHERE id = ${b.id}`;
    await audit(u.email, 'user-password', String(b.id));
    return res.json({ ok: true });
  }
  if (req.method === 'DELETE') {
    if (Number(b.id) === u.id) return res.status(400).json({ error: 'Nuk mund ta fshish veten.' });
    await sql`DELETE FROM users WHERE id = ${b.id}`;
    await audit(u.email, 'user-delete', String(b.id));
    return res.json({ ok: true });
  }
  res.status(405).end();
}
