import { ensure, meWhy, wrap } from './_lib.js';
// Diagnostikim: pas hyrjes tregon nëse sesioni njihet dhe, nëse jo, pse.
export default wrap(async (req, res) => {
  await ensure();
  const w = await meWhy(req);
  res.json(w.user ? { ok: true } : { ok: false, reason: w.reason });
});
