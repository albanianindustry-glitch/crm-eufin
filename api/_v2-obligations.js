// Moduli Detyrimet (API v2): "Sot", matrica mujore/vjetore dhe veprimet mbi detyrimet. Motori është i pastër (_v2-obligations-domain.js).
import { ApiError, mutateKey, readState, parse, isDay } from './_v2-http.js';
import { addMonths, todayTirane } from './_v2-calendar.js';
import { annualMatrix, buildObligations, defaultPeriod, monthlyMatrix, periodOptions, tvshLocked } from './_v2-obligations-domain.js';
import { toDto as taskDto } from './_v2-tasks.js';

const EMPTY_X = { mt: [], k: [], sv: [], hist: [], fat: [], set: {}, cat: [], done: {}, users: [], fu: {} };
const load = async (req) => { const s = await readState(req), x = { ...EMPTY_X, ...parse(s.data.crmX, EMPTY_X) }; return { s, x, clients: parse(s.data.crmClients, []), today: todayTirane() }; };
const cleanDoc = (d, required) => {
  if (!d && !required) return null;
  const url = String((d && d.url) || ''), name = String((d && d.name) || '').trim().slice(0, 150);
  if (!/^\/api\/file\?id=[A-Za-z0-9-]{8,64}$/.test(url) || !name) throw new ApiError(422, 'invalid', 'Bashkëlidh dokumentin (PDF) që provon punën e kryer.');
  return { url, name };
};
const docId = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
async function attachClientDoc(req, clientId, doc, extra = {}) {
  await mutateKey(req, 'crmClients', (list, state) => {
    const i = list.findIndex((c) => String(c.id) === String(clientId)); if (i < 0) throw new ApiError(404, 'not_found', 'Klienti nuk ekziston.');
    const entry = { id: docId(), name: doc.name, data: doc.url, at: new Date().toISOString().slice(0, 10), by: state.me.name, ...extra };
    const next = list.slice(); next[i] = { ...list[i], docs: [...(list[i].docs || []), entry] }; return { next, result: entry.id };
  }, []);
}
const num = (v) => (v === '' || v == null ? null : Number(v));

export async function today(req) {
  const { s, x, clients, today: t } = await load(req), admin = s.me.role === 'admin';
  const all = buildObligations({ clients, x, today: t }), names = new Map(clients.map((c) => [String(c.id), c.emriKompanise]));
  // Kontabilisti sheh vetëm detyrimet ku ai është përgjegjës; admini i sheh të gjitha (edhe ato pa përgjegjës). Ekipi: te /obligations/team dhe te Detyrat.
  const items = admin ? all : all.filter((i) => i.responsible === s.me.name);
  const mineTask = (q) => (q.us && q.us.length ? q.us : q.u ? [q.u] : []).includes(s.me.name) || (!(q.us && q.us.length) && !q.u && q.by === s.me.name);
  const tasks = (x.mt || []).filter((q) => q.st !== 'done' && q.due && (new Date(q.due) - new Date(t)) / 864e5 <= 14 && (admin || mineTask(q))).map((q) => taskDto(q, s.me, names.get(String(q.cid)) || ''));
  return { today: t, me: s.me, users: s.users, items, tasks, scope: admin ? 'all' : 'mine' };
}
// Pamja e ekipit: ngarkesa e detyrimeve sipas anëtarit (e hapur për të gjithë, si detyrat e ekipit).
export async function team(req) {
  const { s, x, clients, today: t } = await load(req), all = buildObligations({ clients, x, today: t });
  const people = [...new Set([...s.users, ...all.map((i) => i.responsible).filter(Boolean)])].map((name) => {
    const mine = all.filter((i) => i.responsible === name);
    return { name, open: mine.length, late: mine.filter((i) => i.late).length, soon: mine.filter((i) => !i.late && i.daysLeft <= 3).length, next: mine.slice(0, 5).map((i) => ({ title: i.title, clientId: i.clientId, clientName: i.clientName, due: i.due, late: i.late })) };
  });
  const orphan = all.filter((i) => !i.responsible);
  return { today: t, people, unassigned: { open: orphan.length, late: orphan.filter((i) => i.late).length, next: orphan.slice(0, 5).map((i) => ({ title: i.title, clientId: i.clientId, clientName: i.clientName, due: i.due, late: i.late })) } };
}
export async function monthly(req, query) {
  const { x, clients, today: t } = await load(req), period = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.period || '') ? query.period : defaultPeriod(t);
  return { today: t, periods: periodOptions(t), ...monthlyMatrix({ clients, x, today: t, period }) };
}
export async function annual(req) { const { x, clients, today: t } = await load(req); return { today: t, ...annualMatrix({ clients, x, today: t }) }; }

export async function setDone(req, body) {
  const key = String((body && body.key) || ''), done = !!(body && body.done);
  if (!/^\d+[A-Za-z0-9_-]{1,70}$/.test(key)) throw new ApiError(422, 'invalid', 'Çelës i pavlefshëm i detyrimit.');
  const { clients } = await load(req); if (!clients.some((c) => key.startsWith(String(c.id)))) throw new ApiError(404, 'not_found', 'Detyrimi nuk i përket asnjë klienti.');
  await mutateKey(req, 'crmX', (x, state) => {
    const cur = { ...EMPTY_X, ...x };
    if (done && tvshLocked(key, cur)) throw new ApiError(409, 'locked', 'Së pari mbyll librat e blerjeve dhe shitjeve për këtë periudhë, pastaj deklaro TVSH-në.');
    const d = { ...(cur.done || {}) }; if (done) d[key] = { by: state.me.name, at: new Date().toISOString() }; else delete d[key];
    return { next: { ...cur, done: d }, result: null };
  }, EMPTY_X);
  return { status: done ? 'done' : 'undone', key };
}

const clientMutate = (req, id, change) => mutateKey(req, 'crmClients', (list) => {
  const i = list.findIndex((c) => String(c.id) === String(id)); if (i < 0) throw new ApiError(404, 'not_found', 'Klienti nuk ekziston.');
  const next = list.slice(); next[i] = change({ ...list[i], fx: { ...(list[i].fx || {}) } }); return { next, result: null };
}, []);
const outcome = (store) => (store && store.requests ? { status: 'pending_approval', requests: store.requests } : { status: 'saved' });

export async function action(req, body) {
  const t = todayTirane(), type = body && body.type, id = body && body.clientId;
  if (type === 'turnover') {
    const value = Number(body.value); if (!Number.isFinite(value) || value < 0 || value > 1e11) throw new ApiError(422, 'invalid', 'Xhiroja e pavlefshme.');
    const { x } = await load(req), lm = ((x.set || {}).brk || []).map((r) => Number(r[1])).filter(Boolean), limits = (lm.length ? lm : [2000000, 8000000, 14000000]).sort((a, b) => a - b);
    const r = await clientMutate(req, id, (c) => { const old = Number(c.xhiroBiznes) || 0, ol = limits.filter((l) => l <= old).pop() || 0, nl = limits.filter((l) => l <= value).pop() || 0; c.xhiroBiznes = String(value); c.fx.xhiroAt = t; if (nl > ol) c.fx.xhCross = nl; return c; });
    return outcome(r.store);
  }
  if (type === 'notified') return outcome((await clientMutate(req, id, (c) => { c.fx.xhNotified = t; return c; })).store);
  if (type === 'prepaid') return outcome((await clientMutate(req, id, (c) => { c.payPrepaid = true; return c; })).store);
  if (type === 'renew') {
    if (!['afatiAdministratori', 'certifikataElektronike'].includes(body.field) || !isDay(body.date)) throw new ApiError(422, 'invalid', 'Fushë ose datë e pavlefshme.');
    const doc = cleanDoc(body.document, false);   // opsionale këtu, por e rekomanduar (certifikata e re / ekstrakti i QKB)
    const r = await clientMutate(req, id, (c) => { c[body.field] = body.date; return c; });
    if (doc) await attachClientDoc(req, id, doc, { cat: body.field === 'certifikataElektronike' ? 'cert' : 'qkb', note: 'Provë për rinovimin e afatit' });
    return outcome(r.store);
  }
  if (type === 'contract-renew') {
    if (!isDay(body.end)) throw new ApiError(422, 'invalid', 'Data e re e mbarimit është e pavlefshme.');
    const doc = cleanDoc(body.document, true);   // kontrata e rinovuar është e detyrueshme
    const s0 = await readState(req), admin = s0.me.role === 'admin';
    let cid = null, contractLabel = '';
    const r = await mutateKey(req, 'crmX', (x) => {
      const k = (x.k || []).find((q) => q.id === body.id); if (!k) throw new ApiError(404, 'not_found', 'Kontrata nuk ekziston.');
      cid = k.cid; contractLabel = k.lb || k.type;
      // Kontabilisti: ndryshimi i mbarimit + PDF-ja e re kalojnë si kërkesë miratimi (admini e lexon dokumentin para vendimit).
      const upd = admin ? { ...k, end: body.end } : { ...k, end: body.end, pendingDoc: { name: doc.name, data: doc.url } };
      return { next: { ...x, k: x.k.map((q) => (q.id === body.id ? upd : q)) }, result: null };
    }, EMPTY_X);
    if (admin) {   // admini e miraton vetvetiu: dokumenti ruhet te klienti si provë dhe lidhet me kontratën
      const entryId = docId();
      await mutateKey(req, 'crmClients', (list) => { const i = list.findIndex((c) => String(c.id) === String(cid)); if (i < 0) return { next: list, result: null }; const next = list.slice(); next[i] = { ...list[i], docs: [...(list[i].docs || []), { id: entryId, kid: body.id, cat: 'kontrate', name: doc.name, data: doc.url, at: t, by: s0.me.name, note: 'Rinovim kontrate' }] }; return { next, result: null }; }, []);
      await mutateKey(req, 'crmX', (x) => ({ next: { ...x, k: x.k.map((q) => (q.id === body.id ? { ...q, doc: entryId } : q)), hist: [...(x.hist || []), { id: entryId, at: new Date().toISOString(), by: s0.me.name, cid, t: `Kontratë e rinovuar deri më ${body.end}: ${contractLabel}` }] }, result: null }), EMPTY_X);
      return { status: 'saved' };
    }
    return outcome(r.store);
  }
  if (type === 'contract-expire') {
    const s = await readState(req); if (s.me.role !== 'admin') throw new ApiError(403, 'forbidden', 'Vetëm administratori e shënon kontratën si të pa-rinovuar (ajo mund ta çaktivizojë klientin).');
    let cid = null, inactivate = false;
    await mutateKey(req, 'crmX', (x) => {
      const k = (x.k || []).find((q) => q.id === body.id); if (!k) throw new ApiError(404, 'not_found', 'Kontrata nuk ekziston.');
      cid = k.cid; const kk = x.k.map((q) => (q.id === body.id ? { ...q, st: 'e' } : q));
      inactivate = k.type !== 'qera' && !kk.some((q) => String(q.cid) === String(k.cid) && q.id !== body.id && q.type !== 'qera' && q.st === 'a');
      return { next: { ...x, k: kk, fu: inactivate ? { ...(x.fu || {}), [k.cid]: addMonths(t, 12) } : (x.fu || {}) }, result: null };
    }, EMPTY_X);
    if (inactivate) await clientMutate(req, cid, (c) => { c.statusKlient = 'inaktiv'; return c; });
    return { status: 'saved', inactivated: inactivate };
  }
  if (type === 'followup') {
    const option = Number(body.option); if (![1, 2, 3].includes(option)) throw new ApiError(422, 'invalid', 'Opsion i pavlefshëm.');
    if (option === 2) { const r = await clientMutate(req, id, (c) => { c.statusKlient = 'aktiv'; return c; }); if (r.store && r.store.requests) return outcome(r.store); }
    await mutateKey(req, 'crmX', (x) => { const fu = { ...(x.fu || {}) }; if (option === 1) fu[id] = addMonths(t, 12); else delete fu[id]; return { next: { ...EMPTY_X, ...x, fu }, result: null }; }, EMPTY_X);
    return { status: 'saved' };
  }
  throw new ApiError(422, 'invalid', 'Veprim i panjohur.');
}
