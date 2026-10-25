import { html, raw } from '../../core/html.js';
import { post, del } from '../../core/api.js';
import { actions, on } from '../../core/actions.js';
import { chip, confirmDialog, openModal, promptDialog, toast } from '../../core/ui.js';
import { refresh } from '../../core/app.js';
import { dateOnly, dateTime, duration } from '../../core/format.js';
import { STATUS, actionButtons, elapsed, registerTasks, taskById } from './table.js';
import { openTaskForm } from './form.js';

let me = { name: '', role: 'accountant' };
export const setMe = (m) => { me = m; };
const dl = (rows) => html`<dl class="dl">${rows.filter((r) => r[1] !== '' && r[1] != null).map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;

export function detailBody(t) {
  const st = STATUS[t.status] || STATUS.todo, e = elapsed(t);
  return html`<div class="chips">${chip(st[0], st[1])}${t.priority === 'h' ? chip('e lartë', 'bad') : ''}${t.recurrence ? chip({ w: 'javore', m: 'mujore', y: 'vjetore' }[t.recurrence]) : ''}${t.pending ? chip(`pret aprovimin (${t.pending.by})`, 'warn') : ''}${t.late ? chip('u kryer me vonesë', 'bad') : ''}</div>
  ${t.description ? html`<p class="desc">${t.description}</p>` : ''}
  ${dl([['Klienti', t.clientId ? html`<a href="#/clients/${t.clientId}" data-action="modal.close">${t.clientName}</a>` : ''], ['Përgjegjës', t.assignees.join(', ') || 'pa caktuar'], ['Caktuar nga', `${t.createdBy} · ${dateTime(t.createdAt)}`], ['Afati', t.due ? dateOnly(t.due) : ''],
    ['Filloi', t.startedAt ? dateTime(t.startedAt) : ''], ['Koha', e == null ? '' : duration(e) + (t.status === 'done' ? ' (kohëzgjatja e kryerjes)' : ' (po zgjat)')], ['Kryer nga', t.status === 'done' ? `${t.doneBy} · ${dateTime(t.doneTs || t.doneAt)}` : ''], ['Aprovuar nga', t.approvedBy]])}
  <h4>Komente (${t.comments.length})</h4><div class="comments">${t.comments.length ? t.comments.map((c) => html`<div class="comment"><b>${c.by}</b> <small class="muted">${dateTime(c.at)}</small><p>${c.text}</p></div>`) : raw('<p class="muted">Asnjë koment ende.</p>')}</div>
  ${t.permissions.comment ? html`<form data-submit="task.comment" data-id="${t.id}" class="comment-form"><textarea name="text" rows="2" maxlength="2000" placeholder="Shkruaj një koment…" required></textarea><button class="btn primary small" type="submit">Komento</button></form>` : ''}
  <div class="form-actions spread"><div>${actionButtons(t, me)}</div><div class="btn-row">${t.permissions.edit ? html`<button class="btn" data-action="task.edit" data-id="${t.id}">Ndrysho</button>` : ''}${t.permissions.del ? html`<button class="btn danger" data-action="task.delete" data-id="${t.id}">Fshi</button>` : ''}</div></div>`;
}

const show = (t) => { registerTasks([t]); return openModal({ title: t.title, width: 680, body: detailBody(t) }); };
const close = () => { document.querySelectorAll('.modal-backdrop').forEach((n) => n.remove()); };

async function runCommand(id, cmd) {
  let body = { command: cmd };
  if (cmd === 'reject') { const reason = await promptDialog({ title: 'Kthe prapa pa aprovuar', label: 'Arsyeja (shfaqet te komentet)', confirmText: 'Kthe prapa' }); if (reason === null) return; body.reason = reason; }
  const r = await post(`/tasks/${id}/command`, body);
  const labels = { start: 'Detyra filloi.', complete: r.task.pending ? 'U dërgua për aprovim te kolegu.' : 'Detyra u kry.', approve: 'Detyra u aprovua dhe u kry.', reject: 'Detyra u kthye prapa.', reopen: 'Detyra u rihap.' };
  toast(labels[cmd] + (r.created ? ` U krijua detyra e radhës: “${r.created.title}”.` : ''), 'success');
  close(); await refresh();
}

actions({
  'task.open': (el) => { const t = taskById(el.getAttribute('data-id')); if (t) { close(); show(t); } },
  'task.cmd': (el) => runCommand(el.getAttribute('data-id'), el.getAttribute('data-cmd')),
  'task.edit': async (el) => { const t = taskById(el.getAttribute('data-id')); close(); await openTaskForm({ task: t }); },
  'task.delete': async (el) => {
    const t = taskById(el.getAttribute('data-id'));
    if (!await confirmDialog({ title: 'Fshi detyrën', message: `Të fshihet detyra “${t.title}”? Veprimi nuk kthehet.`, confirmText: 'Fshi', danger: true })) return;
    await del(`/tasks/${t.id}`); close(); toast('Detyra u fshi.', 'success'); await refresh();
  },
});
on('submit', 'task.comment', async (form) => {
  const id = form.getAttribute('data-id'), text = new FormData(form).get('text');
  const r = await post(`/tasks/${id}/comments`, { text }); close(); show(r.task); await refresh();
});
export { show as showTask };
