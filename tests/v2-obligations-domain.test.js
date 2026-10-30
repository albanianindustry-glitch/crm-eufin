import test from 'node:test';
import assert from 'node:assert/strict';
import { buildObligations, monthlyMatrix, annualMatrix, tvshLocked, applies, responsibleFor, periodOptions, defaultPeriod } from '../api/_v2-obligations-domain.js';
import { holidays, effectiveDue, easter, addMonths, todayTirane } from '../api/_v2-calendar.js';

const TODAY = '2026-10-20';   // e martë
const client = (extra = {}) => ({ id: 1, emriKompanise: 'ABE', nipt: 'L11111111A', statusKlient: 'aktiv', statusTVSH: 'me_tvsh', tarifaMujore: '0', statusPagese: 'paguan', dataKontrate: '2025-01-10', fx: { lloji: 'biznes', forma: 'SHPK', punonjes: true, regj: '2025-01-10', resp: 'Ana' }, ...extra });
const run = (clients, x = {}, today = TODAY) => buildObligations({ clients, x: { done: {}, k: [], cat: [], set: {}, fu: {}, ...x }, today });
const find = (list, key) => list.find((o) => o.key === key);

test('kalendari: festat 2026 përputhen me ditët e mbyllura të Bankës së Shqipërisë; Pashkët; afati efektiv', () => {
  const h = [...holidays(2026)].sort();
  for (const d of ['2026-03-16', '2026-03-20', '2026-03-23', '2026-04-06', '2026-04-13', '2026-05-27', '2026-09-07', '2026-11-23', '2026-11-30', '2026-12-01']) assert.ok(h.includes(d), d);
  assert.equal(easter(2026, false), '2026-04-05'); assert.equal(easter(2026, true), '2026-04-12');
  assert.equal(effectiveDue('2026-03-14'), '2026-03-13'); assert.equal(effectiveDue('2026-10-14'), '2026-10-14'); assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.match(todayTirane(new Date('2026-10-20T22:30:00Z')), /^2026-10-2[01]$/);
});

test('mujore: dritarja (14 ditë para afatit, 60 pas), periudha aktuale dhe dy të mëparshmet', () => {
  const o = run([client()]);
  assert.ok(find(o, '1tvsh2026-09')); assert.ok(find(o, '1tvsh2026-08')); assert.ok(!find(o, '1tvsh2026-10'), 'afati 14 nëntor është larg (>14 ditë)');
  assert.equal(find(o, '1tvsh2026-09').due, '2026-10-14'); assert.equal(find(o, '1lp2026-09').due, '2026-10-20');
  assert.ok(!find(o, '1mag2026-09'), 'raporti i mallit zbatohet vetëm me magazinë'); assert.ok(!find(o, '1qera2026-09'));
  const nov = run([client()], {}, '2026-11-01');
  const t = find(nov, '1tvsh2026-10'); assert.ok(t, '13 ditë para afatit shfaqet'); assert.equal(t.originalDue, '2026-11-14'); assert.equal(t.due, '2026-11-13'); assert.ok(t.shifted); assert.match(t.note, /bie ditë pushimi/);
});

test('TVSH: kyçet derisa të mbyllen librat; shënimi ndryshon; e kryer del nga lista', () => {
  let x = { done: {} }; let o = run([client()], x);
  assert.equal(find(o, '1tvsh2026-09').locked, true); assert.match(find(o, '1tvsh2026-09').note, /Së pari mbyll librat/);
  assert.equal(tvshLocked('1tvsh2026-09', x), true); assert.equal(tvshLocked('1fat2026-09', x), false);
  x = { done: { '1lib2026-09': { by: 'Ana' } } }; o = run([client()], x);
  assert.equal(find(o, '1tvsh2026-09').locked, false); assert.equal(tvshLocked('1tvsh2026-09', x), false); assert.ok(!find(o, '1lib2026-09'));
  x.done['1tvsh2026-09'] = 1; assert.ok(!find(run([client()], x), '1tvsh2026-09'));
});

test('zbatueshmëria: individi s\'ka detyrime mujore; përfaqësuesi tatimor vetëm TVSH; pa TVSH s\'ka TVSH/fatura', () => {
  assert.equal(run([client({ fx: { lloji: 'individ' } })]).filter((o) => o.category === 'monthly').length, 0);
  const tr = run([client({ fx: { lloji: 'biznes', forma: 'Përfaqësues tatimor' } })]).filter((o) => o.category === 'monthly');
  assert.ok(tr.length && tr.every((o) => o.kind === 'tvsh'));
  const noVat = run([client({ statusTVSH: 'pa_tvsh' })]).filter((o) => o.category === 'monthly').map((o) => o.kind);
  assert.ok(!noVat.includes('tvsh') && !noVat.includes('fat') && noVat.includes('lib'));
  assert.equal(applies(client({ fx: { lloji: 'biznes', qera: true } }), 'qera', {}), true);
});

test('pezullimi: nuk ka detyrime pas muajit të pezullimit; listëpagesa e fundit shtohet', () => {
  const o = run([client({ fx: { lloji: 'biznes', punonjes: true, pezullim: '2026-08-15', resp: 'Ana', regj: '2025-01-10' } })]);
  assert.ok(find(o, '1tvsh2026-08')); assert.ok(!find(o, '1tvsh2026-09'));
  const f = find(o, '1lpfinal'); assert.ok(f); assert.equal(f.originalDue, '2026-09-20'); assert.equal(f.due, '2026-09-18', '20 shtatori është e diel: tërhiqet në të premten'); assert.equal(f.category, 'suspension');
});

test('klient i ri: asnjë detyrim para muajit të aktivizimit dhe para datës së kontratës', () => {
  const o = run([client({ dataKontrate: '2026-09-20', fx: { lloji: 'biznes', forma: 'SHPK', punonjes: true, regj: '2026-09-20', resp: 'Ana' } })]);
  assert.ok(!o.some((x) => x.period === '2026-08')); assert.ok(find(o, '1lp2026-09'));
  assert.ok(!find(run([client({ dataKontrate: '2026-10-15' })]), '1tvsh2026-09'), 'afati 14.10 është para datës së kontratës');
});

test('vjetore: tatim fitimi 31 mars (dritarja 45 ditë), afati i personalizuar, vendore, DIVA', () => {
  const feb = run([client({ fx: { lloji: 'biznes', forma: 'SHPK', vendore: true, resp: 'Ana', regj: '2025-01-10' } })], {}, '2026-02-20');
  assert.ok(find(feb, '1fit2026')); assert.equal(find(feb, '1fit2026').due, '2026-03-31'); assert.ok(find(feb, '1vend2026'));
  assert.ok(!find(run([client()], { set: { dl: { SH: '05-31' } } }, '2026-02-20'), '1fit2026'), 'afati 31 maj është larg');
  assert.equal(find(run([client()], { set: { dl: { SH: '04-10' } } }, '2026-03-01'), '1fit2026').due, '2026-04-10');
  const diva = run([client({ fx: { lloji: 'individ', dual: true, regj: '2025-01-10', resp: 'Ana' } })], {}, '2026-02-20');
  assert.ok(find(diva, '1diva2026')); assert.ok(!find(diva, '1fit2026'));
});

test('kategoritë e shtuara nga përdoruesi: mujore (pas mbarimit të periudhës, nga muaji X) dhe vjetore', () => {
  const x = { cat: [{ id: 'x1', name: 'Raport i veçantë', fr: 'm', day: 10, ap: '', from: '2026-09' }, { id: 'y1', name: 'Raport vjetor', fr: 'y', mo: 11, day: 15, ap: '' }] };
  const o = run([client()], x);
  assert.ok(find(o, '1x12026-09')); assert.ok(!find(o, '1x12026-10'), 'periudha ende s\'ka mbaruar'); assert.ok(!find(o, '1x12026-08'), 'para muajit të fillimit');
  const y = find(o, '1cay12026'); assert.ok(y); assert.equal(y.due, '2026-11-13'); assert.equal(y.category, 'annual');
});

test('xhiroja: afrim i kufirit (85%), kërkohet çdo 3 ditë, kalimi i kufirit kërkon rivlerësim', () => {
  let o = run([client({ xhiroBiznes: '1700000' })]); const near = o.find((q) => q.kind === 'xhiro');
  assert.ok(near); assert.match(near.title, /2\.000\.000 Lekë \(85%\)/); assert.deepEqual(near.actions.map((a) => a.type), ['turnover', 'notified']);
  assert.ok(!run([client({ xhiroBiznes: '1700000', fx: { lloji: 'biznes', xhiroAt: TODAY, resp: 'Ana', regj: '2025-01-10' } })]).some((q) => q.kind === 'xhiro'));
  assert.ok(!run([client({ xhiroBiznes: '1000000' })]).some((q) => q.kind === 'xhiro'));
  o = run([client({ xhiroBiznes: '2500000', fx: { lloji: 'biznes', xhCross: 2000000, xhiroAt: TODAY, resp: 'Ana', regj: '2025-01-10' } })]);
  assert.ok(find(o, '1xhx2000000')); assert.ok(!find(run([client({ xhiroBiznes: '2500000', fx: { lloji: 'biznes', xhCross: 2000000, xhiroAt: TODAY, resp: 'Ana', regj: '2025-01-10' } })], { done: { '1xhx2000000': 1 } }), '1xhx2000000'));
});

test('pagesat e studios: nga data 10 e muajit; pagesa e parë pas një muaji; paraprakisht', () => {
  const c = client({ tarifaMujore: '5000' });
  assert.equal(find(run([c]), '1pay2026-10').originalDue, '2026-10-10'); assert.equal(find(run([c]), '1pay2026-10').due, '2026-10-09', '10 tetori është e shtunë');
  assert.ok(!find(run([c], {}, '2026-10-05'), '1pay2026-10'), 'para datës 10 dhe me status "paguan"');
  assert.ok(find(run([client({ tarifaMujore: '5000', statusPagese: 'vonese' })], {}, '2026-10-05'), '1pay2026-10'));
  const fresh = client({ tarifaMujore: '5000', dataKontrate: '2026-09-20', fx: { lloji: 'biznes', regj: '2026-09-20', resp: 'Ana' } });
  const first = find(run([fresh]), '1pay2026-09'); assert.ok(first); assert.equal(first.due, '2026-10-20'); assert.deepEqual(first.actions.map((a) => a.type), ['done', 'prepaid']);
  assert.ok(!find(run([{ ...fresh, payPrepaid: true }]), '1pay2026-09'));
  assert.ok(!find(run([fresh], {}, '2026-09-25'), '1pay2026-09'), 'muaji i aktivizimit nuk ka pagesë mujore (vetëm pagesa e parë, më 20 tetor)');
});

test('skadimet dhe rikujtesat: administratori/certifikata (60 ditë para, 30 pas), kontratat (45), ndjekja e klientit joaktiv', () => {
  const o = run([client({ afatiAdministratori: '2026-11-30', certifikataElektronike: '2026-10-01' }), client({ id: 2, emriKompanise: 'Zeta', nipt: 'L22222222B', statusKlient: 'inaktiv' }), client({ id: 3, emriKompanise: 'Vjetër', nipt: 'L33333333C', afatiAdministratori: '2027-03-01' })],
    { k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'Kontrata', end: '2026-11-01', st: 'a' }, { id: 'k2', cid: 1, type: 'qera', end: '2027-06-01', st: 'a' }], fu: { 2: '2026-10-01' } });
  assert.equal(o.filter((q) => q.category === 'expiry').length, 2); assert.ok(o.some((q) => q.category === 'contract' && q.actions[0].suggested === '2027-11-01'));
  assert.equal(o.filter((q) => q.category === 'contract').length, 1); assert.ok(o.some((q) => q.category === 'followup' && q.clientId === 2 && q.actions.length === 3));
});

test('hapat pas regjistrimit: vetëm ata brenda 14 ditëve; përgjegjësi sipas llojit dhe renditja sipas afatit', () => {
  const o = run([client({ fx: { lloji: 'biznes', regj: '2026-10-15', resp: 'Ana', resps: { tvsh: 'Beni' }, punonjes: true }, dataKontrate: '2026-10-15' })], { done: { '1onbdr': 1 } });
  const onb = o.filter((q) => q.category === 'onboarding'); assert.equal(onb.length, 6); assert.ok(!onb.some((q) => q.kind === 'onb' && q.key.endsWith('pun')));
  assert.equal(responsibleFor(client({ fx: { resp: 'Ana', resps: { tvsh: 'Beni' } } }), 'tvsh'), 'Beni'); assert.equal(responsibleFor(client({ fx: { resp: 'Ana', resps: { tvsh: 'Beni' } } }), 'lp'), 'Ana');
  const sorted = run([client({ fx: { lloji: 'biznes', forma: 'SHPK', punonjes: true, resp: 'Ana', resps: { tvsh: 'Beni' }, regj: '2025-01-10' } })]);
  assert.equal(find(sorted, '1tvsh2026-09').responsible, 'Beni'); assert.equal(find(sorted, '1lp2026-09').responsible, 'Ana');
  assert.deepEqual(sorted.map((q) => q.due), [...sorted.map((q) => q.due)].sort());
});

test('matrica mujore: qeliza (e kryer, me vonesë, e kyçur, jo e zbatueshme), plani dhe pagesat e pa arkëtuara', () => {
  const c1 = client({ tarifaMujore: '100' }), c2 = client({ id: 2, emriKompanise: 'Individ', nipt: 'K22222222B', fx: { lloji: 'individ' } }), c3 = client({ id: 3, emriKompanise: 'Pa TVSH', nipt: 'L33333333C', statusTVSH: 'pa_tvsh' });
  const m = monthlyMatrix({ clients: [c1, c2, c3], x: { done: { '1lib2026-09': 1, '3lib2026-09': 1, '3tvsh2026-09': 1 } }, today: TODAY, period: '2026-09' });
  assert.equal(m.rows.length, 2, 'individi nuk hyn në matricë'); const r1 = m.rows[0], idx = (k) => m.types.findIndex((t) => t.kind === k);
  assert.equal(r1.cells[idx('lib')].done, true); assert.equal(r1.cells[idx('tvsh')].late, true); assert.equal(r1.cells[idx('tvsh')].locked, false); assert.equal(r1.cells[idx('mag')].applicable, false);
  const open = monthlyMatrix({ clients: [c1], x: { done: {} }, today: TODAY, period: '2026-09' }); assert.equal(open.rows[0].cells[idx('tvsh')].locked, true);
  assert.deepEqual(m.plan.find((p) => p.kind === 'lib'), { kind: 'lib', label: 'Librat e blerjeve dhe shitjeve', day: 12, total: 2, done: 2 });
  assert.equal(m.unpaid.length, 1); assert.equal(m.unpaid[0].amount, 100); assert.equal(defaultPeriod(TODAY), '2026-09'); assert.equal(periodOptions(TODAY).length, 12); assert.equal(periodOptions(TODAY)[0].value, '2026-10');
});

test('matrica vjetore: viti i afatit (pas marsit = viti i ardhshëm) dhe zbatueshmëria', () => {
  const a = annualMatrix({ clients: [client({ fx: { lloji: 'biznes', forma: 'SHPK', vendore: true, resp: 'Ana' } })], x: { done: { '1fit2027': 1 } }, today: TODAY });
  assert.equal(a.year, 2027); assert.equal(a.rows[0].fit.done, true); assert.equal(a.rows[0].vend.applicable, true); assert.equal(a.rows[0].diva.applicable, false);
  assert.equal(annualMatrix({ clients: [client()], x: {}, today: '2026-02-01' }).year, 2026);
});
