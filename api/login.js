import bcrypt from 'bcryptjs';
import { sql, ensure, sign, cookie, audit } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const { email = '', password = '' } = req.body || {};
  const r = await sql`SELECT * FROM users WHERE email = ${String(email).toLowerCase().trim()}`;
  const u = r[0];
  if (!u || !(await bcrypt.compare(String(password), u.hash))) {
    await new Promise((s) => setTimeout(s, 700));
    return res.status(401).json({ error: 'Email ose fjalëkalim i gabuar.' });
  }
  res.setHeader('Set-Cookie', cookie(await sign(u), 604800));
  await audit(u.email, 'login');
  res.json({ ok: true });
}
