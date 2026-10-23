// Hap CRM-në e vërtetë (index.html + të gjitha skriptet) në jsdom kundrejt serverit lokal.
import { JSDOM, VirtualConsole, CookieJar } from 'jsdom';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function openApp(base, cookie) {
  const errors = [], alerts = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) errors.push(String((e.detail && e.detail.message) || e.message)); });
  const jar = new CookieJar(); jar.setCookieSync(cookie + '; Path=/', base);
  const dom = await JSDOM.fromURL(base + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, cookieJar: jar, virtualConsole,
    beforeParse(w) {
      // jsdom nuk dërgon cookie në XHR sinkron dhe nuk ka fetch: ura e testimit
      const open = w.XMLHttpRequest.prototype.open;
      w.XMLHttpRequest.prototype.open = function (...a) { const r = open.apply(this, a); try { this.setRequestHeader('X-Test-Cookie', cookie); } catch { /* */ } return r; };
      w.fetch = (u, o = {}) => fetch(new URL(u, base), { ...o, headers: { ...(o.headers || {}), 'X-Test-Cookie': cookie } });
      w.alert = (m) => alerts.push(String(m)); w.confirm = () => true; w.prompt = (m, d) => (typeof w.__promptAnswer === 'function' ? w.__promptAnswer(m, d) : d);
      w.URL.createObjectURL = () => 'blob:x'; w.HTMLElement.prototype.scrollIntoView = () => {}; w.open = () => null; w.scrollTo = () => {};
      w.addEventListener('error', (e) => errors.push('window.onerror: ' + e.message));
    },
  });
  await new Promise((resolve) => dom.window.addEventListener('load', resolve, { once: true }));
  await sleep(1500);
  return { w: dom.window, d: dom.window.document, errors, alerts, close: () => dom.window.close() };
}
