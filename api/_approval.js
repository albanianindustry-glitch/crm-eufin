const parse = (value, fallback) => {
  try { return JSON.parse(value || ''); } catch { return fallback; }
};

const sameId = (a, b) => String(a) === String(b);
const getPath = (obj, path) => path.split('.').reduce((x, key) => (x == null ? undefined : x[key]), obj);
const setPath = (obj, path, value) => {
  const keys = path.split('.'), last = keys.pop();
  let cur = obj;
  for (const key of keys) { if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {}; cur = cur[key]; }
  if (value === null || value === undefined) delete cur[last]; else cur[last] = value;
};
// Çelësat e fushave default (statusTVSH, statusTatimFitim) nuk fshihen kurrë nga një kërkesë.
const NEVER_CLEAR = new Set(['statusTVSH', 'statusTatimFitim']);
// Bosh = null, '', [] ose {} (një fushë që s'është plotësuar kurrë është e njëjtë me një listë të zbrazët).
const emptyish = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const normV = (v) => (emptyish(v) ? null : v);
const baseMatches = (current, base) => Object.entries(base || {}).every(([field, value]) =>
  JSON.stringify(normV(getPath(current, field))) === JSON.stringify(normV(value)));

export function resolveApprovalState({ requestValue, clientsValue, crmXValue, id, decision, reason = '', actor, now, documentId }) {
  const requests = parse(requestValue, null);
  const clients = parse(clientsValue, null);
  const crmX = parse(crmXValue, {});
  if (!Array.isArray(requests) || !Array.isArray(clients) || !crmX || typeof crmX !== 'object') {
    return { error: 'Struktura e kërkesës ose e të dhënave është e pavlefshme.', status: 400 };
  }

  const request = requests.find((item) => sameId(item.id, id));
  if (!request) return { error: 'Kërkesa nuk ekziston.', status: 404 };
  if (request.st !== 'pending') return { error: 'Kërkesa është vendosur më parë.', status: 409 };
  if (decision !== 'approved' && decision !== 'rejected') return { error: 'Vendimi është i pavlefshëm.', status: 400 };

  const nextClients = structuredClone(clients);
  const nextX = structuredClone(crmX);
  if (decision === 'approved' && request.kind === 'client') {
    const client = nextClients.find((item) => sameId(item.id, request.cid));
    if (!client) return { error: 'Klienti nuk ekziston më.', status: 409 };
    if (!baseMatches(client, request.base)) return { error: 'Klienti ka ndryshuar pas krijimit të kërkesës.', status: 409 };
    for (const [field, value] of Object.entries(request.patch || {})) {
      if (value === null && NEVER_CLEAR.has(field)) continue;
      setPath(client, field, value);
    }
  } else if (decision === 'approved' && request.kind === 'contract') {
    nextX.k = Array.isArray(nextX.k) ? nextX.k : [];
    const contract = nextX.k.find((item) => sameId(item.id, request.kid));
    if (!contract) return { error: 'Kontrata nuk ekziston më.', status: 409 };
    if (!baseMatches(contract, request.base)) return { error: 'Kontrata ka ndryshuar pas krijimit të kërkesës.', status: 409 };
    const client = nextClients.find((item) => sameId(item.id, contract.cid));
    if (!client) return { error: 'Klienti i kontratës nuk ekziston më.', status: 409 };

    if (request.op === 'del') {
      const doc = (client.docs || []).find((item) => sameId(item.id, contract.doc));
      if (doc) {
        doc.archived = true;
        doc.kdel = now.slice(0, 10);
      }
      nextX.k = nextX.k.filter((item) => !sameId(item.id, contract.id));
    } else if (request.op === 'edit') {
      const patch = request.patch || {};
      for (const [field, value] of Object.entries(patch)) {
        if (field === 'pendingDoc') continue;
        if (value === null) delete contract[field];
        else contract[field] = value;
      }
      if (patch.pendingDoc) {
        const oldDoc = (client.docs || []).find((item) => sameId(item.id, contract.doc));
        if (oldDoc) {
          oldDoc.archived = true;
          oldDoc.kdel = now.slice(0, 10);
          oldDoc.note = 'zëvendësuar nga kontrata e re';
        }
        client.docs = client.docs || [];
        client.docs.push({
          id: documentId,
          kid: contract.id,
          cat: 'kontrate',
          name: patch.pendingDoc.name,
          data: patch.pendingDoc.data,
          at: now.slice(0, 10),
        });
        contract.doc = documentId;
      }
    } else {
      return { error: 'Lloji i veprimit të kontratës është i pavlefshëm.', status: 400 };
    }

    nextX.hist = Array.isArray(nextX.hist) ? nextX.hist : [];
    nextX.hist.push({
      id: documentId,
      at: now,
      by: actor.name,
      cid: contract.cid,
      t: request.op === 'del' ? `Kontratë e fshirë (miratuar nga ${actor.name}): ${contract.lb || contract.type}` : `Ndryshim i kontratës i miratuar nga ${actor.name}: ${contract.lb || contract.type}`,
    });
  } else if (decision === 'approved' && !['client', 'contract'].includes(request.kind)) {
    return { error: 'Lloji i kërkesës nuk mbështetet.', status: 400 };
  }

  request.st = decision;
  request.dec = actor.name;
  request.decAt = now;
  if (decision === 'rejected' && reason) request.why = String(reason).slice(0, 500);

  return {
    requestValue: JSON.stringify(requests),
    clientsValue: decision === 'approved' ? JSON.stringify(nextClients) : clientsValue,
    crmXValue: decision === 'approved' && request.kind === 'contract' ? JSON.stringify(nextX) : crmXValue,
    request,
    auditAction: decision === 'approved' ? 'request-approved' : 'request-rejected',
    auditDetail: `${request.label || request.kind} (kërkuar nga ${request.by})${decision === 'rejected' && request.why ? ' – ' + request.why : ''}`,
  };
}
