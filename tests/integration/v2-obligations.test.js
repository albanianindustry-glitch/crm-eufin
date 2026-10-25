// API v2 për detyrimet: "Sot", matrica, shënimi si e kryer (me kyçjen e TVSH-së dhe lejet) dhe veprimet.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../helpers/http-server.mjs';
import { Client } from '../helpers/client.mjs';
import { addMonths, addDays, todayTirane } from '../../api/_v2-calendar.js';

let env, admin, ana, beni, c1, c2;
const T = todayTirane(), PREV = (() => { const d = new Date(T + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
before(async () => {
  env = await startServer(0);
  admin = new Client(env.base, '10.5.0.1'); ana = new Client(env.base, '10.5.0.2'); beni = new Client(env.base, '10.5.0.3');
  await admin.login('admin@test.al', 'AdminPass12345');
  await admin.call('POST', '/api/users', { name: 'Ana', email: 'ana@test.al', password: 'AnaPass123456', role: 'accountant' });
  await admin.call('POST', '/api/users', { name: 'Beni', email: 'beni@test.al', password: 'BeniPass123456', role: 'accountant' });
  await ana.login('ana@test.al', 'AnaPass123456'); await beni.login('beni@test.al', 'BeniPass123456');
  const base = (id, name, nipt, extra = {}) => ({ id, emriKompanise: name, nipt, statusKlient: 'aktiv', statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim', statusPagese: 'paguan', tarifaMujore: '0', dataKontrate: '2024-01-01', docs: [], ortaket: [], adresat: [], fx: { lloji: 'biznes', forma: 'SHPK', punonjes: true, regj: '2024-01-01', resp: 'Ana' }, ...extra });
  c1 = base(1, 'ABE Sh.p.k.', 'L11111111A', { xhiroBiznes: '1700000', afatiAdministratori: addDays(T, 20) });
  c2 = base(2, 'Beta Sh.p.k.', 'L22222222B', { fx: { lloji: 'biznes', forma: 'SHPK', regj: '2024-01-01', resp: 'Beni' } });
  await admin.put('crmClients', [c1, c2], 0);
  await admin.put('crmX', { mt: [{ id: 'm1', title: 'Detyrë manuale', by: 'Administratori', u: 'Ana', us: ['Ana'], st: 'todo', due: T, cm: [] }], sv: [], k: [{ id: 'k1', cid: 1, type: 'mujor', lb: 'Kontrata e kontabilitetit', end: addDays(T, 10), st: 'a' }, { id: 'k2', cid: 2, type: 'mujor', lb: 'Kontrata Beta', end: addDays(T, 5), st: 'a' }], hist: [], fat: [], set: {}, cat: [], done: {}, users: ['Ana', 'Beni'], fu: {} }, 0);
});
after(() => env && env.server.close());
const items = async (who = admin) => (await who.call('GET', '/api/v2/obligations/today')).json;
const find = (d, key) => d.items.find((i) => i.key === key);

test('Sot: detyrimet e klientëve, përgjegjësit, kyçja e TVSH-së, xhiroja, skadimet dhe detyrat manuale', async () => {
  const r = await admin.call('GET', '/api/v2/obligations/today'); assert.equal(r.status, 200); const d = r.json;
  const tvsh = find(d, `1tvsh${PREV}`); assert.ok(tvsh, 'TVSH e muajit të kaluar'); assert.equal(tvsh.responsible, 'Ana'); assert.equal(tvsh.locked, true); assert.equal(find(d, `2tvsh${PREV}`).responsible, 'Beni');
  assert.equal(find(d, `2lp${PREV}`), undefined, 'Beta s\'ka punonjës: s\'ka listëpagesë');
  assert.ok(d.items.some((i) => i.kind === 'xhiro' && i.clientId === 1)); assert.ok(d.items.some((i) => i.category === 'expiry' && i.clientId === 1)); assert.ok(d.items.some((i) => i.category === 'contract' && i.clientId === 2));
  assert.ok(d.tasks.some((q) => q.title === 'Detyrë manuale')); assert.equal(d.today, T);
  const sorted = d.items.map((i) => i.due); assert.deepEqual(sorted, [...sorted].sort());
});

test('shënimi si e kryer: TVSH e kyçur (409), pas mbylljes së librave kalon; lejet; zhbërja', async () => {
  const key = `1tvsh${PREV}`, lib = `1lib${PREV}`;
  assert.equal((await ana.call('POST', '/api/v2/obligations/done', { key, done: true })).status, 409);
  assert.equal((await beni.call('POST', '/api/v2/obligations/done', { key: lib, done: true })).status, 403, 'Beni s\'është përgjegjës i ABE');
  assert.equal((await ana.call('POST', '/api/v2/obligations/done', { key: lib, done: true })).status, 200);
  const d = await items(ana); assert.equal(find(d, lib), undefined); assert.equal(find(d, key).locked, false); assert.match(find(d, key).note, /Deklarim dhe pagesë/);
  assert.equal((await ana.call('POST', '/api/v2/obligations/done', { key, done: true })).status, 200);
  assert.equal(find(await items(admin), key), undefined);
  const x = JSON.parse((await admin.boot()).data.crmX.value); assert.equal(x.done[key].by, 'Ana'); assert.ok(x.done[key].at);
  assert.equal((await ana.call('POST', '/api/v2/obligations/done', { key, done: false })).status, 200); assert.ok(find(await items(admin), key));
  assert.equal((await admin.call('POST', '/api/v2/obligations/done', { key: '999zzz2026-01', done: true })).status, 404);
  assert.equal((await admin.call('POST', '/api/v2/obligations/done', { key: '../x', done: true })).status, 422);
});

test('matrica mujore dhe vjetore: periudha, qeliza, plani; periudhë e pavlefshme → default', async () => {
  const m = (await admin.call('GET', `/api/v2/obligations/monthly?period=${PREV}`)).json;
  assert.equal(m.period, PREV); assert.equal(m.rows.length, 2); assert.equal(m.types.length, 7); assert.equal(m.periods.length, 12);
  const row1 = m.rows.find((r) => r.clientId === 1), lp = m.types.findIndex((t) => t.kind === 'lp'); assert.equal(row1.cells[lp].applicable, true); assert.equal(m.rows.find((r) => r.clientId === 2).cells[lp].applicable, false);
  assert.ok(m.plan.find((p) => p.kind === 'lib').done >= 1); assert.equal((await admin.call('GET', '/api/v2/obligations/monthly?period=jo-periudhe')).json.period, PREV);
  const a = (await admin.call('GET', '/api/v2/obligations/annual')).json; assert.equal(a.rows.length, 2); assert.ok(a.year >= Number(T.slice(0, 4))); assert.equal(a.rows[0].fit.applicable, true);
});

test('veprimet: xhiroja (kalimi i kufirit), njoftimi, paraprakisht, rinovimi i afatit, kontrata dhe ndjekja', async () => {
  assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'turnover', clientId: 1, value: 2500000 })).json.status, 'saved');
  let c = JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 1); assert.equal(c.xhiroBiznes, '2500000'); assert.equal(c.fx.xhiroAt, T); assert.equal(c.fx.xhCross, 2000000);
  assert.ok(find(await items(), '1xhx2000000'), 'kalimi i kufirit kërkon rivlerësim');
  assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'turnover', clientId: 1, value: -5 })).status, 422);
  await admin.call('POST', '/api/v2/obligations/action', { type: 'notified', clientId: 1 }); await admin.call('POST', '/api/v2/obligations/action', { type: 'prepaid', clientId: 1 });
  c = JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 1); assert.equal(c.fx.xhNotified, T); assert.equal(c.payPrepaid, true);
  const newDate = addMonths(c.afatiAdministratori, 12); assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'renew', clientId: 1, field: 'afatiAdministratori', date: newDate })).json.status, 'saved');
  assert.ok(!(await items()).items.some((i) => i.category === 'expiry' && i.clientId === 1)); assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'renew', clientId: 1, field: 'nipt', date: newDate })).status, 422);
  assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'contract-renew', id: 'k1', end: addMonths(T, 12) })).json.status, 'saved'); assert.ok(!(await items()).items.some((i) => i.category === 'contract' && i.clientId === 1));
  const forb = await ana.call('POST', '/api/v2/obligations/action', { type: 'contract-expire', id: 'k2' }); assert.equal(forb.status, 403);
  const exp = await admin.call('POST', '/api/v2/obligations/action', { type: 'contract-expire', id: 'k2' }); assert.equal(exp.json.inactivated, true);
  const boot = await admin.boot(), c2n = JSON.parse(boot.data.crmClients.value).find((q) => q.id === 2), x = JSON.parse(boot.data.crmX.value);
  assert.equal(c2n.statusKlient, 'inaktiv'); assert.equal(x.k.find((k) => k.id === 'k2').st, 'e'); assert.equal(x.fu[2], addMonths(T, 12));
  assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'followup', clientId: 2, option: 2 })).json.status, 'saved');
  assert.equal(JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 2).statusKlient, 'aktiv'); assert.equal(JSON.parse((await admin.boot()).data.crmX.value).fu[2], undefined);
  assert.equal((await admin.call('POST', '/api/v2/obligations/action', { type: 'zzz' })).status, 422);
});

test('kontabilisti: ndryshimi i xhirosë ekzistuese kërkon miratim (nuk ruhet drejtpërdrejt)', async () => {
  const before = JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 1).xhiroBiznes;
  const r = await ana.call('POST', '/api/v2/obligations/action', { type: 'turnover', clientId: 1, value: 3100000 }); assert.equal(r.json.status, 'pending_approval');
  assert.equal(JSON.parse((await admin.boot()).data.crmClients.value).find((q) => q.id === 1).xhiroBiznes, before);
});
