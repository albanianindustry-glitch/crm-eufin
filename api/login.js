import { sql, ensure, sign, cookie, audit, wrap, ip, bcrypt } from './_lib.js';

export default wrap(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const email = String((req.body || {}).email || '').toLowerCase().trim();
  const password = String((req.body || {}).password || '');
  const addr = ip(req);
  const t = await sql`SELECT count(*)::int AS c FROM login_attempts WHERE at > now() - interval '15 minutes' AND (email = ${email} OR ip = ${addr})`;
  if (t[0].c >= 8) return res.status(429).json({ error: 'Shumë përpjekje. Provo përsëri pas 15 minutash.' });
  const r = await sql`SELECT * FROM users WHERE email = ${email}`;
  const u = r[0];
  if (!u || !(await bcrypt.compare(password, u.hash))) {
    await sql`INSERT INTO login_attempts(email, ip) VALUES(${email}, ${addr})`;
    await new Promise((s) => setTimeout(s, 600));
    return res.status(401).json({ error: 'Email ose fjalëkalim i gabuar.' });
  }
  await sql`DELETE FROM login_attempts WHERE email = ${email}`;
  res.setHeader('Set-Cookie', cookie(await sign(u), 604800));
  await audit(u.email, 'login', addr);
  res.json({ ok: true });
});
