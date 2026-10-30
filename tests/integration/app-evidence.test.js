// Ndërfaqja: rinovim kontrate me dokument, njoftime (zile + shirit lart), detyra me provë, formulari i klientit me dokumente/afate/kredenciale, dosja.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';
import { bootApp, sleep, waitFor } from '../helpers/app.mjs';
import { addDays, addMonths, todayTirane } from '../../api/_v2-calendar.js';

let env, admin, ana, beni, ui;
const T = todayTirane();
const pdfData = (t) => 'data:application/pdf;base64,' + Buffer.from(`%PDF-1.4\n${t}\n%%EOF\n`).toString('base64');
before(async () => {
  env = await startServer(0);
  admin = new Client(env.base, '10.8.0.1'); ana = new Client(env.base, '10.8.0.2'); beni = new Client(env.base, '10.8.0.3');
  await admin.login('admin@test.al', 'AdminPass12345');
  await admin.call('POST', '/api/users', { name: 'Ana', email: 'ana@test.al', password: 'AnaPass123456', role: 'accountant' });
  await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' });
  await ana.login('ana@test.al', 'AnaPass123456'); await beni.login('beni@test.al', 'BeniPass123456');
  const base = (id, name, nipt, resp, extra = {}) => ({ id, emriKompanise: name, nipt, statusKlient: 'aktiv', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', statusPagese: 'paguan', tarifaMujore: '0', dataKontrate: '2024-01-01', docs: [], ortaket: [], adresat: [], fx: { lloji: 'biznes', forma: 'SHPK', punonjes: true, regj: '2024-01-01', resp }, ...extra });
  await admin.put('crmClients', [base(1, 'ABE Sh.p.k.', 'L11111111A', 'Ana'), base(2, 'Beta Sh.p.k.', 'L22222222B', 'Beni', { fx: { lloji: 'biznes', forma: 'SHPK', regj: '2024-01-01', resp: 'Beni', resps: { tvsh: 'Administratori', lp: 'Administratori', fat: 'Administratori', pay: 'Administratori' } } })], 0);
  await admin.put('crmX', { mt: [], sv: [], k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'Kontrata ABE', end: addDays(T, 9), st: 'a' }, { id: 'k2', cid: 1, type: 'qera', lb: 'Qera ABE', end: addDays(T, 400), st: 'a', rent: '1000' }], hist: [], fat: [], set: {}, cat: [], done: {}, users: ['Ana', 'Beni'], fu: {} }, 0);
});
after(() => { try { ui && ui.close(); } catch { /* */ } env && env.server.close(); });

test('shiriti i kuq: atributi hidden respektohet nga CSS dhe banerat e gabimit janë të fshehur në hapje', async () => {
  assert.match(fs.readFileSync(new URL('../../public/app/app.css', import.meta.url), 'utf8'), /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  ui = await bootApp(env.base, admin.cookie, { hash: '#/clients/new' }); await waitFor(() => ui.$('#client-form'), { label: 'formulari' });
  assert.equal(ui.$('#form-error').hidden, true);
  await ui.go('#/tasks'); await waitFor(() => ui.$('[data-action="task.new"]'), { label: 'detyrat' }); ui.click('[data-action="task.new"]'); await waitFor(() => ui.$('#task-form'), { label: 'dritarja' }); assert.equal(ui.$('#task-error').hidden, true);
  ui.close();
});

test('rinovimi i kontratës (kontabilisti): dritarja kërkon datë dhe PDF; dërgohet për miratim bashkë me dokumentin', async () => {
  ui = await bootApp(env.base, ana.cookie, { hash: '#/today' });
  const card = () => ui.$$('#today-body .ob').find((c) => /Kontratë shërbimi.*Kontrata ABE/.test(c.textContent));
  await waitFor(card, { label: 'karta e kontratës' });
  ui.click(card().querySelector('[data-action="ob.act"]')); await waitFor(() => ui.$('.modal form[data-submit="ob.renew.save"]'), { label: 'dritarja e rinovimit' });
  assert.match(ui.text('.modal'), /Kërkesa i dërgohet administratorit/); assert.match(ui.text('.modal'), /Kontrata e rinovuar \(PDF\)/);
  ui.click('.modal button[type=submit]'); await waitFor(() => !ui.$('#renew-error').hidden, { label: 'gabim pa PDF' }); assert.match(ui.text('#renew-error'), /duhet bashkëlidhur/);
  ui.$('.modal input[name=date]').value = addMonths(T, 12); ui.attach('.modal input[type=file]', 'kontrata-2027.pdf');
  ui.click('.modal button[type=submit]'); await waitFor(() => ui.toasts().some((t) => /për miratim, bashkë me dokumentin/.test(t)), { label: 'toast' });
  assert.equal(JSON.parse((await admin.boot()).data.crmX.value).k.find((k) => k.id === 'k1').end, addDays(T, 9));
  ui.close();
});

test('njoftimet: kërkesa e re shfaq shirit të butë lart (jo i kuq) me “Hap” që të çon te miratimet; zilja liston njoftimet; dokumenti hapet', async () => {
  ui = await bootApp(env.base, admin.cookie, { hash: '#/today' });
  await waitFor(() => ui.$('#bell-count'), { label: 'zilja' }); await ui.app.pollNotifications();
  const up = (await ana.call('POST', '/api/file', { data: pdfData('k2'), name: 'kontrata-b.pdf' })).json;
  const r = await ana.call('POST', '/api/v2/obligations/action', { type: 'contract-renew', id: 'k1', end: addMonths(T, 24), document: { url: up.url, name: 'kontrata-b.pdf' } }); assert.equal(r.status, 202, JSON.stringify(r.json));
  await ui.app.pollNotifications(); await waitFor(() => ui.banner(), { label: 'shiriti' });
  assert.match(ui.text('#banner-root'), /kërkon miratim/); assert.ok(!ui.banner().className.includes('error')); assert.equal(ui.text('#bell-count'), '2', 'një njoftim nga kërkesa e mëparshme + ky i ri');
  ui.click('#bell-count'.replace('#bell-count', '.bell')); await waitFor(() => !ui.$('#notif-panel').hidden, { label: 'paneli' }); assert.match(ui.text('#notif-panel'), /kërkon miratim/);
  ui.click(ui.$('#banner-root [data-action="notif.open"]')); await waitFor(() => /#\/approvals/.test(ui.w.location.hash), { label: 'kalimi te miratimet' });
  await waitFor(() => ui.$$('.rq').length >= 2, { label: 'kërkesat' }); const card = ui.$$('.rq').find((q) => /kontrata-b\.pdf/.test(q.textContent)); assert.ok(card, 'kërkesa me dokumentin e ri'); const rq = card.textContent; assert.match(rq, /Data e mbarimit/); assert.match(rq, /PDF i ri i kontratës/); assert.match(rq, /kontrata-b\.pdf/);
  const link = card.querySelector('a[href^="/api/file"]'); assert.ok(link, 'lidhja për të hapur dokumentin'); assert.equal((await admin.call('GET', link.getAttribute('href'))).status, 200);
  assert.ok(!ui.banner(), 'shiriti u mbyll pas hapjes'); await waitFor(() => ui.text('#bell-count') === '1', { label: 'njoftimi u lexua (mbetet 1 i palexuar)' });
  ui.click(card.querySelector('[data-action="req.approve"]')); await waitFor(() => ui.$('[data-action="dlg.ok"]'), { label: 'dialogu' }); ui.click('[data-action="dlg.ok"]'); await waitFor(() => !ui.$$('.rq').some((q) => /kontrata-b\.pdf/.test(q.textContent) && q.querySelector('[data-action="req.approve"]')), { label: 'miratuar' });
  const c = JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 1); assert.ok(c.docs.some((d) => d.data === up.url && d.cat === 'kontrata'.replace('kontrata', 'kontrate')));
  ui.close();
});

test('detyra me provë: dritarja kërkon PDF; kolegu njoftohet me shirit dhe “Hap” e hap detyrën me dokumentin; aprovimi e mbyll dhe e ruan te klienti', async () => {
  const t = (await admin.call('POST', '/api/v2/tasks', { title: 'Largim punonjësi – Beta', clientId: 2, assignees: ['Beni', 'Administratori'], review: true, evidence: true, due: T })).json.task;
  ui = await bootApp(env.base, beni.cookie, { hash: '#/tasks' });
  const row = () => ui.$$('#tasks-body tbody tr').find((r) => r.textContent.includes('Largim punonjësi'));
  await waitFor(() => ui.$('select[name=st]'), { label: 'filtrat' }); ui.choose('select[name=st]', 'open'); await waitFor(row, { label: 'detyra' });
  assert.match(row().textContent, /kërkon provë/); ui.click(row().querySelector('[data-action="task.complete"]')); await waitFor(() => ui.$('form[data-submit="task.complete.save"]'), { label: 'dritarja' });
  ui.click('.modal button[type=submit]'); await waitFor(() => !ui.$('#proof-error').hidden, { label: 'gabim pa PDF' }); assert.match(ui.text('#proof-error'), /dokument provë/);
  ui.attach('.modal input[type=file]', 'vertetim.pdf'); ui.click('.modal button[type=submit]'); await waitFor(() => ui.toasts().some((x) => /aprovim te kolegu/.test(x)), { label: 'dërguar për aprovim' });
  ui.close();
  ui = await bootApp(env.base, admin.cookie, { hash: '#/today' }); await waitFor(() => ui.$('#bell-count'), { label: 'zilja' });
  assert.ok((await admin.call('GET', '/api/notifications')).json.items.some((n) => /kërkon aprovimin tënd/.test(n.text)));
  await ui.go('#/tasks?open=' + t.id); await waitFor(() => ui.$('.modal'), { label: 'detajet e detyrës nga lidhja' });
  assert.match(ui.text('.modal'), /Dokumente provë/); assert.ok(ui.$('.modal a[href^="/api/file"]')); assert.match(ui.text('.modal'), /vertetim\.pdf/);
  ui.click('.modal [data-cmd=approve]'); await waitFor(() => ui.toasts().some((x) => /aprovua dhe u kry/.test(x)), { label: 'aprovimi' }); await sleep(300); assert.ok(!ui.$('.modal'), 'dritarja nuk rihapet pas rifreskimit');
  const c = JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 2); assert.ok(c.docs.some((d) => d.tid === t.id && d.cat === 'prove'));
  ui.close();
});

test('klient i ri: dokumentet e administratorit dhe ortakut, afatet e certifikatës, kredencialet (admin); dosja i shfaq qartë', async () => {
  ui = await bootApp(env.base, admin.cookie, { hash: '#/clients/new' }); await waitFor(() => ui.$('#client-form'), { label: 'formulari' });
  for (const w of ['ID / pasaporta e administratorit', 'Certifikata elektronike skadon më', 'Afati i administratorit (QKB)', 'e-Albania: përdoruesi', 'e-Filing: fjalëkalimi']) assert.ok(ui.view().includes(w), w);
  ui.type('input[name=name]', 'Delta Trade'); ui.type('input[name=nipt]', 'L44444444D'); ui.type('input[name=administrator]', 'Dritan Z.');
  ui.attach('input[name=admin_file]', 'id-admin.pdf'); ui.click('[data-action="client.partner.add"]');
  ui.$('input[name=p_name]').value = 'Ortaku Një'; ui.$('input[name=p_share]').value = '100'; ui.attach('.partner-card input[type=file]', 'id-ortak.pdf');
  ui.$('input[name=certificate]').value = addDays(T, 20); ui.$('input[name=administratorDeadline]').value = addDays(T, 50);
  ui.$('input[name=s_eAlbaniaUser]').value = 'delta'; ui.$('input[name=s_eAlbaniaPassword]').value = 'S3kret!'; ui.$('input[name=s_eFilingPassword]').value = 'F1ling';
  ui.click('#client-form button[type=submit]'); await waitFor(() => ui.$('.profile-head h1')?.textContent === 'Delta Trade', { label: 'dosja' });
  const v = ui.view(); for (const w of ['Afate dhe alarme', 'Certifikata elektronike', 'Afati i administratorit', 'id-admin.pdf', 'id-ortak.pdf', 'Ortaku Një', 'Dokumentet e kërkuara', 'ID / pasaporta e administratorit dhe ortakëve']) assert.ok(v.includes(w), w);
  assert.match(ui.text('.checklist li:nth-child(4)'), /✓/, 'ID-të e plota → ✓'); assert.ok(ui.$$('.deadline').length >= 2);
  ui.click('[data-tab=secrets]'); ui.click('[data-action="client.secrets.show"]'); await waitFor(() => /S3kret!/.test(ui.text('#profile-tab')), { label: 'kredencialet' }); assert.match(ui.text('#profile-tab'), /delta/);
  ui.close();
});

test('dosja: ekipi i grupuar me etiketa të lexueshme (jo çelësa teknikë)', async () => {
  const beta = (await admin.call('GET', '/api/v2/clients')).json.clients.find((c) => c.name === 'Beta Sh.p.k.');
  ui = await bootApp(env.base, admin.cookie, { hash: `#/clients/${beta.id}` }); await waitFor(() => ui.$('.profile-head'), { label: 'dosja' });
  const t = ui.text('.resp-line'); assert.match(t, /Administratori/); assert.match(t, /Faturat e muajit/); assert.match(t, /Listëpagesa/); assert.match(t, /TVSH/); assert.doesNotMatch(ui.text('.resp-line'), /\bfat\b|\blp\b|\btvsh\b/);
  ui.close();
});
