import { randomUUID } from 'node:crypto';
import { sql, ensure, me, audit, wrap } from './_lib.js';

export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (req.method === 'POST') {
    const d = String((req.body || {}).data || '');
    const m = d.match(/^data:application\/pdf;base64,([A-Za-z0-9+/=]+)$/);
    if (!m) return res.status(400).json({ error: 'Pranohen vetëm PDF.' });
    const id = randomUUID();
    await sql`INSERT INTO files(id, name, data, size, created_by) VALUES(${id}, ${String((req.body || {}).name || '').slice(0, 200)}, ${m[1]}, ${Math.round(m[1].length * 0.75)}, ${u.email})`;
    await audit(u.email, 'file-upload', id);
    return res.json({ url: '/api/file?id=' + id });
  }
  if (req.method === 'GET') {
    const r = await sql`SELECT data FROM files WHERE id = ${String(req.query.id || '')}`;
    if (!r.length) return res.status(404).end();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(Buffer.from(r[0].data, 'base64'));
  }
  res.status(405).end();
});
