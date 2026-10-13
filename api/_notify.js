// Nxjerr njoftimet nga ndryshimet e detyrave (crmX.mt): caktim, koment, mbyllje.
const arr = (s) => { try { const x = JSON.parse(s || '{}').mt; return Array.isArray(x) ? x : []; } catch { return []; } };
export function diffNotifs(oldStr, newStr, actor) {
  const old = new Map(arr(oldStr).map((t) => [t.id, t])), out = [];
  for (const t of arr(newStr)) {
    const p = old.get(t.id);
    if (t.u && t.u !== actor.name && (!p || p.u !== t.u)) out.push({ name: t.u, text: `${actor.name} të caktoi detyrën: ${t.title}` });
    if (p && (t.cm || []).length > (p.cm || []).length) {
      const last = t.cm[t.cm.length - 1];
      for (const who of new Set([t.u, t.by])) if (who && who !== last.by) out.push({ name: who, text: `${last.by} komentoi te "${t.title}": ${String(last.tx).slice(0, 120)}` });
    }
    if (p && p.st !== 'done' && t.st === 'done' && t.by && t.by !== actor.name) out.push({ name: t.by, text: `${actor.name} e mbylli detyrën: ${t.title}` });
  }
  return out;
}

// Përmbledhje ditore: detyra që mbarojnë sot ose janë me vonesë, për çdo përgjegjës.
export function dueDigest(mt, today) {
  const by = {};
  (mt || []).filter((t) => t.u && t.st !== 'done' && t.due && t.due <= today).forEach((t) => { (by[t.u] = by[t.u] || []).push(t); });
  return Object.entries(by).map(([name, L]) => ({ name, text: `Ke ${L.length} detyra që mbarojnë sot ose janë me vonesë: ${L.slice(0, 3).map((t) => t.title).join(', ')}${L.length > 3 ? '…' : ''}` }));
}
