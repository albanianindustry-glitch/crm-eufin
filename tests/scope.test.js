import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeX, unscopeX } from '../api/_scope.js';
const S = JSON.stringify;
test('politika: të gjithë i shohin të gjitha detyrat (Detyrat e ekipit)', () => {
  const x = S({ mt: [{ id: 1, u: 'A' }, { id: 2, u: 'B', by: 'C' }, { id: 3 }] });
  for (const u of [{ name: 'Laura', role: 'accountant' }, { name: 'A', role: 'accountant' }, { name: 'Ana', role: 'admin' }]) assert.equal(JSON.parse(scopeX(x, u)).mt.length, 3);
  assert.equal(unscopeX(x, x, { name: 'Laura', role: 'accountant' }), x);
});
