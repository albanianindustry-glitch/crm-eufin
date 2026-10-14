import { sql, ensure, me, wrap, KEYS } from './_lib.js';
import { decClients, blankClients } from './_crypto.js';
import { scopeX } from './_scope.js';

export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  const rows = await sql`SELECT key, value, version FROM kv`;
  const data = {};
  rows.filter((r) => KEYS.includes(r.key)).forEach((r) => {
    let v = r.value;
    if (r.key === 'crmClients') v = u.role === 'admin' ? decClients(v) : blankClients(v);
    if (r.key === 'crmX') v = scopeX(v, u);
    data[r.key] = { version: r.version, value: v };
  });
  const users = (await sql`SELECT name FROM users ORDER BY name`).map((x) => x.name);
  res.setHeader('Cache-Control', 'no-store');
  res.json({ me: { name: u.name, email: u.email, role: u.role }, data, users });
});
