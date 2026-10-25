// Teste integrimi: funksionet reale të /api mbi Postgres të vërtetë në memorie (PGlite).
// Ekzekutim: npm run test:integration
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';

let env, admin, ana, beni;
const client = (id, extra = {}) => ({ id, emriKompanise: 'Klient ' + id, nipt: 'L' + String(id).padStart(8, '0') + 'A', statusKlient: 'aktiv', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', tarifaMujore: '100', fx: { lloji: 'biznes' }, ...extra });

before(async () => {
  env = await startServer(0);
  admin = new Client(env.base, '10.0.1.1'); ana = new Client(env.base, '10.0.1.2'); beni = new Client(env.base, '10.0.1.3');
  assert.equal((await admin.login('admin@test.al', 'AdminPass12345')).status, 200);
  assert.equal((await admin.call('POST', '/api/users', { name: 'Ana', email: 'ana@test.al', password: 'AnaPass123456', role: 'accountant' })).status, 200);
  assert.equal((await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' })).status, 200);
  await ana.login('ana@test.al', 'AnaPass123456'); await beni.login('beni@test.al', 'BeniPass123456');
  const seed = [client(1, { passwordEAlbania: 'sekret1', fx: { lloji: 'biznes', resp: 'Ana' } }), client(2, { fx: { lloji: 'biznes', resp: 'Beni' } }), client(3)];
  assert.equal((await admin.put('crmClients', seed, 0)).status, 200);
  const X = { mt: [], sv: [], k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'Kontrata', end: '2027-01-01', st: 'a' }], hist: [], fat: [], set: {}, cat: [], done: {}, users: ['Ana', 'Beni'] };
  assert.equal((await admin.put('crmX', X, 0)).status, 200);
  assert.equal((await admin.put('crmDeklarimeTVSH', [{ id: 1, clientId: 1, muaji: 'Shtator', viti: 2026 }], 0)).status, 200);
  assert.equal((await admin.put('crmAplikime', [], 0)).status, 200);
});
after(() => env && env.server.close());

test('SQL: kushti i transaksionit nuk vlerësohet gabimisht në planifikim (1/0)', async () => {
  const { sql } = await import('../../api/_lib.js');
  const ok = await sql`SELECT CASE WHEN EXISTS (SELECT 1 FROM kv WHERE key = 'crmClients') THEN 1 ELSE 1 / (SELECT 0) END AS committed`;
  assert.equal(ok[0].committed, 1);
});

test('kontabilisti nuk fshin klientë (një ose të gjithë)', async () => {
  const list = await ana.list('crmClients'), v = await ana.version('crmClients');
  assert.equal((await ana.put('crmClients', list.filter((c) => c.id !== 3), v)).status, 403);
  assert.equal((await ana.put('crmClients', [], v)).status, 403);
  assert.equal((await admin.list('crmClients')).length, 3);
});

test('kontabilisti nuk boshatis deklarimet TVSH; admini po', async () => {
  const v = await ana.version('crmDeklarimeTVSH');
  assert.equal((await ana.put('crmDeklarimeTVSH', [], v)).status, 403);
  assert.equal((await admin.list('crmDeklarimeTVSH')).length, 1);
});

test('ID e dyfishtë e klientit refuzohet', async () => {
  const list = await admin.list('crmClients'), v = await admin.version('crmClients');
  assert.equal((await admin.put('crmClients', [...list, client(1, { nipt: 'L99999999Z' })], v)).status, 400);
});

test('ndryshimi i klientit ekzistues bëhet kërkesë; miratimi e zbaton; vendimi i dytë refuzohet', async () => {
  const list = await ana.list('crmClients'), v = await ana.version('crmClients');
  list[0].tarifaMujore = '777';
  const r = await ana.put('crmClients', list, v);
  assert.equal(r.status, 200); assert.equal(r.json.requests, 1);
  assert.equal((await admin.list('crmClients'))[0].tarifaMujore, '100');
  const pending = (await admin.list('crmReq')).filter((q) => q.st === 'pending');
  assert.equal(pending.length, 1);
  assert.equal((await ana.call('PUT', '/api/store', { key: 'crmReq', action: { id: pending[0].id, decision: 'approved' } })).status, 403);
  const ok = await admin.call('PUT', '/api/store', { key: 'crmReq', action: { id: pending[0].id, decision: 'approved' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const after = (await admin.list('crmClients'))[0];
  assert.equal(after.tarifaMujore, '777'); assert.equal(after.passwordEAlbania, 'sekret1');
  assert.equal((await admin.call('PUT', '/api/store', { key: 'crmReq', action: { id: pending[0].id, decision: 'approved' } })).status, 409);
});

test('ruajtja e përsëritur e së njëjtës kërkesë nuk krijon dublikatë', async () => {
  for (let i = 0; i < 3; i += 1) {
    const list = await ana.list('crmClients'), v = await ana.version('crmClients');
    list[1].tarifaMujore = '555';
    await ana.put('crmClients', list, v);
  }
  assert.equal((await admin.list('crmReq')).filter((q) => q.st === 'pending' && q.cid === 2).length, 1);
});

test('plotësimi i vlerave default (statusTVSH/statusTatimFitim) nuk është kërkesë miratimi', async () => {
  const list = await admin.list('crmClients'), v = await admin.version('crmClients');
  const bare = client(40, { nipt: 'L40404040A' }); delete bare.statusTVSH; delete bare.statusTatimFitim;
  assert.equal((await admin.put('crmClients', [...list, bare], v)).status, 200);
  const before = (await admin.list('crmReq')).length;
  const mine = await ana.list('crmClients'), v2 = await ana.version('crmClients');
  mine.forEach((c) => { c.statusTVSH = c.statusTVSH || 'me_tvsh'; c.statusTatimFitim = c.statusTatimFitim || 'me_tatim'; });
  const r = await ana.put('crmClients', mine, v2);
  assert.equal(r.status, 200);
  assert.equal((await admin.list('crmReq')).length, before);
});

test('ndryshim + klient i ri në të njëjtën ruajtje: klienti ruhet, ndryshimi bëhet kërkesë', async () => {
  const list = await ana.list('crmClients'), v = await ana.version('crmClients');
  list.find((c) => c.id === 3).tarifaMujore = '321';
  list.push(client(50, { nipt: 'L50505050A', fx: { lloji: 'biznes', resp: 'Ana' } }));
  const r = await ana.put('crmClients', list, v);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const now = await admin.list('crmClients');
  assert.ok(now.some((c) => c.id === 50)); assert.equal(now.find((c) => c.id === 3).tarifaMujore, '100');
});

test('konvertimi i aplikimit në klient punon (transaksion)', async () => {
  const v = await admin.version('crmAplikime');
  const app = { id: 7001, emriKompaniseAplikim: 'Aplikant', administratoriAplikim: 'A', nrKontaktiAplikim: '069', emailAplikim: 'a@b.al', adresaAplikim: 'Tiranë', tarifaMujoreAplikim: '120', xhiroBiznesAplikim: '1000', statusAplikim: 'pritje', dataAplikimit: '2026-10-01', ortaket: [] };
  assert.equal((await admin.put('crmAplikime', [app], v)).status, 200);
  const r = await ana.call('PUT', '/api/store', { key: 'crmAplikime', workflow: { type: 'convert', applicationId: 7001, nipt: 'L77777777A', approvalDate: '2026-10-15', prepaid: false } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const created = (await admin.list('crmClients')).find((c) => c.nipt === 'L77777777A');
  assert.ok(created); assert.equal(created.statusTVSH, 'me_tvsh'); assert.equal(created.statusTatimFitim, 'me_tatim');
});

test('fshirja e klientit nga admini: lejohet pa të dhëna të lidhura, edhe kur ka njoftim caktimi', async () => {
  const list = await admin.list('crmClients'), v = await admin.version('crmClients');
  const withResp = client(60, { nipt: 'L60606060A', fx: { lloji: 'biznes', resp: 'Beni' } });
  assert.equal((await admin.put('crmClients', [...list, withResp], v)).status, 200);
  const l2 = await admin.list('crmClients'), v2 = await admin.version('crmClients');
  const r = await admin.put('crmClients', l2.filter((c) => c.id !== 60), v2);
  assert.equal(r.status, 200, JSON.stringify(r.json));
});

test('fshirja e klientit me të dhëna të lidhura (deklarim) bllokohet me mesazh të qartë', async () => {
  const list = await admin.list('crmClients'), v = await admin.version('crmClients');
  const r = await admin.put('crmClients', list.filter((c) => c.id !== 1), v);
  assert.equal(r.status, 403); assert.match(r.json.message, /të dhëna të lidhura/);
});

test('njoftimet: dërguesi shfaqet, lidhja ruhet gjithmonë si JSON i vlefshëm, dhe s\'prish fshirjen', async () => {
  await ana.call('POST', '/api/notifications', { say: { name: 'Administratori', text: 'Aprovo pagesën', link: { t: 'req', id: 'x'.repeat(400) } } });
  await ana.call('POST', '/api/notifications', { say: { name: 'Administratori', text: 'Bosh', link: null } });
  const items = (await admin.call('GET', '/api/notifications')).json.items;
  const mine = items.filter((n) => /Aprovo pagesën|Bosh/.test(n.text));
  assert.equal(mine.length, 2);
  for (const n of mine) { assert.ok(n.text.startsWith('Ana')); if (n.link) assert.doesNotThrow(() => JSON.parse(n.link)); }
  const list = await admin.list('crmClients'), v = await admin.version('crmClients');
  const tmp = client(61, { nipt: 'L61616161A' });
  assert.equal((await admin.put('crmClients', [...list, tmp], v)).status, 200);
  const l2 = await admin.list('crmClients'), v2 = await admin.version('crmClients');
  assert.equal((await admin.put('crmClients', l2.filter((c) => c.id !== 61), v2)).status, 200);
});

test('admini mbetet i kyçur kur ndryshon fjalëkalimin e vet nga paneli i ekipit', async () => {
  const me = (await admin.call('GET', '/api/users')).json.find((u) => u.email === 'admin@test.al');
  assert.equal((await admin.call('PATCH', '/api/users', { id: me.id, password: 'AdminPass67890' })).status, 200);
  assert.equal((await admin.call('GET', '/api/bootstrap')).status, 200);
});

test('PDF: pranohet vetëm PDF e vërtetë', async () => {
  const good = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n').toString('base64');
  assert.equal((await ana.call('POST', '/api/file', { data: 'data:application/pdf;base64,' + good, name: 'a.pdf' })).status, 200);
  assert.equal((await ana.call('POST', '/api/file', { data: 'data:application/pdf;base64,' + Buffer.from('<html>').toString('base64') })).status, 400);
});

test('auditimi filtrohet në bazë (kërkim, përdorues, veprim, datë)', async () => {
  const all = (await admin.call('GET', '/api/audit')).json;
  assert.ok(all.length > 5);
  const logins = (await admin.call('GET', '/api/audit?action=login')).json;
  assert.ok(logins.length >= 1 && logins.every((r) => r.action === 'login'));
  const byUser = (await admin.call('GET', '/api/audit?user=ana@test.al')).json;
  assert.ok(byUser.every((r) => r.user_email === 'ana@test.al'));
  const today = new Date().toISOString().slice(0, 10);
  assert.ok((await admin.call('GET', `/api/audit?from=${today}&to=${today}`)).json.length >= 1);
  assert.equal((await admin.call('GET', '/api/audit?from=2000-01-01&to=2000-01-02')).json.length, 0);
  assert.equal((await admin.call('GET', '/api/audit?from=nuk-eshte-date')).status, 200);
});

test('hyrja: 8 gabime nga e njëjta IP bllokojnë vetëm atë çift; kolegu nga IP tjetër hyn', async () => {
  const attacker = new Client(env.base, '203.0.113.9');
  for (let i = 0; i < 8; i += 1) assert.equal((await attacker.login('beni@test.al', 'gabim-gabim')).status, 401);
  assert.equal((await attacker.login('beni@test.al', 'BeniPass123456')).status, 429);
  const legit = new Client(env.base, '198.51.100.7');
  assert.equal((await legit.login('beni@test.al', 'BeniPass123456')).status, 200);
});
