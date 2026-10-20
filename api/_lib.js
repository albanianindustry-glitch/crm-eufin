import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export class ConfigError extends Error {}
let _sql;
const db = () => {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new ConfigError('Mungon variabla DATABASE_URL (lidh Neon te Vercel -> Storage dhe bëj Redeploy).');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
};
// Lazy: pa DATABASE_URL moduli importohet, por query kthen mesazh të qartë.
export const sql = (...a) => db()(...a);
export const sqlTransaction = (...a) => db().transaction(...a);
export function configStatus() {
  const miss = ['DATABASE_URL', 'AUTH_SECRET', 'DATA_KEY'].filter((k) => !process.env[k]);
  const bad = [];
  if (process.env.AUTH_SECRET && process.env.AUTH_SECRET.length < 32) bad.push('AUTH_SECRET (min. 32 karaktere)');
  if (process.env.DATA_KEY && Buffer.from(process.env.DATA_KEY, 'base64').length !== 32) bad.push('DATA_KEY (duhet 32 bajt base64)');
  return { missing: miss, invalid: bad, ok: !miss.length && !bad.length };
}
export const KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX', 'crmReq'];
export const ARRAY_KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmReq'];
export const MIN_PW = 10;
const secret = () => {
  const s = process.env.AUTH_SECRET || '';
  if (s.length < 32) throw new Error('AUTH_SECRET duhet të ketë të paktën 32 karaktere.');
  return new TextEncoder().encode(s);
};

let ready = false;
export async function ensure() {
  if (ready) return;
  const cs = configStatus();
  if (!cs.ok) throw new ConfigError('Konfigurim i paplotë: ' + [...cs.missing, ...cs.invalid].join(', ') + '.');
  secret();
  await sql`CREATE TABLE IF NOT EXISTS users(id serial PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL DEFAULT 'accountant', hash text NOT NULL, pwv int NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS kv(key text PRIMARY KEY, value text NOT NULL, version int NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS files(id text PRIMARY KEY, name text, data text NOT NULL, size int, created_by text, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS audit(id serial PRIMARY KEY, at timestamptz DEFAULT now(), user_email text, action text, detail text)`;
  // Migrime idempotente: tabela të krijuara nga versione të vjetra pa kolonat e reja.
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS pwv int NOT NULL DEFAULT 0`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'accountant'`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now()`;
  await sql`ALTER TABLE kv ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1`;
  await sql`ALTER TABLE kv ADD COLUMN IF NOT EXISTS updated_by text`;
  await sql`ALTER TABLE kv ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`;
  await sql`ALTER TABLE files ADD COLUMN IF NOT EXISTS created_by text`;
  await sql`CREATE TABLE IF NOT EXISTS notifs(id serial PRIMARY KEY, user_id int NOT NULL, text text NOT NULL, read boolean NOT NULL DEFAULT false, at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS chat(id serial PRIMARY KEY, from_name text NOT NULL, to_name text, text text NOT NULL, at timestamptz DEFAULT now())`;
  await sql`ALTER TABLE notifs ADD COLUMN IF NOT EXISTS link text`;
  await sql`ALTER TABLE notifs ADD COLUMN IF NOT EXISTS ukey text`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS notifs_ukey ON notifs(user_id, ukey) WHERE ukey IS NOT NULL`;
  await sql`CREATE TABLE IF NOT EXISTS login_attempts(email text, ip text, at timestamptz DEFAULT now())`;
  await sql`DELETE FROM login_attempts WHERE at < now() - interval '1 day'`;
  const n = await sql`SELECT count(*)::int AS c FROM users`;
  if (n[0].c === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await sql`INSERT INTO users(email, name, role, hash) VALUES(${process.env.ADMIN_EMAIL.toLowerCase().trim()}, 'Administratori', 'admin', ${hash})`;
  }
  ready = true;
}

export const sign = (u) =>
  new SignJWT({ id: u.id, pwv: u.pwv || 0 }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret());

export async function meWhy(req) {
  const m = (req.headers.cookie || '').match(/(?:^|; )sid=([^;]+)/);
  if (!m) return { reason: 'cookie-ja e sesionit nuk mbërriti në server' };
  let payload;
  try { ({ payload } = await jwtVerify(m[1], secret())); } catch (e) { if (e instanceof ConfigError || /AUTH_SECRET/.test(e.message)) throw e; return { reason: 'tokeni i sesionit nuk vlen (' + (e.code || e.name) + ')' }; }
  const r = await sql`SELECT id, email, name, role, pwv FROM users WHERE id = ${payload.id}`;
  if (!r[0]) return { reason: 'përdoruesi i sesionit nuk ekziston në bazë' };
  if ((r[0].pwv || 0) !== (payload.pwv || 0)) return { reason: 'sesion i vjetër (fjalëkalimi ndryshoi)' };
  return { user: r[0] };
}
export const me = async (req) => (await meWhy(req)).user || null;

export const cookie = (v, age) => `sid=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
export const audit = (email, action, detail = '') =>
  sql`INSERT INTO audit(user_email, action, detail) VALUES(${email}, ${action}, ${detail})`;
export const ip = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

// Mbështjellës: mbrojtje CSRF për kërkesat që ndryshojnë të dhëna dhe trajtim i gabimeve pa zbuluar detaje.
export const wrap = (h) => async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'crm') return res.status(403).json({ error: 'Kërkesë e paautorizuar.' });
    await h(req, res);
  } catch (e) {
    console.error('API error:', e);
    if (e instanceof ConfigError) return res.status(500).json({ error: e.message, config: true });
    res.status(500).json({ error: 'Gabim i brendshëm. Provo përsëri ose kontakto administratorin.' });
  }
};
// Njoftim brenda CRM-së; email vetëm nëse janë vendosur RESEND_API_KEY dhe EMAIL_FROM. Dështimi nuk e prish ruajtjen.
export async function notify(items) {
  for (const n of items) {
    const rows = await sql`SELECT id, email FROM users WHERE lower(trim(name)) = lower(trim(${n.name}))`;
    if (!rows.length) { await audit('sistemi', 'notify-skip', 'nuk gjendet përdoruesi: ' + n.name); continue; }
    for (const x of rows) {
      await sql`INSERT INTO notifs(user_id, text, link) VALUES(${x.id}, ${n.text}, ${n.link ? JSON.stringify(n.link) : null})`;
      if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
        try {
          await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [x.email], subject: 'CRM: njoftim i ri', text: n.text + '\n\n' + (process.env.APP_URL || '') }) });
        } catch (e) { console.error('email', e); }
      }
    }
  }
}
export { bcrypt };
