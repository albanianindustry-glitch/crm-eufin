// Moduli Detyrimet (API v2): "Sot", matrica mujore/vjetore dhe veprimet mbi detyrimet. Motori është i pastër (_v2-obligations-domain.js).
import { ApiError, mutateKey, readState, parse, isDay } from './_v2-http.js';
import { addMonths, todayTirane } from './_v2-calendar.js';
import { annualMatrix, buildObligations, defaultPeriod, monthlyMatrix, periodOptions, tvshLocked } from './_v2-obligations-domain.js';
import { toDto as taskDto } from './_v2-tasks.js';

const EMPTY_X = { mt: [], k: [], sv: [], hist: [], fat: [], set: {}, cat: [], done: {}, users: [], fu: {} };
const load = async (req) => { const s = await readState(req), x = { ...EMPTY_X, ...parse(s.data.crmX, EMPTY_X) }; return { s, x, clients: parse(s.data.crmClients, []), today: todayTirane() }; };
const num = (v) => (v === '' || v == null ? null : Number(v));

export async function today(req) {
  const { s, x, clients, today: t } = await load(req), items = buildObligations({ clients, x, today: t });
  const names = new Map(clients.map((c) => [String(c.id), c.emriKompanise]));
  const tasks = (x.mt || []).filter((q) => q.st !== 'done' && q.due && (new Date(q.due) - new Date(t)) / 864e5 <= 14).map((q) => taskDto(q, s.me, names.get(String(q.cid)) || ''));
  return { today: t, me: s.me, users: s.users, items, tasks };
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
    return outcome((await clientMutate(req, id, (c) => { c[body.field] = body.date; return c; })).store);
  }
  if (type === 'contract-renew') {
    if (!isDay(body.end)) throw new ApiError(422, 'invalid', 'Data e re është e pavlefshme.');
    const r = await mutateKey(req, 'crmX', (x) => { const k = (x.k || []).find((q) => q.id === body.id); if (!k) throw new ApiError(404, 'not_found', 'Kontrata nuk ekziston.'); return { next: { ...x, k: x.k.map((q) => (q.id === body.id ? { ...q, end: body.end } : q)) }, result: null }; }, EMPTY_X);
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
