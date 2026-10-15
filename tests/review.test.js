import test from 'node:test';
import assert from 'node:assert/strict';
import { diffClients } from '../api/_notify.js';
const S = JSON.stringify, cl = (x) => ({ id: 1, emriKompanise: 'ABE', fx: {}, ...x });
test('ndryshim te klienti: njoftohen administratorët (jo autori) me link aprovimi', () => {
  const r = diffClients(S([cl({ afatiAdministratori: '2027-01-01' })]), S([cl({ afatiAdministratori: '2027-02-02' })]), { name: 'Laura' }, ['Ana', 'Laura']);
  assert.deepEqual(r.map((x) => x.name), ['Ana']);
  assert.equal(r[0].link.rv, 1); assert.equal(r[0].link.by, 'Laura'); assert.ok(r[0].link.what.includes('afati i administratorit'));
});
test('pa ndryshim të vëzhguar: asnjë njoftim aprovimi', () => {
  assert.equal(diffClients(S([cl({})]), S([cl({})]), { name: 'Laura' }, ['Ana']).length, 0);
});
test('autori që është admin nuk njoftohet vetë', () => {
  const r = diffClients(S([cl({ tarifaMujore: '1' })]), S([cl({ tarifaMujore: '2' })]), { name: 'Ana' }, ['Ana']);
  assert.equal(r.length, 0);
});
