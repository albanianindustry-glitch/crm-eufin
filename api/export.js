import { sql, ensure, me, audit, wrap } from './_lib.js';
import { blankClients } from './_crypto.js';
// Kopje rezervë e të dhënave për administratorin (pa fjalëkalimet e klientëve dhe pa skedarët PDF).
export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (u.role !== 'admin') return res.status(403).json({ error: 'Vetëm administratori.' });
  const rows = await sql`SELECT key, value, version FROM kv`;
  const data = {};
  rows.forEach((r) => { data[r.key] = r.key === 'crmClients' ? blankClients(r.value) : r.value; });
  await audit(u.email, 'export');
  res.setHeader('Content-Disposition', `attachment; filename="crm-rezerve-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({ exported_at: new Date().toISOString(), data });
});
