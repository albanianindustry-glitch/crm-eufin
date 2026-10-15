import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

process.env.DATA_KEY = randomBytes(32).toString('base64');
const { encField, decField, encClients, decClients, blankClients, keepSecrets } = await import('../api/_crypto.js');

const clients = JSON.stringify([{ id: 1, emriKompanise: 'Alfa', passwordEAlbania: 'sekret1', passwordEFiling: '' }]);

test('enkriptimi dhe dekriptimi kthejnë vlerën origjinale', () => {
  const e = encField('fjalekalim');
  assert.ok(e.startsWith('enc:'));
  assert.notEqual(e, 'fjalekalim');
  assert.equal(decField(e), 'fjalekalim');
});
test('enkriptimi nuk ri-enkriptohet dhe vlerat bosh mbeten bosh', () => {
  const e = encField('x');
  assert.equal(encField(e), e);
  assert.equal(encField(''), '');
});
test('vlera e ndryshuar (e dëmtuar) nuk dekriptohet', () => {
  const e = encField('abc').slice(0, -3) + 'AAA';
  assert.throws(() => decField(e));
});
test('encClients/decClients dhe blankClients', () => {
  const enc = encClients(clients);
  assert.ok(JSON.parse(enc)[0].passwordEAlbania.startsWith('enc:'));
  assert.equal(JSON.parse(decClients(enc))[0].passwordEAlbania, 'sekret1');
  assert.equal(JSON.parse(blankClients(enc))[0].passwordEAlbania, '');
});
test('kontabilisti nuk mbishkruan fjalëkalimet ekzistuese', () => {
  const stored = encClients(clients);
  const fromAccountant = JSON.stringify([{ id: 1, emriKompanise: 'Alfa i ri', passwordEAlbania: '', passwordEFiling: '' }]);
  const kept = JSON.parse(keepSecrets(fromAccountant, stored))[0];
  assert.equal(kept.emriKompanise, 'Alfa i ri');
  assert.equal(decField(kept.passwordEAlbania), 'sekret1');
});
