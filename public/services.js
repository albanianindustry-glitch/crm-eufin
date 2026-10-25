/* Shërbime të veçanta (proces më vete, me faturim), Referuesit dhe eksporti i TVSH-së me një rresht për muaj. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, adm = ME.role === 'admin';
  X.sv = X.sv || []; X.ref = X.ref || [];
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var cls = function () { return typeof clients !== 'undefined' ? clients : []; };
  var cname = function (id) { var c = cls().find(function (x) { return String(x.id) === String(id); }); return c ? c.emriKompanise : '—'; };
  var TYPES = ['PASH', 'Dërgim dokumenti', 'Procedurë për marrje llogarie bankare', 'Aplikim për licencë', 'Aplikim për leje unike', 'Tjetër'];
  var show = 'open', tabs = document.querySelector('.tabs');
  function mkTab(id, label) {
    var b = document.createElement('button'); b.className = 'tab'; b.setAttribute('onclick', "switchTab('" + id + "')"); b.textContent = label; tabs.appendChild(b);
    var p = document.createElement('div'); p.id = id; p.className = 'tab-content'; document.getElementById('detyrat').insertAdjacentElement('afterend', p); return { b: b, p: p };
  }
  var T1 = mkTab('tsv', 'Shërbime të veçanta'), T2 = mkTab('tref', 'Referuesit');
  var _sw = window.switchTab; window.switchTab = function (t) { _sw(t); if (t === 'tsv') drawSv(); if (t === 'tref') drawRef(); };
  var sel = function (id, arr, ph) { return '<select id="' + id + '">' + (ph ? '<option value="">' + ph + '</option>' : '') + arr.map(function (o) { return '<option value="' + E(o[0]) + '">' + E(o[1]) + '</option>'; }).join('') + '</select>'; };
  function fdur(m) { m = Math.round(m); if (m < 60) return Math.max(m, 1) + ' min'; var h = Math.floor(m / 60); return h < 24 ? h + ' orë ' + (m % 60) + ' min' : Math.floor(h / 24) + ' ditë ' + (h % 24) + ' orë'; }
  var tk = function (s) { return s.tid ? X.mt.find(function (t) { return t.id === s.tid; }) : null; }, src = function (s) { return tk(s) || s; };
  var dur = function (s) { var o = src(s); return o.st === 'done' ? (o.mins ? fdur(o.mins) : '') : (o.at ? fdur((o.mp || 0) + (Date.now() - new Date(o.at)) / 6e4) : ''); };
  var badge = function () { T1.b.textContent = 'Shërbime të veçanta (' + X.sv.filter(function (s) { return src(s).st !== 'done'; }).length + ')'; };

  /* ---------- Shërbime të veçanta ---------- */
  function drawSv() {
    var users = (X.users || []).map(function (n) { return [n, n]; }), L = X.sv.filter(function (s) { return show === 'all' || (show === 'done') === (src(s).st === 'done'); });
    var nO = X.sv.filter(function (s) { return src(s).st !== 'done'; }).length, b = function (k, l) { return '<button class="btn ' + (show === k ? 'btn-primary' : 'btn-secondary') + '" onclick="xSvF(\'' + k + '\')">' + l + '</button>'; };
    T1.p.innerHTML = A.sec('Shërbime të veçanta (kërkesa jashtë detyrimeve mujore)',
      '<details><summary class="btn btn-primary btn-small" style="display:inline-block;cursor:pointer">+ Hap proces të ri</summary><div class="form-grid" style="margin-top:10px">' +
      '<div class="form-group"><label>Klienti *</label>' + sel('sv_c', cls().map(function (c) { return [c.id, c.emriKompanise]; }), '— zgjidh —') + '</div>' +
      '<div class="form-group"><label>Lloji *</label>' + sel('sv_t', TYPES.map(function (t) { return [t, t]; })) + '</div>' +
      '<div class="form-group"><label>Përshkrim / detaje</label><input id="sv_x"></div>' +
      '<div class="form-group"><label>Përgjegjësi</label>' + sel('sv_u', users, '— unë —') + '</div>' +
      '<div class="form-group"><label>Afati</label><input type="date" id="sv_d" value="' + A.TODAY + '"></div>' +
      '<div class="form-group"><label>Faturimi *</label><select id="sv_b" onchange="document.getElementById(\'sv_a\').parentNode.style.display=this.value===\'inv\'?\'\':\'none\'"><option value="inv">Faturohet veç nga Eufin</option><option value="fee">Përfshihet në tarifën mujore</option></select></div>' +
      '<div class="form-group"><label>Shuma e faturës (Lekë)</label><input type="number" id="sv_a"></div></div><button class="btn btn-primary" onclick="xSvAdd()">Hap procesin</button></details>' +
      '<div style="margin:12px 0;display:flex;gap:8px;flex-wrap:wrap">' + b('open', 'Të hapura (' + nO + ')') + b('done', 'Të përfunduara (' + (X.sv.length - nO) + ')') + b('all', 'Të gjitha') + '</div>' +
      (L.length ? L.map(function (s) {
        var st = src(s).st, canA = adm || s.u === ME.name || s.by === ME.name, inv = s.bill === 'inv', warn = st === 'done' && inv && !s.invd;
        return '<div class="skadje-item" style="display:block;border-left-color:' + (st === 'done' ? '#28a745' : '#2a5298') + '"><strong>' + E(s.type) + '</strong> – ' + E(cname(s.cid)) + (s.x ? ' · ' + E(s.x) : '') +
          '<br><small>' + (inv ? '💰 Faturohet veç' + (s.amt ? ': ' + Math.round(+s.amt).toLocaleString('de-DE') + ' Lekë' : '') + (s.invd ? ' · <b>u faturua</b>' : ' · <b style="color:#b4443b">pa faturuar</b>') : '✔ Përfshihet në tarifën mujore') +
          ' · përgjegjës: ' + E(s.u || '—') + ' · afati: ' + (xFd(s.due) || '—') + ' · statusi: ' + ({ todo: 'për t’u bërë', prog: 'në proces', done: 'përfunduar' })[st] + ' · ⏱ ' + dur(s) + '</small>' +
          (warn ? '<div class="alert alert-warning" style="margin:6px 0">Procesi është mbyllur por nuk është faturuar ende.</div>' : '') +
          '<div style="margin-top:6px;display:flex;gap:5px;flex-wrap:wrap">' + (!canA ? '<small style="color:#6b7280">Vetëm përgjegjësi ose krijuesi mund ta ndryshojë.</small>' : '') + (canA && st === 'todo' ? '<button class="btn btn-secondary btn-small" onclick="xSvSt(\'' + s.id + '\',\'prog\')">Fillo</button>' : '') +
          (!canA ? '' : st !== 'done' ? '<button class="btn btn-success btn-small" onclick="xSvSt(\'' + s.id + '\',\'done\')">U krye</button>' : '<button class="btn btn-secondary btn-small" onclick="xSvSt(\'' + s.id + '\',\'todo\')">Rihap</button>') +
          (canA && inv && !s.invd ? '<button class="btn btn-primary btn-small" onclick="xSvInv(\'' + s.id + '\')">U faturua</button>' : '') +
          (adm || s.by === ME.name ? '<button class="btn btn-danger btn-small" onclick="xSvDel(\'' + s.id + '\')">Fshi</button>' : '') + '</div></div>';
      }).join('') : '<div class="alert alert-success">Asnjë proces këtu.</div>'));
    document.getElementById('sv_a').parentNode.style.display = ''; badge();
  }
  var save = function () { A.sv(); drawSv(); };
  window.xSvF = function (m) { show = m; drawSv(); };
  window.xSvAdd = function () {
    var g = function (i) { return document.getElementById(i).value; };
    if (!g('sv_c')) return alert('Zgjidh klientin.');
    var id = uid(), tid = uid(), u = g('sv_u') || ME.name, now = new Date().toISOString();
    // Çdo proces krijon edhe një detyrë: del te "Detyrat e mia" të përgjegjësit, e njofton dhe e mat kohën automatikisht.
    X.mt.push({ id: tid, title: 'Shërbim: ' + g('sv_t'), cid: g('sv_c'), due: g('sv_d'), prio: 'n', rec: '', desc: g('sv_x').trim(), u: u, us: [u], st: 'todo', by: ME.name, at: now, sid: id });
    X.sv.push({ id: id, tid: tid, cid: g('sv_c'), type: g('sv_t'), x: g('sv_x').trim(), u: u, due: g('sv_d'), bill: g('sv_b'), amt: g('sv_b') === 'inv' ? g('sv_a') : '', invd: false, st: 'todo', by: ME.name, at: now });
    save();
  };
  window.xSvSt = function (id, st) {
    var s = X.sv.find(function (x) { return x.id === id; }); if (!s) return;
    if (tk(s) && window.xMt) { xMt(s.tid, st); if (st === 'done' && window.xToast) xToast(s.bill === 'inv' && !s.invd ? 'U mbyll. Mos harro ta faturosh.' : 'Procesi u mbyll. E gjen te "Të përfunduara".'); drawSv(); return; }
    if (st !== 'done' && s.doneTs) { s.mp = s.mins || 0; s.at = new Date().toISOString(); }
    s.st = st; if (st === 'done') { s.doneTs = new Date().toISOString(); s.mins = (s.mp || 0) + Math.max(1, Math.round((new Date(s.doneTs) - new Date(s.at)) / 6e4)); } else { s.doneTs = ''; s.mins = 0; }
    save(); if (st === 'done' && window.xToast) xToast(s.bill === 'inv' && !s.invd ? 'U mbyll. Mos harro ta faturosh.' : 'Procesi u mbyll. E gjen te "Të përfunduara".');
  };
  window.xSvInv = function (id) { var s = X.sv.find(function (x) { return x.id === id; }); if (s) { s.invd = true; save(); } };
  window.xSvDel = function (id) { if (!confirm('Të fshihet ky proces?')) return; X.sv = X.sv.filter(function (x) { return x.id !== id; }); X.mt = X.mt.filter(function (t) { return t.sid !== id; }); save(); };

  /* ---------- Referuesit ---------- */
  function drawRef() {
    var rows = X.ref.map(function (r) {
      var L = cls().filter(function (c) { return (c.fx || {}).ref === r.id; });
      return '<tr><td><b>' + E(r.name) + '</b><small style="display:block">' + E(r.country || '') + '</small></td><td>' + E(r.email || '') + '<small style="display:block">' + E(r.phone || '') + '</small></td><td>' + L.length + '</td><td>' + (L.map(function (c) { return E(c.emriKompanise); }).join(', ') || '<span style="color:#999">—</span>') + '</td><td>' + (adm ? '<button class="btn btn-danger btn-small" onclick="xRefDel(\'' + r.id + '\')">Fshi</button>' : '') + '</td></tr>';
    }).join('');
    T2.p.innerHTML = A.sec('Referuesit (bashkëpunëtorë që na dërgojnë klientë)',
      '<div class="form-grid"><div class="form-group"><label>Emri / kompania *</label><input id="rf_n"></div><div class="form-group"><label>Shteti</label><input id="rf_c"></div><div class="form-group"><label>Email</label><input id="rf_e"></div><div class="form-group"><label>Telefon</label><input id="rf_p"></div></div><button class="btn btn-primary" onclick="xRefAdd()">+ Shto referues</button>' +
      '<div class="table-section" style="margin-top:14px"><table style="min-width:640px"><thead><tr><th>Referuesi</th><th>Kontakti</th><th>Klientë</th><th>Klientët e referuar</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="no-data">Asnjë referues. Te regjistrimi i klientit zgjidh "Referuar nga".</td></tr>') + '</tbody></table></div>');
  }
  window.xRefAdd = function () { var n = document.getElementById('rf_n').value.trim(); if (!n) return alert('Shkruaj emrin.'); X.ref.push({ id: uid(), name: n, country: document.getElementById('rf_c').value, email: document.getElementById('rf_e').value, phone: document.getElementById('rf_p').value }); A.sv(); drawRef(); };
  window.xRefDel = function (id) { if (cls().some(function (c) { return (c.fx || {}).ref === id; }) && !confirm('Ky referues ka klientë të lidhur. Të fshihet gjithsesi?')) return; X.ref = X.ref.filter(function (r) { return r.id !== id; }); A.sv(); drawRef(); };
  // Zgjedhësi "Referuar nga" te profili i klientit
  var _set = window.setFx; window.setFx = function (f) {
    var s = document.getElementById('fx_ref'); if (s) s.innerHTML = '<option value="">— Jo i referuar —</option>' + X.ref.map(function (r) { return '<option value="' + E(r.id) + '">' + E(r.name) + (r.country ? ' (' + E(r.country) + ')' : '') + '</option>'; }).join('');
    _set(f);
  };

  /* ---------- TVSH: Excel me një rresht për muaj ---------- */
  var COLS = [['shitjetPerjashtuar', 'Shitje të përjashtuara'], ['shitjetEksport', 'Eksporte'], ['shitjetVlTatushme', 'Shitje të tatueshme'], ['shitjetTVSH', 'TVSH në shitje'], ['shitjetTotali', 'Totali i shitjeve'],
    ['importePerjashtuar', 'Importe të përjashtuara'], ['importeVlTatushme', 'Importe të tatueshme'], ['importeTVSH', 'TVSH në importe'], ['importeTotali', 'Totali i importeve'],
    ['blerjetVenditVlTatushme', 'Blerje vendi të tatueshme'], ['blerjetVenditTVSH', 'TVSH në blerje vendi'], ['blerjetVenditTotali', 'Totali blerje vendi'],
    ['blerjetInvestimitVlTatushme', 'Investime të tatueshme'], ['blerjetInvestimitTVSH', 'TVSH në investime'], ['blerjetInvestimitTotali', 'Totali investime']];
  var mIdx = function (m) { return A.MN.findIndex(function (n) { return n.toLowerCase() === String(m || '').trim().toLowerCase(); }); };
  window.xTvshRows = function () {
    var D = (typeof deklarimeTVSH !== 'undefined' ? deklarimeTVSH : []).slice(); if (!D.length) return alert('Nuk ka deklarime TVSH për eksport.');
    D.sort(function (a, b) { return String(a.nipt).localeCompare(String(b.nipt)) || (+a.viti - +b.viti) || (mIdx(a.muaji) - mIdx(b.muaji)); });
    var f = function (n) { return (+n || 0).toFixed(2).replace('.', ','); }, q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
    var out = [['Klienti', 'NIPT', 'Viti', 'Muaji'].concat(COLS.map(function (c) { return c[1]; }), ['TVSH për t’u paguar', 'TVSH kreditore (e bartur)']).map(q).join(';')], carry = {};
    D.forEach(function (d) {
      var cl = cls().find(function (c) { return c.nipt === d.nipt; }), cr = carry[d.nipt] || 0, net = (+d.tvshPerTuPaguar || 0) - cr, pay = net > 0 ? net : 0;
      carry[d.nipt] = net < 0 ? -net : 0;
      out.push([q(cl ? cl.emriKompanise : ''), q(d.nipt), d.viti, q(d.muaji)].concat(COLS.map(function (c) { return f(d[c[0]]); }), [f(pay), f(carry[d.nipt])]).join(';'));
    });
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + out.join('\r\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'TVSH_rreshta_sipas_muajit_' + A.TODAY + '.csv'; a.click();
  };
  var tv = document.getElementById('tvsh'); if (tv) tv.insertAdjacentHTML('afterbegin', '<div style="margin-bottom:10px"><button class="btn btn-export" onclick="xTvshRows()">⬇ Excel: një rresht për muaj (çdo klient, çdo periudhë)</button> <small>TVSH kreditore e bartur llogaritet automatikisht në kolonën e fundit.</small></div>');
  if (adm) { var chg = false; X.sv.forEach(function (s) { var t = tk(s); if (t && (s.st !== t.st || (+s.mins || 0) !== (+t.mins || 0))) { s.st = t.st; s.mins = t.mins || 0; chg = true; } }); if (chg) A.sv(); }   // njehsim i statuseve të vjetra
  document.addEventListener('focusin', function (e) {   // lista e referuesve gjithmonë e freskët kur hapet zgjedhësi
    var el = e.target; if (!el || el.id !== 'fx_ref') return; var cur = el.value;
    el.innerHTML = '<option value="">— Jo i referuar —</option>' + X.ref.map(function (r) { return '<option value="' + E(r.id) + '">' + E(r.name) + (r.country ? ' (' + E(r.country) + ')' : '') + '</option>'; }).join(''); el.value = cur;
  });
  var fm = document.getElementById('fx_forma');   // Përfaqësues tatimor: vetëm TVSH
  if (fm) fm.addEventListener('change', function () {
    var tr = fm.value === 'Përfaqësues tatimor';   // opsionet që nuk zbatohen çaktivizohen me shpjegim
    ['fx_punonjes', 'fx_magazine', 'fx_qera', 'fx_vendore', 'fx_imp', 'fx_dual', 'fx_fonde'].forEach(function (i) { var e = document.getElementById(i); if (e) { if (tr) e.checked = false; e.disabled = tr; e.title = tr ? 'Nuk zbatohet për përfaqësuesin tatimor (vetëm TVSH)' : ''; } });
    if (!tr) return;
    var t = document.getElementById('statusTVSH'); if (t) t.value = 'me_tvsh';
    if (window.xToast) xToast('Përfaqësues tatimor: i vetmi detyrim fiskal është TVSH; detyrimet e tjera çaktivizohen.');
  });
  window.addEventListener('crm:sync', function () { var a = function (i) { var e = document.getElementById(i); return e && e.classList.contains('active'); }; if (a('tsv')) drawSv(); if (a('tref')) drawRef(); badge(); });
  badge();
})();
