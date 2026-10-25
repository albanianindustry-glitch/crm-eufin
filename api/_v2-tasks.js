// Moduli Detyrat (API v2): shërbim mbi domenin e pastër; ruajtja kalon nga rruga e provuar (leje, njoftime, auditim).
import { randomUUID } from 'node:crypto';
import { ApiError, mutateKey, readState, parse } from './_v2-http.js';
import { createTask, transition, updateTask, addComment, canDelete, permissions, assignees, DomainError } from './_v2-tasks-domain.js';

const EMPTY_X = { mt: [], k: [], sv: [], hist: [], fat: [], set: {}, cat: [], done: {}, users: [] };
const uid = () => 'm' + randomUUID().replace(/-/g, '').slice(0, 12);
const wrapDomain = (fn) => { try { return fn(); } catch (e) { if (e instanceof DomainError) throw new ApiError(e.status, e.code, e.message); throw e; } };

export function toDto(t, me, clientName = '') {
  return {
    id: t.id, title: t.title || '', description: t.desc || '', clientId: t.cid === '' || t.cid == null ? null : t.cid, clientName,
    due: t.due || '', priority: t.prio === 'h' ? 'h' : 'n', recurrence: t.rec || '', assignees: assignees(t), review: !!t.rev,
    status: t.st || 'todo', createdBy: t.by || '', createdAt: t.at || '', startedAt: t.pst || '', minutes: t.mins || 0, carriedMinutes: t.mp || 0,
    doneAt: t.doneAt || '', doneTs: t.doneTs || '', doneBy: t.doneBy || '', approvedBy: t.apprBy || '', pending: t.pend && t.pend.by ? { by: t.pend.by, at: t.pend.at || '' } : null, late: !!t.late,
    comments: (t.cm || []).map((c) => ({ id: c.id || '', by: c.by || '', at: c.at || '', text: c.tx || '' })),
    permissions: permissions(t, me),
  };
}

export async function listTasks(req) {
  const state = await readState(req), x = parse(state.data.crmX, EMPTY_X), clients = parse(state.data.crmClients, []);
  const names = new Map(clients.map((c) => [String(c.id), c.emriKompanise]));
  return { tasks: (x.mt || []).map((t) => toDto(t, state.me, names.get(String(t.cid)) || '')), users: state.users, clients: clients.map((c) => ({ id: c.id, name: c.emriKompanise })), me: state.me, now: new Date().toISOString() };
}

const run = async (req, build) => {
  const { result } = await mutateKey(req, 'crmX', (x, state) => { const base = { ...EMPTY_X, ...x, mt: x.mt || [] }; return build(base, state); }, EMPTY_X);
  return result;
};
// Emrat e fushave në API (DTO) -> emrat e domenit.
const MAP = { title: 'title', description: 'desc', due: 'due', priority: 'prio', recurrence: 'rec', assignees: 'assignees', review: 'review', clientId: 'clientId' };
const fromDto = (input) => {
  const out = {}, src = input && typeof input === 'object' ? input : {};
  for (const k of Object.keys(src)) { if (!MAP[k]) throw new ApiError(422, 'invalid', `Fushë e panjohur: ${k}.`); out[MAP[k]] = src[k]; }
  return out;
};
const nameOf = (state, cid) => { const c = parse(state.data.crmClients, []).find((x) => String(x.id) === String(cid)); return c ? c.emriKompanise : ''; };
const idx = (x, id) => { const i = x.mt.findIndex((t) => t.id === id); if (i < 0) throw new ApiError(404, 'not_found', 'Detyra nuk ekziston.'); return i; };

export async function create(req, input) {
  const t = await run(req, (x, state) => {
    if (input.clientId != null && input.clientId !== '' && !parse(state.data.crmClients, []).some((c) => String(c.id) === String(input.clientId))) throw new ApiError(422, 'invalid', 'Klienti i zgjedhur nuk ekziston.');
    const task = wrapDomain(() => createTask(fromDto(input), state.me, { uid, users: state.users }));
    return { next: { ...x, mt: [...x.mt, task] }, result: { task, me: state.me, name: nameOf(state, task.cid) } };
  });
  return { task: toDto(t.task, t.me, t.name) };
}

export async function command(req, id, cmd, body = {}) {
  const out = await run(req, (x, state) => {
    const i = idx(x, id), r = wrapDomain(() => transition(x.mt[i], cmd, state.me, { uid, reason: String(body.reason || '').slice(0, 500) }));
    const mt = x.mt.slice(); mt[i] = r.task; if (r.created) mt.push(r.created);
    return { next: { ...x, mt }, result: { task: r.task, created: r.created, me: state.me, name: nameOf(state, r.task.cid) } };
  });
  return { task: toDto(out.task, out.me, out.name), created: out.created ? toDto(out.created, out.me, out.name) : null };
}

export async function update(req, id, patch) {
  const out = await run(req, (x, state) => {
    if (patch && 'clientId' in patch && patch.clientId !== '' && patch.clientId != null && !parse(state.data.crmClients, []).some((c) => String(c.id) === String(patch.clientId))) throw new ApiError(422, 'invalid', 'Klienti i zgjedhur nuk ekziston.');
    const i = idx(x, id), t = wrapDomain(() => updateTask(x.mt[i], fromDto(patch), state.me, { users: state.users }));
    const mt = x.mt.slice(); mt[i] = t; return { next: { ...x, mt }, result: { t, me: state.me, name: nameOf(state, t.cid) } };
  });
  return { task: toDto(out.t, out.me, out.name) };
}

export async function comment(req, id, text) {
  const out = await run(req, (x, state) => {
    const i = idx(x, id), t = wrapDomain(() => addComment(x.mt[i], text, state.me, { uid }));
    const mt = x.mt.slice(); mt[i] = t; return { next: { ...x, mt }, result: { t, me: state.me, name: nameOf(state, t.cid) } };
  });
  return { task: toDto(out.t, out.me, out.name) };
}

export async function remove(req, id) {
  await run(req, (x, state) => {
    const i = idx(x, id); wrapDomain(() => canDelete(x.mt[i], state.me));
    return { next: { ...x, mt: x.mt.filter((_, j) => j !== i) }, result: null };
  });
  return { status: 'deleted' };
}
