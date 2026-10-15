import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeJson } from '../api/_merge.js';

const S = JSON.stringify;
const base = [{ id: 1, name: 'Alfa', fee: 100, status: 'aktiv' }, { id: 2, name: 'Beta', fee: 200, status: 'aktiv' }];

test('ndryshime në rekorde të ndryshme ruhen të dyja', () => {
  const mine = [{ ...base[0], fee: 150 }, base[1]];
  const theirs = [base[0], { ...base[1], status: 'inaktiv' }];
  const r = JSON.parse(mergeJson(S(base), S(mine), S(theirs)).json);
  assert.equal(r.find((x) => x.id === 1).fee, 150);
  assert.equal(r.find((x) => x.id === 2).status, 'inaktiv');
});
test('fusha të ndryshme të të njëjtit rekord bashkohen pa konflikt', () => {
  const mine = [{ ...base[0], fee: 150 }, base[1]];
  const theirs = [{ ...base[0], status: 'pezulluar' }, base[1]];
  const m = mergeJson(S(base), S(mine), S(theirs));
  const a = JSON.parse(m.json).find((x) => x.id === 1);
  assert.deepEqual([a.fee, a.status, m.conflicts], [150, 'pezulluar', 0]);
});
test('e njëjta fushë: fiton ai që ruan tani dhe numërohet konflikt', () => {
  const mine = [{ ...base[0], fee: 150 }, base[1]];
  const theirs = [{ ...base[0], fee: 300 }, base[1]];
  const m = mergeJson(S(base), S(mine), S(theirs));
  assert.equal(JSON.parse(m.json).find((x) => x.id === 1).fee, 150);
  assert.equal(m.conflicts, 1);
});
test('rekord i ri nga secili mbahet; fshirja pa prekje nga tjetri zbatohet', () => {
  const mine = [base[0], base[1], { id: 3, name: 'Gama' }];
  const theirs = [base[0], { id: 4, name: 'Delta' }];            // kolegu fshiu id 2, shtoi id 4
  const ids = JSON.parse(mergeJson(S(base), S(mine), S(theirs)).json).map((x) => x.id).sort();
  assert.deepEqual(ids, [1, 3, 4]);
});
test('fshirja ime nuk fshin rekordin që kolegu e ka ndryshuar', () => {
  const mine = [base[0]];                                          // unë fshiva id 2
  const theirs = [base[0], { ...base[1], fee: 999 }];              // kolegu e ndryshoi
  const r = JSON.parse(mergeJson(S(base), S(mine), S(theirs)).json);
  assert.equal(r.find((x) => x.id === 2).fee, 999);
});
test('objekt me hartë (p.sh. detyrat e kryera) bashkohet sipas çelësit', () => {
  const b = { done: { a: 1 }, k: [] };
  const mine = { done: { a: 1, b: 1 }, k: [] };
  const theirs = { done: { a: 1, c: 1 }, k: [] };
  const r = JSON.parse(mergeJson(S(b), S(mine), S(theirs)).json);
  assert.deepEqual(Object.keys(r.done).sort(), ['a', 'b', 'c']);
});
