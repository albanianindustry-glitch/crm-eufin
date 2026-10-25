// Aplikacioni i ri (public/app) i drejtuar si përdorues: klikime, shkrim, formularë, navigim, mbi API-n e vërtetë.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';
import { bootApp, waitFor } from '../helpers/app.mjs';

let env, admin, ana, beni, ui;
before(async () => {
  env = await startServer(0);
  admin = new Client(env.base, '10.4.0.1'); ana = new Client(env.base, '10.4.0.2'); beni = new Client(env.base, '10.4.0.3');
  await admin.login('admin@test.al', 'AdminPass12345');
  await admin.call('POST', '/api/users', { name: 'Enejd Saliaj', email: 'enejd@test.al', password: 'EnejdPass12345', role: 'accountant' });
  await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' });
  await ana.login('enejd@test.al', 'EnejdPass12345'); await beni.login('beni@test.al', 'BeniPass123456');
  const mk = (name, nipt, fee, resp, extra = {}) => admin.call('POST', '/api/v2/clients', { name, nipt, monthlyFee: fee, responsible: resp, administrator: 'Artan B.', phone: '0691112233', email: 'a@b.al', ...extra });
  await mk('Eufin Consult', 'L11111111A', 5000, 'Enejd Saliaj');
  await mk('Alfa Sh.p.k.', 'L22222222B', 12000, 'Beni', { paymentStatus: 'vonese' });
  await mk('Zeta Individ', 'K33333333C', 800, '', { kind: 'individ', status: 'inaktiv' });
  await mk('<img src=x onerror=alert(1)> Evil', 'L44444444D', 100, 'Beni');
});
after(() => { try { ui && ui.close(); } catch { /* */ } env && env.server.close(); });

test('guaska: navigimi, përdoruesi dhe faqja fillestare (Detyrat)', async () => {
  ui = await bootApp(env.base, admin.cookie);
  await waitFor(() => ui.$('#view h1'), { label: 'faqja e detyrave' });
  assert.equal(ui.$('#view h1').textContent, 'Detyrat');
  assert.match(ui.text('.nav'), /Detyrat/); assert.match(ui.text('.nav'), /Klientët/); assert.match(ui.text('.nav'), /Miratime/);
  assert.match(ui.text('.user'), /Administratori/); assert.ok(ui.$('.nav a.active'));
  ui.close();
});

test('klientët: lista, kërkimi, filtrat dhe renditja', async () => {
  ui = await bootApp(env.base, admin.cookie, { hash: '#/clients' });
  await waitFor(() => ui.$('#clients-table table'), { label: 'tabela e klientëve' });
  assert.match(ui.text('#clients-table'), /Eufin Consult/); assert.match(ui.text('#clients-table'), /Alfa/); assert.doesNotMatch(ui.text('#clients-table'), /Zeta/, 'inaktivët fshihen si default');
  ui.type('input[name=q]', 'alfa'); assert.doesNotMatch(ui.text('#clients-table'), /Eufin/); assert.match(ui.text('#clients-table'), /Alfa/);
  ui.type('input[name=q]', ''); ui.choose('select[name=status]', ''); assert.match(ui.text('#clients-table'), /Zeta/);
  ui.choose('select[name=who]', '__none'); assert.match(ui.text('#clients-table'), /Zeta/); assert.doesNotMatch(ui.text('#clients-table'), /Eufin/);
  ui.choose('select[name=who]', ''); ui.choose('select[name=pay]', 'vonese'); assert.match(ui.text('#clients-table'), /Alfa/); assert.doesNotMatch(ui.text('#clients-table'), /Eufin/);
  ui.choose('select[name=pay]', ''); ui.choose('select[name=sort]', 'fee'); assert.ok(ui.$$('#clients-table tbody tr')[0].textContent.includes('Alfa'));
  assert.match(ui.text('#clients-table'), /12\.000 Lekë/);
});

test('XSS: emri me HTML shfaqet si tekst; asnjë element i injektuar', async () => {
  assert.equal(ui.$$('#view img').length, 0); assert.match(ui.text('#clients-table'), /<img src=x onerror=alert\(1\)> Evil/);
  ui.close();
});

test('klient i ri: validimi tregon gabimin te fusha; ruajtja e vlefshme hap dosjen', async () => {
  ui = await bootApp(env.base, admin.cookie, { hash: '#/clients/new' });
  await waitFor(() => ui.$('#client-form'), { label: 'formulari' });
  ui.type('input[name=name]', 'Beta Trade'); ui.type('input[name=nipt]', 'gabim');
  ui.click('#client-form button[type=submit]');
  await waitFor(() => !ui.$('#form-error').hidden, { label: 'banner gabimi' });
  assert.match(ui.text('#form-error'), /NIPT i pavlefshëm/); assert.ok(ui.$('input[name=nipt]').closest('label').classList.contains('has-error'));
  ui.type('input[name=nipt]', 'l55555555e'); ui.type('input[name=monthlyFee]', '7500'); ui.choose('select[name=responsible]', 'Beni');
  ui.click('[data-action="client.partner.add"]'); ui.$('input[name=p_name]').value = 'Ortak Një'; ui.$('input[name=p_share]').value = '100';
  ui.click('#client-form button[type=submit]');
  await waitFor(() => /#\/clients\/\d+$/.test(ui.w.location.hash), { label: 'kalimi te dosja' });
  await waitFor(() => ui.$('.profile-head h1'), { label: 'dosja' });
  assert.equal(ui.$('.profile-head h1').textContent, 'Beta Trade'); assert.match(ui.view(), /L55555555E/); assert.match(ui.view(), /7\.500 Lekë/); assert.match(ui.view(), /Ortak Një/); assert.match(ui.view(), /Beni/);
  assert.ok(ui.toasts().some((t) => /u krijua/.test(t)));
});

test('dosja e klientit: KPI, skedat, kredencialet (vetëm admin) dhe kthimi', async () => {
  const list = (await admin.call('GET', '/api/v2/clients')).json.clients, eufin = list.find((c) => c.name === 'Eufin Consult');
  await admin.call('PUT', `/api/v2/clients/${eufin.id}/secrets`, { eAlbaniaUser: 'eufin', eAlbaniaPassword: 'Sekret#1' });
  await admin.call('POST', '/api/v2/tasks', { title: 'Përgatit bilancin', clientId: eufin.id, assignees: ['Enejd Saliaj'], due: '2026-01-05' });
  await ui.go(`#/clients/${eufin.id}`); await waitFor(() => ui.$('.profile-head h1')?.textContent === 'Eufin Consult');
  for (const w of ['Tarifa mujore', '5.000 Lekë', 'Pagesa e studios', 'Detyra të hapura', 'Të dhënat e klientit', 'Përgjegjësit dhe ortakët', 'Enejd Saliaj', 'Përgatit bilancin', 'me vonesë']) assert.ok(ui.view().includes(w), w);
  assert.ok(!ui.view().includes('Sekret#1'));
  ui.click('[data-tab=secrets]'); ui.click('[data-action="client.secrets.show"]'); await waitFor(() => /Sekret#1/.test(ui.text('#profile-tab')), { label: 'kredencialet' });
  ui.click('[data-action="client.secrets.hide"]'); assert.ok(!ui.text('#profile-tab').includes('Sekret#1'));
  ui.click('[data-tab=contracts]'); assert.match(ui.text('#profile-tab'), /Asnjë kontratë/);
  ui.click('[data-tab=history]'); ui.click('[data-tab=docs]'); assert.match(ui.text('#profile-tab'), /Asnjë dokument/);
  ui.click('.back'); await waitFor(() => ui.$('#clients-table'), { label: 'kthimi te lista' });
  ui.close();
});

let reqId;
test('kontabilisti: s\'ka kredenciale/miratime; ndryshon tarifën → kërkesë; vlerat mbeten deri në miratim', async () => {
  const eufin = (await ana.call('GET', '/api/v2/clients')).json.clients.find((c) => c.name === 'Eufin Consult');
  ui = await bootApp(env.base, ana.cookie, { hash: `#/clients/${eufin.id}/edit` });
  await waitFor(() => ui.$('#client-form'), { label: 'formulari i ndryshimit' });
  assert.match(ui.view(), /kërkon miratim/); assert.ok(!ui.text('.nav').includes('Miratime'));
  ui.type('input[name=monthlyFee]', '5100'); ui.click('#client-form button[type=submit]');
  await waitFor(() => /#\/clients\/\d+$/.test(ui.w.location.hash) && ui.$('.profile-head'), { label: 'kthimi te dosja' });
  assert.ok(ui.toasts().some((t) => /miratim/i.test(t))); assert.match(ui.view(), /5\.000 Lekë/); assert.ok(!ui.$('[data-tab=secrets]'));
  await ui.go('#/approvals'); await waitFor(() => /Nuk ke leje/.test(ui.view()), { label: 'refuzimi i faqes' });
  ui.close();
});

test('miratimi: administratori sheh etiketa të lexueshme (Tarifa mujore: 5.000 Lekë → 5.100 Lekë) dhe aprovon', async () => {
  ui = await bootApp(env.base, admin.cookie, { hash: '#/approvals' });
  await waitFor(() => ui.$('.rq'), { label: 'kërkesa' });
  const t = ui.text('.rq'); assert.match(t, /Enejd Saliaj/); assert.match(t, /Eufin Consult/); assert.match(t, /Tarifa mujore/); assert.match(t, /5\.000 Lekë/); assert.match(t, /5\.100 Lekë/); assert.doesNotMatch(t, /tarifaMujore/);
  await waitFor(() => ui.text('#badge-approvals') === '1', { label: 'badge i miratimeve' });
  ui.click('[data-action="req.approve"]'); await waitFor(() => ui.$('[data-action="dlg.ok"]'), { label: 'dialogu' }); ui.click('[data-action="dlg.ok"]');
  await waitFor(() => /Asnjë kërkesë në pritje/.test(ui.view()), { label: 'kërkesa u mbyll' });
  assert.equal((await admin.call('GET', '/api/v2/clients')).json.clients.find((c) => c.name === 'Eufin Consult').monthlyFee, 5100);
  ui.close();
});

test('refuzimi kërkon arsye dhe e shfaq te vendimet', async () => {
  const eufin = (await ana.call('GET', '/api/v2/clients')).json.clients.find((c) => c.name === 'Eufin Consult');
  const pr = await ana.call('PATCH', `/api/v2/clients/${eufin.id}`, { administrator: 'Emër i ri' }); assert.equal(pr.status, 202, JSON.stringify(pr.json));
  ui = await bootApp(env.base, admin.cookie, { hash: '#/approvals' });
  await waitFor(() => ui.$('[data-action="req.reject"]'), { label: 'butoni Refuzo' });
  ui.click('[data-action="req.reject"]'); await waitFor(() => ui.$('#dlg-input'), { label: 'dialogu i arsyes' });
  ui.$('#dlg-input').value = 'Jo tani'; ui.click('[data-action="dlg.ok"]');
  await waitFor(() => /Jo tani/.test(ui.view()), { label: 'arsyeja te vendimet' }); assert.match(ui.view(), /Refuzuar/);
  ui.close();
});

test('detyrat: krijim nga formulari, fillim, komente, mbyllje; tabela tregon përgjegjësin, kohën dhe kush e ka kryer', async () => {
  ui = await bootApp(env.base, ana.cookie, { hash: '#/tasks' });
  await waitFor(() => ui.$('#tasks-body'), { label: 'detyrat' });
  ui.click('[data-action="task.new"]'); await waitFor(() => ui.$('#task-form'), { label: 'formulari i detyrës' });
  ui.$('#task-form [name=title]').value = 'Dërgo deklaratën TVSH'; ui.choose('#task-form [name=a1]', 'Enejd Saliaj'); ui.$('#task-form [name=due]').value = '2099-01-01';
  ui.click('#task-form button[type=submit]');
  await waitFor(() => /Dërgo deklaratën TVSH/.test(ui.text('#tasks-body')), { label: 'detyra në tabelë' });
  assert.match(ui.text('#tasks-body'), /Enejd Saliaj/); assert.match(ui.text('#tasks-body'), /pret/);
  const rowOf = (title) => ui.$$('#tasks-body tbody tr').find((r) => r.textContent.includes(title));
  ui.click(rowOf('Dërgo deklaratën TVSH').querySelector('[data-cmd=start]')); await waitFor(() => /Në proces/.test(ui.text('#tasks-body')), { label: 'statusi në proces' }); assert.match(ui.text('#tasks-body'), /po zgjat/);
  ui.click(rowOf('Dërgo deklaratën TVSH').querySelector('[data-action="task.open"]')); await waitFor(() => ui.$('.modal .comment-form'), { label: 'detajet' });
  ui.$('.modal textarea[name=text]').value = 'Po e përgatis tani'; ui.click('.modal .comment-form button'); await waitFor(() => /Po e përgatis tani/.test(ui.text('.modal')), { label: 'komenti' });
  ui.click('.modal [data-action="modal.close"]');
  ui.click(rowOf('Dërgo deklaratën TVSH').querySelector('[data-cmd=complete]')); await waitFor(() => !/Dërgo deklaratën TVSH/.test(ui.text('#tasks-body')), { label: 'detyra u mbyll (filtri: të hapura)' });
  ui.choose('select[name=st]', 'done'); await waitFor(() => /Dërgo deklaratën TVSH/.test(ui.text('#tasks-body')), { label: 'te të kryerat' });
  assert.match(ui.text('#tasks-body'), /Kryer/); assert.match(ui.text('#tasks-body'), /Enejd Saliaj/); assert.match(ui.text('#tasks-body'), /kohëzgjatja e kryerjes/);
  ui.close();
});

test('detyrat e ekipit: ngarkesa sipas anëtarit; kolegu pa të drejtë nuk shfaq veprime; filtri sipas personit', async () => {
  await admin.call('POST', '/api/v2/tasks', { title: 'Detyrë për Benin', assignees: ['Beni'], due: '2026-01-01' });
  ui = await bootApp(env.base, beni.cookie, { hash: '#/tasks' });
  await waitFor(() => ui.$('select[name=st]'), { label: 'filtrat' }); ui.choose('select[name=st]', 'open');   // filtrat ruhen midis navigimeve (gjendje e modulit)
  await waitFor(() => /Detyrë për Benin/.test(ui.text('#tasks-body')), { label: 'detyra e Benit' });
  ui.click('[data-scope=team]'); await waitFor(() => /Ngarkesa sipas anëtarit/.test(ui.view()), { label: 'pamja e ekipit' });
  assert.match(ui.view(), /Enejd Saliaj/); assert.match(ui.view(), /me vonesë/);
  ui.choose('select[name=who]', 'Enejd Saliaj'); assert.doesNotMatch(ui.text('.card.flush'), /Detyrë për Benin/);
  ui.choose('select[name=who]', ''); ui.type('input[name=q]', 'benin');
  const row = ui.$$('#tasks-body tbody tr').find((r) => /Detyrë për Benin/.test(r.textContent)); assert.ok(row);
  await admin.call('POST', '/api/v2/tasks', { title: 'Detyrë e Enejdit', assignees: ['Enejd Saliaj'] });
  ui.type('input[name=q]', ''); await ui.go('#/tasks'); await ui.go('#/tasks'); ui.click('[data-scope=team]');
  await waitFor(() => /Detyrë e Enejdit/.test(ui.text('#tasks-body')), { label: 'detyra e Enejdit në ekip' });
  const other = ui.$$('#tasks-body tbody tr').find((r) => /Detyrë e Enejdit/.test(r.textContent));
  assert.equal(other.querySelectorAll('[data-action="task.cmd"]').length, 0, 'Beni s\'ka veprime mbi detyrën e Enejdit');
  ui.close();
});

test('rrugë e panjohur tregon faqe të qartë; sesioni i skaduar nuk prish aplikacionin', async () => {
  ui = await bootApp(env.base, admin.cookie, { hash: '#/nuk-ekziston' });
  await waitFor(() => /Faqja nuk u gjet/.test(ui.view()), { label: '404' });
  await assert.rejects(() => bootApp(env.base, 'sid=i-pavlefshem', { hash: '#/tasks' }), /Sesioni ka skaduar|unauthenticated|Nuk/i);
  ui.close();
});
