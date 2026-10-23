import { sql, ensure, me, wrap } from './_lib.js';

// Historiku i auditimit (vetëm administratori), me filtra: q (detaj), user, action, from, to. Maksimumi 500 rreshta.
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  res.setHeader('Cache-Control', 'no-store');
  const q = new URL(req.url, 'http://x').searchParams, f = (k) => (q.get(k) || '').trim().toLowerCase();
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T00:00:00Z').getTime());
  const text = f('q'), usr = f('user'), act = (q.get('action') || '').trim();
  const from = isDay(q.get('from') || '') ? q.get('from') : '', to = isDay(q.get('to') || '') ? q.get('to') : '';
  // Filtrimi bëhet në bazë (jo vetëm mbi 3000 rreshtat e fundit), ndaj gjendet edhe ngjarja e vjetër.
  const rows = await sql`SELECT at, user_email, action, detail FROM audit
    WHERE (${text} = '' OR position(${text} in lower(coalesce(detail, ''))) > 0)
      AND (${usr} = '' OR position(${usr} in lower(coalesce(user_email, ''))) > 0)
      AND (${act} = '' OR action = ${act})
      AND (${from} = '' OR at >= NULLIF(${from}, '')::date)
      AND (${to} = '' OR at < (NULLIF(${to}, '')::date + 1))
    ORDER BY id DESC LIMIT 500`;
  res.json(rows);
});
