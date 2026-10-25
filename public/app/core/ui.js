import { html, esc, raw } from './html.js';

const root = () => document.getElementById('modal-root');
const toastRoot = () => document.getElementById('toast-root');

export function toast(message, kind = 'info', ms = 4500) {
  const host = toastRoot(); if (!host) return;
  const el = document.createElement('div'); el.className = `toast ${kind}`; el.setAttribute('role', kind === 'error' ? 'alert' : 'status'); el.textContent = message;
  host.appendChild(el); setTimeout(() => el.remove(), ms);
}

export function openModal({ title, body, width = 560, footer = '' }) {
  const host = root(); const wrap = document.createElement('div'); wrap.className = 'modal-backdrop';
  wrap.innerHTML = html`<div class="modal" role="dialog" aria-modal="true" style="max-width:${width}px"><div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-action="modal.close" aria-label="Mbyll">×</button></div><div class="modal-body">${body}</div>${footer ? html`<div class="modal-foot">${footer}</div>` : ''}</div>`.toString();
  host.appendChild(wrap);
  const first = wrap.querySelector('input,select,textarea,button.primary'); if (first) first.focus();
  return { el: wrap, close: () => wrap.remove() };
}
export const closeModal = (el) => { const w = el && el.closest ? el.closest('.modal-backdrop') : null; if (w) w.remove(); };
export const closeAllModals = () => { const h = root(); if (h) h.innerHTML = ''; };

export function confirmDialog({ title = 'Konfirmo', message, confirmText = 'Po, vazhdo', cancelText = 'Anulo', danger = false }) {
  return new Promise((resolve) => {
    const m = openModal({ title, width: 440, body: html`<p>${message}</p>`, footer: html`<button class="btn" data-action="dlg.cancel">${cancelText}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-action="dlg.ok">${confirmText}</button>` });
    m.el.addEventListener('click', (e) => { const a = e.target.closest('[data-action]'); if (!a) return; const act = a.getAttribute('data-action'); if (act === 'dlg.ok') { m.close(); resolve(true); } else if (act === 'dlg.cancel' || act === 'modal.close') { m.close(); resolve(false); } });
  });
}
export function promptDialog({ title, label, confirmText = 'Ruaj', required = false, placeholder = '' }) {
  return new Promise((resolve) => {
    const m = openModal({ title, width: 480, body: html`<label class="field"><span>${label}</span><textarea id="dlg-input" rows="3" placeholder="${placeholder}"></textarea></label><p class="err" id="dlg-err"></p>`, footer: html`<button class="btn" data-action="dlg.cancel">Anulo</button><button class="btn primary" data-action="dlg.ok">${confirmText}</button>` });
    m.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-action]'); if (!a) return; const act = a.getAttribute('data-action');
      if (act === 'dlg.ok') { const v = m.el.querySelector('#dlg-input').value.trim(); if (required && !v) { m.el.querySelector('#dlg-err').textContent = 'Ky fushë është e detyrueshme.'; return; } m.close(); resolve(v); }
      else if (act === 'dlg.cancel' || act === 'modal.close') { m.close(); resolve(null); }
    });
  });
}

export const chip = (label, kind = '') => html`<span class="chip ${kind}">${label}</span>`;
export const empty = (msg) => html`<div class="empty">${msg}</div>`;
export const field = (label, control, error = '', hint = '') => html`<label class="field ${error ? 'has-error' : ''}"><span>${label}</span>${control}${hint ? html`<small>${hint}</small>` : ''}${error ? html`<em class="err">${error}</em>` : ''}</label>`;
export const select = (name, options, value, { blank = null, attrs = '' } = {}) => html`<select name="${name}" ${raw(attrs)}>${blank !== null ? html`<option value="">${blank}</option>` : ''}${options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${l}</option>`)}</select>`;
export { esc };
