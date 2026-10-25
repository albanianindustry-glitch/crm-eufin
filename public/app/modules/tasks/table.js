import { html, raw } from '../../core/html.js';
import { dateOnly, dateTime, daysFrom, duration, today } from '../../core/format.js';
import { chip, empty } from '../../core/ui.js';

export const STATUS = { todo: ['Për t’u bërë', 'info'], prog: ['Në proces', 'warn'], done: ['Kryer', 'ok'] };
const index = new Map();
export const registerTasks = (list) => list.forEach((t) => index.set(String(t.id), t));
export const taskById = (id) => index.get(String(id));
export const isOpen = (t) => t.status !== 'done';
export const isLate = (t) => !!t.due && isOpen(t) && t.due < today();

export function elapsed(t, now = Date.now()) {
  if (t.status === 'done') return t.minutes;
  const from = t.startedAt || t.createdAt; if (t.status === 'prog' && from) return (t.carriedMinutes || 0) + (now - new Date(from)) / 6e4;
  return null;
}
export function timeCell(t, now = Date.now()) {
  if (t.status === 'done') return t.minutes ? html`<b>${duration(t.minutes)}</b><small class="sub">kohëzgjatja e kryerjes</small>` : raw('—');
  if (t.status === 'prog') { const e = elapsed(t, now); return e == null ? raw('—') : html`<b>${duration(e)}</b><small class="sub">po zgjat${t.startedAt ? ' nga ' + dateOnly(t.startedAt) : ''}</small>`; }
  return t.createdAt ? html`<small class="sub">pret ${duration((now - new Date(t.createdAt)) / 6e4)}</small>` : raw('—');
}

export function actionButtons(t, me) {
  const p = t.permissions, b = [];
  if (t.status === 'done') { if (p.act) b.push(html`<button class="btn small" data-action="task.cmd" data-cmd="reopen" data-id="${t.id}">Rihap</button>`); }
  else if (t.pending) {
    if (t.pending.by !== me.name && p.act) b.push(html`<button class="btn small success" data-action="task.cmd" data-cmd="approve" data-id="${t.id}">Aprovo</button><button class="btn small" data-action="task.cmd" data-cmd="reject" data-id="${t.id}">Kthe prapa</button>`);
    else b.push(html`<small class="sub">⏳ pret aprovimin e kolegut</small>`);
  } else if (p.act) {
    if (t.status === 'todo') b.push(html`<button class="btn small" data-action="task.cmd" data-cmd="start" data-id="${t.id}">Fillo</button>`);
    b.push(html`<button class="btn small success" data-action="task.cmd" data-cmd="complete" data-id="${t.id}">${t.review ? 'Kërko aprovim' : 'U krye'}</button>`);
  }
  return html`<div class="btn-row">${b}</div>`;
}

export function taskTable(tasks, me, { showClient = true } = {}) {
  registerTasks(tasks);
  if (!tasks.length) return empty('Asnjë detyrë sipas filtrave të zgjedhur.');
  const now = Date.now();
  return html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Detyra</th>${showClient ? html`<th>Klienti</th>` : ''}<th>Përgjegjës</th><th>Caktuar nga</th><th>Afati</th><th>Statusi</th><th>Koha</th><th>Kryer nga</th><th></th></tr></thead><tbody>${tasks.map((t) => {
    const late = isLate(t), st = STATUS[t.status] || STATUS.todo;
    return html`<tr class="${late ? 'late' : ''}"><td><a href="#" data-action="task.open" data-id="${t.id}"><b>${t.title}</b></a>${t.priority === 'h' ? chip('e lartë', 'bad') : ''}${t.recurrence ? chip('përsëritet') : ''}${t.comments.length ? html`<small class="sub">💬 ${t.comments.length}</small>` : ''}</td>
      ${showClient ? html`<td>${t.clientId ? html`<a href="#/clients/${t.clientId}">${t.clientName}</a>` : raw('<span class="muted">—</span>')}</td>` : ''}
      <td>${t.assignees.length ? t.assignees.map((n) => html`<div><b>${n}</b></div>`) : raw('<b class="bad-text">pa caktuar</b>')}</td>
      <td>${t.createdBy || '—'}<small class="sub">${dateOnly(t.createdAt)}</small></td>
      <td>${dateOnly(t.due)}${late ? html`<small class="sub bad-text">me vonesë ${Math.abs(daysFrom(t.due))} ditë</small>` : ''}</td>
      <td>${chip(st[0], st[1])}</td><td>${timeCell(t, now)}</td>
      <td>${t.status === 'done' ? html`${t.doneBy}<small class="sub">${dateTime(t.doneTs || t.doneAt)}${t.approvedBy ? ' · aprovoi ' + t.approvedBy : ''}</small>` : raw('<span class="muted">—</span>')}</td><td>${actionButtons(t, me)}</td></tr>`;
  })}</tbody></table></div>`;
}
