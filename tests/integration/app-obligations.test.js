// "Sot" dhe "Detyrimet" në ndërfaqen e re, të drejtuara me klikime të vërteta mbi API-n e vërtetë.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';
import { bootApp, waitFor } from '../helpers/app.mjs';
import { MONTHS, todayTirane } from '../../api/_v2-calendar.js';

let env, admin, ana, ui;
const T = todayTirane(), PREV = (() => { const d = new Date(T + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
before(async () => {
  env = await startServer(0);
  admin = new Client(env.base, '10.6.0.1'); ana = new Client(env.base, '10.6.0.2');
  await admin.login('admin@test.al', 'AdminPass12345');
  await admin.call('POST', '/api/users', { name: 'Ana', email: 'ana@test.al', password: 'AnaPass123456', role: 'accountant' });
  await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' });
  await ana.login('ana@test.al', 'AnaPass123456');
  const base = (id, name, nipt, resp, extra = {}) => ({ id, emriKompanise: name, nipt, statusKlient: 'aktiv', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', statusPagese: 'paguan', tarifaMujore: '0', dataKontrate: '2024-01-01', docs: [], ortaket: [], adresat: [], fx: { lloji: 'biznes', forma: 'SHPK', punonjes: true, regj: '2024-01-01', resp }, ...extra });
  await admin.put('crmClients', [base(1, 'ABE Sh.p.k.', 'L11111111A', 'Ana', { xhiroBiznes: '1700000' }), base(2, 'Beta Sh.p.k.', 'L22222222B', 'Beni')], 0);
  await admin.put('crmX', { mt: [], sv: [], k: [], hist: [], fat: [], set: {}, cat: [], done: {}, users: ['Ana', 'Beni'], fu: {} }, 0);
});
after(() => { try { ui && ui.close(); } catch { /* */ } env && env.server.close(); });

test('Sot: përmbledhja, detyrimet me përgjegjës, filtri "Të miat" dhe badge në menu', async () => {
  ui = await bootApp(env.base, ana.cookie, { hash: '#/today' });
  await waitFor(() => ui.$('#today-body .ob'), { label: 'detyrimet' });
  assert.equal(ui.$('#view h1').textContent, 'Sot'); assert.match(ui.text('#today-body'), /ABE Sh\.p\.k\./); assert.match(ui.text('.summary'), /Përmbledhje/);
  assert.ok(!ui.text('#today-body').includes('Beta Sh.p.k.'), 'kontabilisti sheh vetëm detyrimet e veta'); assert.ok(!ui.$('select[name=who]'), 'pa filtër personash për kontabilistin'); assert.match(ui.text('#view'), /Detyrat → Ekipi/);
  assert.match(ui.text('#today-body'), /Së pari mbyll librat/);
  await waitFor(() => !ui.$('#badge-today').hidden, { label: 'badge Sot' }); assert.ok(Number(ui.text('#badge-today')) > 0);
});

const PL = `${MONTHS[Number(PREV.slice(5, 7)) - 1]} ${PREV.slice(0, 4)}`;
test('Sot: TVSH e kyçur jep mesazh të qartë; mbyllja e librave e zhbllokon; pastaj kalon', async () => {
  const card = (re) => ui.$$('#today-body .ob').find((c) => re.test(c.textContent));
  ui.click(card(new RegExp(`ABE.*TVSH – ${PL}`)).querySelector('[data-action="ob.act"]'));
  await waitFor(() => ui.toasts().some((t) => /Së pari mbyll librat/.test(t)), { label: 'toast i kyçjes' });
  const lib = new RegExp(`ABE.*Librat e blerjeve dhe shitjeve – ${PL}`), tv = new RegExp(`ABE.*TVSH – ${PL}`);
  ui.click(card(lib).querySelector('[data-action="ob.act"]'));
  await waitFor(() => !card(lib), { label: 'libri u mbyll' });
  assert.ok(!/Së pari mbyll librat/.test(card(tv).textContent));
  ui.click(card(tv).querySelector('[data-action="ob.act"]'));
  await waitFor(() => !card(tv), { label: 'TVSH u mbyll' });
  const x = JSON.parse((await admin.boot()).data.crmX.value); assert.ok(Object.keys(x.done).some((k) => k.startsWith('1tvsh') && x.done[k].by === 'Ana'));
});

test('Sot: xhiroja afër kufirit – kontabilisti dërgon ndryshimin për miratim, jo drejtpërdrejt', async () => {
  const card = () => ui.$$('#today-body .ob').find((c) => /Xhiroja po i afrohet/.test(c.textContent));
  await waitFor(card, { label: 'karta e xhirosë' });
  const input = card().querySelector('input[type=number]'); input.value = '1900000';
  ui.click(card().querySelector('[data-cmd], [data-action="ob.act"]'));
  await waitFor(() => ui.toasts().some((t) => /miratim/i.test(t)), { label: 'toast i miratimit' });
  assert.equal(JSON.parse((await admin.boot()).data.crmClients.value).find((c) => c.id === 1).xhiroBiznes, '1700000');
  ui.close();
});

test('Detyrimet: matrica mujore – qelizat ndryshojnë gjendje, periudha ndërrohet, plani dhe pagesat; skeda Vjetore', async () => {
  ui = await bootApp(env.base, ana.cookie, { hash: '#/obligations' });
  await waitFor(() => ui.$('table.matrix'), { label: 'matrica' });
  assert.match(ui.view(), /Plani i muajit/); assert.match(ui.text('table.matrix thead'), /Listëpagesa/); assert.match(ui.text('table.matrix tbody'), /ABE Sh\.p\.k\./);
  const btn = () => [...ui.$$('table.matrix tbody tr')].find((r) => r.textContent.includes('ABE')).querySelectorAll('.cellbtn')[1];   // Listëpagesa
  assert.ok(!btn().classList.contains('done')); ui.click(btn());
  await waitFor(() => btn().classList.contains('done'), { label: 'qeliza e kryer' }); assert.equal(btn().textContent, '✓');
  ui.click(btn()); await waitFor(() => !btn().classList.contains('done'), { label: 'zhbërja' });
  const select = ui.$('select[name=period]'), other = [...select.options].map((o) => o.value).find((v) => v !== select.value);
  ui.choose('select[name=period]', other); await waitFor(() => ui.$('select[name=period]').value === other, { label: 'periudha e re' });
  ui.click('[data-tab=annual]'); await waitFor(() => /Deklarime vjetore/.test(ui.view()), { label: 'skeda vjetore' }); assert.match(ui.view(), /Tatim fitimi/); assert.match(ui.view(), /DIVA\/DVAP/);
  const fit = ui.$('table.matrix tbody .cellbtn'); ui.click(fit); await waitFor(() => ui.$('table.matrix tbody .cellbtn').classList.contains('done'), { label: 'tatim fitimi i kryer' });
  ui.close();
});

test('administratori e përditëson xhiron dhe ruhet menjëherë', async () => {
  const list = await admin.list('crmClients'); list.find((c) => c.id === 2).xhiroBiznes = '1800000'; assert.equal((await admin.put('crmClients', list, await admin.version('crmClients'))).status, 200);
  ui = await bootApp(env.base, admin.cookie, { hash: '#/today' });
  await waitFor(() => ui.$('select[name=who]'), { label: 'filtrat' }); ui.choose('select[name=who]', '');
  const card = () => ui.$$('#today-body .ob').find((c) => /Xhiroja po i afrohet/.test(c.textContent));
  await waitFor(card, { label: 'karta e xhirosë' }); card().querySelector('input[type=number]').value = '1950000'; ui.click(card().querySelector('[data-action="ob.act"]'));
  await waitFor(() => ui.toasts().some((t) => /U ruajt/.test(t)), { label: 'toast i ruajtjes' });
  assert.equal(JSON.parse((await admin.boot()).data.crmClients.value).find((c) => c.id === 2).xhiroBiznes, '1950000'); ui.close();
});

test('XSS: emri i klientit me HTML nuk injekton asgjë te Sot, Detyrimet, Klientët', async () => {
  const list = await admin.list('crmClients'); list.find((c) => c.id === 2).emriKompanise = '<img src=x onerror=alert(1)> Evil'; assert.equal((await admin.put('crmClients', list, await admin.version('crmClients'))).status, 200);
  ui = await bootApp(env.base, admin.cookie, { hash: '#/today' });
  await waitFor(() => ui.$('select[name=who]'), { label: 'Sot' }); ui.choose('select[name=who]', '');
  for (const h of ['#/today', '#/obligations', '#/clients', '#/tasks']) { await ui.go(h); await waitFor(() => ui.$('#view h1'), { label: h }); await new Promise((r) => setTimeout(r, 200)); assert.equal(ui.$$('#view img').length, 0, h); }
  await ui.go('#/obligations'); await waitFor(() => /Evil/.test(ui.text('table.matrix')), { label: 'teksti i shfaqur si tekst' }); ui.close();
});
