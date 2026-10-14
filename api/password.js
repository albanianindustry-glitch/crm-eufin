import bcrypt from 'bcryptjs';
import { sql, ensure, me, sign, cookie, audit } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  const { current = '', next = '' } = req.body || {};
  if (String(next).length < 8) return res.status(400).json({ error: 'Fjalëkalimi i ri duhet të ketë min. 8 karaktere.' });
  const r = await sql`SELECT hash FROM users WHERE id = ${u.id}`;
  if (!(await bcrypt.compare(String(current), r[0].hash))) {
    await new Promise((s) => setTimeout(s, 500));
    return res.status(403).json({ error: 'Fjalëkalimi aktual është i gabuar.' });
  }
  const n = await sql`UPDATE users SET hash = ${await bcrypt.hash(String(next), 10)}, tv = tv + 1 WHERE id = ${u.id} RETURNING id, tv`;
  res.setHeader('Set-Cookie', cookie(await sign(n[0]), 604800)); // mbetesh i kyçur këtu; seancat e tjera anulohen
  await audit(u.email, 'password-self');
  res.json({ ok: true });
}
