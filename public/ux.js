/* Organizim: kontabilisti sheh vetëm punën e vet; fillimi te Detyrat e mia; njoftim kur detyra kryhet. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, adm = ME.role === 'admin';
  window.xToast = function (t) {
    var e = document.getElementById('xtoast2');
    if (!e) { e = document.createElement('div'); e.id = 'xtoast2'; e.style.cssText = 'position:fixed;bottom:56px;right:14px;z-index:3000;padding:10px 16px;border-radius:6px;font:14px Segoe UI,Arial;color:#fff;background:#2f855a;max-width:340px'; document.body.appendChild(e); }
    e.textContent = t; e.style.display = 'block'; clearTimeout(e._t); e._t = setTimeout(function () { e.style.display = 'none'; }, 4500);
  };
  if (!adm) {
    // Kontabilisti nuk mund të ndërrojë pamjen te kolegët; pamja e tij është gjithmonë e vetja.
    Object.defineProperty(X, 'view', { enumerable: false, configurable: true, get: function () { return ME.name; }, set: function () {} });
    var w = document.getElementById('xwho'); if (w) w.style.display = 'none';
    A.re();
  }
  var sub = document.getElementById('xsub');
  if (sub) new MutationObserver(function () {
    [].slice.call(sub.querySelectorAll('button')).forEach(function (b) {
      var t = b.textContent.trim();
      if (t === 'Detyra të tjera') b.textContent = 'Detyrat e ekipit';
      if (!adm && (t === 'Ekipi' || t === 'Lista e detyrimeve')) b.remove();
    });
  }).observe(sub, { childList: true });
  var first = document.querySelector('.tab[onclick="switchTab(\'tmine\')"]'); if (first) first.click();

  // ---- Njoftimet me lidhje: klikimi të çon te detyra ose klienti përkatës.
  var st = document.createElement('style');
  st.textContent = '@keyframes xf{0%,65%{box-shadow:0 0 0 3px #f6ad55;background:#fffaf0}100%{box-shadow:none}}.xflash{animation:xf 2.6s ease-out}';
  document.head.appendChild(st);
  window.xFlash = function (e) { e.classList.remove('xflash'); void e.offsetWidth; e.classList.add('xflash'); };
  window.xOpenLink = function (l) {
    if (typeof l === 'string') { try { l = JSON.parse(l); } catch (e) { return; } }
    if (!l || !l.t) return;
    if (l.t === 'task') {   // nëse s'është ende në kopjen lokale, merr të dhënat e freskëta dhe provo përsëri
      var okT = window.xShowTask && window.xShowTask(l.id), nf = function () { window.xToast('Detyra nuk u gjet (mund të jetë fshirë).'); };
      if (!okT) { if (window.xLiveSync) window.xLiveSync(true).then(function () { if (!(window.xShowTask && window.xShowTask(l.id))) nf(); }); else nf(); }
      return;
    }
    if (l.t === 'req') { if (window.switchTab) window.switchTab('treq'); return; }
    if (l.t === 'mine') { var m = document.querySelector('.tab[onclick="switchTab(\'tmine\')"]'); if (m) m.click(); return; }
    if (l.t === 'today') { if (window.xGo) window.xGo(); return; }
    if (l.t === 'client') {
      var c = (typeof clients !== 'undefined' ? clients : []).filter(function (x) { return x.id === +l.id; })[0];
      if (!c) { window.xToast('Klienti nuk u gjet (mund të jetë fshirë).'); return; }
      if (window.xDosje) window.xDosje(c.id);
    }
  };
  // Pas rifreskimit për të marrë të dhënat e reja, hapet vendi që synonte njoftimi.
  try { var g = sessionStorage.getItem('crmGoto'); if (g) { sessionStorage.removeItem('crmGoto'); setTimeout(function () { window.xOpenLink(g); }, 400); } } catch (e) {}

  // ---- Përmbledhje ditore për detyrat standarde (ato llogariten në shfletues; serveri nuk i njeh).
  // Një njoftim në ditë për përdoruesin, vetëm nëse ka detyra përgjegjësia e të cilit është e tij që mbarojnë brenda 3 ditëve.
  function digest() {
    try {
      var T = (A.tasks ? A.tasks() : []).filter(function (a) { return a.k && A.respFor(a) === ME.name && A.diff(a.d) <= 3; });
      if (!T.length) return;
      var late = T.filter(function (a) { return A.diff(a.d) < 0; }).length;
      var txt = 'Ke ' + T.length + ' detyrime standarde që mbarojnë brenda 3 ditëve' + (late ? ' (' + late + ' me vonesë)' : '') + ': ' + T.slice(0, 3).map(function (a) { return a.c + ' – ' + a.t; }).join('; ') + (T.length > 3 ? '…' : '');
      fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' }, body: JSON.stringify({ auto: { key: 'digest:' + A.TODAY, text: txt.slice(0, 390), link: { t: 'today' } } }) });
    } catch (e) {}
  }
  setTimeout(digest, 3000); setInterval(digest, 3600000);
})();
