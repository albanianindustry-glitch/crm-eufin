import bcrypt from 'bcryptjs';
import { sql, ensure, sign, cookie, audit } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const { email = '', password = '' } = req.body || {};
  const em = String(email).toLowerCase().trim().slice(0, 200);
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const k = em + '|' + ip;
  const f = await sql`SELECT count(*)::int AS c FROM attempts WHERE k = ${k} AND at > now() - interval '15 minutes'`;
  if (f[0].c >= 8) return res.status(429).json({ error: 'Shumë përpjekje. Provo përsëri pas 15 minutash.' });
  const r = await sql`SELECT * FROM users WHERE email = ${em}`;
  const u = r[0];
  // kohë e njëjtë për përdorues ekzistues/joekzistues (pa zbuluar cilat email-e ekzistojnë)
  const ok = u ? await bcrypt.compare(String(password), u.hash) : (await bcrypt.hash(String(password), 10), false);
  if (!ok) {
    await sql`INSERT INTO attempts(k) VALUES(${k})`;
    await new Promise((s) => setTimeout(s, 500));
    return res.status(401).json({ error: 'Email ose fjalëkalim i gabuar.' });
  }
  await sql`DELETE FROM attempts WHERE k = ${k}`;
  res.setHeader('Set-Cookie', cookie(await sign(u), 604800));
  await audit(u.email, 'login');
  res.json({ ok: true });
}
