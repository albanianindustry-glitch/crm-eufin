// Moduli Detyrat (API v2): shërbim mbi domenin e pastër; ruajtja kalon nga rruga e provuar (leje, njoftime, auditim).
import { randomUUID } from 'node:crypto';
import { ApiError, mutateKey, readState, parse } from './_v2-http.js';
import { createTask, transition, updateTask, addComment, canDelete, permissions, assignees, DomainError } from './_v2-tasks-domain.js';
import { notify } from './_lib.js';

const EMPTY_X = { mt: [], k: [], sv: [], hist: [], fat: [], set: {}, cat: [], done: {}, users: [] };
const uid = () => 'm' + randomUUID().replace(/-/g, '').slice(0, 12);
const wrapDomain = (fn) => { try { return fn(); } catch (e) { if (e instanceof DomainError) throw new ApiError(e.status, e.code, e.message); throw e; } };

export function toDto(t, me, clientName = '') {
  return {
    id: t.id, title: t.title || '', description: t.desc || '', clientId: t.cid === '' || t.cid == null ? null : t.cid, clientName,
    due: t.due || '', priority: t.prio === 'h' ? 'h' : 'n', recurrence: t.rec || '', assignees: assignees(t), review: !!t.rev, evidence: !!t.ev, proof: (t.proof || []).map((p) => ({ name: p.name || 'Dokument', url: p.url || '', by: p.by || '', at: p.at || '' })),
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
const MAP = { title: 'title', description: 'desc', due: 'due', priority: 'prio', recurrence: 'rec', assignees: 'assignees', review: 'review', clientId: 'clientId', evidence: 'evidence' };
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

const cleanDocs = (list) => {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 5) throw new ApiError(422, 'invalid', 'Dokumentet bashkëlidhur janë të pavlefshëm (max. 5).');
  return list.map((d) => {
    const url = String((d && d.url) || ''), name = String((d && d.name) || 'Dokument').trim().slice(0, 150) || 'Dokument';
    if (!/^\/api\/file\?id=[A-Za-z0-9-]{8,64}$/.test(url)) throw new ApiError(422, 'invalid', 'Dokumenti duhet ngarkuar së pari (PDF).');
    return { name, url };
  });
};

// Dokumentet provë ruhen te dosja e klientit (shtim = plotësim i lirë, jo ndryshim i vlerës ekzistuese).
async function attachProof(req, task, me) {
  if (task.cid === '' || task.cid == null || !(task.proof || []).length) return;
  await mutateKey(req, 'crmClients', (list) => {
    const i = list.findIndex((c) => String(c.id) === String(task.cid)); if (i < 0) return { next: list, result: null };
    const have = new Set((list[i].docs || []).map((d) => d.data));
    const add = task.proof.filter((p) => !have.has(p.url)).map((p) => ({ id: 'd' + uid(), tid: task.id, cat: 'prove', name: p.name, data: p.url, at: String(p.at || new Date().toISOString()).slice(0, 10), by: p.by || me.name, note: `Provë për detyrën: ${task.title}` }));
    if (!add.length) return { next: list, result: null };
    const next = list.slice(); next[i] = { ...list[i], docs: [...(list[i].docs || []), ...add] }; return { next, result: null };
  }, []);
}

export async function command(req, id, cmd, body = {}) {
  const documents = cleanDocs(body.documents);
  const out = await run(req, (x, state) => {
    const i = idx(x, id), r = wrapDomain(() => transition(x.mt[i], cmd, state.me, { uid, reason: String(body.reason || '').slice(0, 500), documents }));
    const mt = x.mt.slice(); mt[i] = r.task; if (r.created) mt.push(r.created);
    return { next: { ...x, mt }, result: { task: r.task, created: r.created, me: state.me, before: x.mt[i], name: nameOf(state, r.task.cid) } };
  });
  if (out.task.st === 'done' && (out.task.proof || []).length) { try { await attachProof(req, out.task, out.me); } catch (e) { console.error('attachProof', e); } }
  // Njoftimet: kolegu i dytë kërkohet për aprovim; kërkuesi njoftohet për vendimin
  try {
    const t = out.task, others = assignees(t).filter((n) => n !== out.me.name), link = { t: 'task', id: t.id };
    if (cmd === 'complete' && t.pend && others.length) await notify(others.map((n) => ({ name: n, text: `${out.me.name} kërkon aprovimin tënd për detyrën “${t.title}”${out.name ? ' (' + out.name + ')' : ''}`, link })));
    if ((cmd === 'approve' || cmd === 'reject') && out.before.pend && out.before.pend.by !== out.me.name) await notify([{ name: out.before.pend.by, text: `${out.me.name} ${cmd === 'approve' ? 'e aprovoi' : 'e ktheu prapa'} detyrën “${t.title}”`, link }]);
  } catch (e) { console.error('notify', e); }
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
