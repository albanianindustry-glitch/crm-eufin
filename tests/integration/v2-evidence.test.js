// Dokumente provë (kontrata e rinovuar, detyra me provë), njoftimet, Sot sipas përgjegjësit dhe fushat e reja të klientit.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';
import { addDays, addMonths, todayTirane } from '../../api/_v2-calendar.js';

let env, admin, ana, beni, c1, c2;
const T = todayTirane();
const pdf = (text) => 'data:application/pdf;base64,' + Buffer.from(`%PDF-1.4\n${text}\n%%EOF\n`).toString('base64');
const upload = async (who, name) => (await who.call('POST', '/api/file', { data: pdf(name), name })).json;
before(async () => {
  env = await startServer(0);
  admin = new Client(env.base, '10.7.0.1'); ana = new Client(env.base, '10.7.0.2'); beni = new Client(env.base, '10.7.0.3');
  await admin.login('admin@test.al', 'AdminPass12345');
  await admin.call('POST', '/api/users', { name: 'Ana', email: 'ana@test.al', password: 'AnaPass123456', role: 'accountant' });
  await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' });
  await ana.login('ana@test.al', 'AnaPass123456'); await beni.login('beni@test.al', 'BeniPass123456');
  const base = (id, name, nipt, resp, extra = {}) => ({ id, emriKompanise: name, nipt, statusKlient: 'aktiv', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', statusPagese: 'paguan', tarifaMujore: '0', dataKontrate: '2024-01-01', docs: [], ortaket: [], adresat: [], fx: { lloji: 'biznes', forma: 'SHPK', punonjes: true, regj: '2024-01-01', resp }, ...extra });
  c1 = base(1, 'ABE Sh.p.k.', 'L11111111A', 'Ana'); c2 = base(2, 'Beta Sh.p.k.', 'L22222222B', 'Beni'); const c3 = base(3, 'Pa përgjegjës', 'L33333333C', '');
  await admin.put('crmClients', [c1, c2, c3], 0);
  await admin.put('crmX', { mt: [], sv: [], k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'Kontrata e kontabilitetit', end: addDays(T, 10), st: 'a' }, { id: 'k2', cid: 2, type: 'mujor', lb: 'Kontrata Beta', end: addDays(T, 8), st: 'a' }], hist: [], fat: [], set: {}, cat: [], done: {}, users: ['Ana', 'Beni'], fu: {} }, 0);
});
after(() => env && env.server.close());

test('Sot: kontabilisti sheh vetëm detyrimet e veta; admini të gjitha (edhe pa përgjegjës); ekipi te /team', async () => {
  const a = (await ana.call('GET', '/api/v2/obligations/today')).json, b = (await beni.call('GET', '/api/v2/obligations/today')).json, ad = (await admin.call('GET', '/api/v2/obligations/today')).json;
  assert.ok(a.items.length && a.items.every((i) => i.responsible === 'Ana')); assert.ok(b.items.length && b.items.every((i) => i.responsible === 'Beni'));
  assert.ok(ad.items.some((i) => i.responsible === 'Ana') && ad.items.some((i) => i.responsible === 'Beni') && ad.items.some((i) => !i.responsible));
  assert.ok(!a.items.some((i) => i.clientId === 2)); assert.equal(a.scope, 'mine'); assert.equal(ad.scope, 'all');
  const team = (await ana.call('GET', '/api/v2/obligations/team')).json;
  assert.ok(team.people.find((p) => p.name === 'Beni').open > 0); assert.ok(team.unassigned.open > 0); assert.ok(team.people.find((p) => p.name === 'Ana').next.length > 0);
});

test('rinovimi i kontratës kërkon dokument; kontabilisti → kërkesë me PDF që admini e lexon; pas miratimit ruhet te klienti si provë', async () => {
  assert.equal((await ana.call('POST', '/api/v2/obligations/action', { type: 'contract-renew', id: 'k1', end: addMonths(T, 12) })).status, 422);
  assert.equal((await ana.call('POST', '/api/v2/obligations/action', { type: 'contract-renew', id: 'k1', end: addMonths(T, 12), document: { url: 'http://evil/x', name: 'x' } })).status, 422);
  const up = await upload(ana, 'kontrata-2027.pdf'); assert.match(up.url, /^\/api\/file\?id=/);
  const r = await ana.call('POST', '/api/v2/obligations/action', { type: 'contract-renew', id: 'k1', end: addMonths(T, 12), document: { url: up.url, name: 'kontrata-2027.pdf' } });
  assert.equal(r.json.status, 'pending_approval', JSON.stringify(r.json));
  const x0 = JSON.parse((await admin.boot()).data.crmX.value).k.find((k) => k.id === 'k1'); assert.equal(x0.end, addDays(T, 10), 'data s\'ndryshon para miratimit'); assert.equal(x0.pendingDoc, undefined);
  const list = (await admin.call('GET', '/api/v2/approvals')).json.pending, req = list.find((q) => q.kind === 'contract');
  assert.ok(req); const fields = req.changes.map((c) => c.field).sort(); assert.deepEqual(fields, ['end', 'pendingDoc']);
  const docRow = req.changes.find((c) => c.field === 'pendingDoc'); assert.equal(docRow.link, up.url); assert.equal(docRow.to, 'kontrata-2027.pdf');
  assert.equal((await admin.call('GET', docRow.link)).status, 200, 'admini e hap PDF-në');
  const notifs = (await admin.call('GET', '/api/notifications')).json.items; assert.ok(notifs.some((n) => /kërkon miratim/.test(n.text) && JSON.parse(n.link).t === 'req'));
  assert.equal((await admin.call('POST', `/api/v2/approvals/${req.id}/decision`, { decision: 'approved' })).status, 200);
  const boot = await admin.boot(), k = JSON.parse(boot.data.crmX.value).k.find((q) => q.id === 'k1'), doc = JSON.parse(boot.data.crmClients.value).find((c) => c.id === 1).docs.find((d) => d.id === k.doc);
  assert.equal(k.end, addMonths(T, 12)); assert.ok(doc); assert.equal(doc.cat, 'kontrate'); assert.equal(doc.data, up.url); assert.equal(doc.name, 'kontrata-2027.pdf');
});

test('rinovimi i kontratës nga admini: zbatohet menjëherë, dokumenti ruhet te klienti dhe lidhet me kontratën', async () => {
  const up = await upload(admin, 'beta-2027.pdf');
  assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'contract-renew', id: 'k2', end: addMonths(T, 12), document: { url: up.url, name: 'beta-2027.pdf' } })).json.status, 'saved');
  const boot = await admin.boot(), k = JSON.parse(boot.data.crmX.value).k.find((q) => q.id === 'k2'), c = JSON.parse(boot.data.crmClients.value).find((q) => q.id === 2);
  assert.equal(k.end, addMonths(T, 12)); assert.ok(c.docs.some((d) => d.id === k.doc && d.cat === 'kontrate' && d.data === up.url));
  assert.ok(!(await admin.call('GET', '/api/v2/obligations/today')).json.items.some((i) => i.category === 'contract' && i.clientId === 2));
});

test('detyra me provë: s\'mbyllet pa dokument; me dokument ruhet te klienti; mbyllja në dy hapa njofton kolegun me lidhje te detyra', async () => {
  const t = (await admin.call('POST', '/api/v2/tasks', { title: 'Largim punonjësi – Beta', clientId: 2, assignees: ['Beni', 'Administratori'], review: true, evidence: true, due: T })).json.task;
  assert.equal(t.evidence, true);
  assert.equal((await beni.call('POST', `/api/v2/tasks/${t.id}/command`, { command: 'complete' })).status, 422);
  assert.equal((await beni.call('POST', `/api/v2/tasks/${t.id}/command`, { command: 'complete', documents: [{ url: 'javascript:1', name: 'x' }] })).status, 422);
  const up = await upload(beni, 'vertetim-largimi.pdf');
  const p = await beni.call('POST', `/api/v2/tasks/${t.id}/command`, { command: 'complete', documents: [{ url: up.url, name: 'vertetim-largimi.pdf' }] });
  assert.equal(p.status, 200, JSON.stringify(p.json)); assert.equal(p.json.task.pending.by, 'Beni'); assert.equal(p.json.task.proof[0].url, up.url);
  const ni = (await admin.call('GET', '/api/notifications')).json.items.find((n) => /kërkon aprovimin tënd/.test(n.text)); assert.ok(ni); assert.deepEqual(JSON.parse(ni.link), { t: 'task', id: t.id });
  const c = JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 2); assert.ok(!c.docs.some((d) => d.tid === t.id), 'provat ruhen vetëm kur detyra mbyllet përfundimisht');
  const done = await admin.call('POST', `/api/v2/tasks/${t.id}/command`, { command: 'approve' }); assert.equal(done.json.task.status, 'done');
  const c2n = JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 2); const d = c2n.docs.find((x) => x.tid === t.id); assert.ok(d); assert.equal(d.cat, 'prove'); assert.equal(d.data, up.url); assert.match(d.note, /Largim punonjësi/);
  assert.ok((await beni.call('GET', '/api/notifications')).json.items.some((n) => /e aprovoi detyrën/.test(n.text)));
});

test('klient i ri me dokumente, afate certifikate dhe kredenciale (admin); lista e dokumenteve të kërkuara; kontabilisti s\'vendos kredenciale', async () => {
  const idDoc = await upload(admin, 'id-admin.pdf'), partnerDoc = await upload(admin, 'id-ortak.pdf');
  const r = await admin.call('POST', '/api/v2/clients', { name: 'Delta Trade', nipt: 'L44444444D', administrator: 'Dritan', certificate: addDays(T, 20), administratorDeadline: addDays(T, 40),
    administratorDocument: { url: idDoc.url, name: 'id-admin.pdf' }, partners: [{ name: 'Ortaku', share: 100, country: 'Shqipëri', document: { url: partnerDoc.url, name: 'id-ortak.pdf' } }], secrets: { eAlbaniaUser: 'delta', eAlbaniaPassword: 'S3kret!', eFilingPassword: 'F1ling' } });
  assert.equal(r.status, 201, JSON.stringify(r.json)); const c = r.json.client;
  assert.equal(c.certificate, addDays(T, 20)); assert.equal(c.administratorDeadline, addDays(T, 40)); assert.equal(c.administratorDocument.url, idDoc.url); assert.equal(c.partners[0].document.url, partnerDoc.url);
  assert.equal(c.requiredDocs.find((d) => d.key === 'id').ok, true); assert.equal(c.requiredDocs.find((d) => d.key === 'statut').ok, false);
  assert.equal((await admin.call('GET', `/api/v2/clients/${c.id}/secrets`)).json.secrets.eAlbaniaPassword, 'S3kret!'); assert.ok(!JSON.stringify((await ana.call('GET', `/api/v2/clients/${c.id}`)).json).includes('S3kret!'));
  assert.equal((await ana.call('POST', '/api/v2/clients', { name: 'Epsilon', nipt: 'L55555555E', secrets: { eAlbaniaPassword: 'x' } })).status, 403);
  assert.equal((await admin.call('POST', '/api/v2/clients', { name: 'Zeta', nipt: 'L66666666Z', administratorDocument: { url: 'data:application/pdf;base64,AAAA', name: 'x' } })).status, 422);
  // kontabilisti shton dokument për herë të parë te klienti ekzistues: pa miratim; zëvendësimi i atij ekzistues: me miratim
  const nd = await upload(ana, 'id-e-re.pdf'); const bare = (await admin.call('POST', '/api/v2/clients', { name: 'Eta', nipt: 'L77777777E' })).json.client;
  const first = await ana.call('PATCH', `/api/v2/clients/${bare.id}`, { administratorDocument: { url: nd.url, name: 'id-e-re.pdf' } }); assert.equal(first.json.status, 'saved'); assert.equal(first.json.client.administratorDocument.url, nd.url);
  const nd2 = await upload(ana, 'id-tjeter.pdf'); const repl = await ana.call('PATCH', `/api/v2/clients/${bare.id}`, { administratorDocument: { url: nd2.url, name: 'id-tjeter.pdf' } }); assert.equal(repl.json.status, 'pending_approval');
});
