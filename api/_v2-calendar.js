// Kalendari: data si tekst (VVVV-MM-DD) pa varësi nga zona orare e serverit; festat zyrtare të Shqipërisë.
export const pad2 = (n) => String(n).padStart(2, '0');
export const dateOf = (y, month0, d) => new Date(Date.UTC(y, month0, d)).toISOString().slice(0, 10);   // month0 = 0..11 (kalon automatikisht muajin)
export const parse = (s) => new Date(s + 'T00:00:00Z');
export const dayDiff = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
  return dateOf(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()));
}
export const isWeekend = (s) => { const w = parse(s).getUTCDay(); return w === 0 || w === 6; };
export const todayTirane = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Tirane', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
export const MONTHS = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'];

// Festat zyrtare (burimi: Kalendari i festave 2026, Banka e Shqipërisë): data fikse + Pashkët (llogariten) + Bajramet (data lunare;
// shtohen çdo vit te ISLAMIC kur shpallen zyrtarisht). Festa që bie të shtunën/të dielën zhvendoset në ditën e parë të punës pasuese.
export const FIXED = ['01-01', '01-02', '03-14', '03-22', '05-01', '09-05', '11-22', '11-28', '11-29', '12-08', '12-25'];
export const ISLAMIC = { 2026: ['03-20', '05-27'] };
export function easter(y, orthodox) {
  if (!orthodox) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
    return dateOf(y, mo - 1, da);
  }
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7, mo = Math.floor((d + e + 114) / 31), da = ((d + e + 114) % 31) + 1;
  return addDays(dateOf(y, mo - 1, da), 13);
}
const cache = new Map();
export function holidays(y) {
  if (cache.has(y)) return cache.get(y);
  const base = [...FIXED.map((x) => `${y}-${x}`), ...(ISLAMIC[y] || []).map((x) => `${y}-${x}`), easter(y, false), easter(y, true)].sort(), seen = new Set();
  for (const s of base) {
    let d = s;
    if (isWeekend(d)) do { d = addDays(d, 1); } while (isWeekend(d) || seen.has(d) || base.includes(d));
    seen.add(d);
  }
  cache.set(y, seen); return seen;
}
export const isHoliday = (s) => holidays(Number(s.slice(0, 4))).has(s);
// Afati efektiv: kur afati bie ditë pushimi/festë, tërhiqet në ditën e punës më parë (zgjedhje konservative e projektit).
export function effectiveDue(s) { let d = s; while (isWeekend(d) || isHoliday(d)) d = addDays(d, -1); return d; }
