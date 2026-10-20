import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code = fs.readFileSync(new URL('../public/alerts.js', import.meta.url), 'utf8');
function setup(role = 'admin') {
  const box = { style: {}, innerHTML: '', handlers: {}, addEventListener(t, f) { this.handlers[t] = f; } };
  const calls = [], X = { mt: [{ id: 't1', title: 'Detyra', u: 'Besa', us: ['Besa'], st: 'todo' }] }, mine = [];
  const ctx = {
    window: { XAPI: { X, E: (x) => String(x), TODAY: '2026-10-15', sv() { calls.push('sv'); } }, CRM_ME: { name: 'Besa', role: role }, xMine: (...a) => mine.push(a), xToast() {}, xOpenLink: (l) => calls.push('open:' + l) },
    document: { createElement: () => box, body: { appendChild() {} } },
    fetch: (u, o) => { calls.push('fetch:' + (o && o.body)); return Promise.resolve({ ok: true }); },
    prompt: () => 'afati i gabuar', localStorage: { getItem: () => null, setItem() {} }, clients: [{ id: 1, emriKompanise: 'ABE' }],
    Date, JSON, Object, Array, String, Math, Set,
  };
  ctx.window.window = ctx.window; vm.createContext(ctx);
  vm.runInContext(code.replace(/^\(function \(\) \{/, '(function () { var window = this.window;').replace(/\}\)\(\);\s*$/, '}).call(this);'), ctx);
  const click = (a, id) => box.handlers.click({ target: { closest: () => ({ getAttribute: (k) => (k === 'data-a' ? a : String(id)) }) } });
  return { ctx, box, calls, X, mine, click };
}
const REV = { id: 5, read: false, at: '2026-10-15T10:00:00Z', text: 'Laura ndryshoi te klienti ABE: afati i administratorit', link: JSON.stringify({ t: 'client', id: 1, rv: 1, by: 'Laura', what: 'afati i administratorit' }) };
const TSK = { id: 6, read: false, at: '2026-10-15T10:01:00Z', text: 'Ana të caktoi detyrën: Detyra', link: JSON.stringify({ t: 'task', id: 't1' }) };

test('njoftimi i ndryshimit tregon Aprovo / Kthe si detyrë; njoftimi i detyrës tregon U krye', () => {
  const s = setup(); s.ctx.window.xNotifyPush([REV, TSK]);
  assert.ok(s.box.innerHTML.includes('E aprovova') && s.box.innerHTML.includes('Kthe si detyrë') && s.box.innerHTML.includes('Shiko klientin'));
  assert.ok(s.box.innerHTML.includes('U krye') && s.box.innerHTML.includes('E kuptova'));
});
test('"Kthe si detyrë" krijon detyrë për kolegun që e bëri ndryshimin dhe e mbyll njoftimin', () => {
  const s = setup(); s.ctx.window.xNotifyPush([REV]); s.click('back', 5);
  const t = s.X.mt[s.X.mt.length - 1];
  assert.equal(t.u, 'Laura'); assert.equal(t.by, 'Besa'); assert.ok(t.title.includes('afati i administratorit') && t.desc.includes('afati i gabuar'));
  assert.ok(s.calls.includes('sv')); assert.ok(s.calls.some((c) => c.startsWith('fetch:') && c.includes('"id":5')));
  assert.ok(!s.box.innerHTML.includes('E aprovova'));
});
test('"E aprovova" njofton kolegun dhe mbyll kartën', () => {
  const s = setup(); s.ctx.window.xNotifyPush([REV]); s.click('ok', 5);
  assert.ok(s.calls.some((c) => c.includes('"say"') && c.includes('Laura') && c.includes('e aprovoi')));
  assert.equal(s.box.innerHTML.includes('Laura ndryshoi'), false);
});
test('"U krye" mbyll detyrën time; njoftimet e lexuara nuk shfaqen', () => {
  const s = setup(); s.ctx.window.xNotifyPush([TSK, { ...REV, id: 9, read: true }]); s.click('fin', 6);
  assert.equal(JSON.stringify(s.mine[0]), JSON.stringify(['t1', 'done']));
  assert.equal(s.box.innerHTML.includes('ABE'), false);
});

test('kartat e chat-it: shfaqen poshtë djathtas, "Hape bisedën" dhe "E kuptova" thërrasin chat-in', () => {
  const s = setup(), seen = [];
  s.ctx.window.xChatOpen = (c) => seen.push('open:' + c); s.ctx.window.xChatAck = (c) => seen.push('ack:' + c);
  s.ctx.window.xChatCards([{ convo: 'Besa', n: 2, from: 'Besa', text: 'Ke një minutë?' }]);
  assert.ok(s.box.innerHTML.includes('Besa') && s.box.innerHTML.includes('2 mesazhe të reja') && s.box.innerHTML.includes('Ke një minutë?') && s.box.innerHTML.includes('Hape bisedën'));
  s.click('chgo', 'Besa'); s.click('chack', 'Besa');
  assert.equal(JSON.stringify(seen), JSON.stringify(['open:Besa', 'ack:Besa']));
});

test('"Shiko klientin" te njoftimi i aprovimit nuk e mbyll kartën; "Hape" te njoftimet e zakonshme po', () => {
  const s = setup(); s.ctx.window.xNotifyPush([REV, TSK]);
  s.click('go', 5); assert.ok(s.box.innerHTML.includes('E aprovova')); assert.ok(!s.calls.some((c) => c.startsWith('fetch:') && c.includes('"id":5')));
  s.click('go', 6); assert.ok(s.calls.some((c) => c.startsWith('fetch:') && c.includes('"id":6')));
});

test('D-08: vetëm administratori sheh "E aprovova" / "Kthe si detyrë"', () => {
  const s = setup('user'); s.ctx.window.xNotifyPush([REV]);
  assert.ok(!s.box.innerHTML.includes('E aprovova') && !s.box.innerHTML.includes('Kthe si detyrë')); assert.ok(s.box.innerHTML.includes('E kuptova'));
});
