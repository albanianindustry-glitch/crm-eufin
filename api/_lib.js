import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export const sql = neon(process.env.DATABASE_URL);
export const KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX'];
export const ARRAY_KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH'];
export const MIN_PW = 10;
const secret = () => {
  const s = process.env.AUTH_SECRET || '';
  if (s.length < 32) throw new Error('AUTH_SECRET duhet të ketë të paktën 32 karaktere.');
  return new TextEncoder().encode(s);
};

let ready = false;
export async function ensure() {
  if (ready) return;
  secret();
  await sql`CREATE TABLE IF NOT EXISTS users(id serial PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL DEFAULT 'accountant', hash text NOT NULL, pwv int NOT NULL DEFAULT 0, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS kv(key text PRIMARY KEY, value text NOT NULL, version int NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS files(id text PRIMARY KEY, name text, data text NOT NULL, size int, created_by text, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS audit(id serial PRIMARY KEY, at timestamptz DEFAULT now(), user_email text, action text, detail text)`;
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

export async function me(req) {
  const m = (req.headers.cookie || '').match(/(?:^|; )sid=([^;]+)/);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], secret());
    const r = await sql`SELECT id, email, name, role, pwv FROM users WHERE id = ${payload.id}`;
    return r[0] && (r[0].pwv || 0) === (payload.pwv || 0) ? r[0] : null;
  } catch { return null; }
}

export const cookie = (v, age) => `sid=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
export const audit = (email, action, detail = '') =>
  sql`INSERT INTO audit(user_email, action, detail) VALUES(${email}, ${action}, ${detail})`;
export const ip = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

// Mbështjellës: mbrojtje CSRF për kërkesat që ndryshojnë të dhëna dhe trajtim i gabimeve pa zbuluar detaje.
export const wrap = (h) => async (req, res) => {
  try {
    if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'crm') return res.status(403).json({ error: 'Kërkesë e paautorizuar.' });
    await h(req, res);
  } catch (e) {
    console.error('API error:', e);
    res.status(500).json({ error: 'Gabim i brendshëm. Provo përsëri ose kontakto administratorin.' });
  }
};
export { bcrypt };
