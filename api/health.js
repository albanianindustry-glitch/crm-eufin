import { sql, wrap, configStatus } from './_lib.js';
// Pa sekrete: tregon vetëm emrat e variablave që mungojnë dhe nëse lidhja me bazën punon.
export default wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const config = configStatus();
  let db = false;
  if (!config.missing.includes('DATABASE_URL')) { try { await sql`SELECT 1`; db = true; } catch { db = false; } }
  const ok = config.ok && db;
  res.status(ok ? 200 : 503).json({ ok, db, config, time: new Date().toISOString() });
});
