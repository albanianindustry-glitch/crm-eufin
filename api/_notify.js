// Nxjerr njoftimet specifike nga ndryshimet. Çdo njoftim ka "link": ku të çojë kur klikohet.
//   {t:'task', id}  -> detyra te "Detyrat e mia"      {t:'client', id} -> dosja e klientit
//   {t:'mine'}      -> lista e detyrave të mia          {t:'today'}      -> "Sot – detyrat"
const arr = (s) => { try { const x = JSON.parse(s || '{}').mt; return Array.isArray(x) ? x : []; } catch { return []; } };
const list = (s) => { try { const x = JSON.parse(s || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };

const wo = (x) => (x && x.us && x.us.length ? x.us : x && x.u ? [x.u] : []);

function diffTasks(oldStr, newStr, actor) {
  const old = new Map(arr(oldStr).map((t) => [t.id, t])), out = [];
  for (const t of arr(newStr)) {
    const p = old.get(t.id), link = { t: 'task', id: t.id };
    for (const w of wo(t)) if (w !== actor.name && !wo(p).includes(w)) out.push({ name: w, text: `${actor.name} të caktoi detyrën: ${t.title}${wo(t).length > 1 ? ' (bashkë me ' + wo(t).filter((x) => x !== w).join(', ') + ')' : ''}`, link });
    if (p && (t.cm || []).length > (p.cm || []).length) {
      const last = t.cm[t.cm.length - 1];
      for (const who of new Set([...wo(t), t.by])) if (who && who !== last.by) out.push({ name: who, text: `${last.by} komentoi te "${t.title}": ${String(last.tx).slice(0, 120)}`, link });
    }
    if (p && p.st !== 'done' && t.st === 'done') for (const who of new Set([t.by, ...wo(t)])) if (who && who !== actor.name && (who === t.by || wo(t).length > 1)) out.push({ name: who, text: `${actor.name} e mbylli detyrën: ${t.title}`, link });
  }
  return out;
}

// Përmbledhje ditore: detyra që mbarojnë sot ose janë me vonesë, për çdo përgjegjës.
export function dueDigest(mt, today) {
  const by = {};
  (mt || []).filter((t) => t.st !== 'done' && t.due && t.due <= today).forEach((t) => { for (const w of wo(t)) (by[w] = by[w] || []).push(t); });
  return Object.entries(by).map(([name, L]) => ({ name, text: `Ke ${L.length} detyra që mbarojnë sot ose janë me vonesë: ${L.slice(0, 3).map((t) => t.title).join(', ')}${L.length > 3 ? '…' : ''}`, link: { t: 'mine' } }));
}

// ---- Klientët: caktime përgjegjësish dhe ndryshime që prekin detyrimet.
export const KIND_LABEL = {
  fat: 'faturat e muajit', lp: 'listëpagesën', f5: 'Financë 5', tvsh: 'deklarimin e TVSH-së', lib: 'librat e blerjeve dhe shitjeve',
  mag: 'raportin e mallit + KMSH', qera: 'tatimin e qerasë', fit: 'tatim fitimin vjetor', vend: 'tatim-taksat vendore', diva: 'DIVA/DVAP',
  pay: 'arkëtimin e pagesës së studios', onb: 'hapat pas regjistrimit', fonde: 'pagesat nga fondet e klientit',
};
const kindLabel = (k) => KIND_LABEL[k] || 'një detyrim të shtuar nga lista';
// Fushat që, kur ndryshojnë, e prekin punën e përgjegjësit (pa sekrete).
const WATCH = [
  ['statusKlient', 'statusi i klientit'], ['statusTVSH', 'statusi TVSH'], ['tarifaMujore', 'tarifa mujore'], ['xhiroBiznes', 'xhiroja'],
  ['statusPagese', 'statusi i pagesës'], ['afatiAdministratori', 'afati i administratorit'], ['certifikataElektronike', 'certifikata elektronike'],
];
const WATCH_FX = [
  ['lloji', 'lloji i klientit'], ['forma', 'forma juridike'], ['punonjes', 'punonjësit'], ['magazine', 'magazina'], ['qera', 'qeraja'],
  ['vendore', 'tatim-taksat vendore'], ['imp', 'importi'], ['fonde', 'fondet e klientit'], ['dual', 'dypunësimi'], ['pezullim', 'data e pezullimit'], ['regj', 'data e regjistrimit'],
];
const same = (a, b) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');

// Kthen {emri: {main:bool, kinds:Set}} për kë është përgjegjës klienti.
export function owners(c) {
  const f = (c && c.fx) || {}, o = {};
  if (f.resp) o[f.resp] = { main: true, kinds: new Set() };
  for (const [k, who] of Object.entries(f.resps || {})) if (who) (o[who] = o[who] || { main: false, kinds: new Set() }).kinds.add(k);
  return o;
}

export function diffClients(oldStr, newStr, actor, admins = []) {
  const old = new Map(list(oldStr).map((c) => [c.id, c])), out = [];
  for (const c of list(newStr)) {
    const p = old.get(c.id), name = c.emriKompanise || 'klient', link = { t: 'client', id: c.id };
    const now = owners(c), was = p ? owners(p) : {};
    const to = {};  // emri -> pjesët e mesazhit
    const add = (who, s) => { if (who && who !== actor.name) (to[who] = to[who] || []).push(s); };
    for (const [who, n] of Object.entries(now)) {
      const b = was[who];
      const gained = [...n.kinds].filter((k) => !b || !b.kinds.has(k));
      const parts = [];
      if (n.main && !(b && b.main)) parts.push('si përgjegjës kryesor');
      if (gained.length) parts.push('për ' + gained.map(kindLabel).join(', '));
      if (parts.length) add(who, `${actor.name} të caktoi ${parts.join(' dhe ')} te klienti ${name}${p ? '' : ' (klient i ri)'}`);
    }
    for (const [who, b] of Object.entries(was)) {
      const n = now[who];
      const lost = [...b.kinds].filter((k) => !n || !n.kinds.has(k));
      const parts = [];
      if (b.main && !(n && n.main)) parts.push('si përgjegjës kryesor');
      if (lost.length) parts.push('nga ' + lost.map(kindLabel).join(', '));
      if (parts.length) add(who, `${actor.name} të hoqi ${parts.join(' dhe ')} te klienti ${name}`);
    }
    if (p) {
      const ch = [];
      for (const [k, l] of WATCH) if (!same(p[k], c[k])) ch.push(l);
      for (const [k, l] of WATCH_FX) if (!same((p.fx || {})[k], (c.fx || {})[k])) ch.push(l);
      if (ch.length) {  // ndryshim që kërkon aprovim: përgjegjësit + administratorët (jo vetë autori)
        const rl = { t: 'client', id: c.id, rv: 1, by: actor.name, what: ch.join(', ').slice(0, 120) };
        for (const who of new Set([...Object.keys(now), ...admins])) if (who && who !== actor.name) out.push({ name: who, text: `${actor.name} ndryshoi te klienti ${name}: ${ch.join(', ')}`, link: rl });
      }
    }
    for (const [who, parts] of Object.entries(to)) out.push({ name: who, text: parts.join(' · '), link });
  }
  return out;
}

// ---- Ndryshime që kërkojnë aprovim: kontratat (te crmX) dhe deklarimet TVSH ----
const KT = { mujor: 'shërbim mujor', vjetor: 'shërbim vjetor', qera: 'qera', perf: 'përfaqësim tatimor' };
const clientOf = (cs, id) => list(cs).find((c) => String(c.id) === String(id));
const cName = (cs, id) => (clientOf(cs, id) || {}).emriKompanise || 'klient';
const revs = (cs, id, admins, actor) => { const c = clientOf(cs, id); return [...new Set([...(c ? Object.keys(owners(c)) : []), ...admins])].filter((w) => w && w !== actor.name); };
const review = (out, cs, id, admins, actor, verb, what) => {
  for (const w of revs(cs, id, admins, actor)) out.push({ name: w, text: `${actor.name} ${verb} te klienti ${cName(cs, id)}: ${what}`, link: { t: 'client', id, rv: 1, by: actor.name, what: what.slice(0, 120) } });
};

export function diffNotifs(oldStr, newStr, actor, admins = [], cs = '') {
  const out = diffTasks(oldStr, newStr, actor);
  if (!oldStr) return out;
  try {
    const A = JSON.parse(oldStr).k || [], B = JSON.parse(newStr).k || [], old = new Map(A.map((k) => [String(k.id), k])), now = new Set(B.map((k) => String(k.id)));
    const lab = (k) => `${KT[k.type] || 'kontratë'}${k.lb ? ' ' + k.lb : ''}`;
    for (const k of B) {
      if (!k.cid) continue;
      const p = old.get(String(k.id));
      if (!p) review(out, cs, k.cid, admins, actor, 'shtoi', `kontratë e re (${lab(k)})`);
      else if (!same(p.end, k.end) || !same(p.st, k.st)) review(out, cs, k.cid, admins, actor, 'ndryshoi', `kontrata ${lab(k)} (afati/statusi)`);
    }
    for (const p of A) if (p.cid && !now.has(String(p.id))) review(out, cs, p.cid, admins, actor, 'fshiu', `kontratën ${lab(p)}`);
  } catch { /* JSON jo i vlefshëm: s'ka njoftim */ }
  return out;
}

export function diffDecl(oldStr, newStr, actor, admins = [], cs = '') {
  const out = [];
  if (!oldStr) return out;
  const old = new Map(list(oldStr).map((d) => [String(d.id), d]));
  for (const d of list(newStr)) {
    const id = d.clientId; if (!id) continue;
    const p = old.get(String(d.id)), per = `${d.muaji || ''} ${d.viti || ''}`.trim();
    if (!p) review(out, cs, id, admins, actor, 'shtoi', `deklarim TVSH i ri (${per})`);
    else if (!same(p.tvshPerTuPaguar, d.tvshPerTuPaguar)) review(out, cs, id, admins, actor, 'ndryshoi', `deklarimi TVSH ${per}`);
  }
  return out;
}
