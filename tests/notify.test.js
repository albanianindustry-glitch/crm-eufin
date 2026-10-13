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
