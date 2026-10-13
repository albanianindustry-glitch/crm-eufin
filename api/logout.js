import { cookie, wrap } from './_lib.js';
export default wrap(async (req, res) => {
  res.setHeader('Set-Cookie', cookie('', 0));
  res.json({ ok: true });
});
