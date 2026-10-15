import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { diffNotifs, dueDigest } from '../api/_notify.js';
import { scopeX, unscopeX } from '../api/_scope.js';
const S = JSON.stringify, ana = { name: 'Ana', role: 'accountant' };

test('detyrë me dy përgjegjës: të dy njoftohen (jo vetja) dhe secili e sheh', () => {
  const t = { id: 1, title: 'Kontribute', u: 'Besa', us: ['Besa', 'Gent'], by: 'Ana' };
  const r = diffNotifs(S({ mt: [] }), S({ mt: [t] }), ana);
  assert.deepEqual(r.map((x) => x.name).sort(), ['Besa', 'Gent']);
  assert.ok(r[0].text.includes('bashkë me'));
  for (const n of ['Besa', 'Gent']) assert.equal(JSON.parse(scopeX(S({ mt: [t] }), { name: n, role: 'accountant' })).mt.length, 1);
  assert.equal(JSON.parse(scopeX(S({ mt: [t] }), { name: 'Tjetri', role: 'accountant' })).mt.length, 0);
});
test('kur njëri e mbyll, tjetri dhe krijuesi njoftohen', () => {
  const a = { id: 1, title: 'X', u: 'Besa', us: ['Besa', 'Gent'], by: 'Ana', st: 'todo' };
  const r = diffNotifs(S({ mt: [a] }), S({ mt: [{ ...a, st: 'done' }] }), { name: 'Besa' });
  assert.deepEqual(r.map((x) => x.name).sort(), ['Ana', 'Gent']);
});
test('përmbledhja ditore përfshin të dy përgjegjësit', () => {
  const r = dueDigest([{ id: 1, title: 'X', u: 'A', us: ['A', 'B'], st: 'todo', due: '2026-01-01' }], '2026-01-02');
  assert.deepEqual(r.map((x) => x.name).sort(), ['A', 'B']);
});
test('detyra e fshehur nuk humbet kur ruan përgjegjësi i dytë', () => {
  const cur = S({ mt: [{ id: 1, u: 'A', us: ['A', 'B'] }, { id: 2, u: 'Z' }] });
  const out = JSON.parse(unscopeX(S({ mt: [{ id: 1, u: 'A', us: ['A', 'B'], st: 'done' }] }), cur, { name: 'B', role: 'accountant' }));
  assert.equal(out.mt.length, 2);
});
// Testi përdor kodin e vërtetë nga index.html
const src = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const MN = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'];
const nt = new Function('MN', src.match(/const nextTitle=[^\n]*/)[0] + ';return nextTitle')(MN);
test('emri i muajit pasardhës në detyrat mujore', () => {
  assert.equal(nt('Kontribute Gusht', 'm'), 'Kontribute Shtator');
  assert.equal(nt('Kontribute Dhjetor 2026', 'm'), 'Kontribute Janar 2027');
  assert.equal(nt('Pagesa e qerasë – Nëntor', 'm'), 'Pagesa e qerasë – Dhjetor');
  assert.equal(nt('Kontribute Gusht', 'w'), 'Kontribute Gusht');
  assert.equal(nt('Bilanci 2026', 'y'), 'Bilanci 2027');
  assert.equal(nt('Raport i përgjithshëm', 'm'), 'Raport i përgjithshëm');
});
