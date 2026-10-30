// Pika e vetme hyrëse e API v2 (një funksion serverless): /api/v2/<burimi>[/<id>[/<veprimi>]]
// Rrugët: session, clients, tasks, approvals. Përgjigjet e gabimit: { error: <kod>, message: <tekst>, ...detaje }.
import { wrap, me } from './_lib.js';
import { ApiError } from './_v2-http.js';
import * as clients from './_v2-clients.js';
import * as tasks from './_v2-tasks.js';
import * as approvals from './_v2-approvals.js';
import * as obligations from './_v2-obligations.js';

const NOT_FOUND = () => new ApiError(404, 'not_found', 'Rruga nuk ekziston.');

async function route(req, parts, body) {
  const [root, id, action] = parts, m = req.method;
  if (root === 'session' && m === 'GET') { const t = await tasks.listTasks(req); return { me: t.me, users: t.users }; }
  if (root === 'clients') {
    if (!id) { if (m === 'GET') return clients.listClients(req); if (m === 'POST') return clients.createClient(req, body); }
    else if (!action) { if (m === 'GET') return clients.getClient(req, id); if (m === 'PATCH') return clients.updateClient(req, id, body); if (m === 'DELETE') return clients.deleteClient(req, id); }
    else if (action === 'secrets') { if (m === 'GET') return clients.getSecrets(req, id); if (m === 'PUT') return clients.setSecrets(req, id, body); }
  }
  if (root === 'tasks') {
    if (!id) { if (m === 'GET') return tasks.listTasks(req); if (m === 'POST') return tasks.create(req, body); }
    else if (!action) { if (m === 'PATCH') return tasks.update(req, id, body); if (m === 'DELETE') return tasks.remove(req, id); }
    else if (action === 'comments' && m === 'POST') return tasks.comment(req, id, body && body.text);
    else if (action === 'command' && m === 'POST') return tasks.command(req, id, body && body.command, body);
  }
  if (root === 'obligations') {
    if (id === 'today' && m === 'GET') return obligations.today(req);
    if (id === 'team' && m === 'GET') return obligations.team(req);
    if (id === 'monthly' && m === 'GET') return obligations.monthly(req, req.query || {});
    if (id === 'annual' && m === 'GET') return obligations.annual(req);
    if (id === 'done' && m === 'POST') return obligations.setDone(req, body);
    if (id === 'action' && m === 'POST') return obligations.action(req, body);
  }
  if (root === 'approvals') {
    if (!id && m === 'GET') return approvals.listApprovals(req);
    if (id === 'clear-automatic' && m === 'POST') return approvals.clearAutomatic(req);
    if (id && action === 'decision' && m === 'POST') return approvals.decision(req, id, body);
  }
  throw NOT_FOUND();
}

export default wrap(async (req, res) => {
  const u = await me(req);
  if (!u) return res.status(401).json({ error: 'unauthenticated', message: 'Sesioni ka skaduar. Hyr përsëri.' });
  const path = String((req.query && (req.query.p ?? req.query.path)) || '').split('/').filter(Boolean).map(decodeURIComponent);
  try {
    const out = await route(req, path, req.body && typeof req.body === 'object' ? req.body : {});
    res.setHeader('Cache-Control', 'no-store');
    const pending = out && out.status === 'pending_approval';
    return res.status(pending ? 202 : req.method === 'POST' && path.length === 1 ? 201 : 200).json(out);
  } catch (e) {
    if (e instanceof ApiError) return res.status(e.status).json({ error: e.code, message: e.message, ...e.extra });
    throw e;
  }
});
