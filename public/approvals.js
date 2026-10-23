/* Kërkesa për miratim (vetëm administratori): ndryshimet e klientëve dhe kontratave nga përdoruesit e zakonshëm zbatohen vetëm pasi i miraton ai. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME || ME.role !== 'admin') return;
  var X = A.X, E = A.E;
  var HDR = { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' };
  var pane = document.createElement('div'); pane.id = 'treq'; pane.className = 'tab-content'; document.getElementById('detyrat').insertAdjacentElement('afterend', pane);
  var _sw = window.switchTab; window.switchTab = function (t) { _sw(t); if (t === 'treq') draw(); };
  var load = function () { try { return JSON.parse(localStorage.getItem('crmReq') || '[]'); } catch (e) { return []; } };
  var save = function (l) { localStorage.setItem('crmReq', JSON.stringify(l)); };
  var cls = function () { return typeof clients !== 'undefined' ? clients : []; };
  var cname = function (id) { var c = cls().find(function (x) { return String(x.id) === String(id); }); return c ? c.emriKompanise : 'klient i fshirë'; };
  var fd = function (s) { return window.xFd ? window.xFd(String(s || '').slice(0, 10)) : s; };

  // Zbatimi i kërkesës: kthen tekst gabimi, ose '' kur u zbatua
  function apply(r) {
    if (r.kind === 'client') {
      var c = cls().find(function (x) { return String(x.id) === String(r.cid); }); if (!c) return 'Klienti nuk ekziston më.';
      Object.keys(r.patch || {}).forEach(function (k) { if (r.patch[k] === null) delete c[k]; else c[k] = r.patch[k]; });
      try { saveData(); } catch (e) {} return '';
    }
    var k = X.k.find(function (x) { return x.id === r.kid; }); if (!k) return 'Kontrata nuk ekziston më.';
    if (r.op === 'del') {
      var c2 = cls().find(function (x) { return String(x.id) === String(k.cid); }), d = c2 && (c2.docs || []).find(function (x) { return x.id === k.doc; });
      if (d) { d.archived = true; d.kdel = A.TODAY; try { saveData(); } catch (e) {} }
      if (window.xHist) window.xHist(k.cid, 'Kontratë e fshirë (miratuar nga ' + ME.name + '): ' + (k.lb || k.type) + (d ? ' (PDF e arkivuar)' : ''));
      X.k = X.k.filter(function (x) { return x.id !== k.id; }); A.sv(); return '';
    }
    var pd = r.patch && r.patch.pendingDoc;
    Object.keys(r.patch || {}).forEach(function (f) { if (f === 'pendingDoc') return; if (r.patch[f] === null) delete k[f]; else k[f] = r.patch[f]; });
    if (pd && window.xKAttach) window.xKAttach(k, pd);
    if (window.xHist) window.xHist(k.cid, 'Ndryshim i kontratës i miratuar nga ' + ME.name + ': ' + (k.lb || k.type) + (pd ? ' (kontratë e re PDF)' : ''));
    A.sv(); return '';
  }
  function stale(r) {  // vlera aktuale ka ndryshuar që nga kërkesa?
    if (r.kind !== 'client') return false; var c = cls().find(function (x) { return String(x.id) === String(r.cid); }); if (!c) return false;
    return (r.changes || []).some(function (ch) { var cur = c[ch.k]; var s = cur == null ? '—' : typeof cur === 'object' ? JSON.stringify(cur) : String(cur); s = s.length > 70 ? s.slice(0, 70) + '…' : s; return s !== ch.from; });
  }
  async function decide(id, decision, reason) {
    try {
      var response = await fetch('/api/store', {
        method: 'PUT',
        headers: HDR,
        body: JSON.stringify({ key: 'crmReq', action: { id: id, decision: decision, reason: reason || '' } })
      });
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        alert(result.error || 'Vendimi nuk u ruajt. Rifresko kërkesat dhe provo përsëri.');
        if (response.status === 409 && window.xLiveSync) await window.xLiveSync(true);
        draw();
        return false;
      }
      if (window.xLiveSync) await window.xLiveSync(true);
      else if (window.XAPI && window.XAPI.re) window.XAPI.re();
      draw();
      return true;
    } catch (error) {
      alert('Vendimi nuk u ruajt për shkak të një gabimi rrjeti. Kërkesa mbetet në pritje.');
      return false;
    }
  }
  window.xReqOk = function (id) {
    var r = load().find(function (x) { return x.id === id; }); if (!r || r.st !== 'pending') return;
    if (stale(r) && !confirm('Vlera aktuale e disa fushave ndryshoi që nga kërkesa. Të zbatohet gjithsesi?')) return;
    decide(id, 'approved');
  };
  window.xReqNo = function (id) { var r = load().find(function (x) { return x.id === id; }); if (!r || r.st !== 'pending') return; var why = prompt('Arsyeja e refuzimit (do t’i shfaqet kolegut):', ''); if (why === null) return; decide(id, 'rejected', why); };
  var DEF = { statusTVSH: 'me_tvsh', statusTatimFitim: 'me_tatim' };
  // Plotësim automatik i vlerës default (nga versione të vjetra): s'është ndryshim i kontabilistit
  function isAuto(r) { return r.kind === 'client' && (r.changes || []).length > 0 && (r.changes || []).every(function (c) { return DEF[c.k] !== undefined && (c.from === '—' || c.from === '' || c.from == null) && c.to === DEF[c.k]; }); }
  window.xReqAuto = async function () {
    var r = await fetch('/api/store', { method: 'PUT', headers: HDR, body: JSON.stringify({ key: 'crmReq', action: { decision: 'dismiss_auto' } }) });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { alert(j.error || j.message || 'Nuk u pastrua.'); return; }
    if (window.xLiveSync) await window.xLiveSync(true); draw();
  };
  var chLine = function (c) { return window.xReqChange ? window.xReqChange(c) : '<div><small><b>' + E(c.k) + ':</b> ' + E(c.from) + ' → <b>' + E(c.to) + '</b></small></div>'; };
  function draw() {
    var L = load(), P = L.filter(function (r) { return r.st === 'pending'; }), AUTO = P.filter(isAuto), REAL = P.filter(function (r) { return !isAuto(r); });
    var D = L.filter(function (r) { return r.st !== 'pending' && !r.auto; }).slice(-15).reverse();
    var card = function (r, done) {
      var what = r.op === 'del' ? 'kërkon të <b>fshijë kontratën</b> te' : 'kërkon ndryshim te';
      return '<div class="rq ' + (r.st === 'approved' ? 'ok' : r.st === 'rejected' ? 'no' : '') + '"><div class="rq-h"><b>' + E(r.by) + '</b> ' + what + ' <a href="#" onclick="xDosje(' + (+r.cid || 0) + ');return false"><b>' + E(cname(r.cid)) + '</b></a><small style="color:#667085">' + fd(r.at) + '</small></div>' +
        (r.changes || []).map(chLine).join('') +
        (done ? '<small>' + (r.st === 'approved' ? '✓ miratuar' : '✗ refuzuar') + ' nga ' + E(r.dec || '') + ' · ' + fd(r.decAt) + (r.why ? ' – ' + E(r.why) : '') + '</small>' :
          '<div class="rq-act"><button class="btn btn-success btn-small" onclick="xReqOk(\'' + r.id + '\')">Aprovo</button> <button class="btn btn-danger btn-small" onclick="xReqNo(\'' + r.id + '\')">Refuzo</button></div>') + '</div>';
    };
    var banner = AUTO.length ? '<div class="rq-auto"><div><b>' + AUTO.length + ' plotësime automatike</b> të vlerave default (statusi TVSH / tatim fitimi) nga një version i vjetër. Nuk janë ndryshime të kontabilistëve.</div><button class="btn btn-secondary btn-small" onclick="xReqAuto()">Pastro ' + AUTO.length + ' plotësimet</button></div>' : '';
    pane.innerHTML = A.sec('Kërkesa për miratim (' + REAL.length + ')', banner + (REAL.map(function (r) { return card(r, false); }).join('') || '<div class="alert alert-success">Asnjë kërkesë në pritje.</div>') + (D.length ? '<h4 style="margin-top:16px">Vendimet e fundit</h4>' + D.map(function (r) { return card(r, true); }).join('') : ''));
  }
  function badge() {
    var n = load().filter(function (r) { return r.st === 'pending' && !isAuto(r); }).length;
    var a = [].slice.call(document.querySelectorAll('#xside nav a, #xside nav button, #xside nav div')).filter(function (e) { return /^Kërkesa për miratim/.test((e.firstChild && e.firstChild.textContent || '').trim()) && e.children.length < 3; })[0];
    if (a) { var b = a.querySelector('.xrqb'); if (!b) { b = document.createElement('span'); b.className = 'xrqb'; b.style.cssText = 'float:right;background:#b4801e;color:#fff;border-radius:9px;padding:0 7px;font-size:11px'; a.appendChild(b); } b.textContent = n; b.style.display = n ? 'inline' : 'none'; }
  }
  window.addEventListener('crm:sync', function () { if (pane.classList && pane.classList.contains('active')) draw(); badge(); });
  setInterval(badge, 4000); badge();
})();
