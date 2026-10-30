import test from 'node:test';
import assert from 'node:assert/strict';
import { diffNotifs } from '../api/_notify.js';
const S = JSON.stringify, ana = { name: 'Ana' };
test('caktimi i detyrës njofton përgjegjësin, jo vetveten', () => {
  const r = diffNotifs(S({ mt: [] }), S({ mt: [{ id: 1, title: 'TVSH', u: 'Besa' }, { id: 2, title: 'X', u: 'Ana' }] }), ana);
  assert.deepEqual(r.map((x) => x.name), ['Besa']);
});
test('komenti njofton krijuesin dhe përgjegjësin, jo autorin', () => {
  const o = { mt: [{ id: 1, title: 'T', u: 'Besa', by: 'Ana', cm: [] }] };
  const n = { mt: [{ id: 1, title: 'T', u: 'Besa', by: 'Ana', cm: [{ by: 'Besa', tx: 'ok' }] }] };
  assert.deepEqual(diffNotifs(S(o), S(n), { name: 'Besa' }).map((x) => x.name), ['Ana']);
});
test('mbyllja njofton krijuesin', () => {
  const o = { mt: [{ id: 1, title: 'T', u: 'Besa', by: 'Ana', st: 'prog' }] };
  const n = { mt: [{ id: 1, title: 'T', u: 'Besa', by: 'Ana', st: 'done' }] };
  assert.equal(diffNotifs(S(o), S(n), { name: 'Besa' })[0].name, 'Ana');
});

import { dueDigest } from '../api/_notify.js';
test('përmbledhja ditore grupon sipas përgjegjësit dhe injoron të kryerat', () => {
  const r = dueDigest([{ u: 'A', title: 'x', due: '2026-10-01', st: 'todo' }, { u: 'A', title: 'y', due: '2026-10-14', st: 'prog' }, { u: 'A', title: 'z', due: '2026-10-01', st: 'done' }, { u: 'B', title: 'q', due: '2026-12-01', st: 'todo' }], '2026-10-14');
  assert.equal(r.length, 1); assert.match(r[0].text, /2 detyra/);
});

import { diffClients, diffNotifs as dn2 } from '../api/_notify.js';
const J = (x) => JSON.stringify(x);
const me = { name: 'Admin' };

test('klient i ri me përgjegjës kryesor dhe përgjegjës të veçantë', () => {
  const n = diffClients(J([]), J([{ id: 7, emriKompanise: 'Alfa', fx: { resp: 'Ana', resps: { tvsh: 'Beni', lp: 'Beni' } } }]), me);
  assert.equal(n.length, 2);
  const ana = n.find((x) => x.name === 'Ana'), beni = n.find((x) => x.name === 'Beni');
  assert.match(ana.text, /përgjegjës kryesor/);
  assert.match(beni.text, /deklarimin e TVSH-së, listëpagesën/);
  assert.deepEqual(ana.link, { t: 'client', id: 7 });
});

test('caktim i ri për një deklaratë njofton vetëm personin e ri; heqja njofton të vjetrin', () => {
  const a = [{ id: 1, emriKompanise: 'Alfa', fx: { resp: 'Ana', resps: { tvsh: 'Beni' } } }];
  const b = [{ id: 1, emriKompanise: 'Alfa', fx: { resp: 'Ana', resps: { tvsh: 'Dita' } } }];
  const n = diffClients(J(a), J(b), me);
  assert.equal(n.length, 2);
  assert.match(n.find((x) => x.name === 'Dita').text, /të caktoi për deklarimin e TVSH-së/);
  assert.match(n.find((x) => x.name === 'Beni').text, /të hoqi nga deklarimin e TVSH-së/);
});

test('ndryshim i profilit fiskal njofton përgjegjësit, jo atë që e bëri', () => {
  const a = [{ id: 1, emriKompanise: 'Alfa', tarifaMujore: '1000', fx: { resp: 'Ana', resps: { lp: 'Admin' }, punonjes: false } }];
  const b = [{ id: 1, emriKompanise: 'Alfa', tarifaMujore: '1000', fx: { resp: 'Ana', resps: { lp: 'Admin' }, punonjes: true } }];
  const n = diffClients(J(a), J(b), me);
  assert.equal(n.length, 1);
  assert.equal(n[0].name, 'Ana');
  assert.match(n[0].text, /punonjësit/);
});

test('pa ndryshim kuptimplotë nuk ka njoftim; fjalëkalimet nuk prekin njoftimet', () => {
  const a = [{ id: 1, emriKompanise: 'Alfa', passwordEAlbania: 'x', fx: { resp: 'Ana' } }];
  const b = [{ id: 1, emriKompanise: 'Alfa', passwordEAlbania: 'y', fx: { resp: 'Ana' } }];
  assert.equal(diffClients(J(a), J(b), me).length, 0);
});

test('njoftimet e detyrave kanë lidhje te detyra', () => {
  const n = dn2(J({ mt: [] }), J({ mt: [{ id: 'z1', title: 'T', u: 'Ana', st: 'todo' }] }), me);
  assert.deepEqual(n[0].link, { t: 'task', id: 'z1' });
});
