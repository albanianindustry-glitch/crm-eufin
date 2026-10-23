// Pamja profesionale: dosja e klientit (faqe), detyrat e ekipit (tabelë), kërkesat për miratim (etiketa të lexueshme).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServerProcess } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';
import { openApp, sleep } from '../helpers/ui.mjs';

let env, admin, adminCk, anaCk, beniCk;
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

before(async () => {
  env = await startServerProcess();
  admin = new Client(env.base, '10.2.0.1'); await admin.login('admin@test.al', 'AdminPass12345'); adminCk = admin.cookie;
  await admin.call('POST', '/api/users', { name: 'Enejd Saliaj', email: 'enejd@test.al', password: 'EnejdPass12345', role: 'accountant' });
  await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' });
  const ana = new Client(env.base, '10.2.0.2'); await ana.login('enejd@test.al', 'EnejdPass12345'); anaCk = ana.cookie;
  const beni = new Client(env.base, '10.2.0.3'); await beni.login('beni@test.al', 'BeniPass123456'); beniCk = beni.cookie;
  const eufin = { id: 1, emriKompanise: 'Eufin Consult', nipt: 'L11111111A', administratori: 'Artan B.', nrKontakti: '0691112233', emailBiznes: 'info@eufin.al', adresaBiznes: 'Tiranë', statusKlient: 'aktiv', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', statusPagese: 'paguan', tarifaMujore: '5000', dataKontrate: '2025-01-10', adresat: [], ortaket: [{ emri: 'Artan B.', perqindja: 100, shtet: 'Shqipëri' }], docs: [], fx: { lloji: 'biznes', forma: 'SHPK', resp: 'Enejd Saliaj', regj: '2025-01-10' } };
  await admin.put('crmClients', [eufin], 0);
  const X = { mt: [
    { id: 'a1', title: 'Përgatit bilancin', by: 'Administratori', u: 'Enejd Saliaj', us: ['Enejd Saliaj'], cid: '1', st: 'todo', due: yesterday, prio: 'h', at: new Date(Date.now() - 36e5 * 5).toISOString(), cm: [] },
    { id: 'a2', title: 'Dërgo faturat', by: 'Beni', u: 'Beni', us: ['Beni'], st: 'done', due: today, doneAt: today, doneTs: new Date().toISOString(), doneBy: 'Beni', mins: 95, at: new Date(Date.now() - 36e5 * 3).toISOString(), cm: [] },
  ], sv: [], k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'Kontrata e kontabilitetit', end: '2027-01-01', st: 'a', val: '5000' }], hist: [{ id: 'h1', cid: 1, t: 'Klienti u regjistrua', by: 'Administratori', at: '2025-01-10T09:00:00.000Z' }], fat: [], set: {}, cat: [], done: {}, users: ['Enejd Saliaj', 'Beni'] };
  await admin.put('crmX', X, 0);
  for (const k of ['crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH']) await admin.put(k, [], 0);
});
after(() => env && env.server.close());

test('kërkesa për miratim: tarifa 5000 → 5100 shfaqet me emër të lexueshëm dhe vlera të formatuara', async () => {
  const a = await openApp(env.base, anaCk);
  a.w.eval('clients').find((c) => c.id === 1).tarifaMujore = '5100'; a.w.saveData(); await sleep(3000); a.close();
  const m = await openApp(env.base, adminCk);
  m.d.querySelector('#xside [data-k="req"]').click(); await sleep(300);
  const html = m.d.getElementById('treq').textContent;
  assert.match(html, /Tarifa mujore/); assert.match(html, /5\.000 Lekë/); assert.match(html, /5\.100 Lekë/); assert.match(html, /Enejd Saliaj/); assert.match(html, /Eufin Consult/);
  assert.doesNotMatch(html, /tarifaMujore/);
  assert.deepEqual(m.errors, []); m.close();
});

test('kërkesat automatike të vjetra (plotësim default) ndahen dhe pastrohen me një klik', async () => {
  const b = await admin.boot();
  const list = JSON.parse(b.data.crmReq.value);
  list.push({ id: 'legacy-1', by: 'Enejd Saliaj', at: new Date().toISOString(), st: 'pending', kind: 'client', cid: 1, label: 'Eufin Consult', changes: [{ k: 'statusTatimFitim', from: '—', to: 'me_tatim' }], patch: { statusTatimFitim: 'me_tatim' } });
  assert.equal((await admin.put('crmReq', list, b.data.crmReq.version)).status, 200);
  const m = await openApp(env.base, adminCk);
  m.d.querySelector('#xside [data-k="req"]').click(); await sleep(300);
  assert.match(m.d.getElementById('treq').textContent, /1 plotësime automatike/);
  assert.match(m.d.getElementById('treq').textContent, /Kërkesa për miratim \(1\)/);
  await m.w.xReqAuto(); await sleep(500);
  assert.doesNotMatch(m.d.getElementById('treq').textContent, /plotësime automatike/);
  assert.equal((await admin.list('crmReq')).filter((r) => r.st === 'pending').length, 1);
  assert.deepEqual(m.errors, []); m.close();
});

test('dosja e klientit hapet si faqe e plotë (jo popup), me KPI, përgjegjës, detyra, kontrata, dokumente dhe kthim', async () => {
  const s = await openApp(env.base, adminCk);
  s.d.querySelector('#xside [data-k="cl"]').click(); await sleep(200);
  s.w.xDosje(1); await sleep(200);
  const p = s.d.getElementById('tprofil');
  assert.ok(p.classList.contains('active')); assert.ok(!s.d.getElementById('xmodal').classList.contains('active'));
  const txt = p.textContent;
  for (const w of ['Eufin Consult', 'Tarifa mujore', '5.000 Lekë', 'Pagesa e studios', 'Përgjegjësit', 'Enejd Saliaj', 'Artan B.', 'Ortakët', 'Përgatit bilancin', 'me vonesë']) assert.ok(txt.includes(w), w);
  s.w.xProfTab('kontrata'); assert.match(p.textContent, /Kontrata e kontabilitetit/);
  s.w.xProfTab('dokumente'); assert.match(p.textContent, /Dokumente që mungojnë/);
  s.w.xProfTab('historik'); assert.match(p.textContent, /Klienti u regjistrua/);
  s.w.xProfBack(); await sleep(200);
  assert.ok(s.d.getElementById('klientet').classList.contains('active'));
  assert.deepEqual(s.errors, []); s.close();
});

test('detyrat e ekipit: tabelë me përgjegjës, caktuar nga, afati, statusi, koha dhe kryer nga; filtra dhe matje kohe', async () => {
  const s = await openApp(env.base, adminCk);
  s.d.querySelector('#xside [data-k="team"]').click(); await sleep(300);
  const el = s.d.getElementById('tmis'), txt = el.textContent;
  for (const h of ['Përgjegjës', 'Caktuar nga', 'Afati', 'Statusi', 'Koha', 'Kryer nga']) assert.ok(txt.includes(h), h);
  assert.match(txt, /Ngarkesa sipas anëtarit/); assert.match(txt, /Enejd Saliaj/); assert.match(txt, /me vonesë 1 ditë/);
  s.w.xTtF('st', 'done'); assert.match(el.textContent, /Dërgo faturat/); assert.match(el.textContent, /1 orë 35 min/); assert.match(el.textContent, /Beni/);
  s.w.xTtF('st', 'open'); s.w.xTtF('who', 'Enejd Saliaj'); assert.doesNotMatch(el.textContent, /Dërgo faturat/);
  s.w.xMt('a1', 'prog'); const t = s.w.XAPI.X.mt.find((x) => x.id === 'a1'); assert.ok(t.pst);
  assert.match(el.textContent, /po zgjat/);
  s.w.xMt('a1', 'done'); s.w.xTtF('st', 'done'); s.w.xTtF('who', ''); assert.match(el.textContent, /Përgatit bilancin/);
  assert.ok(s.w.XAPI.X.mt.find((x) => x.id === 'a1').mins >= 1);
  assert.deepEqual(s.errors, []); s.close();
});

test('detyra e re nga detyrat e ekipit ruan kush e caktoi dhe kur; kolegu e sheh dhe e fillon (serveri pranon pst)', async () => {
  const s = await openApp(env.base, adminCk);
  s.d.querySelector('#xside [data-k="team"]').click(); await sleep(200);
  s.d.getElementById('mt_t').value = 'Detyrë nga admini'; s.d.getElementById('mt_u').value = 'Beni'; s.d.getElementById('mt_d').value = today;
  s.w.xMtAdd(); await sleep(2500);
  const mine = (await admin.list('crmX')).mt.find((t) => t.title === 'Detyrë nga admini');
  assert.ok(mine && mine.by === 'Administratori' && mine.at); s.close();
  const b = await openApp(env.base, beniCk);
  b.w.xMt(mine.id, 'prog'); await sleep(3000);
  const after = (await admin.list('crmX')).mt.find((t) => t.id === mine.id);
  assert.equal(after.st, 'prog'); assert.ok(after.pst); assert.deepEqual(b.errors, []); b.close();
});
