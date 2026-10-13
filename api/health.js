import { sql, wrap } from './_lib.js';
export default wrap(async (req, res) => {
  await sql`SELECT 1`;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, time: new Date().toISOString() });
});
