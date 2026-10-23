const table = [];
export function route(pattern, handler) { table.push({ segments: pattern.split('/').filter(Boolean), handler }); }
export function clearRoutes() { table.length = 0; }
export function parseHash(hash = (globalThis.location && globalThis.location.hash) || '') {
  const raw = hash.replace(/^#/, '') || '/', [path, query = ''] = raw.split('?');
  return { path: '/' + path.split('/').filter(Boolean).join('/'), query: Object.fromEntries(new URLSearchParams(query)) };
}
export function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const r of table) {
    if (r.segments.length !== parts.length) continue;
    const params = {}; let ok = true;
    r.segments.forEach((s, i) => { if (s.startsWith(':')) params[s.slice(1)] = decodeURIComponent(parts[i]); else if (s !== parts[i]) ok = false; });
    if (ok) return { handler: r.handler, params };
  }
  return null;
}
export const go = (path) => { globalThis.location.hash = '#' + path; };
