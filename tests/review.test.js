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

import { diffNotifs, diffDecl } from '../api/_notify.js';
const CS = S([{ id: 1, emriKompanise: 'ABE', fx: {} }]);
test('kontrata e re / e ndryshuar / e fshirë njofton administratorët me aprovim', () => {
  const old = S({ k: [{ id: 'a', cid: 1, type: 'qera', lb: 'Zyra', end: '2027-01-01', st: 'a' }, { id: 'z', cid: 1, type: 'mujor', lb: '', end: '2027-01-01', st: 'a' }] });
  const nw = S({ k: [{ id: 'a', cid: 1, type: 'qera', lb: 'Zyra', end: '2027-06-01', st: 'a' }, { id: 'n', cid: 1, type: 'perf', lb: '', end: '2027-01-01', st: 'a' }] });
  const r = diffNotifs(old, nw, { name: 'Laura' }, ['Ana'], CS);
  assert.equal(r.length, 3); assert.ok(r.every((x) => x.name === 'Ana' && x.link.rv === 1 && x.link.by === 'Laura' && x.link.id === 1));
  assert.ok(r.some((x) => x.text.includes('kontratë e re')) && r.some((x) => x.text.includes('afati/statusi')) && r.some((x) => x.text.includes('fshiu')));
});
test('ruajtja e parë (pa gjendje të mëparshme) nuk spam-on njoftime', () => {
  assert.equal(diffNotifs('', S({ k: [{ id: 'a', cid: 1, type: 'qera', end: 'x' }] }), { name: 'Laura' }, ['Ana'], CS).length, 0);
  assert.equal(diffDecl('', S([{ id: 1, clientId: 1, muaji: 'Gusht', viti: 2026, tvshPerTuPaguar: 5 }]), { name: 'Laura' }, ['Ana'], CS).length, 0);
});
test('deklarimi TVSH i ri ose me shumë të ndryshuar kërkon aprovim', () => {
  const d = (v) => ({ id: 7, clientId: 1, emriKompanise: 'ABE', muaji: 'Gusht', viti: 2026, tvshPerTuPaguar: v });
  const r1 = diffDecl(S([]), S([d(100)]), { name: 'Laura' }, ['Ana'], CS);
  assert.equal(r1.length, 1); assert.ok(r1[0].text.includes('deklarim TVSH i ri (Gusht 2026)'));
  assert.equal(diffDecl(S([d(100)]), S([d(100)]), { name: 'Laura' }, ['Ana'], CS).length, 0);
  assert.equal(diffDecl(S([d(100)]), S([d(250)]), { name: 'Laura' }, ['Ana'], CS).length, 1);
});
