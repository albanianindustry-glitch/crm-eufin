import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/data-safety.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window, Array, Object, JSON, TypeError });

const credentials = {
  passwordEAlbania: 'secret-a',
  passwordEFiling: 'secret-b',
  passwordProgramiFiskal: 'secret-c',
  passwordCertifikata: 'secret-d',
};

test('client export redacts passwords without mutating CRM state', () => {
  const clients = [{ id: 1, emriKompanise: 'Test', ...credentials }];
  const exported = window.crmRedactClients(clients);

  assert.deepEqual(JSON.parse(JSON.stringify(exported[0])), {
    id: 1,
    emriKompanise: 'Test',
    passwordEAlbania: '',
    passwordEFiling: '',
    passwordProgramiFiskal: '',
    passwordCertifikata: '',
  });
  assert.deepEqual(clients[0], { id: 1, emriKompanise: 'Test', ...credentials });
});

test('local backup redacts client credentials and preserves other buckets', () => {
  const clients = [{ id: 1, emriKompanise: 'Test', ...credentials }];
  const backup = {
    crmClients: JSON.stringify(clients),
    crmX: JSON.stringify({ mt: [] }),
    _data: '2026-10-20',
  };
  const exported = window.crmRedactBackup(backup);
  const savedClients = JSON.parse(exported.crmClients);

  assert.equal(savedClients[0].passwordEAlbania, '');
  assert.equal(savedClients[0].passwordEFiling, '');
  assert.equal(JSON.parse(exported.crmX).mt.length, 0);
  assert.equal(exported._data, '2026-10-20');
  assert.equal(JSON.parse(backup.crmClients)[0].passwordEAlbania, 'secret-a');
});
