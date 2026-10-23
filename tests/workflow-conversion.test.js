import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareApplicationConversion } from '../api/_workflow.js';

const current = (overrides = {}) => ({
  id: 17,
  emriKompaniseAplikim: 'Test Client',
  administratoriAplikim: 'Test Admin',
  nrKontaktiAplikim: '0690000000',
  emailAplikim: 'test@example.invalid',
  adresaAplikim: 'Test Address',
  tarifaMujoreAplikim: '10000',
  xhiroBiznesAplikim: '200000',
  statusAplikim: 'pritje',
  ortaket: [],
  shenimetAplikim: '',
  ...overrides,
});
const run = (application, options = {}) => prepareApplicationConversion({
  clientsValue: JSON.stringify(options.clients || []),
  applicationsValue: JSON.stringify([application]),
  applicationId: 17,
  nipt: options.nipt || 'L12345678M',
  approvalDate: options.date || '2026-10-20',
  prepaid: false,
  now: '2026-10-20T12:00:00.000Z',
  nextId: () => 100,
});

test('application conversion creates one client and marks the application approved in the same result', () => {
  const result = run(current());
  const client = JSON.parse(result.clientsValue)[0];
  const application = JSON.parse(result.applicationsValue)[0];
  assert.equal(client.id, 100);
  assert.equal(client.nipt, 'L12345678M');
  assert.equal(application.statusAplikim, 'aprovuar');
  assert.equal(application.niptAprovuar, 'L12345678M');
});

test('application conversion rejects repeated conversion and duplicate NIPT', () => {
  assert.equal(run(current({ statusAplikim: 'aprovuar' })).status, 409);
  assert.equal(run(current(), { clients: [{ id: 1, nipt: 'L12345678M' }] }).status, 409);
});

test('application conversion validates NIPT, real calendar date and amounts', () => {
  assert.equal(run(current(), { nipt: 'bad' }).status, 400);
  assert.equal(run(current(), { date: '2026-02-30' }).status, 400);
  assert.equal(run(current({ tarifaMujoreAplikim: '-1' })).status, 400);
});
