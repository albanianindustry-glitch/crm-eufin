/* Faturimi mujor (si Excel-i: një "sheet" për muaj, mënyra e pagesës, komente) dhe Paneli i menaxherit. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, adm = ME.role === 'admin', MN = A.MN; X.fat = X.fat || [];
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var cls = function () { return typeof clients !== 'undefined' ? clients : []; };
  var cl = function (id) { return cls().find(function (c) { return String(c.id) === String(id); }) || {}; };
  var money = function (n) { return Math.round(+n || 0).toLocaleString('de-DE') + ' Lekë'; };
  var plabel = function (p) { return MN[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4); };
  var MODES = { pf_cash: 'Proformë + cash', pf_bank: 'Proformë + bankë', fi_bank: 'Fiskale me bankë' };
  var FLOW = {  // [çelësi, gjendja e arritur, veprimi]
    pf_cash: [['proAt', 'Proforma u dërgua', 'Proforma u dërgua'], ['paidAt', 'Arkëtuar cash', 'U arkëtua cash'], ['fisAt', 'Fatura fiskale u lëshua', 'U lëshua fatura fiskale']],
    pf_bank: [['proAt', 'Proforma u dërgua', 'Proforma u dërgua'], ['paidAt', 'Pagesa hyri në bankë', 'Pagesa hyri në bankë'], ['fisAt', 'Fatura fiskale u lëshua', 'U lëshua fatura fiskale']],
    fi_bank: [['fisAt', 'Fatura fiskale u lëshua', 'U lëshua fatura fiskale'], ['paidAt', 'Pagesa hyri në bankë', 'Pagesa hyri në bankë']]
  };
  var steps = function (f) { return FLOW[f.mode] || FLOW.pf_bank; };
  var nextStep = function (f) { return steps(f).find(function (s) { return !f[s[0]]; }) || null; };
  var status = function (f) { var d = steps(f).filter(function (s) { return f[s[0]]; }); return !d.length ? 'Pa filluar' : nextStep(f) ? d[d.length - 1][1] : 'Mbyllur'; };
  var total = function (f) { return f.lines.reduce(function (a, l) { return a + (+l.a || 0); }, 0); };
  var late = function (f) { var s = f.mode === 'fi_bank' ? f.fisAt : f.proAt; return !f.paidAt && !!s && (Date.now() - new Date(s)) / 864e5 > 7; };  // pa pagesë mbi 7 ditë
  var fd = function (s) { return s ? window.xFd(String(s).slice(0, 10)) : ''; };
  var per = A.TODAY.slice(0, 7), tabs = document.querySelector('.tabs');
  function mkTab(id) { var p = document.createElement('div'); p.id = id; p.className = 'tab-content'; document.getElementById('detyrat').insertAdjacentElement('afterend', p); return p; }
  var P1 = mkTab('tfat'), P2 = mkTab('tmgr');
  var _sw = window.switchTab; window.switchTab = function (t) { _sw(t); if (t === 'tfat') draw(); if (t === 'tmgr') drawMgr(); };

  /* ---------- Faturimi ---------- */
  function periods() { var o = [], d = new Date(); for (var i = 0; i < 12; i++) { var x = new Date(d.getFullYear(), d.getMonth() - i, 1); o.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')); } return o; }
  var usedSid = function (sid) { return X.fat.some(function (f) { return f.lines.some(function (l) { return l.sid === sid; }); }); };
  function generate(p) {
    var made = 0, added = 0;
    act().forEach(function (c) {
      var fee = +c.tarifaMujore || 0, f = X.fat.find(function (x) { return String(x.cid) === String(c.id) && x.per === p; }), lines = [];
      if (f && f.fisAt) return;  // e lëshuar: shërbimet e reja shkojnë në faturimin tjetër
      if (!f && fee && p >= stM(c)) lines.push({ t: 'Tarifa mujore ' + plabel(p), a: fee });
      (X.sv || []).forEach(function (s) { if (String(s.cid) === String(c.id) && s.bill === 'inv' && !s.invd && !usedSid(s.id)) lines.push({ t: 'Shërbim: ' + s.type, a: +s.amt || 0, sid: s.id }); });
      if (!lines.length) return;
      if (f) { f.lines = f.lines.concat(lines); added++; } else { X.fat.push({ id: uid(), cid: c.id, per: p, mode: c.payMode || 'pf_bank', lines: lines, by: ME.name, cm: [] }); made++; }
    });
    return { made: made, added: added };
  }
  function draw() {
    var L = X.fat.filter(function (f) { return f.per === per; }).sort(function (a, b) { return String(cl(a.cid).emriKompanise).localeCompare(String(cl(b.cid).emriKompanise)); });
    var T = L.reduce(function (a, f) { var t = total(f); a.t += t; if (f.fisAt) a.i += t; if (f.paidAt) a.p += t; return a; }, { t: 0, i: 0, p: 0 });
    var rows = L.map(function (f) {
      var c = cl(f.cid), nx = nextStep(f), id = f.id, sp = steps(f).map(function (s) { return '<span title="' + (f[s[0]] ? fd(f[s[0]]) : '') + '" style="margin-right:8px;color:' + (f[s[0]] ? '#1d7a46' : '#9ca3af') + '">' + (f[s[0]] ? '✓' : '○') + ' ' + s[1].split(' ')[0] + (s[0] === 'fisAt' ? ' fiskale' : '') + '</span>'; }).join('');
      return '<tr' + (late(f) ? ' class="lr"' : '') + '><td><b>' + E(c.emriKompanise || '—') + '</b><small style="display:block">' + E(c.nipt || '') + '</small></td>' +
        '<td><select onchange="xFatMode(\'' + id + '\',this.value)">' + Object.keys(MODES).map(function (m) { return '<option value="' + m + '"' + (m === f.mode ? ' selected' : '') + '>' + MODES[m] + '</option>'; }).join('') + '</select></td>' +
        '<td title="' + E(f.lines.map(function (l) { return l.t + ': ' + money(l.a); }).join('\n')) + '">' + money(total(f)) + (f.lines.length > 1 ? '<small style="display:block">' + f.lines.length + ' zëra</small>' : '') + '</td>' +
        '<td><b>' + status(f) + '</b>' + (late(f) ? ' <span style="color:#b4443b">· pa pagesë mbi 7 ditë</span>' : '') + '<small style="display:block">' + sp + '</small>' + (f.fisNo ? '<small>Fatura nr. ' + E(f.fisNo) + '</small>' : '') + '</td>' +
        '<td style="white-space:nowrap">' + (nx ? '<button class="btn btn-success btn-small" onclick="xFatNext(\'' + id + '\')">' + nx[2] + '</button> ' : '') + (steps(f).some(function (s) { return f[s[0]]; }) ? '<button class="btn btn-secondary btn-small" onclick="xFatUndo(\'' + id + '\')">↩</button>' : '') + '</td>' +
        '<td><details><summary>💬 ' + (f.cm || []).length + '</summary>' + (f.cm || []).map(function (m) { return '<div style="margin:4px 0"><small>' + E(fd(m.at)) + ' · ' + E(m.by) + '</small><br>' + E(m.t) + '</div>'; }).join('') + '<input id="fc_' + id + '" placeholder="Koment…" style="width:170px"> <button class="btn btn-primary btn-small" onclick="xFatCm(\'' + id + '\')">+</button></details></td></tr>';
    }).join('');
    P1.innerHTML = A.sec('Faturimi mujor', '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><label>Muaji (si “sheet”):</label><select id="fat_per" onchange="xFatPer(this.value)">' + periods().map(function (p) { return '<option value="' + p + '"' + (p === per ? ' selected' : '') + '>' + plabel(p) + '</option>'; }).join('') + '</select>' +
      '<button class="btn btn-primary" onclick="xFatGen()">Gjenero faturimet e muajit</button><button class="btn btn-export" onclick="xFatXls()">⬇ Excel (një sheet për muaj)</button><button class="btn btn-secondary" onclick="xFatCsv()">CSV këtë muaj</button></div>' +
      '<div style="margin-bottom:10px"><b>Për ' + plabel(per) + ':</b> për t’u faturuar ' + money(T.t) + ' · fiskale të lëshuara ' + money(T.i) + ' · të arkëtuara ' + money(T.p) + ' · <b>pa arkëtuar ' + money(T.t - T.p) + '</b></div>' +
      '<div class="table-section"><table style="min-width:900px"><thead><tr><th>Klienti</th><th>Mënyra e pagesës</th><th>Shuma</th><th>Statusi</th><th>Hapi tjetër</th><th>Komente</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="no-data">Asnjë faturim për këtë muaj. Shtyp “Gjenero faturimet e muajit”: merr tarifat mujore dhe shërbimet e veçanta pa faturuar.</td></tr>') + '</tbody></table></div>' +
      '<p class="hintp">Rreshti i kuq = pa pagesë mbi 7 ditë pas proformës / faturës. Rrjedhat: proformë+cash → arkëtim → fiskale; proformë+bankë → pagesa hyri në bankë → fiskale; fiskale me bankë → pagesa.</p>');
  }
  var byId = function (id) { return X.fat.find(function (f) { return f.id === id; }); };
  var save = function () { A.sv(); draw(); };
  window.xFatPer = function (p) { per = p; draw(); };
  window.xFatGen = function () { var el = document.getElementById('fat_per'); if (el && el.value) per = el.value; var r = generate(per); A.sv(); draw(); if (window.xToast) window.xToast(r.made || r.added ? 'U krijuan ' + r.made + ' faturime' + (r.added ? ', u shtuan shërbime te ' + r.added : '') + '.' : 'Nuk ka asgjë të re për t’u faturuar.'); };
  window.xFatMode = function (id, m) { var f = byId(id); if (!f) return; f.mode = m; var c = cl(f.cid); c.payMode = m; if (typeof saveData === 'function') saveData(); save(); };
  window.xFatNext = function (id) {
    var f = byId(id), s = f && nextStep(f); if (!s) return;
    if (s[0] === 'proAt') { var pn = prompt('Nr. i proformës (opsionale):', ''); if (pn === null) return; f.proNo = pn; }
    if (s[0] === 'fisAt') { var fn = prompt('Nr. i faturës fiskale (opsionale):', ''); if (fn === null) return; f.fisNo = fn; f.lines.forEach(function (l) { var sv = l.sid && (X.sv || []).find(function (x) { return x.id === l.sid; }); if (sv) sv.invd = true; }); }
    f[s[0]] = new Date().toISOString(); (f.log = f.log || []).push({ k: s[0], by: ME.name, at: f[s[0]] }); save();
  };
  window.xFatUndo = function (id) {
    var f = byId(id); if (!f) return; var d = steps(f).filter(function (s) { return f[s[0]]; }), s = d[d.length - 1]; if (!s || !confirm('Të zhbëhet “' + s[1] + '”?')) return;
    f[s[0]] = ''; if (s[0] === 'fisAt') f.lines.forEach(function (l) { var sv = l.sid && (X.sv || []).find(function (x) { return x.id === l.sid; }); if (sv) sv.invd = false; }); save();
  };
  window.xFatCm = function (id) { var f = byId(id), el = document.getElementById('fc_' + id); if (!f || !el || !el.value.trim()) return; (f.cm = f.cm || []).push({ by: ME.name, at: new Date().toISOString(), t: el.value.trim() }); save(); };
  var rowsFor = function (p) { return X.fat.filter(function (f) { return f.per === p; }).map(function (f) { var c = cl(f.cid); return [c.emriKompanise || '', c.nipt || '', MODES[f.mode] || '', total(f), f.proNo || '', fd(f.proAt), fd(f.paidAt), f.fisNo || '', fd(f.fisAt), status(f), (f.cm || []).map(function (m) { return m.by + ': ' + m.t; }).join(' | ')]; }); };
  var HEAD = ['Klienti', 'NIPT', 'Mënyra e pagesës', 'Shuma (Lekë)', 'Nr. proformës', 'Data e proformës', 'Data e pagesës', 'Nr. fiskale', 'Data fiskale', 'Statusi', 'Komente'];
  var dl = function (name, type, body) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: type })); a.download = name; a.click(); };
  window.xFatCsv = function () { var q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }; dl('Faturimi_' + per + '.csv', 'text/csv;charset=utf-8', '\ufeff' + [HEAD].concat(rowsFor(per)).map(function (r) { return r.map(q).join(';'); }).join('\r\n')); };
  window.xFatXls = function () {  // Excel (SpreadsheetML): një worksheet për muaj, me emrin e muajit si në Excel-in tënd
    var x = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var ps = Object.keys(X.fat.reduce(function (o, f) { o[f.per] = 1; return o; }, {})).sort().reverse(); if (!ps.length) return alert('Nuk ka faturime për eksport.');
    var ws = ps.map(function (p) { return '<Worksheet ss:Name="' + x(plabel(p)) + '"><Table>' + [HEAD].concat(rowsFor(p)).map(function (r) { return '<Row>' + r.map(function (v) { return typeof v === 'number' ? '<Cell><Data ss:Type="Number">' + v + '</Data></Cell>' : '<Cell><Data ss:Type="String">' + x(v) + '</Data></Cell>'; }).join('') + '</Row>'; }).join('') + '</Table></Worksheet>'; }).join('');
    dl('Faturimi_' + A.TODAY + '.xls', 'application/vnd.ms-excel', '<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' + ws + '</Workbook>');
  };

  /* ---------- Paneli i menaxherit (vetëm administrator) ---------- */
  function mgr() {
    var p = A.TODAY.slice(0, 7), T = X.mt || [], who = function (t) { return t.us && t.us.length ? t.us : [t.u]; };
    var doneM = T.filter(function (t) { return t.st === 'done' && String(t.doneAt || '').slice(0, 7) === p; });
    var users = (X.users || []).map(function (n) {
      var op = T.filter(function (t) { return t.st !== 'done' && who(t).indexOf(n) >= 0; }), mine = doneM.filter(function (t) { return t.doneBy === n; });
      return { name: n, open: op.length, late: op.filter(function (t) { return t.due && t.due < A.TODAY; }).length, done: mine.length, mins: mine.reduce(function (a, t) { return a + (+t.mins || 0); }, 0) };
    });
    var cs = cls().filter(function (c) { return +c.tarifaMujore; }).map(function (c) {
      var mins = doneM.filter(function (t) { return String(t.cid) === String(c.id); }).reduce(function (a, t) { return a + (+t.mins || 0); }, 0);
      return { name: c.emriKompanise, fee: +c.tarifaMujore, mins: mins, rate: mins ? Math.round((+c.tarifaMujore) / (mins / 60)) : null };
    }).sort(function (a, b) { return (a.rate == null ? 1e12 : a.rate) - (b.rate == null ? 1e12 : b.rate); });
    var F = X.fat.filter(function (f) { return f.per === p; }), bill = { total: 0, issued: 0, paid: 0, n: F.length };
    F.forEach(function (f) { var t = total(f); bill.total += t; if (f.fisAt) bill.issued += t; if (f.paidAt) bill.paid += t; });
    return { users: users, clients: cs, bill: bill, per: p };
  }
  window.xMgrData = mgr;
  var hrs = function (m) { return (m / 60).toFixed(1) + ' orë'; };
  function drawMgr() {
    var d = mgr();
    P2.innerHTML = A.sec('Paneli i menaxherit – ' + plabel(d.per),
      '<h4>Ngarkesa e ekipit</h4><div class="table-section"><table style="min-width:600px"><thead><tr><th>Kolegu</th><th>Të hapura</th><th>Me vonesë</th><th>Kryer këtë muaj</th><th>Koha e kryer</th></tr></thead><tbody>' + d.users.map(function (u) { return '<tr><td><b>' + E(u.name) + '</b></td><td>' + u.open + '</td><td style="color:' + (u.late ? '#b4443b' : 'inherit') + '">' + u.late + '</td><td>' + u.done + '</td><td>' + hrs(u.mins) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<h4 style="margin-top:18px">Faturimi i muajit</h4><p>Për t’u faturuar <b>' + money(d.bill.total) + '</b> · fiskale të lëshuara ' + money(d.bill.issued) + ' · arkëtuar ' + money(d.bill.paid) + ' · <b>pa arkëtuar ' + money(d.bill.total - d.bill.paid) + '</b> (' + d.bill.n + ' faturime)</p>' +
      '<h4 style="margin-top:18px">Koha dhe tarifa për klient</h4><div class="table-section"><table style="min-width:600px"><thead><tr><th>Klienti</th><th>Tarifa mujore</th><th>Koha këtë muaj</th><th>Lekë për orë</th></tr></thead><tbody>' + d.clients.map(function (c) { return '<tr><td><b>' + E(c.name) + '</b></td><td>' + money(c.fee) + '</td><td>' + (c.mins ? hrs(c.mins) : '<span class="miss">—</span>') + '</td><td>' + (c.rate == null ? '<span class="miss">pa kohë të regjistruar</span>' : money(c.rate)) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="hintp">Koha llogaritet vetëm nga detyrat e ekipit dhe shërbimet e veçanta të mbyllura këtë muaj. Detyrimet e zakonshme mujore (kutitë ✓) nuk kanë kohë të matur, ndaj “Lekë për orë” është tregues orientues, jo fitim i saktë.</p>');
  }
  window.addEventListener('crm:sync', function () { var a = function (i) { var e = document.getElementById(i); return e && e.classList.contains('active'); }; if (a('tfat')) draw(); if (a('tmgr')) drawMgr(); });
})();
