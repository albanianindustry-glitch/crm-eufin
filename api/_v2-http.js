// Shtresa e përbashkët e API v2: ndërtuar mbi rregullat e provuara të /api/store (leje, miratime, bashkim, auditim, njoftime).
import storeHandler from './store.js';
import bootstrapHandler from './bootstrap.js';

export class ApiError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

const fakeRes = () => ({
  statusCode: 200, headers: {}, body: undefined,
  setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; }, send(o) { this.body = o; return this; },
});

async function invoke(handler, req, { method, url, body, query = {} }) {
  const res = fakeRes();
  await handler({ method, url, body, query, headers: { ...req.headers, 'x-requested-with': 'crm' }, socket: req.socket }, res);
  return res;
}

const CODES = { 400: 'invalid', 401: 'unauthenticated', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 422: 'invalid', 429: 'rate_limited' };
export function fromStore(res) {
  const b = res.body && typeof res.body === 'object' ? res.body : {};
  const message = b.message || (b.error && !['perm', 'conflict'].includes(b.error) ? b.error : '') ||
    (res.statusCode === 409 ? 'Të dhënat u ndryshuan nga dikush tjetër. Rifresko dhe provo përsëri.' : res.statusCode === 403 ? 'Nuk ke të drejtë për këtë veprim.' : 'Veprimi nuk u krye.');
  return new ApiError(res.statusCode, CODES[res.statusCode] || 'error', message);
}

export async function readState(req) {
  const res = await invoke(bootstrapHandler, req, { method: 'GET', url: '/api/bootstrap' });
  if (res.statusCode !== 200) throw fromStore(res);
  return res.body;
}

export const parse = (row, fallback) => { try { return row && row.value ? JSON.parse(row.value) : fallback; } catch { return fallback; } };

// Ndryshim i një çelësi (p.sh. klientët) në nivel rreshti: lexon, zbaton `build`, ruan me version dhe bashkim (base).
// `build(current, state)` kthen { next, result }. Rirrjedh deri 3 herë kur dikush tjetër ruan njëkohësisht.
export async function mutateKey(req, key, build, fallback) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await readState(req), row = (state.data || {})[key];
    const current = parse(row, fallback), { next, result } = build(JSON.parse(JSON.stringify(current)), state);
    const body = { key, value: JSON.stringify(next), version: row ? row.version : 0 };
    if (row && row.value) body.base = row.value;
    const res = await invoke(storeHandler, req, { method: 'PUT', url: '/api/store', body });
    if (res.statusCode === 409 && res.body && res.body.error === 'conflict' && attempt < 2) { last = res; continue; }
    if (res.statusCode >= 400) throw fromStore(res);
    return { result, store: res.body || {}, state };
  }
  throw fromStore(last);
}

export async function decide(req, id, decision, reason = '') {
  const res = await invoke(storeHandler, req, { method: 'PUT', url: '/api/store', body: { key: 'crmReq', action: { id, decision, reason } } });
  if (res.statusCode >= 400) throw fromStore(res);
  return res.body || {};
}

export async function dismissAuto(req) {
  const res = await invoke(storeHandler, req, { method: 'PUT', url: '/api/store', body: { key: 'crmReq', action: { decision: 'dismiss_auto' } } });
  if (res.statusCode >= 400) throw fromStore(res);
  return res.body || {};
}

export const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T00:00:00Z').getTime());
export const pick = (o, keys) => Object.fromEntries(keys.filter((k) => Object.prototype.hasOwnProperty.call(o || {}, k)).map((k) => [k, o[k]]));
