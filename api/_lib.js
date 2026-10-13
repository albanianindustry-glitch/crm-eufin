import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

export const sql = neon(process.env.DATABASE_URL);
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || '');
export const KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX'];
export const SECRET_FIELDS = ['passwordEAlbania', 'passwordEFiling', 'passwordProgramiFiskal', 'passwordCertifikata'];

let ready = false;
export async function ensure() {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS users(id serial PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL DEFAULT 'accountant', hash text NOT NULL, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS kv(key text PRIMARY KEY, value text NOT NULL, version int NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS files(id text PRIMARY KEY, name text, data text NOT NULL, size int, created_by text, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS audit(id serial PRIMARY KEY, at timestamptz DEFAULT now(), user_email text, action text, detail text)`;
  const n = await sql`SELECT count(*)::int AS c FROM users`;
  if (n[0].c === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await sql`INSERT INTO users(email, name, role, hash) VALUES(${process.env.ADMIN_EMAIL.toLowerCase().trim()}, 'Administratori', 'admin', ${hash})`;
  }
  ready = true;
}

export const sign = (u) =>
  new SignJWT({ id: u.id }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret());

export async function me(req) {
  const m = (req.headers.cookie || '').match(/(?:^|; )sid=([^;]+)/);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], secret());
    const r = await sql`SELECT id, email, name, role FROM users WHERE id = ${payload.id}`;
    return r[0] || null;
  } catch { return null; }
}

export const cookie = (v, age) => `sid=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
export const audit = (email, action, detail = '') =>
  sql`INSERT INTO audit(user_email, action, detail) VALUES(${email}, ${action}, ${detail})`;

// Fjalëkalimet e klientëve shihen vetëm nga administratori
export function strip(v) {
  try { const a = JSON.parse(v); a.forEach(c => SECRET_FIELDS.forEach(f => { if (f in c) c[f] = ''; })); return JSON.stringify(a); }
  catch { return v; }
}
export function keep(newV, oldV) {
  try {
    const n = JSON.parse(newV), o = JSON.parse(oldV || '[]');
    n.forEach(c => { const p = o.find(x => x.id === c.id); if (p) SECRET_FIELDS.forEach(f => { c[f] = p[f] || ''; }); });
    return JSON.stringify(n);
  } catch { return newV; }
}
