// Ngjarje me delegim: elementet kanë data-action / data-input / data-change / data-submit; asnjë onclick inline.
const handlers = { click: {}, input: {}, change: {}, submit: {} };
let reporter = (e) => console.error(e);
export const setErrorReporter = (fn) => { reporter = fn; };
export function on(type, name, fn) { handlers[type][name] = fn; }
export function actions(map) { for (const [k, fn] of Object.entries(map)) on('click', k, fn); }
export function attach(root) {
  for (const type of ['click', 'input', 'change', 'submit']) {
    const attr = 'data-' + (type === 'click' ? 'action' : type);
    root.addEventListener(type, async (ev) => {
      const el = ev.target.closest && ev.target.closest('[' + attr + ']');
      if (!el || !root.contains(el)) return;
      const fn = handlers[type][el.getAttribute(attr)];
      if (!fn) return;
      if (type === 'submit' || (type === 'click' && ((el.tagName === 'BUTTON' && el.type === 'submit') || (el.tagName === 'A' && el.getAttribute('href') === '#')))) ev.preventDefault();   // lidhjet href="#" janë veprime, jo navigim
      try { await fn(el, ev); } catch (e) { reporter(e); }
    });
  }
}
export const formData = (form) => Object.fromEntries(new FormData(form).entries());
