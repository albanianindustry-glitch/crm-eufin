/* Detyrat e mia: çdo përdorues sheh detyrat që i janë caktuar, i punon brenda CRM-së (status, koment, orë) dhe admini ndjek ecurinë. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, isAdmin = ME.role === 'admin', show = 'open';
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var save = function () { A.sv(); draw(); if (window.renderTm) renderTm(); badge(); };
  var mine = function () { return X.mt.filter(function (t) { return t.u === ME.name; }); };
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
    return '<div class="skadje-item" style="display:block;border-left-color:' + (late(t) ? '#dc3545' : t.prio === 'h' ? '#b7791f' : '#2a5298') + '">' +
      '<strong>' + E(t.title) + '</strong> ' + (late(t) ? '<span style="color:#b4443b">· me vonesë</span>' : '') +
      '<br><small>Afati: ' + (t.due || '—') + ' · Statusi: ' + ({ todo: 'Për t’u bërë', prog: 'Në proces', done: 'Kryer' })[t.st] + (showWho ? ' · përgjegjës: ' + E(t.u || '—') : '') + (t.by ? ' · caktuar nga ' + E(t.by) : '') + (t.st === 'done' && t.doneAt ? ' · kryer më ' + E(t.doneAt) : '') + (hrs ? ' · ' + hrs + ' orë' : '') + '</small>' +
      (t.desc ? '<div style="margin:6px 0">' + E(t.desc) + '</div>' : '') +
      '<div style="margin:6px 0;display:flex;gap:5px;flex-wrap:wrap">' +
      (t.st === 'todo' ? '<button class="btn btn-secondary btn-small" onclick="xMine(\'' + t.id + '\',\'prog\')">Fillo</button>' : '') +
      (t.st !== 'done' ? '<button class="btn btn-success btn-small" onclick="xMine(\'' + t.id + '\',\'done\')">U krye</button>' : '<button class="btn btn-secondary btn-small" onclick="xMine(\'' + t.id + '\',\'todo\')">Rihap</button>') + '</div>' +
      cm + '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap"><input id="cx_' + t.id + '" placeholder="Shënim / përditësim për detyrën" style="flex:1;min-width:180px;padding:8px;border:1px solid #cfd5df;border-radius:5px">' +
      '<input id="ch_' + t.id + '" type="number" min="0" step="0.25" placeholder="orë" style="width:70px;padding:8px;border:1px solid #cfd5df;border-radius:5px">' +
      '<button class="btn btn-primary btn-small" onclick="xCom(\'' + t.id + '\')">Shto</button></div></div>';
  }

  function draw() {
    var all = show === 'all', M = mine(), L = all ? X.mt.slice() : M.slice();
    if (show === 'open') L = L.filter(open); else if (show === 'done') L = L.filter(function (t) { return !open(t); });
    L.sort(function (a, b) { return show === 'done' ? ((b.doneAt || '') > (a.doneAt || '') ? 1 : -1) : ((a.due || '9') < (b.due || '9') ? -1 : 1); });
    var nOpen = M.filter(open).length, nDone = M.length - nOpen, nLate = M.filter(late).length;
    var b = function (k, l) { return '<button class="btn ' + (show === k ? 'btn-primary' : 'btn-secondary') + '" onclick="xMineF(\'' + k + '\')">' + l + '</button>'; };
    pane.innerHTML = A.sec('Detyrat e mia – ' + E(ME.name),
      '<div class="stats"><div class="stat-card"><h3>' + nOpen + '</h3><p>Të hapura</p></div><div class="stat-card ' + (nLate ? 'warning' : 'success') + '"><h3>' + nLate + '</h3><p>Me vonesë</p></div><div class="stat-card success"><h3>' + nDone + '</h3><p>Të kryera</p></div></div>' +
      '<div style="margin:10px 0;display:flex;gap:8px;flex-wrap:wrap">' + b('open', 'Të hapura (' + nOpen + ')') + b('done', 'Të kryera (' + nDone + ')') + (isAdmin ? b('all', 'Të gjithë ekipi') : '') + '</div>' +
      (L.map(function (t) { return card(t, all); }).join('') || '<div class="alert alert-success">' + (show === 'done' ? 'Asnjë detyrë e kryer ende.' : 'Asnjë detyrë e hapur. Detyrat të caktohen nga administratori ose te Detyrat → Detyrat e ekipit.') + '</div>'));
  }
  window.xMineF = function (m) { show = m; draw(); };
  window.xMine = function (id, st) { var t = X.mt.find(function (x) { return x.id === id; }); if (!t) return; if (window.xMt) { xMt(id, st); } else { t.st = st; A.sv(); } if (st === 'done' && window.xToast) xToast('Detyra u krye. E gjen te Detyrat e mia → Të kryera.'); draw(); badge(); };
  window.xCom = function (id) {
    var t = X.mt.find(function (x) { return x.id === id; }), tx = (document.getElementById('cx_' + id).value || '').trim(); if (!t || !tx) return;
    (t.cm = t.cm || []).push({ id: uid(), by: ME.name, at: new Date().toISOString(), tx: tx, h: +document.getElementById('ch_' + id).value || 0 });
    save();
  };
  // Vetëm admini ose kush e krijoi mund ta fshijë; krijuesi regjistrohet te detyra e re.
  var _add = window.xMtAdd; window.xMtAdd = function () { var n = X.mt.length; _add(); if (X.mt.length > n) { var t = X.mt[X.mt.length - 1]; t.by = ME.name; t.at = new Date().toISOString(); A.sv(); badge(); } };
  var _del = window.xMtDel; window.xMtDel = function (id) { var t = X.mt.find(function (x) { return x.id === id; }); if (t && !isAdmin && t.by !== ME.name) return alert('Vetëm administratori ose krijuesi mund ta fshijë këtë detyrë.'); _del(id); badge(); };
  badge();
})();
