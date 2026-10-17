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
  new Function('window', 'X', 'clients', 'TODAY', 'confirm', 'prompt', 'alert', 'saveData', 'sv', 're', 'xHist', 'shkarkoDokmentin', line('xDelK') + ';' + line('xEdK') + ';' + line('xKPdf'))(win, X, clients, '2026-10-16', () => ans.confirm.shift(), () => ans.prompt.shift(), () => hist.push('alert'), () => {}, () => {}, () => {}, (cid, t) => hist.push(t), (d, n) => hist.push('open:' + n));
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
  let r = run(X, [{ id: 1 }], { confirm: [], prompt: ['2027-06-30', 'B', '250'] }); r.win.xEdK('k1');
  assert.deepEqual([X.k[0].end, X.k[0].lb, X.k[0].val], ['2027-06-30', 'B', '250']); assert.ok(r.hist.some((h) => h.includes('skadimi 2027-01-01 → 2027-06-30')));
  r = run(X, [{ id: 1 }], { confirm: [], prompt: ['30.06.2027'] }); r.win.xEdK('k1'); assert.equal(X.k[0].end, '2027-06-30'); assert.ok(r.hist.includes('alert'));
});
