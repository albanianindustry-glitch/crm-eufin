import { sql, ensure, me, wrap } from './_lib.js';

// Historiku i auditimit (vetëm administratori), me filtra: q (detaj), user, action, from, to. Maksimumi 500 rreshta.
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  res.setHeader('Cache-Control', 'no-store');
  const q = new URL(req.url, 'http://x').searchParams, f = (k) => (q.get(k) || '').trim().toLowerCase(), day = (v) => new Date(v).toISOString().slice(0, 10);
  const text = f('q'), usr = f('user'), act = (q.get('action') || '').trim(), from = q.get('from') || '', to = q.get('to') || '';
  const rows = await sql`SELECT at, user_email, action, detail FROM audit ORDER BY id DESC LIMIT 3000`;
  res.json(rows.filter((r) => (!text || String(r.detail || '').toLowerCase().includes(text)) && (!usr || String(r.user_email || '').toLowerCase().includes(usr)) && (!act || r.action === act) && (!from || day(r.at) >= from) && (!to || day(r.at) <= to)).slice(0, 500));
});
