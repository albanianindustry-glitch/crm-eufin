// Bashkim treditësh (baza / ndryshimet e mia / ndryshimet e kolegut) për të dhënat JSON.
// Lista me objekte që kanë "id" bashkohen për rekord; objektet bashkohen fushë për fushë.
// Nëse të dy kanë ndryshuar të njëjtën fushë, fiton versioni i atij që po ruan tani (numërohet si konflikt).
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hasIds = (a) => a.every((x) => isObj(x) && x.id !== undefined);

export function merge3(base, mine, theirs, stats = { c: 0 }) {
  if (eq(mine, base)) return theirs;
  if (eq(theirs, base) || eq(mine, theirs)) return mine;

  if (isObj(mine) && isObj(theirs) && (base === undefined || isObj(base))) {
    const b = base || {}, out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(b)])) {
      const inM = k in mine, inT = k in theirs, inB = k in b;
      if (!inM && !inT) continue;
      if (!inM) { if (inB && eq(b[k], theirs[k])) continue; out[k] = theirs[k]; stats.c++; continue; }
      if (!inT) { if (inB && eq(b[k], mine[k])) continue; out[k] = mine[k]; stats.c++; continue; }
      out[k] = merge3(inB ? b[k] : undefined, mine[k], theirs[k], stats);
    }
    return out;
  }

  if (Array.isArray(mine) && Array.isArray(theirs) && (base === undefined || Array.isArray(base))) {
    const B = base || [];
    if (hasIds(mine) && hasIds(theirs) && hasIds(B)) {
      const bm = new Map(B.map((x) => [x.id, x])), mm = new Map(mine.map((x) => [x.id, x])), tm = new Map(theirs.map((x) => [x.id, x]));
      const out = [], seen = new Set();
      for (const id of [...theirs.map((x) => x.id), ...mine.map((x) => x.id)]) {
        if (seen.has(id)) continue;
        seen.add(id);
        const b = bm.get(id), m = mm.get(id), t = tm.get(id);
        if (m && t) out.push(merge3(b, m, t, stats));
        else if (m) { if (b && eq(b, m)) continue; out.push(m); if (b) stats.c++; }      // kolegu e fshiu; unë e kisha ndryshuar
        else if (t) { if (b && eq(b, t)) continue; out.push(t); if (b) stats.c++; }      // unë e fshiva; kolegu e kishte ndryshuar
      }
      return out;
    }
  }
  stats.c++;
  return mine;
}

export function mergeJson(baseStr, mineStr, theirsStr) {
  const stats = { c: 0 };
  const v = merge3(JSON.parse(baseStr), JSON.parse(mineStr), JSON.parse(theirsStr), stats);
  return { json: JSON.stringify(v), conflicts: stats.c };
}
