// Motori i detyrimeve: funksione të pastra (pa DB, pa HTTP, pa orë të brendshme): gjithçka merr `today` si parametër.
// Porton rregullat e modulit të vjetër (tasks(), matrica mujore/vjetore, plani i muajit) dhe i bën të provueshme.
import { MONTHS, addDays, addMonths, dateOf, dayDiff, effectiveDue, pad2 } from './_v2-calendar.js';

// [çelësi, emri, dita e afatit (muajin pasardhës), kushti i zbatueshmërisë, shënimi]
export const MT = [
  ['fat', 'Faturat e muajit të marra nga klienti', 6, 'tvsh_n', 'Kërko faturat e blerjeve dhe shitjeve; pa to librat nuk mbyllen.'],
  ['lp', 'Listëpagesa', 20, 'punonjes', 'Deklarim dhe pagesë.'],
  ['f5', 'Financë 5', 20, '', 'Regjistro informacionin fiskal për bilancin.'],
  ['tvsh', 'TVSH', 14, 'tvsh', 'Deklarim dhe pagesë.'],
  ['lib', 'Librat e blerjeve dhe shitjeve', 12, '', 'Regjistro në Financë 5 dhe monitoro subjektet me TVSH.'],
  ['mag', 'Raport malli + KMSH', 14, 'magazine', 'Gjendja e mallit dhe KMSH.'],
  ['qera', 'Tatim qeraje', 20, 'qera', 'Tatimi në burim për kontratat B2C.'],
];
export const OB = [['nipt', 'Merr NIPT dhe ekstraktin e QKB', 0], ['dr', 'Regjistrimi tatimor (DRT / e-Albania)', 7], ['tvsh', 'Regjistro për TVSH nëse aplikohet', 15], ['bank', 'Hap llogarinë bankare', 15],
  ['kasa', 'Kasa fiskale / pajisjet nëse shet me para në dorë', 15], ['cert', 'Certifikata elektronike', 15], ['ealb', 'Hyrja në e-Albania dhe e-Filing', 15], ['pun', 'Regjistro punonjësit nëse ka', 30]];
export const money = (n) => `${Math.round(Number(n) || 0).toLocaleString('de-DE')} Lekë`;

const fx = (c) => c.fx || {};
const isTR = (c) => fx(c).forma === 'Përfaqësues tatimor';
export const activeClients = (clients) => clients.filter((c) => c.statusKlient === 'aktiv' || c.statusKlient === 'pezulluar');
const rents = (c, x) => (x.k || []).filter((k) => String(k.cid) === String(c.id) && k.type === 'qera' && k.st === 'a');
const rentTax = (c, x) => rents(c, x).reduce((s, k) => s + (Number(k.rent) || 0) * Number((x.set || {}).rate || 15) / 100, 0);
const suspended = (c, pr) => !!(fx(c).pezullim && pr > String(fx(c).pezullim).slice(0, 7));
const startDate = (c) => [c.dataKontrate, fx(c).regj].filter(Boolean).sort().pop() || '';
const startMonth = (c) => startDate(c).slice(0, 7);
export function applies(c, f, x) {
  const F = fx(c);
  if (F.lloji === 'individ') return false;
  if (isTR(c)) return f === 'tvsh';
  if (!f) return true;
  if (f === 'tvsh' || f === 'tvsh_n') return c.statusTVSH === 'me_tvsh';
  if (f === 'qera') return !!(F.qera || rents(c, x).length);
  return !!F[f];
}
const divaOn = (c) => { const f = fx(c); return f.lloji === 'individ' && !!(f.dual || (Number(f.inc2) || 0) >= 500 || (Number(f.gross) || 0) >= 1200000); };
const localTax = (c, x) => { const t = Number(c.xhiroBiznes) || 0, b = ((x.set || {}).brk || []).find((r) => t >= Number(r[0]) && (!r[1] || t <= Number(r[1]))); return b && (Number(b[2]) || Number(b[3])) ? (Number(b[2]) || 0) + t * (Number(b[3]) || 0) / 100 : null; };
const turnoverLimits = (x) => { const b = (((x.set || {}).brk) || []).map((r) => Number(r[1])).filter(Boolean); return (b.length ? b : [2000000, 8000000, 14000000]).slice().sort((a, b) => a - b); };
export const monthlyTypes = (x) => [...MT, ...(x.cat || []).filter((c) => c.fr === 'm').map((c) => [c.id, c.name, c.day, c.ap, c.hint || 'Detyrim i shtuar nga ti.'])];
const customOf = (x, id) => (x.cat || []).find((c) => c.id === id);
const isDone = (x, key) => !!(x.done || {})[key];

// Përgjegjësi: i caktuari për llojin e detyrimit, përndryshe përgjegjësi kryesor i klientit.
export const responsibleFor = (c, kind) => { const f = fx(c); return (f.resps && f.resps[kind || '']) || f.resp || ''; };
// Kyçja e TVSH-së: nuk shënohet e kryer pa mbyllur librat e blerjeve dhe shitjeve për periudhën.
export function tvshLocked(key, x) { const m = String(key).match(/^(\d+)tvsh(\d{4}-\d{2})$/); return !!(m && !isDone(x, `${m[1]}lib${m[2]}`) && !isDone(x, key)); }

function monthlyDue(period, day) { return dateOf(Number(period.slice(0, 4)), Number(period.slice(5, 7)), day); }   // afati bie në muajin pasardhës
const periodOf = (today, offset) => { const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1 + offset, d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`; };
const periodLabel = (p) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

export function buildObligations({ clients = [], x = {}, today }) {
  const out = [], Y = Number(today.slice(0, 4)), diff = (d) => dayDiff(d, today), cls = activeClients(clients);
  const push = (c, o) => out.push({ clientId: c ? c.id : null, clientName: c ? c.emriKompanise : '', actions: [{ type: 'done', label: 'U krye' }], ...o });
  const types = monthlyTypes(x);

  for (const c of cls) {
    // --- mujore: periudha aktuale dhe dy të mëparshmet
    for (let o = -2; o <= 0; o += 1) {
      const pr = periodOf(today, o);
      for (const [k, t, d, f, n0] of types) {
        if (!applies(c, f, x) || suspended(c, pr) || pr < startMonth(c)) continue;
        const cu = customOf(x, k); if (cu && cu.from && pr < cu.from) continue;
        const due = monthlyDue(pr, d), key = `${c.id}${k}${pr}`;
        const first = dateOf(Number(pr.slice(0, 4)), Number(pr.slice(5, 7)), 1);
        if (isDone(x, key) || (cu ? today < first : diff(due) > 14) || diff(due) < -60 || (c.dataKontrate && due < c.dataKontrate)) continue;
        const note = k === 'tvsh' && !isDone(x, `${c.id}lib${pr}`) ? 'Së pari mbyll librat e blerjeve dhe shitjeve; pastaj deklaro TVSH-në.'
          : k === 'qera' ? `Paguaj ${money(rentTax(c, x))} tatim në burim (${rents(c, x).map((r) => r.ll || 'qiradhënës').join(', ') || 'shto kontratën e qerasë'}).` : n0;
        push(c, { key, kind: k, category: 'monthly', period: pr, title: `${t} – ${periodLabel(pr)}`, note, due, locked: k === 'tvsh' && !isDone(x, `${c.id}lib${pr}`) });
      }
    }
    // --- vjetore: tatim fitimi, tatim-taksa vendore, DIVA/DVAP
    for (const y of [Y - 1, Y, Y + 1]) {
      const F = fx(c), due31 = `${y}-03-31`;
      const rows = [
        ['fit', `Deklarata vjetore e tatim fitimit (${F.forma || 'zgjidh PF/SHPK/SHA te profili'})`, F.lloji !== 'individ' && !isTR(c),
          F.forma === 'PF' ? 'PF: përgatit deklaratën vjetore të tatim fitimit nga biznesi dhe dorëzoje në e-Filing.' : F.forma ? 'SHPK/SHA: mbyll bilancin, përgatit pasqyrat financiare dhe deklaratën e tatim fitimit; dorëzoje në e-Filing dhe depozito pasqyrat në QKB.' : 'Zgjidh formën juridike te profili fiskal.'],
        ['vend', 'Kontroll tatim-taksa vendore (e-Albania)', !!F.vendore && F.lloji !== 'individ' && !isTR(c),
          `Xhiro: ${money(c.xhiroBiznes)}. Tatimi vendor i vlerësuar: ${localTax(c, x) === null ? 'plotëso normat te Parametrat fiskalë' : money(localTax(c, x))}. Adresat: ${(c.adresat || []).map((a) => a.adresa).join('; ') || c.adresaBiznes || '—'}`],
        ['diva', 'DIVA/DVAP – deklarimi vjetor personal', divaOn(c) && !isTR(c), 'Plotësohen kriteret (dypunësim, ≥500€ ose ≥1.200.000 Lekë bruto).'],
      ];
      for (const [k, t, on, note] of rows) {
        const key = `${c.id}${k}${y}`, due = k === 'fit' ? `${y}-${((x.set || {}).dl || {})[F.forma === 'PF' ? 'PF' : 'SH'] || '03-31'}` : due31;
        if (!on || isDone(x, key) || y - 1 < (Number(startMonth(c).slice(0, 4)) || 0) || diff(due) > 45 || diff(due) < -60 || (c.dataKontrate && due < c.dataKontrate)) continue;
        push(c, { key, kind: k, category: 'annual', period: String(y), title: `${t} – ${y}`, note, due });
      }
    }
    // --- detyrime vjetore të shtuara nga përdoruesi
    for (const cat of (x.cat || []).filter((q) => q.fr === 'y')) for (const y of [Y - 1, Y, Y + 1]) {
      const due = `${y}-${pad2(cat.mo)}-${pad2(cat.day)}`, key = `${c.id}ca${cat.id}${y}`;
      if (!applies(c, cat.ap, x) || isDone(x, key) || diff(due) > 45 || diff(due) < -60) continue;
      push(c, { key, kind: cat.id, category: 'annual', period: String(y), title: `${cat.name} – ${y}`, note: cat.hint || 'Detyrim vjetor i shtuar nga ti.', due });
    }
  }

  // --- xhiroja: afrimi dhe kalimi i kufijve
  for (const c of cls) {
    const t = Number(c.xhiroBiznes) || 0; if (!t || isTR(c)) continue;
    const lm = turnoverLimits(x), pct = Number((x.set || {}).xhPct) || 85, nx = lm.find((l) => l > t), F = fx(c), cross = Number(F.xhCross) || 0;
    if (nx && t >= nx * pct / 100) {
      const due = addDays(F.xhiroAt || '1970-01-01', 3);
      if (diff(due) <= 0) push(c, { key: `${c.id}xh${F.xhiroAt || '0'}`, kind: 'xhiro', category: 'turnover', title: `Xhiroja po i afrohet kufirit ${money(nx)} (${Math.round(t / nx * 100)}%)`,
        note: `Njofto klientin dhe kërko xhiron e fundit (përditësuar: ${F.xhiroAt || 'asnjëherë'}; kërkohet çdo 3 ditë). Pas përditësimit rivlerëso tatim-taksat.${F.xhNotified ? ` Klienti u njoftua më ${F.xhNotified}.` : ''}`,
        due: today, actions: [{ type: 'turnover', label: 'Përditëso xhiron', value: t }, { type: 'notified', label: 'U njoftua klienti' }] });
    }
    if (cross) { const key = `${c.id}xhx${cross}`; if (!isDone(x, key)) push(c, { key, kind: 'xhiro', category: 'turnover', title: `Xhiroja ka kaluar kufirin ${money(cross)}`, note: 'Rivlerëso statusin tatimor dhe tatim-taksat vendore dhe njofto klientin.', due: today, actions: [{ type: 'done', label: 'U rivlerësua' }] }); }
  }

  // --- biznes i pezulluar: listëpagesa e fundit
  for (const c of clients) {
    const p = fx(c).pezullim; if (!p) continue;
    const key = `${c.id}lpfinal`, due = dateOf(Number(String(p).slice(0, 4)), Number(String(p).slice(5, 7)), 20);
    if (!isDone(x, key)) push(c, { key, kind: 'lp', category: 'suspension', title: `Biznes i pezulluar nga ${p} – listëpagesa e fundit`, note: 'Deklaro listëpagesën deri në datën e pezullimit, çregjistro punonjësit dhe mbyll TVSH/Financë 5 deri në atë datë.', due });
  }

  // --- pagesat e studios
  const dnow = Number(today.slice(8, 10)), cm = today.slice(0, 7);
  for (const c of cls) {
    const fee = Number(c.tarifaMujore); if (!fee) continue;
    const key = `${c.id}pay${cm}`;
    if (!(isDone(x, key) || suspended(c, cm) || cm === startMonth(c) || (dnow < 10 && c.statusPagese === 'paguan')))
      push(c, { key, kind: 'pay', category: 'payment', period: cm, title: `Pagesa e studios ${money(fee)} për ${MONTHS[Number(cm.slice(5, 7)) - 1]} nuk është arkëtuar`, note: 'Kontakto klientin; kur paguan, shëno “Pagesa u arkëtua”.', due: `${cm}-10`, actions: [{ type: 'done', label: 'Pagesa u arkëtua' }] });
    const s0 = startDate(c);
    if (s0 && !c.payPrepaid) {
      const k2 = `${c.id}pay${s0.slice(0, 7)}`, sd = addMonths(s0, 1);
      if (!isDone(x, k2) && today >= sd && diff(sd) >= -45)
        push(c, { key: k2, kind: 'pay', category: 'payment', period: s0.slice(0, 7), title: `Pagesa e parë e studios ${money(fee)} (${s0} → ${sd})`, note: 'Cikli i parë nga aktivizimi deri një muaj më pas. Kur paguan, shëno arkëtimin.', due: sd,
          actions: [{ type: 'done', label: 'Pagesa u arkëtua' }, { type: 'prepaid', label: 'U mor paraprakisht' }] });
    }
  }

  // --- skadime: administratori (QKB), certifikata, kontratat; rikujtesa; hapat pas regjistrimit
  for (const c of cls) for (const [f, l] of [['afatiAdministratori', 'Afati i administratorit (QKB)'], ['certifikataElektronike', 'Certifikata elektronike']]) {
    if (c[f] && diff(c[f]) <= 60 && diff(c[f]) >= -30)
      push(c, { key: '', kind: f, category: 'expiry', title: `${l} skadon`, note: 'Njofto klientin dhe rinovo; pastaj vendos datën e re.', due: c[f], actions: [{ type: 'renew', label: 'U rinovua', field: f, suggested: addMonths(c[f], 12) }] });
  }
  for (const k of (x.k || []).filter((q) => q.st === 'a' && diff(q.end) <= 45)) {
    const c = clients.find((q) => String(q.id) === String(k.cid)) || {};
    push(c.id ? c : null, { key: '', kind: 'contract', category: 'contract', title: `${k.type === 'qera' ? 'Kontratë qeraje' : k.type === 'perf' ? 'Kontratë përfaqësimi tatimor' : `Kontratë shërbimi (${k.type})`}${k.lb ? ' – ' + k.lb : ''} mbaron`,
      note: k.type === 'qera' ? 'Pyet klientin: a u rinovua kontrata e qerasë?' : 'Diskuto rinovimin. Nëse jo, shëno “Nuk u rinovua” – klienti ruhet për ndjekje.', due: k.end, clientName: c.emriKompanise || '?',
      actions: [{ type: 'contract-renew', label: 'U rinovua', id: k.id, suggested: addMonths(k.end, 12) }, { type: 'contract-expire', label: 'Nuk u rinovua', id: k.id }] });
  }
  for (const c of clients.filter((q) => q.statusKlient === 'inaktiv' && (x.fu || {})[q.id] && diff(x.fu[q.id]) <= 0))
    push(c, { key: '', kind: 'followup', category: 'followup', title: 'Rikujtesë: a është kthyer klienti? Mund t’i bëhet ofertë e re?', note: 'Kontakto klientin dhe regjistro rezultatin.', due: x.fu[c.id],
      actions: [{ type: 'followup', label: 'I bëra ofertë të re (rikujto pas 1 viti)', option: 1 }, { type: 'followup', label: 'U bë përsëri klient', option: 2 }, { type: 'followup', label: 'Mos pyet më', option: 3 }] });
  for (const c of clients.filter((q) => fx(q).regj && diff(fx(q).regj) > -120)) for (const [s, t, o] of OB) {
    const key = `${c.id}onb${s}`, due = addDays(fx(c).regj, o);
    if (!isDone(x, key) && diff(due) <= 14) push(c, { key, kind: 'onb', category: 'onboarding', title: `Hapi pas regjistrimit: ${t}`, note: `Afat orientues ${o} ditë pas regjistrimit; ndryshoje sipas rastit.`, due });
  }

  // --- zhvendosja e afateve që bien në ditë pushimi/festë; përgjegjësi; urgjenca
  return out.map((a) => {
    const c = a.clientId != null ? clients.find((q) => String(q.id) === String(a.clientId)) : null, original = a.due, due = a.key ? effectiveDue(a.due) : a.due;
    const left = diff(due);
    return { ...a, originalDue: original, due, shifted: due !== original, note: due !== original ? `${a.note} (Afati ${original} bie ditë pushimi – përfundoje më ${due})` : a.note,
      responsible: c ? responsibleFor(c, a.kind) : '', daysLeft: left, late: left < 0 };
  }).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.title.localeCompare(b.title)));
}

// Matrica mujore: klientët (jo individ) × llojet e detyrimeve për një periudhë.
export function monthlyMatrix({ clients = [], x = {}, today, period }) {
  const types = monthlyTypes(x), rows = activeClients(clients).filter((c) => fx(c).lloji !== 'individ').map((c) => ({
    clientId: c.id, clientName: c.emriKompanise, responsible: fx(c).resp || '',
    cells: types.map(([k, , d, f]) => {
      if (!applies(c, f, x) || suspended(c, period)) return { kind: k, applicable: false };
      const key = `${c.id}${k}${period}`, due = effectiveDue(monthlyDue(period, d)), done = isDone(x, key);
      return { kind: k, applicable: true, key, done, due, late: !done && dayDiff(due, today) < 0, locked: k === 'tvsh' && !isDone(x, `${c.id}lib${period}`) && !done, responsible: (fx(c).resps || {})[k] && (fx(c).resps || {})[k] !== (fx(c).resp || '') ? fx(c).resps[k] : '' };
    }),
  }));
  const plan = types.map(([k, t, d, f]) => { const cs = activeClients(clients).filter((c) => applies(c, f, x) && !suspended(c, period)); return { kind: k, label: t, day: d, total: cs.length, done: cs.filter((c) => isDone(x, `${c.id}${k}${period}`)).length }; });
  const cm = today.slice(0, 7), unpaid = activeClients(clients).filter((c) => Number(c.tarifaMujore) && !isDone(x, `${c.id}pay${cm}`) && !suspended(c, cm)).map((c) => ({ clientId: c.id, clientName: c.emriKompanise, amount: Number(c.tarifaMujore) }));
  return { period, label: periodLabel(period), types: types.map(([k, t, d]) => ({ kind: k, label: t, day: d })), rows, plan, unpaid, unpaidMonth: MONTHS[Number(cm.slice(5, 7)) - 1] };
}
export const periodOptions = (today) => Array.from({ length: 12 }, (_, i) => { const p = periodOf(today, -i); return { value: p, label: periodLabel(p) }; });
export const defaultPeriod = (today) => periodOf(today, -1);

export function annualMatrix({ clients = [], x = {}, today }) {
  const m = Number(today.slice(5, 7)) - 1, year = m > 2 ? Number(today.slice(0, 4)) + 1 : Number(today.slice(0, 4));
  const cell = (c, k, on) => (on ? { applicable: true, key: `${c.id}${k}${year}`, done: isDone(x, `${c.id}${k}${year}`) } : { applicable: false });
  return { year, due: `${year}-03-31`, rows: activeClients(clients).map((c) => ({ clientId: c.id, clientName: c.emriKompanise, form: fx(c).lloji === 'individ' ? 'Individ' : fx(c).forma || '—',
    fit: cell(c, 'fit', fx(c).lloji !== 'individ' && !isTR(c)), vend: cell(c, 'vend', !!fx(c).vendore && fx(c).lloji !== 'individ' && !isTR(c)), diva: cell(c, 'diva', divaOn(c) && !isTR(c)) })) };
}
