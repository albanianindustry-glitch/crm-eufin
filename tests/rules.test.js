import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
// Këto teste ekzekutojnë kodin e vërtetë të index.html dhe services.js, jo kopje të tij.
const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const svc = fs.readFileSync(new URL('../public/services.js', import.meta.url), 'utf8');
const MN = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'];
const P = (n) => (n < 10 ? '0' : '') + n;

test('Përfaqësues tatimor ka vetëm TVSH; klienti i zakonshëm mbetet i pandryshuar', () => {
  const src = html.match(/const tr=c=>[^\n]*\nconst ok=[^\n]*/)[0];
  const { ok } = new Function('fx', 'rents', src + ';return {ok}')((c) => c.fx || {}, () => []);
  const rep = { fx: { forma: 'Përfaqësues tatimor', lloji: 'biznes', punonjes: true, magazine: true, qera: true }, statusTVSH: 'pa_tvsh' };
  for (const f of ['fat', 'lp', 'f5', 'lib', 'mag', 'qera', 'punonjes', 'magazine', '']) assert.equal(ok(rep, f), false, f);
  assert.equal(ok(rep, 'tvsh'), true);
  const norm = { fx: { forma: 'SHPK', lloji: 'biznes', punonjes: true }, statusTVSH: 'me_tvsh' };
  assert.equal(ok(norm, 'tvsh'), true); assert.equal(ok(norm, 'punonjes'), true); assert.equal(ok(norm, ''), true);
});

test('detyrim i ri mujor: "Kontribute GUSHT 2026" -> emër bazë + fillim 2026-08', () => {
  const blk = html.match(/let nm=n,from='';[^\n]*?\}\}const c=/)[0].replace(/const c=$/, '');
  const r = new Function('n', 'f', 'MN', 'Y', 'P', blk + ';return {nm,from}')('Kontribute GUSHT 2026', 'm', MN, 2026, P);
  assert.deepEqual(r, { nm: 'Kontribute', from: '2026-08' });
});

function sandbox(extra = {}) {
  const els = {}, el = (id) => (els[id] = els[id] || { value: '', style: {}, parentNode: { style: {} }, appendChild() {}, insertAdjacentElement() {}, insertAdjacentHTML() {}, setAttribute() {}, addEventListener() {}, click() {} });
  let csv = '';
  const X = { mt: [] }, ctx = {
    window: { XAPI: { X, E: (x) => x, sec: (a, b) => b, TODAY: '2026-10-14', MN, sv() {} }, CRM_ME: { name: 'Ana', role: 'admin' }, switchTab() {} },
    document: { querySelector: () => el('q'), createElement: () => el('c'), getElementById: el }, els, X, Blob: class { constructor(p) { csv = p.join(''); } }, URL: { createObjectURL: () => 'x' },
    clients: [{ id: 7, nipt: 'L1', emriKompanise: 'ABE' }], alert() {}, confirm: () => true, Date, Math, String, JSON, Array, setTimeout, ...extra,
  };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(svc.replace(/^\(function \(\) \{/, '(function () {var window=this.window;').replace(/\}\)\(\);\s*$/, '}).call(this);'), ctx);
  return { ctx, X, els, csv: () => csv };
}

test('eksport TVSH: një rresht për muaj, kredia e bartur në kolonën e fundit', () => {
  const s = sandbox({ deklarimeTVSH: [{ nipt: 'L1', viti: '2026', muaji: 'Shtator', tvshPerTuPaguar: -50 }, { nipt: 'L1', viti: '2026', muaji: 'Gusht', tvshPerTuPaguar: -300 }, { nipt: 'L1', viti: '2026', muaji: 'Tetor', tvshPerTuPaguar: 400 }] });
  s.ctx.window.xTvshRows();
  const rows = s.csv().replace('\ufeff', '').split('\r\n'), last = (r) => r.split(';').slice(-2);
  assert.equal(rows.length, 4);
  assert.ok(rows[1].includes('"Gusht"') && rows[2].includes('"Shtator"') && rows[3].includes('"Tetor"'));
  assert.deepEqual([last(rows[1])[1], last(rows[2])[1], last(rows[3])[0], last(rows[3])[1]], ['300,00', '350,00', '50,00', '0,00']);
});

test('shërbimi i veçantë krijon detyrë të lidhur për përgjegjësin (njoftim, "Detyrat e mia", kohë), fshirja i heq të dyja', () => {
  const s = sandbox(), set = (k, v) => { s.els[k] = Object.assign(s.els[k] || { style: {}, parentNode: { style: {} } }, { value: v }); };
  Object.entries({ sv_c: '7', sv_t: 'PASH', sv_x: 'Kërkesë', sv_u: 'Besa', sv_d: '2026-10-20', sv_b: 'inv', sv_a: '15000' }).forEach(([k, v]) => set(k, v));
  s.ctx.window.xSvAdd();
  assert.equal(s.X.sv.length, 1); assert.equal(s.X.mt.length, 1);
  const t = s.X.mt[0], v = s.X.sv[0];
  assert.equal(JSON.stringify([t.u, t.us, t.by, t.sid, v.tid]), JSON.stringify(['Besa', ['Besa'], 'Ana', v.id, t.id]));
  assert.ok(t.title.includes('PASH') && t.title.includes('ABE') && t.at);
  assert.equal(v.invd, false); assert.equal(v.bill, 'inv');
  s.ctx.window.xSvDel(v.id);
  assert.equal(s.X.sv.length + s.X.mt.length, 0);
});
