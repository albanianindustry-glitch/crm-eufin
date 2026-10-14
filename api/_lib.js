import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

export const sql = neon(process.env.DATABASE_URL);
const secret = () => {
  const s = process.env.AUTH_SECRET || '';
  if (s.length < 32) throw new Error('AUTH_SECRET mungon ose është më i shkurtër se 32 karaktere');
  return new TextEncoder().encode(s);
};
export const KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX'];
export const SECRET_FIELDS = ['passwordEAlbania', 'passwordEFiling', 'passwordProgramiFiskal', 'passwordCertifikata'];
// ENC-START  (AES-256-GCM; çelësi DATA_KEY ruhet vetëm te variablat e mjedisit, jo në bazë)
const dkey = () => { const k = process.env.DATA_KEY || ''; if (k.length < 32) throw new Error('DATA_KEY mungon (min. 32 karaktere)'); return createHash('sha256').update(k).digest(); };
export function enc(t) {
  if (!t || String(t).startsWith('enc:1:')) return t;
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', dkey(), iv);
  const ct = Buffer.concat([c.update(String(t), 'utf8'), c.final()]);
  return 'enc:1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function dec(t) {
  if (!t || !String(t).startsWith('enc:1:')) return t; // vlerë e vjetër e pa-enkriptuar
  const b = Buffer.from(String(t).slice(6), 'base64'), d = createDecipheriv('aes-256-gcm', dkey(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
}
export function mapSecrets(v, fn) {
  let a; try { a = JSON.parse(v); } catch { return v; }
  a.forEach(c => SECRET_FIELDS.forEach(f => { if (c[f]) c[f] = fn(c[f]); })); // gabimi në fn ngrihet (nuk ruhet kurrë pa enkriptim)
  return JSON.stringify(a);
}
// ENC-END

let ready = false;
export async function ensure() {
  if (ready) return;
  await sql`CREATE TABLE IF NOT EXISTS users(id serial PRIMARY KEY, email text UNIQUE NOT NULL, name text NOT NULL, role text NOT NULL DEFAULT 'accountant', hash text NOT NULL, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS kv(key text PRIMARY KEY, value text NOT NULL, version int NOT NULL DEFAULT 1, updated_by text, updated_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS files(id text PRIMARY KEY, name text, data text NOT NULL, size int, created_by text, created_at timestamptz DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS audit(id serial PRIMARY KEY, at timestamptz DEFAULT now(), user_email text, action text, detail text)`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tv int NOT NULL DEFAULT 0`;
  await sql`CREATE TABLE IF NOT EXISTS attempts(id serial PRIMARY KEY, k text NOT NULL, at timestamptz DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS attempts_k ON attempts(k, at)`;
  const n = await sql`SELECT count(*)::int AS c FROM users`;
  if (n[0].c === 0 && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await sql`INSERT INTO users(email, name, role, hash) VALUES(${process.env.ADMIN_EMAIL.toLowerCase().trim()}, 'Administratori', 'admin', ${hash})`;
  }
  ready = true;
}

export const sign = (u) =>
  new SignJWT({ id: u.id, tv: u.tv || 0 }).setProtectedHeader({ alg: 'HS256' }).setExpirationTime('7d').sign(secret());

export async function me(req) {
  const m = (req.headers.cookie || '').match(/(?:^|; )sid=([^;]+)/);
  if (!m) return null;
  try {
    const { payload } = await jwtVerify(m[1], secret());
    const r = await sql`SELECT id, email, name, role, tv FROM users WHERE id = ${payload.id}`;
    return r[0] && (r[0].tv || 0) === (payload.tv || 0) ? r[0] : null; // fjalëkalimi i ndryshuar anulon seancat e vjetra
  } catch { return null; }
}

export const cookie = (v, age) => `sid=${v}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
export const audit = (email, action, detail = '') =>
  sql`INSERT INTO audit(user_email, action, detail) VALUES(${email}, ${action}, ${detail})`.catch(() => {});

// Fjalëkalimet e klientëve shihen vetëm nga administratori
export function strip(v) {
  try { const a = JSON.parse(v); a.forEach(c => SECRET_FIELDS.forEach(f => { if (f in c) c[f] = ''; })); return JSON.stringify(a); }
  catch { return v; }
}
export function keep(newV, oldV) {
  try {
    const n = JSON.parse(newV), o = JSON.parse(oldV || '[]');
    n.forEach(c => { const p = o.find(x => x.id === c.id); SECRET_FIELDS.forEach(f => { c[f] = p ? (p[f] || '') : ''; }); });
    return JSON.stringify(n);
  } catch { return newV; }
}

// Kontabilisti nuk fshin klientë (kontroll në server, jo vetëm në ndërfaqe)
export function removed(newV, oldV) {
  try {
    const n = new Set(JSON.parse(newV).map(c => c.id));
    return JSON.parse(oldV || '[]').some(c => !n.has(c.id));
  } catch { return true; }
}
