// Moduli Miratimet (API v2). Një kërkesë kërkon miratim vetëm kur ndryshon një vlerë ekzistuese; plotësimet e para
// (fushë e zbrazët, dokument i ri) dhe zhurma automatike nuk shfaqen si kërkesa, por pastrohen me një veprim.
import { ApiError, readState, parse, decide, dismissAuto } from './_v2-http.js';
import { CLIENT_DEFAULTS, CLIENT_RESTRICTED, classifyChange, requestKind } from './_perm.js';

const emptyV = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
function show(v) {
  if (emptyV(v)) return '—';
  if (Array.isArray(v)) {
    const named = v.map((x) => (x && typeof x === 'object' ? (x.name || x.emri || x.adresa || '') + (x.perqindja != null && x.perqindja !== '' ? ` (${x.perqindja}%)` : '') : String(x))).filter(Boolean);
    return named.length ? named.join(', ') : `${v.length} elemente`;
  }
  if (typeof v === 'object') return Object.entries(v).filter(([, x]) => x).map(([k, x]) => `${k}: ${x}`).join(', ') || '—';
  return String(v);
}

// Vetëm ndryshimet që kërkojnë miratim, me vlera të lexueshme (jo JSON i papërpunuar).
export function reviewRows(r) {
  if (!r.patch) return (r.changes || []).map((c) => ({ field: c.k, from: c.from, to: c.to }));
  const patch = r.patch || {}, base = r.base || {}, defaults = r.kind === 'client' ? CLIENT_DEFAULTS : {}, out = [];
  const push = (key, o, n) => {
    const forced = (r.kind === 'contract' && key === 'pendingDoc') || (r.kind === 'client' && CLIENT_RESTRICTED.includes(key));
    const kind = forced ? (JSON.stringify(o ?? null) === JSON.stringify(n ?? null) ? 'noop' : 'restricted') : classifyChange(key, o, n, defaults);
    if (kind === 'restricted') out.push({ field: key, from: show(o), to: key === 'pendingDoc' ? (n && n.name) || 'dokument i ri' : show(n) });
  };
  for (const key of Object.keys(patch)) {
    if (key === 'fx' && patch.fx && typeof patch.fx === 'object') for (const sk of new Set([...Object.keys(base.fx || {}), ...Object.keys(patch.fx || {})])) push(`fx.${sk}`, (base.fx || {})[sk], patch.fx[sk]);
    else push(key, base[key], patch[key]);
  }
  return out;
}

const dto = (r) => ({
  id: r.id, kind: r.kind || 'client', operation: r.op || 'edit', status: r.st, requestedBy: r.by || '', requestedAt: r.at || '', clientId: r.cid ?? null, label: r.label || '',
  changes: r.st === 'pending' ? reviewRows(r) : (r.changes || []).map((c) => ({ field: c.k, from: c.from, to: c.to })), decidedBy: r.dec || '', decidedAt: r.decAt || '', reason: r.why || '',
});

export async function listApprovals(req) {
  const state = await readState(req);
  if (state.me.role !== 'admin') throw new ApiError(403, 'forbidden', 'Vetëm administratori i sheh kërkesat për miratim.');
  const all = parse(state.data.crmReq, []), pending = all.filter((r) => r.st === 'pending');
  const real = pending.filter((r) => requestKind(r) === 'real'), automatic = pending.filter((r) => requestKind(r) !== 'real');
  return {
    pending: real.map(dto).filter((r) => r.changes.length || r.operation === 'del'),
    automatic: automatic.map((r) => ({ id: r.id, kind: requestKind(r), requestedBy: r.by || '', label: r.label || '', clientId: r.cid ?? null })),
    decided: all.filter((r) => r.st !== 'pending' && !r.auto).slice(-30).reverse().map(dto), me: state.me,
  };
}
export async function decision(req, id, body) {
  if (!['approved', 'rejected'].includes(body && body.decision)) throw new ApiError(422, 'invalid', 'Vendimi duhet të jetë approved ose rejected.');
  await decide(req, id, body.decision, body.reason || '');
  return { status: body.decision };
}
// Zhurma (pa ndryshim real) pastrohet; plotësimet e para zbatohen (nuk kërkonin miratim).
export async function clearAutomatic(req) {
  const state = await readState(req);
  if (state.me.role !== 'admin') throw new ApiError(403, 'forbidden', 'Vetëm administratori.');
  const pending = parse(state.data.crmReq, []).filter((r) => r.st === 'pending');
  const free = pending.filter((r) => requestKind(r) === 'free'); let applied = 0, failed = 0;
  for (const r of free) { try { await decide(req, r.id, 'approved', 'Zbatuar automatikisht: plotësim i parë, nuk kërkon miratim'); applied += 1; } catch { failed += 1; } }
  const cleaned = (await dismissAuto(req)).dismissed || 0;
  return { applied, dismissed: cleaned, failed };
}
