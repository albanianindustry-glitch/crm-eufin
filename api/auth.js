import { sql, ensure, me, meWhy, sign, cookie, audit, wrap, ip, bcrypt, MIN_PW } from './_lib.js';

// Bashkon login, logout, whoami dhe password në një funksion të vetëm
// (plani Hobby i Vercel lejon maksimumi 12 funksione). URL-të e vjetra
// /api/login, /api/logout, /api/whoami, /api/password ruhen me rewrites te vercel.json.

async function login(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const email = String((req.body || {}).email || '').toLowerCase().trim();
  const password = String((req.body || {}).password || '');
  const addr = ip(req);
  const t = await sql`SELECT count(*)::int AS c FROM login_attempts WHERE at > now() - interval '15 minutes' AND (email = ${email} OR ip = ${addr})`;
  if (t[0].c >= 8) return res.status(429).json({ error: 'Shumë përpjekje. Provo përsëri pas 15 minutash.' });
  const r = await sql`SELECT * FROM users WHERE email = ${email}`;
  const u = r[0];
  if (!u || !(await bcrypt.compare(password, u.hash))) {
    await sql`INSERT INTO login_attempts(email, ip) VALUES(${email}, ${addr})`;
    await new Promise((s) => setTimeout(s, 600));
    return res.status(401).json({ error: 'Email ose fjalëkalim i gabuar.' });
  }
  await sql`DELETE FROM login_attempts WHERE email = ${email}`;
  res.setHeader('Set-Cookie', cookie(await sign(u), 604800));
  await audit(u.email, 'login', addr);
  res.json({ ok: true });
}

async function logout(req, res) {
  res.setHeader('Set-Cookie', cookie('', 0));
  res.json({ ok: true });
}

// Diagnostikim: pas hyrjes tregon nëse sesioni njihet dhe, nëse jo, pse (pa sekrete).
async function whoami(req, res) {
  try {
    await ensure();
    const w = await meWhy(req);
    res.json(w.user ? { ok: true } : { ok: false, reason: w.reason });
  } catch (e) {
    console.error('whoami', e);
    res.json({ ok: false, reason: 'gabim në server: ' + String(e.message || e).slice(0, 200) });
  }
}

// Çdo përdorues e ndryshon vetë fjalëkalimin; sesionet e tjera mbyllen, ky vazhdon.
async function password(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  const { current = '', password: next = '' } = req.body || {};
  const row = (await sql`SELECT hash FROM users WHERE id = ${u.id}`)[0];
  if (!(await bcrypt.compare(String(current), row.hash))) return res.status(400).json({ error: 'Fjalëkalimi aktual është i gabuar.' });
  if (String(next).length < MIN_PW) return res.status(400).json({ error: `Fjalëkalimi i ri duhet të ketë min. ${MIN_PW} karaktere.` });
  const r = await sql`UPDATE users SET hash = ${await bcrypt.hash(String(next), 10)}, pwv = pwv + 1 WHERE id = ${u.id} RETURNING id, pwv`;
  res.setHeader('Set-Cookie', cookie(await sign(r[0]), 604800));
  await audit(u.email, 'password-self');
  res.json({ ok: true });
}

const actions = { login, logout, whoami, password };

export default wrap(async (req, res) => {
  const a = String((req.query || {}).a || '');
  const fn = Object.prototype.hasOwnProperty.call(actions, a) ? actions[a] : null;
  if (!fn) return res.status(404).json({ error: 'Veprim i panjohur.' });
  return fn(req, res);
});
