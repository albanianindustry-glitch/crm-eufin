// API v2 (Klientët, Detyrat, Miratimet) mbi Postgres të vërtetë në memorie.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';

let env, admin, ana, beni;
const j = (r) => r.json;
before(async () => {
  env = await startServer(0);
  admin = new Client(env.base, '10.3.0.1'); ana = new Client(env.base, '10.3.0.2'); beni = new Client(env.base, '10.3.0.3');
  await admin.login('admin@test.al', 'AdminPass12345');
  await admin.call('POST', '/api/users', { name: 'Ana', email: 'ana@test.al', password: 'AnaPass123456', role: 'accountant' });
  await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' });
  await ana.login('ana@test.al', 'AnaPass123456'); await beni.login('beni@test.al', 'BeniPass123456');
});
after(() => env && env.server.close());

const NEW = { name: 'ABE Sh.p.k.', nipt: 'L11111111A', administrator: 'Artan B.', phone: '0691112233', email: 'info@abe.al', monthlyFee: 5000, responsible: 'Ana', kind: 'biznes', legalForm: 'SHPK', registeredAt: '2025-01-10', partners: [{ name: 'Artan B.', share: 100, country: 'Shqipëri' }] };
let clientId;

test('pa sesion: 401 me kod të qartë', async () => {
  const anon = new Client(env.base, '10.3.9.9'); const r = await anon.call('GET', '/api/v2/clients');
  assert.equal(r.status, 401); assert.equal(r.json.error, 'unauthenticated');
});

test('klientët: krijimi me validim (NIPT, email, shuma, përgjegjës i panjohur) dhe NIPT unik', async () => {
  assert.equal((await admin.call('POST', '/api/v2/clients', { ...NEW, nipt: 'abc' })).status, 422);
  assert.equal((await admin.call('POST', '/api/v2/clients', { ...NEW, email: 'jo-email' })).status, 422);
  assert.equal((await admin.call('POST', '/api/v2/clients', { ...NEW, monthlyFee: -5 })).status, 422);
  assert.equal((await admin.call('POST', '/api/v2/clients', { ...NEW, responsible: 'Fantazma' })).status, 422);
  assert.equal((await admin.call('POST', '/api/v2/clients', { ...NEW, hack: 1 })).status, 422);
  const ok = await admin.call('POST', '/api/v2/clients', { ...NEW, nipt: 'l11111111a' });
  assert.equal(ok.status, 201, JSON.stringify(ok.json)); clientId = ok.json.client.id;
  assert.equal(ok.json.client.nipt, 'L11111111A'); assert.equal(ok.json.client.monthlyFee, 5000); assert.equal(ok.json.client.responsible, 'Ana');
  const dup = await admin.call('POST', '/api/v2/clients', NEW); assert.equal(dup.status, 409); assert.equal(dup.json.error, 'duplicate_nipt');
});

test('klientët: lista dhe detajet; asnjë fjalëkalim në DTO; përputhshmëri me formatin e vjetër', async () => {
  assert.equal((await admin.call('PUT', `/api/v2/clients/${clientId}/secrets`, { eAlbaniaUser: 'abe', eAlbaniaPassword: 'sekret-1' })).status, 200);
  const list = await admin.call('GET', '/api/v2/clients'); assert.equal(list.status, 200);
  assert.ok(!JSON.stringify(list.json).includes('sekret-1'));
  const c = list.json.clients.find((x) => x.id === clientId); assert.equal(c.name, 'ABE Sh.p.k.'); assert.equal(c.openTasks, 0);
  const detail = (await ana.call('GET', `/api/v2/clients/${clientId}`)).json; assert.equal(detail.client.partners[0].name, 'Artan B.'); assert.ok(!JSON.stringify(detail).includes('sekret-1'));
  const legacy = JSON.parse((await admin.boot()).data.crmClients.value).find((x) => x.id === clientId);
  assert.equal(legacy.emriKompanise, 'ABE Sh.p.k.'); assert.equal(legacy.tarifaMujore, '5000'); assert.equal(legacy.fx.resp, 'Ana'); assert.equal(legacy.passwordEAlbania, 'sekret-1'); assert.equal(legacy.statusTVSH, 'me_tvsh');
});

test('kredencialet: vetëm admini i lexon/ndryshon; kontabilisti 403', async () => {
  const s = await admin.call('GET', `/api/v2/clients/${clientId}/secrets`); assert.equal(s.json.secrets.eAlbaniaPassword, 'sekret-1');
  assert.equal((await ana.call('GET', `/api/v2/clients/${clientId}/secrets`)).status, 403);
  assert.equal((await ana.call('PUT', `/api/v2/clients/${clientId}/secrets`, { eAlbaniaPassword: 'x' })).status, 403);
});

test('modifikimi: admini ruan menjëherë; kontabilisti krijon kërkesë (202) që admini e miraton ose e refuzon', async () => {
  const a = await admin.call('PATCH', `/api/v2/clients/${clientId}`, { phone: '0692223344' }); assert.equal(a.status, 200); assert.equal(a.json.status, 'saved'); assert.equal(a.json.client.phone, '0692223344');
  const r = await ana.call('PATCH', `/api/v2/clients/${clientId}`, { monthlyFee: 5100 });
  assert.equal(r.status, 202, JSON.stringify(r.json)); assert.equal(r.json.status, 'pending_approval'); assert.equal(r.json.client.monthlyFee, 5000);
  assert.equal((await admin.call('GET', '/api/v2/clients')).json.clients.find((x) => x.id === clientId).pendingRequests, 1);
  assert.equal((await ana.call('GET', '/api/v2/approvals')).status, 403);
  const list = (await admin.call('GET', '/api/v2/approvals')).json; assert.equal(list.pending.length, 1);
  const req = list.pending[0]; assert.deepEqual(req.changes, [{ field: 'tarifaMujore', from: '5000', to: '5100' }]); assert.equal(req.requestedBy, 'Ana');
  assert.equal((await ana.call('POST', `/api/v2/approvals/${req.id}/decision`, { decision: 'approved' })).status, 403);
  assert.equal((await admin.call('POST', `/api/v2/approvals/${req.id}/decision`, { decision: 'approved' })).status, 200);
  assert.equal((await admin.call('GET', `/api/v2/clients/${clientId}`)).json.client.monthlyFee, 5100);
  const again = await admin.call('POST', `/api/v2/approvals/${req.id}/decision`, { decision: 'approved' }); assert.equal(again.status, 409);
  await ana.call('PATCH', `/api/v2/clients/${clientId}`, { notes: 'Shënim i ri' });
  const p2 = (await admin.call('GET', '/api/v2/approvals')).json.pending[0];
  assert.equal((await admin.call('POST', `/api/v2/approvals/${p2.id}/decision`, { decision: 'rejected', reason: 'Jo tani' })).status, 200);
  assert.equal((await admin.call('GET', `/api/v2/clients/${clientId}`)).json.client.notes, '');
  assert.equal((await admin.call('GET', '/api/v2/approvals')).json.decided[0].reason, 'Jo tani');
});

test('fshirja: kontabilisti 403; admini fshin klient pa lidhje; mesazh i qartë kur ka të dhëna të lidhura', async () => {
  assert.equal((await ana.call('DELETE', `/api/v2/clients/${clientId}`)).status, 403);
  const tmp = (await admin.call('POST', '/api/v2/clients', { ...NEW, nipt: 'K22222222B', name: 'Klient i përkohshëm', responsible: '' })).json.client;
  assert.equal((await admin.call('DELETE', `/api/v2/clients/${tmp.id}`)).status, 200);
  assert.equal((await admin.call('GET', `/api/v2/clients/${tmp.id}`)).status, 404);
});

let t1;
test('detyrat: krijim me klient dhe përgjegjës; vlerësim i të dhënave; përputhshmëri me formatin e vjetër', async () => {
  assert.equal((await admin.call('POST', '/api/v2/tasks', { title: '' })).status, 422);
  assert.equal((await admin.call('POST', '/api/v2/tasks', { title: 'X1', clientId: 99999 })).status, 422);
  const r = await admin.call('POST', '/api/v2/tasks', { title: 'Përgatit bilancin', clientId: clientId, assignees: ['Ana'], due: '2026-10-01', priority: 'h' });
  assert.equal(r.status, 201, JSON.stringify(r.json)); t1 = r.json.task;
  assert.equal(t1.clientName, 'ABE Sh.p.k.'); assert.deepEqual(t1.assignees, ['Ana']); assert.equal(t1.createdBy, 'Administratori'); assert.equal(t1.status, 'todo');
  const legacy = JSON.parse((await admin.boot()).data.crmX.value).mt.find((t) => t.id === t1.id); assert.equal(legacy.us[0], 'Ana'); assert.equal(legacy.st, 'todo'); assert.equal(legacy.prio, 'h');
  assert.equal((await admin.call('GET', '/api/v2/clients')).json.clients.find((x) => x.id === clientId).openTasks, 1);
});

test('detyrat: vetëm përgjegjësi e nis/mbyll; koha dhe kryer-nga regjistrohen; komenti; rihapja', async () => {
  assert.equal((await beni.call('POST', `/api/v2/tasks/${t1.id}/command`, { command: 'start' })).status, 403);
  const s = await ana.call('POST', `/api/v2/tasks/${t1.id}/command`, { command: 'start' }); assert.equal(s.status, 200); assert.equal(s.json.task.status, 'prog'); assert.ok(s.json.task.startedAt);
  assert.equal((await beni.call('POST', `/api/v2/tasks/${t1.id}/comments`, { text: 'përshëndetje' })).status, 403);
  const c = await ana.call('POST', `/api/v2/tasks/${t1.id}/comments`, { text: 'Po e përgatis' }); assert.equal(c.json.task.comments[0].text, 'Po e përgatis'); assert.equal(c.json.task.comments[0].by, 'Ana');
  const d = await ana.call('POST', `/api/v2/tasks/${t1.id}/command`, { command: 'complete' }); assert.equal(d.json.task.status, 'done'); assert.equal(d.json.task.doneBy, 'Ana'); assert.ok(d.json.task.minutes >= 1); assert.equal(d.json.task.late, true);
  assert.equal((await ana.call('POST', `/api/v2/tasks/${t1.id}/command`, { command: 'complete' })).status, 409);
  assert.equal((await ana.call('POST', `/api/v2/tasks/${t1.id}/command`, { command: 'reopen' })).json.task.status, 'todo');
  assert.equal((await ana.call('POST', `/api/v2/tasks/${t1.id}/command`, { command: 'zzz' })).status, 400);
});

test('detyrat: mbyllje në dy hapa me aprovim të kolegut; detyra e përsëritur krijon të ardhshmen', async () => {
  const r = (await admin.call('POST', '/api/v2/tasks', { title: 'Deklarata Tetor 2026', assignees: ['Ana', 'Beni'], review: true, due: '2026-10-31', recurrence: 'm' })).json.task;
  const p = await ana.call('POST', `/api/v2/tasks/${r.id}/command`, { command: 'complete' }); assert.equal(p.json.task.pending.by, 'Ana'); assert.notEqual(p.json.task.status, 'done');
  assert.equal((await ana.call('POST', `/api/v2/tasks/${r.id}/command`, { command: 'approve' })).status, 409);
  const ok = await beni.call('POST', `/api/v2/tasks/${r.id}/command`, { command: 'approve' });
  assert.equal(ok.json.task.status, 'done'); assert.equal(ok.json.task.doneBy, 'Ana'); assert.equal(ok.json.task.approvedBy, 'Beni');
  assert.equal(ok.json.created.title, 'Deklarata Nëntor 2026'); assert.equal(ok.json.created.due, '2026-11-30'); assert.equal(ok.json.created.status, 'todo');
});

test('detyrat: modifikim/fshirje vetëm nga krijuesi ose admini; lista ka lejet për çdo përdorues', async () => {
  const t = (await ana.call('POST', '/api/v2/tasks', { title: 'Detyra e Anës', assignees: ['Beni'] })).json.task;
  assert.equal((await beni.call('PATCH', `/api/v2/tasks/${t.id}`, { title: 'Ndryshuar' })).status, 403);
  assert.equal((await ana.call('PATCH', `/api/v2/tasks/${t.id}`, { title: 'Ndryshuar nga Ana', due: '2026-12-01' })).json.task.title, 'Ndryshuar nga Ana');
  const list = (await beni.call('GET', '/api/v2/tasks')).json; const mine = list.tasks.find((x) => x.id === t.id);
  assert.equal(mine.permissions.act, true); assert.equal(mine.permissions.del, false);
  assert.equal((await beni.call('DELETE', `/api/v2/tasks/${t.id}`)).status, 403);
  assert.equal((await ana.call('DELETE', `/api/v2/tasks/${t.id}`)).status, 200);
  assert.equal((await ana.call('DELETE', `/api/v2/tasks/${t.id}`)).status, 404);
});

test('rrugë e panjohur: 404; kërkesa pa X-Requested-With refuzohet', async () => {
  assert.equal((await admin.call('GET', '/api/v2/nuk-ekziston')).status, 404);
  const raw = await fetch(env.base + '/api/v2/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: admin.cookie }, body: '{}' }); assert.equal(raw.status, 403);
});
