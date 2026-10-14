import { sql, ensure, me, audit } from './_lib.js';

// Fshin PDF-të që nuk i referohet asnjë rekord (p.sh. të zëvendësuara ose të hequra), më të vjetra se 1 ditë
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  const refs = (await sql`SELECT value FROM kv`).map((r) => r.value).join(' ');
  const old = await sql`SELECT id FROM files WHERE created_at < now() - interval '1 day'`;
  const dead = old.filter((f) => !refs.includes(f.id));
  for (const f of dead) await sql`DELETE FROM files WHERE id = ${f.id}`;
  await audit(u.email, 'cleanup', String(dead.length));
  res.json({ deleted: dead.length });
}
