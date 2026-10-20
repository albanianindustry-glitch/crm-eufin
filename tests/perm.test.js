import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { checkX, events } from '../api/_perm.js';
const S = JSON.stringify, laura = { name: 'Laura', role: 'user' }, ana = { name: 'Ana', role: 'admin' };
const task = (x = {}) => ({ id: 't1', title: 'Detyra', by: 'Ana', u: 'Besa', us: ['Besa'], st: 'todo', cm: [], ...x });
const X = (mt, rest = {}) => S({ mt, ...rest });

test('administratori lejohet gjithçka', () => assert.deepEqual(checkX(X([task()]), X([]), ana), []));
test('përdoruesi i zakonshëm nuk fshin as ndryshon statusin e detyrës së kolegut', () => {
  assert.equal(checkX(X([task()]), X([]), laura).length, 1);                       // fshirje
  assert.equal(checkX(X([task()]), X([task({ st: 'done' })]), laura).length, 1);   // "U krye"
  assert.equal(checkX(X([task()]), X([task({ st: 'prog' })]), laura).length, 1);   // "Fillo"
  assert.equal(checkX(X([task()]), X([task({ u: 'Laura', us: ['Laura'] })]), laura).length > 0, true); // ricaktim
});
test('përgjegjësi ndryshon statusin dhe komenton, por nuk modifikon përcaktimin; krijuesi fshin e modifikon', () => {
  const besa = { name: 'Besa', role: 'user' };
  assert.deepEqual(checkX(X([task()]), X([task({ st: 'done', doneBy: 'Besa', mins: 5 })]), besa), []);
  assert.deepEqual(checkX(X([task()]), X([task({ cm: [{ id: 1, by: 'Besa', tx: 'ok' }] })]), besa), []);
  assert.equal(checkX(X([task()]), X([task({ title: 'Tjetër' })]), besa).length, 1);
  assert.equal(checkX(X([task()]), X([]), besa).length, 1);
  assert.deepEqual(checkX(X([task({ by: 'Laura' })]), X([]), laura), []);                       // krijuesi fshin
  assert.deepEqual(checkX(X([task({ by: 'Laura' })]), X([task({ by: 'Laura', title: 'E re' })]), laura), []);
});
test('detyra e re mund ta krijojë kushdo', () => assert.deepEqual(checkX(X([]), X([task({ by: 'Laura' })]), laura), []));
test('shërbimet: vetëm përgjegjësi ose krijuesi i ndryshon; vetëm krijuesi e fshin', () => {
  const sv = { id: 's1', type: 'PASH', u: 'Besa', by: 'Ana', st: 'todo' }, mk = (a) => S({ mt: [], sv: a });
  assert.equal(checkX(mk([sv]), mk([{ ...sv, st: 'done' }]), laura).length, 1);
  assert.deepEqual(checkX(mk([sv]), mk([{ ...sv, st: 'done' }]), { name: 'Besa', role: 'user' }), []);
  assert.equal(checkX(mk([sv]), mk([]), { name: 'Besa', role: 'user' }).length, 1);
});
test('historiku vetëm shtohet: s’ndryshohet e s’fshihet nga përdoruesi i zakonshëm', () => {
  const h = { id: 'h1', t: 'x', by: 'Ana' }, mk = (a) => S({ mt: [], hist: a });
  assert.deepEqual(checkX(mk([h]), mk([h, { id: 'h2', t: 'y', by: 'Laura' }]), laura), []);
  assert.equal(checkX(mk([h]), mk([]), laura).length, 1);
  assert.equal(checkX(mk([h]), mk([{ ...h, t: 'ndryshuar' }]), laura).length, 1);
});
test('fshirjet regjistrohen në auditim (detyrë, shërbim, kontratë)', () => {
  const old = S({ mt: [task()], sv: [{ id: 's', type: 'PASH' }], k: [{ id: 'k', type: 'qera', lb: 'Zyra' }] });
  assert.deepEqual(events(old, S({ mt: [], sv: [], k: [] })).map((e) => e.action).sort(), ['contract-delete', 'service-delete', 'task-delete']);
  assert.equal(events(old, old).length, 0);
});

// ---- kontratat: lidhja me PDF, modifikimi dhe fshirja ----
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const line = (n) => html.match(new RegExp('window\\.' + n + '=[^\\n]*'))[0];
function run(X, clients, ans) {
  const hist = [], win = {}; let i = 0;
  new Function('window', 'X', 'clients', 'TODAY', 'confirm', 'prompt', 'alert', 'saveData', 'sv', 're', 'xHist', 'shkarkoDokmentin', 'ADMIN', line('xDelK') + ';' + line('xEdK') + ';' + line('xKPdf'))(win, X, clients, '2026-10-16', () => ans.confirm.shift(), () => ans.prompt.shift(), () => hist.push('alert'), () => {}, () => {}, () => {}, (cid, t) => hist.push(t), (d, n) => hist.push('open:' + n), ans.admin !== false);
  return { win, hist };
}
test('kontrata: PDF-ja hapet nga kontrata; fshirja e arkivon PDF-në dhe lë gjurmë', () => {
  const mkc = () => [{ id: 1, docs: [{ id: 'd1', kid: 'k1', cat: 'kontrate', name: 'Kontratë – Zyra', data: 'x' }] }];
  let X = { k: [{ id: 'k1', doc: 'd1', cid: 1, type: 'qera', lb: 'Zyra', end: '2027-01-01', st: 'a' }] }, c = mkc();
  let r = run(X, c, { confirm: [true, true], prompt: [] }); r.win.xKPdf('k1'); assert.ok(r.hist.includes('open:Kontratë – Zyra'));
  r.win.xDelK('k1'); assert.equal(X.k.length, 0); assert.equal(c[0].docs[0].archived, true); assert.equal(c[0].docs[0].kdel, '2026-10-16');
  assert.ok(r.hist.some((h) => h.includes('Kontratë e fshirë') && h.includes('arkivuar')));
  X = { k: [{ id: 'k1', doc: 'd1', cid: 1, type: 'qera', lb: 'Zyra', end: '2027-01-01', st: 'a' }] }; c = mkc();
  r = run(X, c, { confirm: [true, false], prompt: [] }); r.win.xDelK('k1'); assert.equal(c[0].docs.length, 0); assert.equal(X.k.length, 0);
});
test('kontrata: modifikimi ndryshon afatin/vlerën dhe regjistron historik; data e keqe refuzohet', () => {
  const X = { k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'A', end: '2027-01-01', st: 'a', val: '100' }] };
  let r = run(X, [{ id: 1 }], { confirm: [false], prompt: ['2027-06-30', 'B', '250'] }); r.win.xEdK('k1');
  assert.deepEqual([X.k[0].end, X.k[0].lb, X.k[0].val], ['2027-06-30', 'B', '250']); assert.ok(r.hist.some((h) => h.includes('skadimi 2027-01-01 → 2027-06-30')));
  r = run(X, [{ id: 1 }], { confirm: [false], prompt: ['30.06.2027'] }); r.win.xEdK('k1'); assert.equal(X.k[0].end, '2027-06-30'); assert.ok(r.hist.includes('alert'));
});

import { divertClients, divertContracts, checkAssign, dupNipt, clientLines } from '../api/_perm.js';
test('kërkesë për miratim: klienti ekzistues nuk ndryshon, i riu lejohet; fjalëkalimet nuk hyjnë në kërkesë', () => {
  const cur = S([{ id: 1, emriKompanise: 'ABE', tarifaMujore: '100', passwordEFiling: '' }]);
  const nw = S([{ id: 1, emriKompanise: 'ABE', tarifaMujore: '999', passwordEFiling: 'HACK', fx: { resp: 'Laura' } }, { id: 2, emriKompanise: 'E re' }]);
  const d = divertClients(cur, nw, laura), out = JSON.parse(d.value);
  assert.equal(out.length, 2); assert.equal(out[0].tarifaMujore, '100'); assert.equal(out[0].fx, undefined); assert.equal(out[1].emriKompanise, 'E re');
  assert.equal(d.requests.length, 1); assert.deepEqual(d.requests[0].changes.map((c) => c.k).sort(), ['fx', 'tarifaMujore']); assert.equal(d.requests[0].patch.tarifaMujore, '999'); assert.ok(!('passwordEFiling' in d.requests[0].patch));
  assert.equal(divertClients(cur, cur, laura).requests.length, 0);
});
test('kërkesë për miratim: kontrata ekzistuese (fshirje/modifikim) kthehet, e re lejohet', () => {
  const k1 = { id: 'a', cid: 1, type: 'qera', lb: 'Zyra', end: '2027-01-01' }, k2 = { id: 'b', cid: 1, type: 'mujor', lb: '', end: '2027-01-01' };
  const cur = S({ k: [k1, k2], mt: [] }), nw = S({ k: [{ ...k1, end: '2028-01-01', pendingDoc: { name: 'x.pdf', data: 'u' } }, { id: 'n', cid: 1, type: 'perf', end: 'x' }], mt: [{ id: 't' }] });
  const d = divertContracts(cur, nw), out = JSON.parse(d.value);
  assert.deepEqual(out.k.map((k) => k.id).sort(), ['a', 'b', 'n']); assert.equal(out.k.find((k) => k.id === 'a').end, '2027-01-01'); assert.equal(out.mt.length, 1);
  assert.deepEqual(d.requests.map((r) => r.op).sort(), ['del', 'edit']); assert.ok(d.requests.find((r) => r.op === 'edit').patch.pendingDoc);
});
test('caktimi: detyra me klient vetëm te përgjegjësi i klientit ose administratori; pa klient lirisht', () => {
  const cs = S([{ id: 1, emriKompanise: 'ABE', fx: { resp: 'Besa', resps: { fat: 'Gent' } } }]), mt = (x) => S({ mt: [{ id: 't', title: 'D', cid: 1, ...x }] });
  assert.deepEqual(checkAssign('', mt({ u: 'Besa', us: ['Besa'] }), cs, ['Ana']), []);
  assert.deepEqual(checkAssign('', mt({ u: 'Gent', us: ['Gent'] }), cs, ['Ana']), []);          // përgjegjës për një lloj detyrimi
  assert.deepEqual(checkAssign('', mt({ u: 'Ana', us: ['Ana'] }), cs, ['Ana']), []);            // administrator
  assert.equal(checkAssign('', mt({ u: 'Laura', us: ['Besa', 'Laura'] }), cs, ['Ana']).length, 1);
  assert.deepEqual(checkAssign('', S({ mt: [{ id: 't', title: 'D', cid: '', u: 'Laura', us: ['Laura'] }] }), cs, ['Ana']), []);
  const old = mt({ u: 'Laura', us: ['Laura'], st: 'todo' });                                    // e vjetër e pandryshuar: mos e prek
  assert.deepEqual(checkAssign(old, mt({ u: 'Laura', us: ['Laura'], st: 'prog' }), cs, ['Ana']), []);
});

test('D-01: NIPT i dyfishtë refuzohet; dublikatet e vjetra nuk bllokojnë; hapësirat dhe shkronjat e vogla nuk e anashkalojnë', () => {
  const one = S([{ id: 1, nipt: 'L123', emriKompanise: 'ABE' }]);
  assert.ok(dupNipt(one, S([{ id: 1, nipt: 'L123', emriKompanise: 'ABE' }, { id: 2, nipt: ' l123 ', emriKompanise: 'Tjetër' }])).includes('Ekziston tashmë'));
  assert.equal(dupNipt(one, S([{ id: 1, nipt: 'L123' }, { id: 2, nipt: 'L999' }, { id: 3, nipt: '' }, { id: 4, nipt: '' }])), '');
  const legacy = S([{ id: 1, nipt: 'X1' }, { id: 2, nipt: 'X1' }]);
  assert.equal(dupNipt(legacy, S([{ id: 1, nipt: 'X1', a: 1 }, { id: 2, nipt: 'X1' }])), '');
  assert.ok(dupNipt(one, S([{ id: 1, nipt: 'L999' }, { id: 2, nipt: 'L999' }])).includes('L999'));
});
test('D-03: rreshtat e auditimit tregojnë fushën, vlerën e vjetër dhe të re; pa fjalëkalime', () => {
  const o = S([{ id: 1, emriKompanise: 'ABE', nrKontakti: '111', passwordEFiling: 'a', docs: [] }]);
  const n = S([{ id: 1, emriKompanise: 'ABE', nrKontakti: '222', passwordEFiling: 'b', docs: [{ x: 1 }] }, { id: 2, emriKompanise: 'E re', nipt: 'L5' }]);
  const l = clientLines(o, n);
  assert.deepEqual(l, ['ABE: numri i kontaktit 111 → 222', 'ABE: docs ndryshuar → ndryshuar', 'Klient i ri: E re (L5)']);
  assert.ok(!l.join('').includes('password'));
});
