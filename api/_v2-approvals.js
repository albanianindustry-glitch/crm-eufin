// Moduli Miratimet (API v2).
import { ApiError, readState, parse, decide, dismissAuto } from './_v2-http.js';
import { isAutoDefaultRequest } from './_perm.js';

const dto = (r) => ({
  id: r.id, kind: r.kind || 'client', operation: r.op || 'edit', status: r.st, requestedBy: r.by || '', requestedAt: r.at || '', clientId: r.cid ?? null, label: r.label || '',
  changes: (r.changes || []).map((c) => ({ field: c.k, from: c.from, to: c.to })), decidedBy: r.dec || '', decidedAt: r.decAt || '', reason: r.why || '', automatic: !!r.auto || isAutoDefaultRequest(r),
});

export async function listApprovals(req) {
  const state = await readState(req);
  if (state.me.role !== 'admin') throw new ApiError(403, 'forbidden', 'Vetëm administratori i sheh kërkesat për miratim.');
  const all = parse(state.data.crmReq, []).map(dto);
  return { pending: all.filter((r) => r.status === 'pending' && !r.automatic), automatic: all.filter((r) => r.status === 'pending' && r.automatic), decided: all.filter((r) => r.status !== 'pending' && !r.automatic).slice(-30).reverse(), me: state.me };
}
export async function decision(req, id, body) {
  if (!['approved', 'rejected'].includes(body && body.decision)) throw new ApiError(422, 'invalid', 'Vendimi duhet të jetë approved ose rejected.');
  await decide(req, id, body.decision, body.reason || '');
  return { status: body.decision };
}
export const clearAutomatic = async (req) => dismissAuto(req);
