// Lidhje e vogël midis moduleve dhe guaskës: rifreskimi i pamjes aktuale pas një veprimi.
let rerender = async () => {};
export const setRerender = (fn) => { rerender = fn; };
export const refresh = () => rerender();
// Pas çdo vizatimi të faqes (p.sh. hapja e detyrës nga njoftimi).
const hooks = [];
export const onRendered = (fn) => { hooks.push(fn); };
export const rendered = () => hooks.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
