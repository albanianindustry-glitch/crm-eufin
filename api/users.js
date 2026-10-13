import { sql, ensure, me, audit, wrap, bcrypt, MIN_PW } from './_lib.js';

export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  if (req.method === 'GET') return res.json(await sql`SELECT id, email, name, role FROM users ORDER BY name`);
  const b = req.body || {};
  if (req.method === 'POST') {
    const email = String(b.email || '').toLowerCase().trim();
    if (!b.name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || String(b.password || '').length < MIN_PW)
      return res.status(400).json({ error: `Plotëso emrin, një email të vlefshëm dhe fjalëkalimin (min. ${MIN_PW} karaktere).` });
    const role = b.role === 'admin' ? 'admin' : 'accountant';
    try {
      await sql`INSERT INTO users(email, name, role, hash) VALUES(${email}, ${String(b.name).trim()}, ${role}, ${await bcrypt.hash(String(b.password), 10)})`;
    } catch { return res.status(409).json({ error: 'Ky email ekziston.' }); }
    await audit(u.email, 'user-create', email);
    return res.json({ ok: true });
  }
  if (req.method === 'PATCH') {
    if (String(b.password || '').length < MIN_PW) return res.status(400).json({ error: `Fjalëkalimi duhet të ketë min. ${MIN_PW} karaktere.` });
    // pwv rrit versionin: sesionet e vjetra të këtij përdoruesi bëhen të pavlefshme
    await sql`UPDATE users SET hash = ${await bcrypt.hash(String(b.password), 10)}, pwv = pwv + 1 WHERE id = ${b.id}`;
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
});
