import { sql, ensure, me, strip, dec, mapSecrets, KEYS } from './_lib.js';

export default async function handler(req, res) {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  const rows = await sql`SELECT key, value, version FROM kv`;
  const data = {};
  rows.filter((r) => KEYS.includes(r.key)).forEach((r) => {
    data[r.key] = { version: r.version, value: r.key !== 'crmClients' ? r.value : u.role === 'admin' ? mapSecrets(r.value, dec) : strip(r.value) };
  });
  const users = (await sql`SELECT name FROM users ORDER BY name`).map((x) => x.name);
  res.json({ me: { name: u.name, email: u.email, role: u.role }, data, users });
}
