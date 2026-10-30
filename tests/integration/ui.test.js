// Teste të ndërfaqes: ngarkojnë index.html të plotë në jsdom (jo kod të ndarë në sandbox),
// ndaj kapin gabime globale (ReferenceError) që testet njësi i fshehin.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServerProcess } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';
import { openApp, sleep } from '../helpers/ui.mjs';

let env, admin, anaCk, adminCk;
const today = new Date().toISOString().slice(0, 10);
const P = (k) => `<i data-xss="1">P${k}</i>"'`;

before(async () => {
  env = await startServerProcess();
  admin = new Client(env.base, '10.1.0.1');
  await admin.login('admin@test.al', 'AdminPass12345'); adminCk = admin.cookie;
  await admin.call('POST', '/api/users', { name: 'Ana', email: 'ana@test.al', password: 'AnaPass123456', role: 'accountant' });
  const ana = new Client(env.base, '10.1.0.2'); await ana.login('ana@test.al', 'AnaPass123456'); anaCk = ana.cookie;
  const base = (id, extra = {}) => ({ id, emriKompanise: 'Klient ' + id, nipt: 'L' + String(id).padStart(8, '0') + 'A', statusKlient: 'aktiv', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', tarifaMujore: '100', adresat: [], ortaket: [], docs: [], fx: { lloji: 'biznes', forma: 'SHPK', resp: 'Ana', regj: '2025-01-10' }, dataKontrate: '2025-01-10', ...extra });
  await admin.put('crmClients', [base(1), base(2)], 0);
  const X = { mt: [], sv: [], k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'Kontrata', end: '2027-01-01', st: 'a', val: '100' }], hist: [], fat: [], set: {}, cat: [], done: {}, users: ['Ana'] };
  await admin.put('crmX', X, 0);
  for (const k of ['crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH']) await admin.put(k, [], 0);
});
after(() => env && env.server.close());

test('administratori: faqja ngarkohet pa asnjë gabim dhe çdo skedë hapet', async () => {
  const s = await openApp(env.base, adminCk);
  assert.deepEqual(s.errors, []);
  for (const tab of [...s.d.querySelectorAll('.tab')]) { tab.click(); await sleep(150); }
  assert.deepEqual(s.errors, []);
  s.close();
});

test('kontratat: ndryshimi dhe fshirja nga administratori punojnë (ADMIN i përcaktuar)', async () => {
  const s = await openApp(env.base, adminCk), X = s.w.XAPI.X;
  const answers = ['2028-01-01', 'Etiketa e re', '150']; s.w.__promptAnswer = () => answers.shift(); s.w.confirm = () => false;
  s.w.xEdK('k1'); assert.equal(X.k[0].end, '2028-01-01'); assert.equal(X.k[0].val, '150');
  s.w.confirm = () => true; s.w.xDelK('k1'); assert.equal(X.k.length, 0);
  assert.deepEqual(s.errors, []); s.close();
});

test('faturimi: "Gjenero" krijon rreshta (act/stM të arritshme nga billing.js)', async () => {
  const s = await openApp(env.base, adminCk), X = s.w.XAPI.X;
  s.w.xFatGen(); assert.ok(X.fat.length >= 1); assert.deepEqual(s.errors, []); s.close();
});

test('detyra e përsëritur: mbyllja krijon të ardhshmen (nextTitle i arritshëm)', async () => {
  const s = await openApp(env.base, adminCk), X = s.w.XAPI.X;
  X.mt.push({ id: 'r1', title: 'Raport Tetor 2026', rec: 'm', due: '2026-10-25', st: 'todo', cm: [], us: ['Administratori'], u: 'Administratori', by: 'Administratori', prio: 'n' });
  s.w.xMt('r1', 'done');
  assert.ok(X.mt.some((t) => /Nëntor 2026/.test(t.title) && t.st === 'todo')); assert.deepEqual(s.errors, []); s.close();
});

test('data dhe festa: addM pa tejkalim muaji; festat 2026 sipas Bankës së Shqipërisë', async () => {
  const s = await openApp(env.base, adminCk), A = s.w.XAPI;
  assert.equal(A.addM('2026-01-31', 1), '2026-02-28'); assert.equal(A.addM('2028-02-29', 12), '2029-02-28'); assert.equal(A.addM('2026-08-31', 1), '2026-09-30');
  const hol = [...A.holidays(2026)].sort();
  for (const d of ['2026-03-16', '2026-03-20', '2026-03-23', '2026-04-06', '2026-04-13', '2026-05-27', '2026-09-07', '2026-11-23', '2026-11-30', '2026-12-01']) assert.ok(hol.includes(d), d);
  assert.equal(A.eff('2026-03-14'), '2026-03-13'); assert.equal(A.eff('2026-10-14'), '2026-10-14'); s.close();
});

test('XSS: asnjë fushë teksti nuk injekton HTML në asnjë skedë', async () => {
  const b = await admin.boot();
  const cl = JSON.parse(b.data.crmClients.value);
  cl.forEach((c, i) => { for (const f of ['emriKompanise', 'administratori', 'nrKontakti', 'emailBiznes', 'adresaBiznes', 'shenime']) c[f] = P(f + i); c.nipt = 'L' + i + P('nipt'); c.adresat = [{ adresa: P('adr'), dokument: '', dokumentEmri: P('dok') }]; c.ortaket = [{ emri: P('ortak'), perqindja: 50, shtet: P('shtet') }]; });
  assert.equal((await admin.put('crmClients', cl, b.data.crmClients.version)).status, 200);
  const X = JSON.parse((await admin.boot()).data.crmX.value);
  X.mt = [{ id: 't1', title: P('task'), by: 'Ana', u: 'Ana', us: ['Ana'], st: 'todo', due: today, cm: [{ t: P('cm'), by: P('by') }] }];
  X.k = [{ id: 'k2', cid: 1, type: 'mujor', lb: P('kontrate'), end: '2027-01-01', st: 'a' }]; X.cat = [{ id: 'x1', name: P('cat'), fr: 'm', day: 5, ap: '', hint: P('hint') }];
  assert.equal((await admin.put('crmX', X, (await admin.boot()).data.crmX.version)).status, 200);
  const v = (await admin.boot()).data.crmAplikime.version;
  await admin.put('crmAplikime', [{ id: 1, emriKompaniseAplikim: P('app'), administratoriAplikim: P('adm'), nrKontaktiAplikim: P('tel'), emailAplikim: P('mail'), adresaAplikim: P('adr'), tarifaMujoreAplikim: '100', xhiroBiznesAplikim: '1000', statusAplikim: 'pritje', dataAplikimit: today, ortaket: [{ emri: P('ao'), perqindja: 10 }] }], v);
  const s = await openApp(env.base, adminCk);
  for (const tab of [...s.d.querySelectorAll('.tab')]) { tab.click(); await sleep(150); }
  try { s.w.editClient(1); } catch { /* formulari */ }
  await sleep(300);
  assert.equal(s.d.querySelectorAll('i[data-xss]').length, 0);
  const broken = []; s.d.querySelectorAll('[onclick]').forEach((el) => { try { new s.w.Function(el.getAttribute('onclick')); } catch { broken.push(el.getAttribute('onclick').slice(0, 80)); } });
  assert.deepEqual(broken, []); s.close();
});

test('kontabilisti: hapja dhe ruajtja pa ndryshim nuk krijon kërkesa; klienti i ri ruhet', async () => {
  const s = await openApp(env.base, anaCk);
  assert.deepEqual(s.errors, []);
  s.w.saveData(); await sleep(2500);
  assert.equal((await admin.list('crmReq')).length, 0);
  s.w.eval('clients').push({ id: 777, emriKompanise: 'I ri nga Ana', nipt: 'L77777777Z', statusKlient: 'aktiv', statusTVSH: 'pa_tvsh', statusTatimFitim: 'me_tatim', fx: { lloji: 'biznes', resp: 'Ana' }, docs: [] });
  s.w.saveData(); await sleep(3000);
  assert.ok((await admin.list('crmClients')).some((c) => c.id === 777)); s.close();
});
