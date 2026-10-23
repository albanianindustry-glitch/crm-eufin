/* Pamja profesionale:
   1) Dosja e klientit si faqe e plotë (jo dritare popup): përmbledhje, kontakte, përgjegjës, detyra, kontrata, dokumente, historik.
   2) Detyrat e ekipit si tabelë: kush është përgjegjës, kush e caktoi, afati, statusi, koha, kush e ka kryer.
   3) Etiketa të lexueshme për kërkesat e miratimit (emra fushash, vlera të formatuara). */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, adm = ME.role === 'admin';
  var $ = function (id) { return document.getElementById(id); };
  var clientsList = function () { return typeof clients !== 'undefined' ? clients : []; };
  var findClient = function (id) { return clientsList().find(function (c) { return String(c.id) === String(id); }); };
  var fd = function (s) { return s ? (window.xFd ? window.xFd(String(s).slice(0, 10)) : String(s).slice(0, 10)) : '—'; };
  var money = function (n) { return A.L(n); };

  // ---------- Etiketat dhe formatimi i vlerave (përdoret edhe te kërkesat për miratim)
  var FIELD = {
    emriKompanise: 'Emri i kompanisë', nipt: 'NIPT', administratori: 'Administratori', nrKontakti: 'Nr. kontaktit', emailBiznes: 'Email biznesi',
    tarifaMujore: 'Tarifa mujore', xhiroBiznes: 'Xhiro e biznesit (vit)', dataKontrate: 'Data e kontratës', statusKlient: 'Statusi i klientit', statusPagese: 'Statusi i pagesës',
    dataFaturesFundit: 'Data e faturës së fundit', afatiAdministratori: 'Afati i administratorit', certifikataElektronike: 'Certifikata elektronike',
    statusTVSH: 'Statusi TVSH', statusTatimFitim: 'Statusi i tatim fitimit', adresaBiznes: 'Adresa', shenimet: 'Shënime', fx: 'Profili fiskal / përgjegjësit',
    ortaket: 'Ortakët', adresat: 'Adresat', docs: 'Dokumentet', dokumentiAdmin: 'ID/Pasaporta e administratorit', kontrata: 'Kontrata',
    lb: 'Emri i kontratës', end: 'Data e mbarimit', rent: 'Qiraja mujore', val: 'Vlera', type: 'Lloji i kontratës', st: 'Statusi'
  };
  var MONEY = { tarifaMujore: 1, xhiroBiznes: 1, rent: 1, val: 1 };
  var DATES = { dataKontrate: 1, dataFaturesFundit: 1, afatiAdministratori: 1, certifikataElektronike: 1, end: 1 };
  var ENUM = {
    statusKlient: { aktiv: 'Aktiv', inaktiv: 'Inaktiv' }, statusPagese: { paguan: 'Paguan në rregull', vonese: 'Me vonesë', spaguan: 'Nuk paguan' },
    statusTVSH: { me_tvsh: 'Me TVSH', pa_tvsh: 'Pa TVSH' }, statusTatimFitim: { me_tatim: 'Me tatim fitimi', pa_tatim: 'Pa tatim fitimi' }
  };
  window.xFieldLabel = function (k) { return FIELD[k] || k; };
  window.xFmtVal = function (k, v) {
    if (v == null || v === '' || v === '—') return '—';
    if (ENUM[k] && ENUM[k][v]) return ENUM[k][v];
    if (MONEY[k] && isFinite(+v)) return money(v);
    if (DATES[k] && /^\d{4}-\d\d-\d\d/.test(String(v))) return fd(v);
    return String(v);
  };
  window.xReqChange = function (c) {
    return '<div class="rq-ch"><span class="rq-f">' + E(window.xFieldLabel(c.k)) + '</span><span class="rq-old">' + E(window.xFmtVal(c.k, c.from)) + '</span><span class="rq-ar">→</span><span class="rq-new">' + E(window.xFmtVal(c.k, c.to)) + '</span></div>';
  };

  // ---------- Ndihmës të përbashkët
  function fdur(m) { m = Math.round(m); if (!isFinite(m) || m < 0) return '—'; if (m < 1) return 'nën 1 min'; if (m < 60) return m + ' min'; var h = Math.floor(m / 60), r = m % 60; if (h < 24) return h + ' orë' + (r ? ' ' + r + ' min' : ''); return Math.floor(h / 24) + ' ditë ' + (h % 24) + ' orë'; }
  var who = function (t) { return t.us && t.us.length ? t.us : (t.u ? [t.u] : []); };
  var isOpen = function (t) { return t.st !== 'done'; };
  var isLate = function (t) { return !!t.due && isOpen(t) && t.due < A.TODAY; };
  var STAT = { todo: ['Për t’u bërë', 'info'], prog: ['Në proces', 'warn'], done: ['Kryer', 'ok'] };
  var chip = function (txt, kind) { return '<span class="chip ' + (kind || '') + '">' + E(txt) + '</span>'; };
  function showPane(id) {
    document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-content').forEach(function (t) { t.classList.remove('active'); });
    var p = $(id); if (p) p.classList.add('active');
    window.scrollTo(0, 0);
  }
  function setTitle(t) { setTimeout(function () { var h = $('xtitle'); if (h) h.textContent = t; }, 30); }

  // =====================================================================================
  // 1) DOSJA E KLIENTIT
  // =====================================================================================
  var pane = document.createElement('div'); pane.id = 'tprofil'; pane.className = 'tab-content';
  (document.getElementById('klientet') || document.querySelector('.tab-content:last-of-type')).insertAdjacentElement('afterend', pane);
  var profId = null, profTab = 'detyra', prevPane = 'klientet';

  var respRows = function (c) {
    var f = c.fx || {}, rows = [];
    rows.push(['Përgjegjësi kryesor', f.resp ? '<b>' + E(f.resp) + '</b>' : '<b style="color:#b4443b">pa caktuar</b>']);
    Object.keys(f.resps || {}).forEach(function (k) { if (f.resps[k]) rows.push([window.xKindLabel ? window.xKindLabel(k) : k, E(f.resps[k])]); });
    return rows;
  };
  var clientOpenTasks = function (c) {
    var std = [];
    try { std = A.tasks().filter(function (a) { return a.c === c.emriKompanise; }); } catch (e) { std = []; }
    var man = X.mt.filter(function (t) { return String(t.cid) === String(c.id) && isOpen(t); });
    return { std: std, man: man };
  };
  var dl = function (rows) { return '<dl class="pf-dl">' + rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + (r[1] === '' || r[1] == null ? '—' : r[1]) + '</dd>'; }).join('') + '</dl>'; };
  var phone = function (c) { var p = String(c.nrKontakti || '').replace(/[^\d+]/g, ''); if (p.charAt(0) === '+') p = p.slice(1); else if (p.charAt(0) === '0') p = '355' + p.slice(1); return p; };
  var REQ = ['statut', 'themelim', 'prokure', 'id', 'qkb', 'bo', 'cert'];
  var hasDoc = function (c, k) { return (c.docs || []).some(function (d) { return d.cat === k; }) || (k === 'id' && (c.dokumentiAdmin || (c.ortaket || []).some(function (o) { return o.dokument; }))); };

  function profileTabBody(c) {
    var T = clientOpenTasks(c);
    if (profTab === 'detyra') {
      var rows = T.std.map(function (a) { var late = A.diff(a.d) < 0; return '<tr><td>' + E(a.t) + '<span class="tt-sub">Detyrim</span></td><td>' + fd(a.d) + (late ? ' ' + chip('me vonesë', 'bad') : '') + '</td><td>' + E(A.respFor(a) || '—') + '</td></tr>'; })
        .concat(T.man.map(function (t) { return '<tr><td>' + E(t.title) + '<span class="tt-sub">Detyrë' + (t.by ? ' · caktuar nga ' + E(t.by) : '') + '</span></td><td>' + fd(t.due) + (isLate(t) ? ' ' + chip('me vonesë', 'bad') : '') + '</td><td>' + E(who(t).join(', ') || '—') + '</td></tr>'; }));
      return rows.length ? '<table class="pf-tbl"><thead><tr><th>Detyra</th><th>Afati</th><th>Përgjegjës</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' : '<div class="pf-empty">Asnjë detyrë e hapur për këtë klient.</div>';
    }
    if (profTab === 'kontrata') {
      var ks = X.k.filter(function (k) { return String(k.cid) === String(c.id); });
      return ks.length ? '<table class="pf-tbl"><thead><tr><th>Kontrata</th><th>Lloji</th><th>Vlera</th><th>Mbaron</th><th>Statusi</th></tr></thead><tbody>' + ks.map(function (k) {
        var det = k.type === 'qera' ? 'Qera ' + money(k.rent) + (k.ll ? ' · ' + E(k.ll) : '') : (k.val ? money(k.val) : '—');
        return '<tr><td>' + E(k.lb || '—') + '</td><td>' + E(k.type || '—') + '</td><td>' + det + '</td><td>' + fd(k.end) + '</td><td>' + (k.st === 'a' ? chip('Aktive', 'ok') : chip('Jo aktive')) + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="pf-empty">Asnjë kontratë e regjistruar.</div>';
    }
    if (profTab === 'dokumente') {
      var miss = REQ.filter(function (k) { return !hasDoc(c, k); }).map(function (k) { return A.CAT[k]; });
      return '<h4 style="margin:0 0 6px">Të ngarkuara</h4>' + (window.xDocsList ? window.xDocsList(c) : '') + '<h4 style="margin:14px 0 6px">Dokumente që mungojnë</h4>' + (miss.length ? miss.map(function (m) { return chip(m, 'warn'); }).join(' ') : chip('Dosja është e plotë', 'ok'));
    }
    if (profTab === 'historik') return (window.xHistHtml ? window.xHistHtml(c.id) : '') || '<div class="pf-empty">Asnjë ngjarje e regjistruar.</div>';
    if (profTab === 'shenime') return c.shenimet ? '<div style="white-space:pre-wrap">' + E(c.shenimet) + '</div>' : '<div class="pf-empty">Pa shënime.</div>';
    return '';
  }

  function drawProfile() {
    var c = findClient(profId);
    if (!c) { pane.innerHTML = '<div class="pf"><button class="pf-back" onclick="xProfBack()">← Kthehu</button><div class="pf-card">Klienti nuk ekziston më.</div></div>'; return; }
    var f = c.fx || {}, T = clientOpenTasks(c), nTasks = T.std.length + T.man.length;
    var nLate = T.std.filter(function (a) { return A.diff(a.d) < 0; }).length + T.man.filter(isLate).length;
    var ks = X.k.filter(function (k) { return String(k.cid) === String(c.id) && k.st === 'a'; });
    var miss = REQ.filter(function (k) { return !hasDoc(c, k); });
    var pagese = { paguan: ['Paguan në rregull', 'ok'], vonese: ['Me vonesë', 'warn'], spaguan: ['Nuk paguan', 'bad'] }[c.statusPagese] || ['—', ''];
    var fondeBal = f.fonde && X.fl ? X.fl.filter(function (x) { return String(x.cid) === String(c.id); }).reduce(function (s, x) { return s + (x.type === 'in' ? +x.amt : -x.amt); }, 0) : null;
    var chips = [chip('NIPT ' + c.nipt), c.statusKlient === 'aktiv' ? chip('Aktiv', 'ok') : chip('Inaktiv', 'bad'), chip((window.xFmtVal('statusTVSH', c.statusTVSH || 'me_tvsh')), 'info'), chip(f.lloji === 'individ' ? 'Individ' : 'Biznes' + (f.forma ? ' · ' + f.forma : ''))].join(' ');
    var acts = '<button class="btn btn-primary btn-small" onclick="xGoKl();editClient(' + c.id + ')">Ndrysho klientin</button>' +
      '<button class="btn btn-secondary btn-small" onclick="openNdryshimModal(' + c.id + ')">Regjistro ndryshim</button>' +
      '<button class="btn btn-secondary btn-small" onclick="openHistorikModal(' + c.id + ')">Historiku i plotë</button>' +
      (adm ? '<button class="btn btn-secondary btn-small" onclick="shfaqKredencialet(' + c.id + ')">Kredencialet</button><button class="btn btn-danger btn-small" onclick="xProfDel(' + c.id + ')">Fshi</button>' : '');
    var tabs = [['detyra', 'Detyra (' + nTasks + ')'], ['kontrata', 'Kontrata'], ['dokumente', 'Dokumente' + (miss.length ? ' (' + miss.length + ' mungojnë)' : '')], ['historik', 'Historiku'], ['shenime', 'Shënime']];
    pane.innerHTML = '<div class="pf"><button class="pf-back" onclick="xProfBack()">← Kthehu te lista</button>' +
      '<div class="pf-head"><div class="pf-av">' + E(String(c.emriKompanise || '?').trim().charAt(0).toUpperCase()) + '</div><div class="pf-ti"><h2>' + E(c.emriKompanise) + '</h2><div class="pf-chips">' + chips + '</div></div><div class="pf-act">' + acts + '</div></div>' +
      '<div class="pf-kpis">' +
      '<div class="pf-kpi"><small>Tarifa mujore</small><b>' + money(c.tarifaMujore) + '</b><span>' + (c.dataKontrate ? 'kontratë nga ' + fd(c.dataKontrate) : '') + '</span></div>' +
      '<div class="pf-kpi"><small>Pagesa e studios</small><b>' + chip(pagese[0], pagese[1]) + '</b>' + (fondeBal !== null ? '<span>Fondet e klientit: ' + money(fondeBal) + '</span>' : '') + '</div>' +
      '<div class="pf-kpi"><small>Detyra të hapura</small><b>' + nTasks + '</b><span>' + (nLate ? '<span style="color:#b4443b">' + nLate + ' me vonesë</span>' : 'asnjë me vonesë') + '</span></div>' +
      '<div class="pf-kpi"><small>Kontrata aktive</small><b>' + ks.length + '</b></div>' +
      '<div class="pf-kpi"><small>Dosja e dokumenteve</small><b>' + (REQ.length - miss.length) + '/' + REQ.length + '</b><span>' + (miss.length ? miss.length + ' mungojnë' : 'e plotë') + '</span></div></div>' +
      '<div class="pf-grid"><div class="pf-card"><h3>Të dhënat e klientit</h3>' + dl([
        ['Administratori', E(c.administratori)],
        ['Telefon', c.nrKontakti ? '<a href="tel:' + E(c.nrKontakti) + '">' + E(c.nrKontakti) + '</a> · <a href="https://wa.me/' + E(phone(c)) + '" target="_blank" rel="noopener">WhatsApp</a>' : ''],
        ['Email', c.emailBiznes ? '<a href="mailto:' + E(c.emailBiznes) + '">' + E(c.emailBiznes) + '</a>' : ''],
        ['Adresa', E(c.adresaBiznes)], ['Xhiro (vit)', c.xhiroBiznes ? money(c.xhiroBiznes) : ''],
        ['Regjistruar në QKB', f.regj ? fd(f.regj) : ''], ['Certifikata elektronike', E(c.certifikataElektronike || '')], ['Afati i administratorit', E(c.afatiAdministratori || '')]]) + '</div>' +
      '<div class="pf-card"><h3>Përgjegjësit</h3>' + dl(respRows(c)) + '<h3 style="margin-top:16px">Ortakët</h3>' + ((c.ortaket || []).length ? dl((c.ortaket || []).map(function (o) { return [E(o.emri || '—'), E(o.perqindja != null ? o.perqindja + '%' : '') + (o.shtet ? ' · ' + E(o.shtet) : '')]; })) : '<div class="pf-empty">Asnjë ortak i regjistruar.</div>') + '</div></div>' +
      '<div class="pf-tabs">' + tabs.map(function (t) { return '<button class="' + (profTab === t[0] ? 'on' : '') + '" onclick="xProfTab(\'' + t[0] + '\')">' + E(t[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="pf-body" id="pfbody">' + profileTabBody(c) + '</div></div>';
  }

  window.xProfTab = function (k) { profTab = k; drawProfile(); };
  window.xProfBack = function () {
    var p = prevPane && prevPane !== 'tprofil' ? prevPane : 'klientet';
    var btn = document.querySelector('.tab[onclick*="\'' + p + '\'"]');
    if (p === 'klientet' && window.xGoKl) window.xGoKl(); else if (btn) btn.click(); else if (window.xGoKl) window.xGoKl();
  };
  window.xProfDel = function (id) { window.xGoKl(); if (window.deleteClient) window.deleteClient(id); };
  window.xDosje = function (id) {
    var c = findClient(id); if (!c) return;
    var act = document.querySelector('.tab-content.active'); if (act && act.id !== 'tprofil') prevPane = act.id;
    profId = c.id; profTab = 'detyra'; drawProfile(); showPane('tprofil'); setTitle('Dosja e klientit');
  };
  window.addEventListener('crm:sync', function () { if (pane.classList.contains('active')) drawProfile(); });

  // =====================================================================================
  // 2) DETYRAT E EKIPIT (tabelë)
  // =====================================================================================
  var fl = { q: '', who: '', st: 'open', when: '' };
  var cname = function (id) { var c = findClient(id); return c ? c.emriKompanise : ''; };
  function startOf(t) { return t.pst || t.at || ''; }
  function elapsed(t) { var s = startOf(t); if (!s) return null; return (t.mp || 0) + (Date.now() - new Date(s)) / 6e4; }
  function timeCell(t) {
    if (t.st === 'done') return t.mins ? '<b>' + fdur(t.mins) + '</b><span class="tt-sub">kohëzgjatja e kryerjes</span>' : '—';
    if (t.st === 'prog') { var e = elapsed(t); return e == null ? '—' : '<b>' + fdur(e) + '</b><span class="tt-sub">po zgjat' + (t.pst ? ' nga ' + fd(t.pst) : '') + '</span>'; }
    var w = t.at ? (Date.now() - new Date(t.at)) / 6e4 : null; return w == null ? '—' : '<span class="tt-sub">pret ' + fdur(w) + '</span>';
  }
  function filtered() {
    var q = fl.q.trim().toLowerCase();
    return X.mt.filter(function (t) {
      if (fl.st === 'open' && !isOpen(t)) return false; if (fl.st === 'late' && !isLate(t)) return false;
      if (['todo', 'prog', 'done'].indexOf(fl.st) >= 0 && t.st !== fl.st) return false;
      if (fl.who === '__none') { if (who(t).length) return false; } else if (fl.who && who(t).indexOf(fl.who) < 0) return false;
      if (fl.when === 'today' && t.due !== A.TODAY) return false;
      if (fl.when === 'week') { var d = A.diff(t.due || '9999-12-31'); if (!(d >= 0 && d <= 7)) return false; }
      if (q && (t.title + ' ' + cname(t.cid) + ' ' + who(t).join(' ') + ' ' + (t.by || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
      if (!isOpen(a)) return (b.doneTs || b.doneAt || '') > (a.doneTs || a.doneAt || '') ? 1 : -1;
      return (a.due || '9999') < (b.due || '9999') ? -1 : 1;
    });
  }
  function actions(t) {
    var b = [];
    if (t.pend) b.push('<span class="tt-sub">⏳ pret aprovimin</span>');
    if (window.xCan && window.xCan(t, 'act') && !t.pend) {
      if (t.st === 'todo') b.push('<button class="btn btn-secondary btn-small" onclick="xMt(\'' + t.id + '\',\'prog\')">Fillo</button>');
      if (t.st !== 'done') b.push('<button class="btn btn-success btn-small" onclick="xMt(\'' + t.id + '\',\'done\')">U krye</button>'); else b.push('<button class="btn btn-secondary btn-small" onclick="xMt(\'' + t.id + '\',\'todo\')">Rihap</button>');
    }
    if (window.xCan && window.xCan(t, 'del')) b.push('<button class="btn btn-danger btn-small" onclick="xMtDel(\'' + t.id + '\')">Fshi</button>');
    return '<div style="display:flex;gap:5px;flex-wrap:wrap">' + b.join('') + '</div>';
  }
  function rowHtml(t) {
    var st = STAT[t.st] || STAT.todo, ws = who(t);
    return '<tr class="' + (isLate(t) ? 'tt-late' : '') + '"><td><b>' + E(t.title) + '</b>' + (t.prio === 'h' ? ' ' + chip('e lartë', 'bad') : '') + (t.rec ? ' ' + chip('përsëritet') : '') + (t.desc ? '<span class="tt-sub">' + E(t.desc) + '</span>' : '') + '</td>' +
      '<td>' + (t.cid && cname(t.cid) ? '<a href="#" onclick="xDosje(' + (+t.cid) + ');return false">' + E(cname(t.cid)) + '</a>' : '<span class="tt-sub">—</span>') + '</td>' +
      '<td>' + (ws.length ? ws.map(function (n) { return '<div><b>' + E(n) + '</b></div>'; }).join('') : '<b style="color:#b4443b">pa caktuar</b>') + (t.rev && ws.length > 1 ? '<span class="tt-sub">kërkon aprovim të dytë</span>' : '') + '</td>' +
      '<td>' + E(t.by || '—') + '<span class="tt-sub">' + (t.at ? fd(t.at) : '') + '</span></td>' +
      '<td>' + fd(t.due) + (isLate(t) ? '<span class="tt-sub" style="color:#b4443b">me vonesë ' + Math.abs(A.diff(t.due)) + ' ditë</span>' : '') + '</td>' +
      '<td>' + chip(st[0], st[1]) + '</td><td>' + timeCell(t) + '</td>' +
      '<td>' + (t.st === 'done' ? E(t.doneBy || '—') + '<span class="tt-sub">' + (t.doneAt ? fd(t.doneAt) : '') + '</span>' : '<span class="tt-sub">—</span>') + '</td><td>' + actions(t) + '</td></tr>';
  }
  function people() {
    var names = (X.users || []).slice(); X.mt.forEach(function (t) { who(t).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); }); });
    return names;
  }
  function drawTeam() {
    var all = X.mt, open = all.filter(isOpen), late = open.filter(isLate), today = open.filter(function (t) { return t.due === A.TODAY; });
    var d30 = all.filter(function (t) { return t.st === 'done' && t.doneAt && A.diff(t.doneAt) >= -30; });
    var withMins = all.filter(function (t) { return t.st === 'done' && t.mins; }), avg = withMins.length ? withMins.reduce(function (s, t) { return s + t.mins; }, 0) / withMins.length : null;
    var kpis = $('tt_kpis'); if (kpis) kpis.innerHTML =
      '<div class="pf-kpi"><small>Të hapura</small><b>' + open.length + '</b></div><div class="pf-kpi"><small>Me vonesë</small><b style="color:' + (late.length ? '#b4443b' : '#1d7a46') + '">' + late.length + '</b></div>' +
      '<div class="pf-kpi"><small>Afati sot</small><b>' + today.length + '</b></div><div class="pf-kpi"><small>Kryer (30 ditët e fundit)</small><b>' + d30.length + '</b></div><div class="pf-kpi"><small>Koha mesatare e kryerjes</small><b>' + (avg == null ? '—' : fdur(avg)) + '</b></div>';
    var ppl = $('tt_ppl'); if (ppl) {
      var rows = people().map(function (n) {
        var mine = all.filter(function (t) { return who(t).indexOf(n) >= 0; }), o = mine.filter(isOpen), dn = mine.filter(function (t) { return t.st === 'done'; }), mm = dn.filter(function (t) { return t.mins; });
        return '<tr><td><b>' + E(n) + '</b></td><td>' + o.length + '</td><td>' + (o.filter(isLate).length ? '<b style="color:#b4443b">' + o.filter(isLate).length + '</b>' : '0') + '</td><td>' + dn.length + '</td><td>' + (mm.length ? fdur(mm.reduce(function (s, t) { return s + t.mins; }, 0)) : '—') + '</td><td>' + (mm.length ? fdur(mm.reduce(function (s, t) { return s + t.mins; }, 0) / mm.length) : '—') + '</td></tr>';
      }).join('');
      ppl.innerHTML = rows ? '<table class="tt-tbl"><thead><tr><th>Anëtari</th><th>Të hapura</th><th>Me vonesë</th><th>Të kryera</th><th>Koha totale</th><th>Koha mesatare</th></tr></thead><tbody>' + rows + '</tbody></table>' : '<div class="pf-empty">Nuk ka anëtarë në ekip.</div>';
    }
    var L = filtered(), tb = $('tt_tbl');
    if (tb) tb.innerHTML = L.length ? '<table class="tt-tbl"><thead><tr><th>Detyra</th><th>Klienti</th><th>Përgjegjës</th><th>Caktuar nga</th><th>Afati</th><th>Statusi</th><th>Koha</th><th>Kryer nga</th><th></th></tr></thead><tbody>' + L.map(rowHtml).join('') + '</tbody></table>' : '<div class="pf-empty">Asnjë detyrë sipas filtrave të zgjedhur.</div>';
    var cnt = $('tt_cnt'); if (cnt) cnt.textContent = L.length + ' detyra';
  }
  window.xTtF = function (k, v) { fl[k] = v; drawTeam(); };

  window.renderTm = function () {
    var el = $('tmis'); if (!el) return;
    var us = (X.users || []).map(function (u) { return '<option>' + E(u) + '</option>'; }).join('');
    var opts = function (sel, list) { return list.map(function (o) { return '<option value="' + o[0] + '"' + (sel === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join(''); };
    el.innerHTML = '<div class="tt"><div class="tt-kpis" id="tt_kpis"></div>' +
      '<div class="pf-card" style="margin-bottom:14px"><details class="tt-new"><summary class="btn btn-primary btn-small">+ Detyrë e re</summary><div class="form-grid" style="margin-top:12px">' +
      '<div class="form-group"><label>Titulli *</label><input id="mt_t"></div>' +
      '<div class="form-group"><label>Klienti (opsional)</label><select id="mt_c"><option value="">— Pa klient —</option>' + clientsList().map(function (c) { return '<option value="' + c.id + '">' + E(c.emriKompanise) + '</option>'; }).join('') + '</select></div>' +
      '<div class="form-group"><label>Afati</label><input type="date" id="mt_d" value="' + A.TODAY + '"></div>' +
      '<div class="form-group"><label>Përgjegjësi</label><select id="mt_u"><option value="">Pa caktuar</option>' + us + '</select></div>' +
      '<div class="form-group"><label>Koleg i dytë (opsional)</label><select id="mt_u2"><option value="">—</option>' + us + '</select></div>' +
      '<div class="form-group"><label><input type="checkbox" id="mt_rv" checked> Mbyllet vetëm pasi ta aprovojë kolegu i dytë</label></div>' +
      '<div class="form-group"><label>Rëndësia</label><select id="mt_p"><option value="n">Normale</option><option value="h">E lartë</option></select></div>' +
      '<div class="form-group"><label>Përsëritja</label><select id="mt_r"><option value="">Pa përsëritje</option><option value="w">Çdo javë</option><option value="m">Çdo muaj</option><option value="y">Çdo vit</option></select></div></div>' +
      '<div class="form-group"><label>Përshkrimi</label><textarea id="mt_x" rows="2"></textarea></div><button class="btn btn-primary" onclick="xMtAdd()">Krijo detyrën</button></details></div>' +
      '<div class="pf-card" style="margin-bottom:14px"><h3>Ngarkesa sipas anëtarit</h3><div class="tt-wrap" id="tt_ppl"></div></div>' +
      '<div class="pf-card"><h3>Detyrat <span class="tt-sub" id="tt_cnt" style="display:inline;margin-left:8px"></span></h3><div class="tt-bar">' +
      '<input id="tt_q" placeholder="Kërko detyrë, klient, person…" value="' + E(fl.q) + '" oninput="xTtF(\'q\',this.value)">' +
      '<select onchange="xTtF(\'who\',this.value)"><option value="">Të gjithë anëtarët</option>' + people().map(function (n) { return '<option' + (fl.who === n ? ' selected' : '') + '>' + E(n) + '</option>'; }).join('') + '<option value="__none"' + (fl.who === '__none' ? ' selected' : '') + '>Pa caktuar</option></select>' +
      '<select onchange="xTtF(\'st\',this.value)">' + opts(fl.st, [['open', 'Të hapura'], ['late', 'Me vonesë'], ['todo', 'Për t’u bërë'], ['prog', 'Në proces'], ['done', 'Të kryera'], ['', 'Të gjitha']]) + '</select>' +
      '<select onchange="xTtF(\'when\',this.value)">' + opts(fl.when, [['', 'Çdo afat'], ['today', 'Afati sot'], ['week', 'Brenda 7 ditëve']]) + '</select></div><div class="tt-wrap" id="tt_tbl"></div></div></div>';
    drawTeam();
  };

  // Detyrat e krijuara këtu ruajnë kush i caktoi dhe kur; "Fillo" regjistron fillimin e punës (për matjen e kohës).
  var _add = window.xMtAdd;
  window.xMtAdd = function () {
    var before = {}; X.mt.forEach(function (t) { before[t.id] = 1; });
    var r = _add.apply(this, arguments);
    var added = X.mt.filter(function (t) { return !before[t.id]; });
    if (added.length) { added.forEach(function (t) { t.at = t.at || new Date().toISOString(); t.by = t.by || ME.name; }); A.sv(); if (window.renderTm) window.renderTm(); }
    return r;
  };
  var _mt = window.xMt;
  window.xMt = function (id, st) {
    var t = X.mt.find(function (x) { return x.id === id; });
    if (t && st === 'prog' && !t.pst) t.pst = new Date().toISOString();
    if (t && st === 'todo') t.pst = '';
    return _mt.apply(this, arguments);
  };
  window.addEventListener('crm:sync', function () { var p = $('tmis'); if (p && p.classList.contains('active') && !(document.activeElement && document.activeElement.id === 'tt_q')) window.renderTm(); });
  setInterval(function () { var p = $('tmis'); if (p && p.classList.contains('active') && !(document.activeElement && /^(tt_q|mt_)/.test(document.activeElement.id || ''))) drawTeam(); }, 60000);

  // Lidhje me aplikacionin e ri (Klientët, Detyrat, Miratimet); modulet e tjera mbeten këtu deri sa të rindërtohen.
  document.addEventListener('DOMContentLoaded', function () {
    var side = $('xside'); if (!side || side.querySelector('.x-newapp')) return;
    var a = document.createElement('a'); a.href = '/app/'; a.className = 'x-newapp'; a.textContent = 'Aplikacioni i ri: Klientët, Detyrat, Miratimet →';
    a.style.cssText = 'display:block;margin:12px;padding:10px 12px;background:#fff;color:#1f2a44;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px';
    side.appendChild(a);
  });
})();
