import { html, raw } from '../../core/html.js';
import { get, post, patch } from '../../core/api.js';
import { on } from '../../core/actions.js';
import { field, openModal, select, toast } from '../../core/ui.js';
import { refresh } from '../../core/app.js';
import { today } from '../../core/format.js';

export async function openTaskForm({ task = null, clientId = null } = {}) {
  const d = await get('/tasks'), t = task || { title: '', description: '', clientId, due: today(), priority: 'n', recurrence: '', assignees: [], review: false };
  const users = d.users.map((u) => [u, u]);
  const m = openModal({ title: task ? 'Ndrysho detyrën' : 'Detyrë e re', width: 620, body: html`<form id="task-form" data-submit="task.save" novalidate data-id="${task ? task.id : ''}">
    <div id="task-error" class="notice error" hidden></div>
    ${field('Titulli *', html`<input name="title" required maxlength="200" value="${t.title}">`)}
    ${field('Përshkrimi', html`<textarea name="description" rows="3" maxlength="2000">${t.description}</textarea>`)}
    <div class="grid2">${field('Klienti (opsional)', select('clientId', d.clients.map((c) => [c.id, c.name]), t.clientId ?? '', { blank: '— pa klient —' }))}
    ${field('Afati', html`<input type="date" name="due" value="${t.due}">`)}
    ${field('Përgjegjësi', select('a1', users, t.assignees[0] || '', { blank: '— pa caktuar —' }))}
    ${field('Koleg i dytë (opsional)', select('a2', users, t.assignees[1] || '', { blank: '—' }))}
    ${field('Rëndësia', select('priority', [['n', 'Normale'], ['h', 'E lartë']], t.priority))}
    ${field('Përsëritja', select('recurrence', [['', 'Pa përsëritje'], ['w', 'Çdo javë'], ['m', 'Çdo muaj'], ['y', 'Çdo vit']], t.recurrence))}</div>
    <label class="check"><input type="checkbox" name="review" ${t.review ? raw('checked') : ''}> Mbyllet vetëm pasi ta aprovojë kolegu i dytë (kërkon dy përgjegjës)</label>
    <label class="check"><input type="checkbox" name="evidence" ${t.evidence ? raw('checked') : ''}> Kërko dokument provë gjatë mbylljes (p.sh. formular, vërtetim, kontratë); ruhet te dosja e klientit</label>
    <div class="form-actions"><button type="button" class="btn" data-action="modal.close">Anulo</button><button class="btn primary" type="submit">${task ? 'Ruaj' : 'Krijo detyrën'}</button></div></form>` });
  return m;
}

on('submit', 'task.save', async (form) => {
  const fd = new FormData(form), id = form.getAttribute('data-id');
  const payload = { title: fd.get('title'), description: fd.get('description'), clientId: fd.get('clientId') || null, due: fd.get('due') || '', priority: fd.get('priority'), recurrence: fd.get('recurrence'), assignees: [fd.get('a1'), fd.get('a2')].filter(Boolean), review: fd.get('review') === 'on', evidence: fd.get('evidence') === 'on' };
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
  try {
    if (id) await patch(`/tasks/${id}`, payload); else await post('/tasks', payload);
    form.closest('.modal-backdrop').remove(); toast(id ? 'Detyra u ruajt.' : 'Detyra u krijua.', 'success'); await refresh();
  } catch (e) { const b = form.querySelector('#task-error'); b.hidden = false; b.textContent = e.message; btn.disabled = false; }
});
