import { sql, ensure, me, sign, cookie, audit, wrap, bcrypt, MIN_PW } from './_lib.js';
// Çdo përdorues e ndryshon vetë fjalëkalimin; sesionet e tjera mbyllen, ky vazhdon.
export default wrap(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  const { current = '', password = '' } = req.body || {};
  const row = (await sql`SELECT hash FROM users WHERE id = ${u.id}`)[0];
  if (!(await bcrypt.compare(String(current), row.hash))) return res.status(400).json({ error: 'Fjalëkalimi aktual është i gabuar.' });
  if (String(password).length < MIN_PW) return res.status(400).json({ error: `Fjalëkalimi i ri duhet të ketë min. ${MIN_PW} karaktere.` });
  const r = await sql`UPDATE users SET hash = ${await bcrypt.hash(String(password), 10)}, pwv = pwv + 1 WHERE id = ${u.id} RETURNING id, pwv`;
  res.setHeader('Set-Cookie', cookie(await sign(r[0]), 604800));
  await audit(u.email, 'password-self');
  res.json({ ok: true });
});
