import { sql, ensure, me, audit, wrap, bcrypt, MIN_PW, sign, cookie } from './_lib.js';

const admins = async () => (await sql`SELECT count(*)::int AS c FROM users WHERE role = 'admin'`)[0].c;

export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  if (req.method === 'GET') return res.json(await sql`SELECT id, email, name, role, created_at FROM users ORDER BY name`);
  const b = req.body || {};
  if (req.method === 'POST') {
    const email = String(b.email || '').toLowerCase().trim(), name = String(b.name || '').trim();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || String(b.password || '').length < MIN_PW)
      return res.status(400).json({ error: `Plotëso emrin, një email të vlefshëm dhe fjalëkalimin (min. ${MIN_PW} karaktere).` });
    // Detyrat lidhen me përdoruesin sipas emrit, ndaj emri duhet të jetë unik.
    if ((await sql`SELECT 1 FROM users WHERE lower(name) = lower(${name})`).length) return res.status(409).json({ error: 'Ekziston një përdorues me këtë emër. Përdor emër të ndryshëm (p.sh. me mbiemër).' });
    const role = b.role === 'admin' ? 'admin' : 'accountant';
    try {
      await sql`INSERT INTO users(email, name, role, hash) VALUES(${email}, ${name}, ${role}, ${await bcrypt.hash(String(b.password), 10)})`;
    } catch { return res.status(409).json({ error: 'Ky email ekziston.' }); }
    await audit(u.email, 'user-create', email);
    return res.json({ ok: true });
  }
  if (req.method === 'PATCH') {
    const id = Number(b.id), t = (await sql`SELECT id, role FROM users WHERE id = ${id}`)[0];
    if (!t) return res.status(404).json({ error: 'Përdoruesi nuk u gjet.' });
    if (b.password !== undefined) {
      if (String(b.password).length < MIN_PW) return res.status(400).json({ error: `Fjalëkalimi duhet të ketë min. ${MIN_PW} karaktere.` });
      // pwv rrit versionin: sesionet e vjetra të këtij përdoruesi bëhen të pavlefshme
      const changed = await sql`UPDATE users SET hash = ${await bcrypt.hash(String(b.password), 10)}, pwv = pwv + 1 WHERE id = ${id} RETURNING id, pwv`;
      // Nëse admini ndryshon fjalëkalimin e vetes, sesioni i tij vazhdon (cookie e re); sesionet e tjera mbyllen.
      if (id === u.id) res.setHeader('Set-Cookie', cookie(await sign(changed[0]), 604800));
      await audit(u.email, 'user-password', String(id));
    }
    if (b.role !== undefined) {
      const role = b.role === 'admin' ? 'admin' : 'accountant';
      if (role !== 'admin' && t.role === 'admin' && (await admins()) <= 1) return res.status(400).json({ error: 'Duhet të mbetet të paktën një administrator.' });
      const changed = await sql`UPDATE users SET role = ${role}, pwv = pwv + 1 WHERE id = ${id} RETURNING id, pwv`;
      if (id === u.id) res.setHeader('Set-Cookie', cookie(await sign(changed[0]), 604800));
      await audit(u.email, 'user-role', `${id}:${role}`);
    }
    return res.json({ ok: true });
  }
  if (req.method === 'DELETE') {
    const id = Number(b.id);
    if (id === u.id) return res.status(400).json({ error: 'Nuk mund ta fshish veten.' });
    const t = (await sql`SELECT role FROM users WHERE id = ${id}`)[0];
    if (t && t.role === 'admin' && (await admins()) <= 1) return res.status(400).json({ error: 'Duhet të mbetet të paktën një administrator.' });
    await sql`DELETE FROM users WHERE id = ${id}`;
    await sql`DELETE FROM notifs WHERE user_id = ${id}`;
    await audit(u.email, 'user-delete', String(id));
    return res.json({ ok: true });
  }
  res.status(405).end();
});
