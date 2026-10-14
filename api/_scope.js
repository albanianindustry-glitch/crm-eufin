// Kontabilisti merr vetëm detyrat që i janë caktuar ose që i ka krijuar vetë (crmX.mt); admini i merr të gjitha.
const vis = (t, u) => t.u === u.name || t.by === u.name;
export function scopeX(json, u) {
  if (u.role === 'admin') return json;
  try { const x = JSON.parse(json); if (Array.isArray(x.mt)) x.mt = x.mt.filter((t) => vis(t, u)); return JSON.stringify(x); } catch { return json; }
}
// Gjatë ruajtjes: detyrat e fshehura nga ky përdorues kthehen nga e ruajtura, që të mos humbasin.
export function unscopeX(newJson, curJson, u) {
  if (u.role === 'admin' || !curJson) return newJson;
  try {
    const n = JSON.parse(newJson), c = JSON.parse(curJson), ids = new Set((n.mt || []).map((t) => t.id));
    n.mt = [...(n.mt || []), ...(c.mt || []).filter((t) => !vis(t, u) && !ids.has(t.id))];
    return JSON.stringify(n);
  } catch { return newJson; }
}
