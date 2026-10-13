import { ensure, meWhy, wrap } from './_lib.js';
// Diagnostikim: pas hyrjes tregon nëse sesioni njihet dhe, nëse jo, pse (vetëm mesazhi i gabimit, pa sekrete).
export default wrap(async (req, res) => {
  try {
    await ensure();
    const w = await meWhy(req);
    res.json(w.user ? { ok: true } : { ok: false, reason: w.reason });
  } catch (e) {
    console.error('whoami', e);
    res.json({ ok: false, reason: 'gabim në server: ' + String(e.message || e).slice(0, 200) });
  }
});
