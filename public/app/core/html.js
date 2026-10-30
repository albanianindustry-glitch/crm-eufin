// Shabllon i sigurt: çdo vlerë e interpoluar kalon nga escape automatikisht (përveç `raw` dhe shabllonëve të tjerë `html`).
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
const render = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(render).join('') : v === false || v == null ? '' : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i += 1) out += render(vals[i]) + strings[i + 1];
  return new Safe(out);
}
export const text = (v) => render(v);
