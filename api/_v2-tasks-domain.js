// Domeni i detyrave: funksione të pastra (pa DB, pa HTTP) që e zbatojnë makinën e gjendjeve.
// Statuset: todo -> prog -> done. Detyra me `rev` dhe dy përgjegjës mbyllet në dy hapa (njëri e shënon të kryer, tjetri e aprovon).
// Formati i të dhënave është i njëjtë me atë që lexon moduli i vjetër, ndaj të dy punojnë mbi të njëjtat detyra.

export class DomainError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

const MONTHS = ['Janar', 'Shkurt', 'Mars', 'Prill', 'Maj', 'Qershor', 'Korrik', 'Gusht', 'Shtator', 'Tetor', 'Nëntor', 'Dhjetor'];
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(v + 'T00:00:00Z').getTime());
export const assignees = (t) => (t && Array.isArray(t.us) && t.us.length ? t.us : t && t.u ? [t.u] : []);
export const isOpen = (t) => t.st !== 'done';
const dayOf = (iso) => String(iso).slice(0, 10);

export function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}
const addDays = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// Titulli i detyrës së përsëritur: "Raport Tetor 2026" -> "Raport Nëntor 2026"; vjetore: viti +1.
export function nextTitle(title, rec) {
  if (!title || (rec !== 'm' && rec !== 'y')) return title;
  if (rec === 'y') return title.replace(/\b(20\d\d)\b/, (m) => String(+m + 1));
  let wrap = false;
  let out = title.replace(new RegExp('(?<![\\p{L}])(' + MONTHS.join('|') + ')(?![\\p{L}])', 'giu'), (m) => {
    const i = MONTHS.findIndex((n) => n.toLowerCase() === m.toLowerCase());
    if (i === 11) wrap = true;
    return MONTHS[(i + 1) % 12];
  });
  if (wrap) out = out.replace(/\b(20\d\d)\b/, (m) => String(+m + 1));
  return out;
}

export function validateTaskInput(input, { users = [], partial = false } = {}) {
  const out = {}, errors = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);
  if (!partial || has('title')) {
    const title = String(input.title ?? '').trim();
    if (title.length < 2) errors.title = 'Titulli është i detyrueshëm (min. 2 shkronja).'; else if (title.length > 200) errors.title = 'Titulli është shumë i gjatë (max. 200).'; else out.title = title;
  }
  if (has('desc')) { const d = String(input.desc ?? '').trim(); if (d.length > 2000) errors.desc = 'Përshkrimi është shumë i gjatë (max. 2000).'; else out.desc = d; }
  if (has('due')) { if (input.due === '' || input.due == null) out.due = ''; else if (!isDay(input.due)) errors.due = 'Afati duhet të jetë datë e vlefshme (VVVV-MM-DD).'; else out.due = input.due; }
  if (has('prio')) { if (!['n', 'h'].includes(input.prio)) errors.prio = 'Rëndësia e pavlefshme.'; else out.prio = input.prio; }
  if (has('rec')) { if (!['', 'w', 'm', 'y'].includes(input.rec || '')) errors.rec = 'Përsëritja e pavlefshme.'; else out.rec = input.rec || ''; }
  if (has('assignees')) {
    const list = [...new Set((Array.isArray(input.assignees) ? input.assignees : []).map((x) => String(x).trim()).filter(Boolean))];
    if (list.length > 2) errors.assignees = 'Një detyrë mund të ketë maksimumi 2 përgjegjës.';
    else if (users.length && list.some((n) => !users.includes(n))) errors.assignees = 'Përgjegjës që nuk ekziston në ekip.';
    else { out.us = list; out.u = list[0] || ''; }
  }
  if (has('review')) out.rev = !!input.review;
  if (has('evidence')) out.ev = !!input.evidence;
  if (has('clientId')) out.cid = input.clientId === '' || input.clientId == null ? '' : String(input.clientId);
  if (Object.keys(errors).length) throw new DomainError('invalid', Object.values(errors)[0], 422);
  return out;
}

export function createTask(input, actor, { now = new Date(), uid, users = [] } = {}) {
  const f = validateTaskInput({ prio: 'n', rec: '', review: false, assignees: [], ...input }, { users });
  return {
    id: uid(), title: f.title, desc: f.desc || '', cid: f.cid ?? '', due: f.due || '', prio: f.prio || 'n', rec: f.rec || '',
    u: f.u || '', us: f.us || [], rev: !!f.rev && (f.us || []).length > 1, ev: !!f.ev, st: 'todo', by: actor.name, at: now.toISOString(), mp: 0, mins: 0,
    doneAt: '', doneTs: '', doneBy: '', pend: null, cm: [],
  };
}

const canAct = (t, actor) => actor.role === 'admin' || assignees(t).includes(actor.name) || (!assignees(t).length && t.by === actor.name);
const isCreator = (t, actor) => actor.role === 'admin' || t.by === actor.name;
export const permissions = (t, actor) => ({ act: canAct(t, actor), edit: isCreator(t, actor), del: isCreator(t, actor), comment: canAct(t, actor) || isCreator(t, actor) });

function minutesBetween(fromIso, toIso) { return Math.max(1, Math.round((new Date(toIso) - new Date(fromIso)) / 60000)); }

// Komandat: start | complete | reopen | approve | reject (me arsye) | cancelPending
// Kthen { task, created } ku created është detyra e re e përsëritjes (nëse ka).
export function transition(task, command, actor, { now = new Date(), uid, reason = '', documents = [] } = {}) {
  const t = JSON.parse(JSON.stringify(task)), iso = now.toISOString(), team = assignees(t);
  if (!canAct(t, actor)) throw new DomainError('forbidden', 'Vetëm përgjegjësit e detyrës (ose administratori) mund ta ndryshojnë statusin.', 403);
  const twoStep = !!t.rev && team.length > 1;
  const finish = (doneBy, apprBy) => {
    const base = t.pst || t.at || iso;
    t.st = 'done'; t.pend = null; t.doneAt = dayOf(iso); t.doneTs = iso; t.doneBy = doneBy;
    t.mins = (t.mp || 0) + minutesBetween(base, iso);
    if (apprBy) t.apprBy = apprBy; else delete t.apprBy;
    t.late = t.due && t.doneAt > t.due ? 1 : 0;
    let created = null;
    if (t.rec && t.due) {
      const due = t.rec === 'w' ? addDays(t.due, 7) : addMonths(t.due, t.rec === 'm' ? 1 : 12);
      created = { ...t, id: uid(), title: nextTitle(t.title, t.rec), due, st: 'todo', at: iso, pst: '', mp: 0, mins: 0, doneAt: '', doneTs: '', doneBy: '', pend: null, cm: [] };
      delete created.apprBy; delete created.late;
    }
    return created;
  };
  switch (command) {
    case 'start':
      if (t.st === 'done') throw new DomainError('invalid_state', 'Detyra është e kryer. Rihape që ta fillosh.', 409);
      t.st = 'prog'; if (!t.pst) t.pst = iso; return { task: t, created: null };
    case 'complete': {
      if (t.st === 'done') throw new DomainError('invalid_state', 'Detyra është tashmë e kryer.', 409);
      if (t.ev && !documents.length && !(t.proof || []).length) throw new DomainError('evidence_required', 'Kjo detyrë kërkon dokument provë (p.sh. kontrata, formulari, vërtetimi) para mbylljes.', 422);
      if (documents.length) t.proof = [...(t.proof || []), ...documents.map((d) => ({ name: d.name, url: d.url, by: actor.name, at: iso }))];
      if (twoStep) {
        if (!t.pend) { t.pend = { by: actor.name, at: iso }; if (t.st === 'todo') { t.st = 'prog'; if (!t.pst) t.pst = iso; } return { task: t, created: null }; }
        if (t.pend.by === actor.name && actor.role !== 'admin') throw new DomainError('invalid_state', 'Pret aprovimin e kolegut tjetër.', 409);
        const first = t.pend.by; return { task: t, created: finish(first, actor.name) };
      }
      return { task: t, created: finish(actor.name, null) };
    }
    case 'approve': {
      if (!twoStep || !t.pend) throw new DomainError('invalid_state', 'Nuk ka asnjë kërkesë për aprovim.', 409);
      if (t.pend.by === actor.name && actor.role !== 'admin') throw new DomainError('invalid_state', 'Aprovimin e jep kolegu tjetër.', 409);
      return { task: t, created: finish(t.pend.by, actor.name) };
    }
    case 'reject': {
      if (!t.pend) throw new DomainError('invalid_state', 'Nuk ka asnjë kërkesë për aprovim.', 409);
      if (t.pend.by === actor.name && actor.role !== 'admin') throw new DomainError('invalid_state', 'Kthimin prapa e bën kolegu tjetër.', 409);
      t.pend = null; t.cm = [...(t.cm || []), { id: uid(), by: actor.name, at: iso, tx: 'Kthyer pa aprovuar' + (reason ? ': ' + reason : ''), h: 0 }];
      return { task: t, created: null };
    }
    case 'cancelPending':
      if (!t.pend) return { task: t, created: null };
      t.pend = null; return { task: t, created: null };
    case 'reopen':
      if (t.st !== 'done') throw new DomainError('invalid_state', 'Detyra nuk është e kryer.', 409);
      t.st = 'todo'; t.mp = t.mins || 0; t.pst = iso; t.doneAt = ''; t.doneTs = ''; t.doneBy = ''; t.pend = null; delete t.apprBy; delete t.late; return { task: t, created: null };
    default: throw new DomainError('invalid', 'Komandë e panjohur.', 400);
  }
}

export function updateTask(task, patch, actor, ctx = {}) {
  if (!isCreator(task, actor)) throw new DomainError('forbidden', 'Vetëm krijuesi ose administratori mund ta modifikojë detyrën.', 403);
  const f = validateTaskInput(patch, { users: ctx.users || [], partial: true });
  const t = { ...task, ...f };
  if ('us' in f) { t.rev = (patch.review !== undefined ? !!patch.review : !!task.rev) && f.us.length > 1; if (!f.us.length) t.u = ''; }
  else if ('rev' in f) t.rev = f.rev && assignees(t).length > 1;
  return t;
}

export function addComment(task, text, actor, { now = new Date(), uid } = {}) {
  if (!permissions(task, actor).comment) throw new DomainError('forbidden', 'Nuk ke të drejtë të komentosh këtë detyrë.', 403);
  const tx = String(text ?? '').trim();
  if (!tx) throw new DomainError('invalid', 'Komenti është bosh.', 422);
  if (tx.length > 2000) throw new DomainError('invalid', 'Komenti është shumë i gjatë (max. 2000).', 422);
  return { ...task, cm: [...(task.cm || []), { id: uid(), by: actor.name, at: now.toISOString(), tx, h: 0 }] };
}

export function canDelete(task, actor) { if (!isCreator(task, actor)) throw new DomainError('forbidden', 'Vetëm krijuesi ose administratori mund ta fshijë detyrën.', 403); return true; }
