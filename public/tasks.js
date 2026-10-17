/* Detyrat e mia: çdo përdorues sheh detyrat që i janë caktuar, i punon brenda CRM-së (status, koment, orë) dhe admini ndjek ecurinë. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, isAdmin = ME.role === 'admin', show = 'open', focus = null;
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var save = function () { A.sv(); draw(); if (window.renderTm) renderTm(); badge(); };
  var cnm = function (id) { var c = (typeof clients !== 'undefined' ? clients : []).find(function (x) { return String(x.id) === String(id); }); return c ? c.emriKompanise : '—'; };
  var who = function (t) { return t.us && t.us.length ? t.us : (t.u ? [t.u] : []); }; window.xWho = who;
  var mine = function () { return X.mt.filter(function (t) { return who(t).indexOf(ME.name) >= 0; }); };
  function fdur(m) { m = Math.round(m); if (m < 1) return 'nën 1 min'; if (m < 60) return m + ' min'; var h = Math.floor(m / 60), r = m % 60; if (h < 24) return h + ' orë' + (r ? ' ' + r + ' min' : ''); return Math.floor(h / 24) + ' ditë ' + (h % 24) + ' orë'; }
  function tdur(t) { if (t.st === 'done') return t.mins ? 'Koha: ' + fdur(t.mins) : ''; return t.at ? 'Po zgjat: ' + fdur((t.mp || 0) + (Date.now() - new Date(t.at)) / 6e4) : ''; }
  function assignBox() {
    var o = '<option value="">—</option>' + (X.users || []).filter(function (n) { return n !== ME.name; }).map(function (n) { return '<option>' + E(n) + '</option>'; }).join('');
    return '<details style="margin-bottom:12px"><summary class="btn btn-primary btn-small" style="display:inline-block;cursor:pointer">+ Cakto detyrë një kolegu</summary><div class="form-grid" style="margin-top:10px"><div class="form-group"><label>Çfarë duhet bërë *</label><input id="qa_t"></div><div class="form-group"><label>Koleg 1 *</label><select id="qa_1">' + o + '</select></div><div class="form-group"><label>Koleg 2 (opsional – e mbyll cilido)</label><select id="qa_2">' + o + '</select></div><div class="form-group"><label>Afati</label><input type="date" id="qa_d" value="' + A.TODAY + '"></div></div><label style="display:block;margin:8px 0"><input type="checkbox" id="qa_r" checked> Mbyllet vetëm pasi ta aprovojë kolegu tjetër (kur janë dy përgjegjës)</label><button class="btn btn-primary" onclick="xQa()">Dërgo detyrën</button> <small>Koha llogaritet automatikisht nga çasti i caktimit deri sa ta mbyllë dikush.</small></details>';
  }
  window.addEventListener('crm:sync', function () { draw(); badge(); });
  window.xQa = function () {
    var t = document.getElementById('qa_t').value.trim(), a = document.getElementById('qa_1').value, b = document.getElementById('qa_2').value;
    if (!t || !a) return alert('Shkruaj detyrën dhe zgjidh të paktën një koleg.');
    var us = [a, b].filter(function (x, i, r) { return x && r.indexOf(x) === i; });
    X.mt.push({ id: uid(), title: t, cid: '', due: document.getElementById('qa_d').value, prio: 'n', rec: '', desc: '', u: us[0], us: us, rev: us.length > 1 && !!(document.getElementById('qa_r') || {}).checked, st: 'todo', by: ME.name, at: new Date().toISOString() });
    A.sv(); draw(); badge(); if (window.xToast) xToast('Detyra u caktua te ' + us.join(' dhe ') + '.');
  };
  var open = function (t) { return t.st !== 'done'; };

  var tabs = document.querySelector('.tabs'), btn = document.createElement('button');
  btn.className = 'tab'; btn.setAttribute('onclick', "switchTab('tmine')"); tabs.insertBefore(btn, tabs.firstChild);
  var pane = document.createElement('div'); pane.id = 'tmine'; pane.className = 'tab-content';
  document.getElementById('detyrat').insertAdjacentElement('afterend', pane);
  var _sw = window.switchTab; window.switchTab = function (t) { _sw(t); if (t === 'tmine') draw(); };

  function badge() { var n = mine().filter(open).length; btn.textContent = 'Detyrat e mia (' + n + ')'; }
  function late(t) { return t.due && open(t) && t.due < A.TODAY; }

  function card(t, showWho) {
    var cm = (t.cm || []).map(function (c) { return '<div style="border-top:1px solid #e1e5ec;padding:6px 0"><small><b>' + E(c.by) + '</b> · ' + E(new Date(c.at).toLocaleString('sq-AL')) + '</small><div>' + E(c.tx) + '</div></div>'; }).join('');
    var hrs = (t.cm || []).reduce(function (s, c) { return s + (+c.h || 0); }, 0);
    return '<div class="skadje-item" id="tk_' + t.id + '" style="display:block;border-left-color:' + (late(t) ? '#dc3545' : t.prio === 'h' ? '#b7791f' : '#2a5298') + '">' +
      '<strong>' + E(t.title) + '</strong> ' + (late(t) ? '<span style="color:#b4443b">· me vonesë</span>' : '') +
      '<br><small>Afati: ' + (xFd(t.due) || '—') + ' · Statusi: ' + ({ todo: 'Për t’u bërë', prog: 'Në proces', done: 'Kryer' })[t.st] + (showWho || who(t).length > 1 ? ' · përgjegjës: ' + E(who(t).join(', ') || '—') : '') + (t.cid ? ' · klienti: ' + E(cnm(t.cid)) : '') + (t.by ? ' · caktuar nga ' + E(t.by) : '') + (t.st === 'done' && t.doneAt ? ' · kryer më ' + E(xFd(t.doneAt)) : '') + (t.doneBy ? ' · mbyllur nga ' + E(t.doneBy) : '') + (tdur(t) ? ' · ⏱ ' + tdur(t) : '') + '</small>' +
      (t.desc ? '<div style="margin:6px 0">' + E(t.desc) + '</div>' : '') +
      '<div style="margin:6px 0;display:flex;gap:5px;flex-wrap:wrap">' +
      (t.pend ? pendBtns(t) : '') +
      (xCan(t, 'act') && t.st === 'todo' && !t.pend ? '<button class="btn btn-secondary btn-small" onclick="xMine(\'' + t.id + '\',\'prog\')">Fillo</button>' : '') +
      (t.pend || !xCan(t, 'act') ? '' : t.st !== 'done' ? '<button class="btn btn-success btn-small" onclick="xMine(\'' + t.id + '\',\'done\')">U krye</button>' : '<button class="btn btn-secondary btn-small" onclick="xMine(\'' + t.id + '\',\'todo\')">Rihap</button>') + '</div>' +
      cm + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input id="cx_' + t.id + '" placeholder="Shënim / përditësim për detyrën" style="flex:1;min-width:180px;padding:8px;border:1px solid #cfd5df;border-radius:5px">' +
      '' +
      '<button class="btn btn-primary btn-small" onclick="xCom(\'' + t.id + '\')">Shto</button></div></div>';
  }

  function draw() {
    var all = show === 'all', M = mine(), L = all ? X.mt.slice() : M.slice();
    if (show === 'open') L = L.filter(open); else if (show === 'done') L = L.filter(function (t) { return !open(t); });
    L.sort(function (a, b) { return show === 'done' ? ((b.doneAt || '') > (a.doneAt || '') ? 1 : -1) : ((a.due || '9') < (b.due || '9') ? -1 : 1); });
    var nOpen = M.filter(open).length, nDone = M.length - nOpen, nLate = M.filter(late).length;
    var b = function (k, l) { return '<button class="btn ' + (show === k ? 'btn-primary' : 'btn-secondary') + '" onclick="xMineF(\'' + k + '\')">' + l + '</button>'; };
    var fc = focus && X.mt.find(function (t) { return t.id === focus; }), extra = fc && L.indexOf(fc) < 0 ? '<div style="margin-bottom:14px"><div class="alert alert-warning" style="margin-bottom:6px">Detyra nga njoftimi (nuk është e caktuar te ti):</div>' + card(fc, true) + '</div>' : '';
    pane.innerHTML = A.sec('Detyrat e mia – ' + E(ME.name), assignBox() + extra +
      '<div class="stats"><div class="stat-card"><h3>' + nOpen + '</h3><p>Të hapura</p></div><div class="stat-card ' + (nLate ? 'warning' : 'success') + '"><h3>' + nLate + '</h3><p>Me vonesë</p></div><div class="stat-card success"><h3>' + nDone + '</h3><p>Të kryera</p></div></div>' +
      '<div style="margin:10px 0;display:flex;gap:8px;flex-wrap:wrap">' + b('open', 'Të hapura (' + nOpen + ')') + b('done', 'Të kryera (' + nDone + ')') + (isAdmin ? b('all', 'Të gjithë ekipi') : '') + '</div>' +
      (L.map(function (t) { return card(t, all); }).join('') || '<div class="alert alert-success">' + (show === 'done' ? 'Asnjë detyrë e kryer ende.' : 'Asnjë detyrë e hapur. Detyrat të caktohen nga administratori ose te Detyrat → Detyrat e ekipit.') + '</div>'));
  }
  window.xMineF = function (m) { show = m; focus = null; draw(); };
  // Hapet nga njoftimi: shfaq detyrën, e çon në pamje dhe e ndriçon.
  window.xShowTask = function (id) {
    var t = X.mt.find(function (x) { return x.id === id; }); if (!t) return false;
    if (t.u === ME.name) show = open(t) ? 'open' : 'done'; else if (isAdmin) show = 'all';
    focus = id; btn.click(); draw();
    setTimeout(function () { var e = document.getElementById('tk_' + id); if (e) { e.scrollIntoView({ behavior: 'smooth', block: 'center' }); if (window.xFlash) xFlash(e); } }, 80);
    return true;
  };
  window.xMine = function (id, st) { var t = X.mt.find(function (x) { return x.id === id; }); if (!t) return; if (window.xMt) { xMt(id, st); } else { t.st = st; A.sv(); } if (st === 'done' && window.xToast) xToast('Detyra u krye. E gjen te Detyrat e mia → Të kryera.'); draw(); badge(); };
  window.xCom = function (id) {
    var t = X.mt.find(function (x) { return x.id === id; }), tx = (document.getElementById('cx_' + id).value || '').trim(); if (!t || !tx) return;
    (t.cm = t.cm || []).push({ id: uid(), by: ME.name, at: new Date().toISOString(), tx: tx, h: 0 });
    save();
  };
  // Vetëm admini ose kush e krijoi mund ta fshijë; krijuesi regjistrohet te detyra e re.
  /* APPROVAL-START: detyra me `rev` dhe dy përgjegjës mbyllet në dy hapa (njëri e shënon të kryer, tjetri e aprovon) */
  window.xCan = function (t, what) {   // veprim i lejuar: 'act' = fillo/kryer/rihap (përgjegjësi), 'del'/'edit' = krijuesi; admini gjithçka
    var me = window.CRM_ME; if (!me || !t) return false; if (me.role === 'admin') return true;
    var isC = t.by === me.name, isA = who(t).indexOf(me.name) >= 0 || (!who(t).length && isC);
    return what === 'act' ? isA : isC;
  };
  function pendBtns(t) {
    var mineP = t.pend.by === ME.name;
    return '<span style="color:#b4801e;align-self:center">⏳ ' + E(t.pend.by) + ' e shënoi të kryer – pret aprovimin e kolegut tjetër</span>' +
      (!xCan(t, 'act') ? '' : mineP ? '<button class="btn btn-secondary btn-small" onclick="xMt(\'' + t.id + '\',\'prog\')">Anulo kërkesën</button>'
        : '<button class="btn btn-success btn-small" onclick="xMt(\'' + t.id + '\',\'done\')">Aprovo &amp; mbyll</button><button class="btn btn-danger btn-small" onclick="xTkBack(\'' + t.id + '\')">Kthe prapa</button>');
  }
  var _xmt = window.xMt;
  window.xMt = function (id, st) {
    var t = X.mt.find(function (x) { return x.id === id; });
    if (t && t.rev && who(t).length > 1 && st === 'done' && t.st !== 'done') {
      if (who(t).indexOf(ME.name) < 0 && !isAdmin) return alert('Vetëm përgjegjësit e detyrës mund ta mbyllin.');
      if (!t.pend) {
        t.pend = { by: ME.name, at: new Date().toISOString() }; if (t.st === 'todo') t.st = 'prog'; A.sv(); draw(); badge();
        if (window.xToast) window.xToast('U shënua e kryer. Pret aprovimin e kolegut tjetër para se të mbyllet.');
        return;
      }
      if (t.pend.by === ME.name) { if (window.xToast) window.xToast('Pret ende aprovimin e kolegut tjetër.'); return; }
      var by = t.pend.by; t.pend = null; _xmt(id, 'done');
      t = X.mt.find(function (x) { return x.id === id; }); if (t) { t.doneBy = by; t.apprBy = ME.name; } A.sv(); return;
    }
    if (t && t.pend && st !== 'done') t.pend = null;
    return _xmt(id, st);
  };
  window.xTkBack = function (id) {
    var t = X.mt.find(function (x) { return x.id === id; }); if (!t || !t.pend) return;
    var why = prompt('Pse e kthen prapa? Shkruaj çfarë mungon.', ''); if (why === null) return;
    t.pend = null; (t.cm = t.cm || []).push({ id: uid(), by: ME.name, at: new Date().toISOString(), tx: 'Kthyer pa aprovuar' + (why ? ': ' + why : ''), h: 0 });
    A.sv(); draw(); badge();
  };
  var _x2 = window.xMt;   // statusi i shërbimit ruhet edhe te vetë shërbimi, që shihet njësoj nga çdo përdorues
  window.xMt = function (id, st) {
    var r = _x2(id, st), t = X.mt.find(function (x) { return x.id === id; });
    if (t && t.sid) { var sv = (X.sv || []).find(function (x) { return x.id === t.sid; }); if (sv) { sv.st = t.st; sv.mins = t.mins || 0; sv.doneTs = t.doneTs || ''; sv.pend = t.pend ? 1 : 0; A.sv(); } }
    return r;
  };
  /* APPROVAL-END */
  var _add = window.xMtAdd; window.xMtAdd = function () { var n = X.mt.length; _add(); if (X.mt.length > n) { var t = X.mt[X.mt.length - 1]; t.by = ME.name; t.at = new Date().toISOString(); A.sv(); badge(); } };
  var _del = window.xMtDel; window.xMtDel = function (id) { var t = X.mt.find(function (x) { return x.id === id; }); if (t && !isAdmin && t.by !== ME.name) return alert('Vetëm administratori ose krijuesi mund ta fshijë këtë detyrë.'); _del(id); badge(); };
  badge();
})();
