export const money = (n) => (n == null || n === '' || Number.isNaN(Number(n)) ? '—' : `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(n))} Lekë`);
export const dateOnly = (s) => { if (!s) return '—'; const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(s); };
export const dateTime = (s) => { if (!s) return '—'; const d = new Date(s); if (Number.isNaN(d.getTime())) return dateOnly(s); const p = (n) => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
export function duration(min) {
  const m = Math.round(Number(min)); if (!Number.isFinite(m) || m < 0) return '—'; if (m < 1) return 'nën 1 min'; if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60; if (h < 24) return `${h} orë${r ? ` ${r} min` : ''}`; return `${Math.floor(h / 24)} ditë ${h % 24} orë`;
}
export const today = () => new Date().toISOString().slice(0, 10);
export const daysFrom = (day, base = today()) => Math.round((new Date(day + 'T00:00:00Z') - new Date(base + 'T00:00:00Z')) / 864e5);
export const LABELS = {
  emriKompanise: 'Emri i kompanisë', nipt: 'NIPT', administratori: 'Administratori', nrKontakti: 'Telefoni', emailBiznes: 'Email', adresaBiznes: 'Adresa', tarifaMujore: 'Tarifa mujore', xhiroBiznes: 'Xhiro vjetore',
  dataKontrate: 'Data e kontratës', statusKlient: 'Statusi i klientit', statusPagese: 'Statusi i pagesës', statusTVSH: 'Statusi TVSH', statusTatimFitim: 'Tatim fitimi', shenimet: 'Shënime', fx: 'Profili fiskal / përgjegjësit', ortaket: 'Ortakët',
  certifikataElektronike: 'Certifikata elektronike', afatiAdministratori: 'Afati i administratorit',
  docs: 'Dokumentet', adresat: 'Adresat', 'fx.resp': 'Përgjegjësi kryesor', 'fx.resps': 'Përgjegjësit sipas llojit', 'fx.lloji': 'Lloji (biznes/individ)', 'fx.forma': 'Forma ligjore', 'fx.regj': 'Regjistruar në QKB',
  kontrata: 'Kontrata', lb: 'Emri i kontratës', end: 'Data e mbarimit', rent: 'Qiraja mujore', val: 'Vlera e kontratës', type: 'Lloji i kontratës', st: 'Statusi', doc: 'Dokumenti i kontratës', pendingDoc: 'PDF i ri i kontratës', ll: 'Lloji i qirasë',
};
export const ENUMS = {
  statusKlient: { aktiv: 'Aktiv', inaktiv: 'Inaktiv' }, statusPagese: { paguan: 'Paguan në rregull', vonese: 'Me vonesë', spaguan: 'Nuk paguan' },
  statusTVSH: { me_tvsh: 'Me TVSH', pa_tvsh: 'Pa TVSH' }, statusTatimFitim: { me_tatim: 'Me tatim fitimi', pa_tatim: 'Pa tatim fitimi' },
};
export function fieldValue(k, v) {
  if (v == null || v === '' || v === '—') return '—';
  if (ENUMS[k] && ENUMS[k][v]) return ENUMS[k][v];
  if ((k === 'tarifaMujore' || k === 'xhiroBiznes' || k === 'rent' || k === 'val') && Number.isFinite(Number(v))) return money(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return dateOnly(v);
  return String(v);
}

export const KIND_LABELS = { fat: 'Faturat e muajit', lp: 'Listëpagesa', f5: 'Financë 5', tvsh: 'TVSH', lib: 'Librat e blerjeve dhe shitjeve', mag: 'Raport malli + KMSH', qera: 'Tatim qeraje', fit: 'Tatim fitimi vjetor', vend: 'Tatim-taksa vendore', diva: 'DIVA/DVAP', pay: 'Pagesa e studios', onb: 'Hapat pas regjistrimit', xhiro: 'Xhiroja' };
export const DOC_CATS = { statut: 'Statuti', themelim: 'Akti i themelimit', prokure: 'Prokura', id: 'ID / pasaporta', qkb: 'Ekstrakti i QKB', bo: 'Pronari përfitues (BO)', cert: 'Certifikata elektronike', kontrate: 'Kontratë', prove: 'Provë e punës së kryer' };
// Etiketa e fushave të shpërndara (ortaket.0.dokument, fx.resp) në kërkesat e miratimit
const SUB = { emri: 'emri', perqindja: 'përqindja', shtet: 'shteti', dokument: 'dokumenti', dokumentEmri: 'emri i dokumentit', adresa: 'adresa' };
export function fieldLabel(k) {
  const m = /^(ortaket|adresat)\.(\d+)\.(\w+)$/.exec(k);
  if (m) return `${m[1] === 'ortaket' ? 'Ortaku' : 'Adresa'} ${Number(m[2]) + 1}: ${SUB[m[3]] || m[3]}`;
  return LABELS[k] || k;
}
export function daysLeftChip(date, today = new Date().toISOString().slice(0, 10)) {
  const d = daysFrom(date, today);
  return d < 0 ? { text: `skaduar ${-d} ditë më parë`, kind: 'bad' } : d === 0 ? { text: 'skadon sot', kind: 'warn' } : d <= 30 ? { text: `edhe ${d} ditë`, kind: 'warn' } : { text: `edhe ${d} ditë`, kind: 'ok' };
}
