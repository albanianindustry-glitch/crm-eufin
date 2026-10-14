import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeX, unscopeX } from '../api/_scope.js';
const S = JSON.stringify, acc = { name: 'Enejd', role: 'accountant' };
const all = { mt: [{ id: 1, u: 'Admin' }, { id: 2, u: 'Enejd' }, { id: 3, u: 'Admin', by: 'Enejd' }], k: 1 };
test('kontabilisti sheh vetëm detyrat e veta', () => {
  assert.deepEqual(JSON.parse(scopeX(S(all), acc)).mt.map((t) => t.id), [2, 3]);
  assert.equal(scopeX(S(all), { name: 'Admin', role: 'admin' }), S(all));
});
test('ruajtja nga kontabilisti nuk fshin detyrat e fshehura', () => {
  const mine = JSON.parse(scopeX(S(all), acc)); mine.mt[0].st = 'done';
  const r = JSON.parse(unscopeX(S(mine), S(all), acc));
  assert.deepEqual(r.mt.map((t) => t.id).sort(), [1, 2, 3]);
  assert.equal(r.mt.find((t) => t.id === 2).st, 'done');
});
test('fshirja e detyrës së vet zbatohet', () => {
  const mine = JSON.parse(scopeX(S(all), acc)); mine.mt = mine.mt.filter((t) => t.id !== 2);
  assert.deepEqual(JSON.parse(unscopeX(S(mine), S(all), acc)).mt.map((t) => t.id).sort(), [1, 3]);
});
