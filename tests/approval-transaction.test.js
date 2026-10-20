import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveApprovalState } from '../api/_approval.js';

const request = (extra = {}) => ({ id: 'req-1', by: 'Lina', label: 'Client Test', st: 'pending', kind: 'client', cid: 1, base: { tarifaMujore: '100' }, patch: { tarifaMujore: '200' }, ...extra });
const base = (item = request()) => ({
  requestValue: JSON.stringify([item]),
  clientsValue: JSON.stringify([{ id: 1, emriKompanise: 'Client Test', tarifaMujore: '100' }]),
  crmXValue: JSON.stringify({ k: [], hist: [] }),
  id: 'req-1',
  decision: 'approved',
  actor: { name: 'Admin' },
  now: '2026-10-20T12:00:00.000Z',
  documentId: 'new-document-id',
});

test('client approval returns both the applied patch and the decided request', () => {
  const result = resolveApprovalState(base());
  assert.equal(JSON.parse(result.clientsValue)[0].tarifaMujore, '200');
  assert.equal(JSON.parse(result.requestValue)[0].st, 'approved');
  assert.equal(result.auditAction, 'request-approved');
});

test('rejection preserves client data and records the decision once', () => {
  const input = base();
  input.decision = 'rejected';
  input.reason = 'Need supporting document';
  const result = resolveApprovalState(input);
  assert.equal(result.clientsValue, input.clientsValue);
  assert.equal(JSON.parse(result.requestValue)[0].st, 'rejected');
  assert.equal(JSON.parse(result.requestValue)[0].why, 'Need supporting document');
  assert.equal(result.auditAction, 'request-rejected');
});

test('replaying an already decided request returns conflict and no replacement data', () => {
  const input = base(request({ st: 'approved' }));
  const result = resolveApprovalState(input);
  assert.equal(result.status, 409);
  assert.equal(result.clientsValue, undefined);
});

test('approval refuses to overwrite client data changed after the request snapshot', () => {
  const input = base();
  input.clientsValue = JSON.stringify([{ id: 1, emriKompanise: 'Client Test', tarifaMujore: '150' }]);
  const result = resolveApprovalState(input);
  assert.equal(result.status, 409);
  assert.equal(result.clientsValue, undefined);
});

test('contract deletion archives its linked document and removes the contract in the same result', () => {
  const contractSnapshot = { id: 'contract-1', cid: 1, doc: 'doc-1', type: 'qera' };
  const input = base(request({ kind: 'contract', kid: 'contract-1', op: 'del', cid: 1, label: 'Lease', base: contractSnapshot }));
  input.clientsValue = JSON.stringify([{ id: 1, docs: [{ id: 'doc-1', archived: false }] }]);
  input.crmXValue = JSON.stringify({ k: [contractSnapshot], hist: [] });
  const result = resolveApprovalState(input);
  assert.equal(JSON.parse(result.crmXValue).k.length, 0);
  assert.equal(JSON.parse(result.clientsValue)[0].docs[0].archived, true);
  assert.equal(JSON.parse(result.requestValue)[0].st, 'approved');
});

test('contract edit replaces the linked PDF while archiving the previous document', () => {
  const contractSnapshot = { id: 'contract-1', cid: 1, doc: 'old-doc', type: 'qera' };
  const input = base(request({ kind: 'contract', kid: 'contract-1', op: 'edit', cid: 1, label: 'Lease', base: { end: '2026-12-31' }, patch: { end: '2027-01-01', pendingDoc: { name: 'renewed.pdf', data: '/api/file?id=new-file' } } }));
  input.clientsValue = JSON.stringify([{ id: 1, docs: [{ id: 'old-doc', archived: false }] }]);
  input.crmXValue = JSON.stringify({ k: [{ ...contractSnapshot, end: '2026-12-31' }], hist: [] });
  const result = resolveApprovalState(input);
  const client = JSON.parse(result.clientsValue)[0];
  const contract = JSON.parse(result.crmXValue).k[0];
  assert.equal(client.docs[0].archived, true);
  assert.equal(client.docs[1].name, 'renewed.pdf');
  assert.equal(contract.doc, 'new-document-id');
  assert.equal(contract.end, '2027-01-01');
});
