import { sql, ensure, notify, wrap } from './_lib.js';
import { dueDigest } from './_notify.js';
// Thirret çdo ditë nga Vercel Cron (shih vercel.json). Kërkon CRON_SECRET.
export default wrap(async (req, res) => {
  const s = process.env.CRON_SECRET;
  if (!s) return res.status(503).json({ error: 'Vendos CRON_SECRET te Vercel.' });
  if (req.headers.authorization !== `Bearer ${s}`) return res.status(401).json({});
  await ensure();
  const row = (await sql`SELECT value FROM kv WHERE key = 'crmX'`)[0];
  let mt = []; try { mt = JSON.parse(row ? row.value : '{}').mt || []; } catch { /* bosh */ }
  const items = dueDigest(mt, new Date().toISOString().slice(0, 10));
  await notify(items);
  res.json({ ok: true, notified: items.length });
});
