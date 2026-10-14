import { cookie } from './_lib.js';
export default function handler(req, res) {
  res.setHeader('Set-Cookie', cookie('', 0));
  res.json({ ok: true });
}
