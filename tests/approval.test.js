import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { diffNotifs } from '../api/_notify.js';
const tasks = fs.readFileSync(new URL('../public/tasks.js', import.meta.url), 'utf8');
const src = tasks.slice(tasks.indexOf('/* APPROVAL-START'), tasks.indexOf('/* APPROVAL-END'));
const who = (t) => (t.us && t.us.length ? t.us : t.u ? [t.u] : []);
function as(me, X, isAdmin = false) {
  const calls = [], win = { xMt: (id, st) => { const t = X.mt.find((x) => x.id === id); t.st = st; if (st === 'done') { t.doneBy = me; calls.push('orig-done'); } else calls.push('orig-' + st); }, xToast: () => calls.push('toast') };
  win.CRM_ME = { name: me, role: isAdmin ? 'admin' : 'user' };
  new Function('window', 'X', 'ME', 'who', 'isAdmin', 'A', 'draw', 'badge', 'E', 'uid', 'prompt', 'alert', src)(win, X, { name: me }, who, isAdmin, { sv() { calls.push('sv'); } }, () => {}, () => {}, (s) => s, () => 'z1', () => 'mungon PDF', () => calls.push('alert'));
  return { win, calls };
}
const T = (extra = {}) => ({ mt: [{ id: 't', title: 'Detyra', rev: true, us: ['Ana', 'Besa'], u: 'Ana', st: 'todo', ...extra }] });

test('detyrë me dy përgjegjës: "U krye" nuk e mbyll, pret aprovimin e tjetrit; vetëm tjetri e mbyll', () => {
  const X = T(), ana = as('Ana', X), besa = as('Besa', X);
  ana.win.xMt('t', 'done');
  assert.equal(X.mt[0].st, 'prog'); assert.equal(X.mt[0].pend.by, 'Ana'); assert.ok(!ana.calls.includes('orig-done'));
  ana.win.xMt('t', 'done');                                   // njëjtit person: s'e aprovon dot vetë
  assert.ok(!ana.calls.includes('orig-done')); assert.equal(X.mt[0].st, 'prog');
  besa.win.xMt('t', 'done');                                  // tjetri e aprovon -> mbyllet
  assert.ok(besa.calls.includes('orig-done')); assert.equal(X.mt[0].st, 'done');
  assert.equal(X.mt[0].pend, null); assert.equal(X.mt[0].doneBy, 'Ana'); assert.equal(X.mt[0].apprBy, 'Besa');
});
test('"Kthe prapa" heq pritjen, lë koment dhe detyra mbetet e hapur', () => {
  const X = T(), ana = as('Ana', X), besa = as('Besa', X);
  ana.win.xMt('t', 'done'); besa.win.xTkBack('t');
  assert.equal(X.mt[0].pend, null); assert.notEqual(X.mt[0].st, 'done');
  assert.ok(X.mt[0].cm[0].tx.includes('Kthyer pa aprovuar: mungon PDF')); assert.equal(X.mt[0].cm[0].by, 'Besa');
});
test('"Anulo kërkesën" (rihapje) e heq pritjen; detyra pa `rev` ose me një përgjegjës mbyllet menjëherë; i huaj nuk mbyll', () => {
  const X = T(), ana = as('Ana', X); ana.win.xMt('t', 'done'); ana.win.xMt('t', 'prog'); assert.equal(X.mt[0].pend, null);
  const Y = T({ rev: false }); as('Ana', Y).win.xMt('t', 'done'); assert.equal(Y.mt[0].st, 'done');
  const Z = T({ us: ['Ana'] }); as('Ana', Z).win.xMt('t', 'done'); assert.equal(Z.mt[0].st, 'done');
  const W = T(), gent = as('Gent', W); gent.win.xMt('t', 'done'); assert.ok(gent.calls.includes('alert')); assert.ok(!W.mt[0].pend);
});
const S = JSON.stringify, base = { id: 't', title: 'Detyra', us: ['Ana', 'Besa'], u: 'Ana', by: 'Gent', st: 'prog' };
test('njoftime: kërkesë aprovimi, kthim prapa, aprovim përfundimtar', () => {
  const pend = { ...base, pend: { by: 'Ana', at: 'x' } };
  const r1 = diffNotifs(S({ mt: [base] }), S({ mt: [pend] }), { name: 'Ana' });
  assert.deepEqual(r1.map((x) => x.name), ['Besa']); assert.ok(r1[0].text.includes('pret aprovimin tënd'));
  const r2 = diffNotifs(S({ mt: [pend] }), S({ mt: [base] }), { name: 'Besa' });
  assert.deepEqual(r2.map((x) => x.name), ['Ana']); assert.ok(r2[0].text.includes('ia ktheu'));
  const r3 = diffNotifs(S({ mt: [pend] }), S({ mt: [{ ...base, st: 'done', pend: null }] }), { name: 'Besa' });
  assert.ok(r3.some((x) => x.name === 'Ana' && x.text.includes('e mbylli')) && r3.some((x) => x.name === 'Gent'));
});

test('shërbimi i lidhur: statusi kopjohet te shërbimi, kështu shihet njësoj edhe kur detyra është e fshehur (scoped)', () => {
  const X = T({ sid: 's1', rev: false, us: ['Besa'], u: 'Besa' }); X.sv = [{ id: 's1', st: 'todo' }];
  const besa = as('Besa', X); besa.win.xMt('t', 'done');
  assert.equal(X.sv[0].st, 'done'); assert.equal(besa.calls.filter((c) => c === 'sv').length > 0, true);
  besa.win.xMt('t', 'todo'); assert.equal(X.sv[0].st, 'todo');
});
test('xCan: veprimet sipas rolit', () => {
  const X = T(), win = as('Laura', X).win, t = X.mt[0];
  assert.equal(win.xCan(t, 'act'), false); assert.equal(win.xCan(t, 'del'), false);          // Laura s'ka lidhje me detyrën
  assert.equal(as('Besa', X).win.xCan(t, 'act'), true); assert.equal(as('Besa', X).win.xCan(t, 'del'), false);
  const own = { ...t, by: 'Laura', us: [], u: '' }; assert.equal(win.xCan(own, 'act'), true); assert.equal(win.xCan(own, 'del'), true);
  assert.equal(as('Ana', X, true).win.xCan(t, 'del'), true);    // administratori
});
