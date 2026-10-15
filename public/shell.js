/* Skeleti i ri: menu anësore, kokë e sipërme (kërkim, njoftime, përdoruesi), formulari i klientit si panel anësor,
   listë klientësh e pastër me menu veprimesh. Nuk ndryshon logjikën; i lëviz dhe i rilidh elementët ekzistues. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var $ = function (id) { return document.getElementById(id); }, E = A.E, adm = ME.role === 'admin';

  function build() {
    var cont = document.querySelector('.container'); if (!cont) return;

    // ---------- Menu anësore
    var NAV = [
      { g: 'Puna', items: [
        ['sot', 'Sot', function () { xGo(); }, 'detyrat'],
        ['mine', 'Detyrat e mia', function () { switchTab('tmine'); }, 'tmine'],
        ['mon', 'Detyrimet mujore', function () { xGo2('tsk', 'tmon'); }, 'tmon'],
        ['ann', 'Detyrimet vjetore', function () { xGo2('tsk', 'tann'); }, 'tann'],
        ['team', 'Detyrat e ekipit', function () { xGo2('tsk', 'tmis'); }, 'tmis'],
        ['sv', 'Shërbime të veçanta', function () { switchTab('tsv'); }, 'tsv']] },
      { g: 'Klientët', items: [
        ['cl', 'Klientët', function () { xGoKl(); }, 'klientet'],
        ['ap', 'Aplikime NIPT', function () { switchTab('aplikime'); }, 'aplikime'],
        ['doc', 'Dokumente', function () { xGo2('dos', 'dokumente'); }, 'dokumente'],
        ['kon', 'Kontrata', function () { xGo2('dos', 'kontrata'); }, 'kontrata'],
        ['ref', 'Referuesit', function () { switchTab('tref'); }, 'tref']] },
      { g: 'Financa', items: [
        ['tvsh', 'Deklarimi i TVSH-së', function () { xGo2('fin', 'tvsh'); }, 'tvsh'],
        ['dog', 'Dogana', function () { xGo2('fin', 'dogana'); }, 'dogana'],
        ['fon', 'Fondet e klientëve', function () { xGo2('fin', 'fonde'); }, 'fonde'],
        ['rep', 'Raporte', function () { switchTab('raporte'); }, 'raporte']] },
      { g: 'Administrim', admin: true, items: [
        ['lis', 'Lista e detyrimeve', function () { xGo2('tsk', 'tlis'); }, 'tlis'],
        ['usr', 'Ekipi dhe llogaritë', function () { xGo2('tsk', 'tteam'); }, 'tteam']] }
    ];
    var side = document.createElement('aside'); side.id = 'xside';
    side.innerHTML = '<div class="brand"><b>Studio Kontabiliteti</b><small>Menaxhimi i klientëve dhe detyrimeve</small></div><nav></nav><div style="padding:14px 20px;font-size:11px;color:#7d8aa5">Versioni 2026-10-15 · v7</div>';
    var nav = side.querySelector('nav'), byPane = {};
    NAV.forEach(function (G) {
      if (G.admin && !adm) return;
      var h = document.createElement('div'); h.className = 'grp'; h.textContent = G.g; nav.appendChild(h);
      G.items.forEach(function (it) {
        var a = document.createElement('a'); a.className = 'it'; a.setAttribute('data-k', it[0]);
        a.innerHTML = '<span>' + E(it[1]) + '</span><span class="n"></span>';
        a.onclick = function (e) { e.preventDefault(); try { it[2](); } catch (x) { console.error(x); } side.classList.remove('open'); };
        nav.appendChild(a); byPane[it[3]] = { el: a, label: it[1] };
      });
    });
    document.body.appendChild(side);

    // ---------- Koka e sipërme
    var top = document.createElement('div'); top.id = 'xtop';
    top.innerHTML = '<button id="xburger" aria-label="Menu">☰</button><h1 id="xtitle"></h1><div class="sp"></div><span id="xwhoslot"></span>' +
      '<div id="xsearch"><input id="xq2" placeholder="Kërko klient (emër, NIPT)…" autocomplete="off"><div id="xres"></div></div>' +
      '<button class="btn btn-primary" id="xnewc">+ Klient i ri</button><span id="xbellslot" style="display:flex;gap:8px;align-items:center"></span>' +
      '<div id="xuser"><button id="xubtn"><span class="av">' + E((ME.name || '?').trim().charAt(0).toUpperCase()) + '</span></button><div id="xumenu"><div class="who"><b>' + E(ME.name) + '</b><small>' + (adm ? 'Administrator' : 'Kontabilist') + '</small></div></div></div>';
    cont.insertBefore(top, cont.firstChild);
    var mv = function (id, to, keep) { var e = $(id); if (e) { if (!keep) e.removeAttribute('style'); to.appendChild(e); } };
    var w = $('xwho'); if (w) $('xwhoslot').appendChild(w);
    mv('nstale', $('xbellslot'), true); mv('nbell', $('xbellslot'));
    ['pwopen', 'aopen', 'xexp', 'uout'].forEach(function (i) { mv(i, $('xumenu')); });
    var uo = $('uopen'); if (uo) uo.style.display = 'none';
    $('xubtn').onclick = function (e) { e.stopPropagation(); var m = $('xumenu'); m.style.display = m.style.display === 'block' ? 'none' : 'block'; };
    $('xburger').onclick = function () { side.classList.toggle('open'); };
    document.addEventListener('click', function (e) { if (!e.target.closest('#xuser')) $('xumenu').style.display = 'none'; if (!e.target.closest('#xsearch')) $('xres').style.display = 'none'; if (!e.target.closest('#xrowmenu,.xdots')) rowMenu.style.display = 'none'; });
    $('xnewc').onclick = function () { xGoKl(); xShowForm(); };

    // Kërkim i shpejtë klienti
    var q = $('xq2'), res = $('xres');
    q.oninput = function () {
      var t = q.value.trim().toLowerCase(); if (!t) { res.style.display = 'none'; return; }
      var L = (typeof clients !== 'undefined' ? clients : []).filter(function (c) { return (String(c.emriKompanise) + ' ' + c.nipt + ' ' + c.administratori).toLowerCase().indexOf(t) >= 0; }).slice(0, 7);
      res.innerHTML = L.length ? L.map(function (c) { return '<div data-id="' + c.id + '"><b>' + E(c.emriKompanise) + '</b><small>' + E(c.nipt) + ' · ' + E(c.administratori) + '</small></div>'; }).join('') : '<div style="color:#667085;cursor:default">Asnjë klient i gjetur</div>';
      res.style.display = 'block';
    };
    res.onclick = function (e) { var d = e.target.closest('[data-id]'); if (!d) return; res.style.display = 'none'; q.value = ''; xDosje(+d.getAttribute('data-id')); };

    // ---------- Titulli dhe zgjedhja aktive
    function active() {
      var c = document.querySelector('.tab-content.active'), id = c ? c.id : '', hit = byPane[id];
      Object.keys(byPane).forEach(function (k) { byPane[k].el.classList.toggle('on', k === id); });
      $('xtitle').textContent = hit ? hit.label : '';
      var ws = $('xwhoslot'); if (ws) ws.style.display = ['detyrat', 'tmon', 'tann'].indexOf(id) >= 0 ? '' : 'none';
    }
    [].slice.call(document.querySelectorAll('.tab-content')).forEach(function (p) { new MutationObserver(active).observe(p, { attributes: true, attributeFilter: ['class'] }); });
    active();

    // ---------- Numrat te menuja (urgjente / me vonesë)
    var bt; function badges() {
      clearTimeout(bt); bt = setTimeout(function () {
        try {
          var T = A.tasks(), urg = T.filter(function (a) { return A.diff(a.d) <= 3; }).length, late = T.filter(function (a) { return A.diff(a.d) < 0; }).length;
          var s = byPane.detyrat.el.querySelector('.n'); s.textContent = urg || ''; s.className = 'n' + (late ? ' late' : '');
          s.title = late ? late + ' me vonesë' : '';
          var mt = (document.querySelector('.tab[onclick="switchTab(\'tmine\')"]') || {}).textContent || '', m = mt.match(/\((\d+)\)/);
          byPane.tmine.el.querySelector('.n').textContent = m && +m[1] ? m[1] : '';
        } catch (e) {}
      }, 250);
    }
    var tabs = document.querySelector('.tabs'); if (tabs) new MutationObserver(badges).observe(tabs, { childList: true, subtree: true, characterData: true });
    badges(); setInterval(badges, 20000);

    // ---------- Klientët: shirit veglash
    var si = $('searchInput'), s1 = $('filterStatus'), s2 = $('filterPagese'), f1 = s1 && s1.closest('.form-group'), f2 = s2 && s2.closest('.form-group');
    if (si && f1 && f2) {
      var ss = si.closest('.search-section'), fsec = f1.closest('.form-section'), rst = fsec.querySelector('button[onclick="resetFilters()"]');
      var tb = document.createElement('div'); tb.id = 'xtoolbar';
      si.placeholder = 'Kërko sipas emrit, NIPT, administratorit…';
      tb.appendChild(si); tb.appendChild(f1); tb.appendChild(f2);
      if (rst) { rst.removeAttribute('style'); rst.textContent = 'Pastro'; tb.appendChild(rst); }
      var o1 = s1.options[0], o2 = s2.options[0]; if (o1) o1.textContent = 'Të gjitha statuset'; if (o2) o2.textContent = 'Të gjitha pagesat';
      ss.parentNode.insertBefore(tb, ss); ss.remove(); fsec.remove();
    }
    // Eksport / kopje rezervë: jashtë rrugës
    var kl = $('klientet'), ex = [].slice.call(kl.querySelectorAll('.export-section'));
    if (ex.length) { var dt = document.createElement('details'); dt.className = 'xmore'; dt.innerHTML = '<summary>Eksport, import dhe kopje rezervë</summary>'; ex.forEach(function (e) { dt.appendChild(e); }); kl.appendChild(dt); }

    // ---------- Tabela: rreshti i klikueshëm + menu veprimesh
    var rowMenu = document.createElement('div'); rowMenu.id = 'xrowmenu'; document.body.appendChild(rowMenu);
    function decorate() {
      [].slice.call(document.querySelectorAll('#clientTableBody tr')).forEach(function (tr) {
        var last = tr.lastElementChild, b = last && last.querySelector('[onclick^="xDosje"]'); if (!b) return;
        var id = b.getAttribute('onclick').match(/\((\d+)\)/)[1]; tr.setAttribute('data-id', id);
        last.innerHTML = '<div class="xrow"><button class="btn btn-secondary btn-small" onclick="editClient(' + id + ')">Ndrysho</button><button class="xdots" data-id="' + id + '" title="Më shumë veprime">⋯</button></div>';
      });
    }
    var _r = window.renderTableKliente; window.renderTableKliente = function () { var r = _r.apply(this, arguments); decorate(); return r; };
    decorate();
    var body = $('clientTableBody');
    body.addEventListener('click', function (e) {
      var d = e.target.closest('.xdots');
      if (d) {
        e.stopPropagation(); var id = d.getAttribute('data-id'), r = d.getBoundingClientRect();
        rowMenu.innerHTML = '<a onclick="xDosje(' + id + ')">Dosja e klientit</a><a onclick="openNdryshimModal(' + id + ')">Regjistro ndryshim</a><a onclick="openHistorikModal(' + id + ')">Historiku</a><a onclick="shfaqKredencialet(' + id + ')">Kredencialet</a><hr><a class="d" onclick="deleteClient(' + id + ')">Fshi klientin</a>';
        rowMenu.style.display = 'block'; rowMenu.style.top = Math.min(r.bottom + 4, window.innerHeight - 230) + 'px'; rowMenu.style.left = Math.max(8, r.right - 190) + 'px';
        return;
      }
      if (e.target.closest('.xrow')) return;
      var tr = e.target.closest('tr'); if (tr && tr.getAttribute('data-id')) xDosje(+tr.getAttribute('data-id'));
    });
    rowMenu.addEventListener('click', function () { rowMenu.style.display = 'none'; });

    // ---------- Formulari i klientit: panel anësor
    var form = $('clientForm'), fs = form && form.closest('.form-section');
    if (fs) {
      fs.classList.add('xdrawer');
      var old = fs.previousElementSibling; if (old && /xShowForm/.test(old.innerHTML)) old.style.display = 'none';
      var dh = document.createElement('div'); dh.className = 'xdh';
      dh.innerHTML = '<div class="row"><span id="xdt"></span><button class="x" title="Mbyll (Esc)" aria-label="Mbyll">×</button></div><div class="xsteps"></div>';
      var h2 = $('formTitle'); dh.querySelector('#xdt').appendChild(h2);
      fs.insertBefore(dh, fs.firstChild);
      var STEPS = [['xs_id', 'Identiteti'], ['xs_contact', 'Kontakti'], ['xs_rel', 'Marrëdhënia'], ['xs_fiscal', 'Profili fiskal'], ['xs_resp', 'Përgjegjësit'], ['xs_logins', 'Hyrjet']];
      var st = dh.querySelector('.xsteps');
      st.innerHTML = STEPS.map(function (s) { return '<a data-t="' + s[0] + '">' + s[1] + '</a>'; }).join('');
      st.onclick = function (e) { var t = e.target.getAttribute && e.target.getAttribute('data-t'); if (!t) return; var el = $(t); if (el) fs.scrollTo({ top: el.offsetTop - dh.offsetHeight + 4, behavior: 'smooth' }); };
      var bd = document.createElement('div'); bd.id = 'xbackdrop'; document.body.appendChild(bd);
      var close = function () { var c = $('cancelBtn'); if (c) c.click(); fs.style.display = 'none'; };
      dh.querySelector('.x').onclick = close; bd.onclick = close;
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && fs.style.display === 'block') close(); });
      var sync = function () {
        var vis = fs.style.display === 'block'; bd.style.display = vis ? 'block' : 'none'; document.body.classList.toggle('xlock', vis);
        if (!vis) return;
        [].slice.call(st.children).forEach(function (a) { var el = $(a.getAttribute('data-t')); a.style.display = !el || el.style.display === 'none' ? 'none' : ''; });
        var y = fs.scrollTop + dh.offsetHeight + 10, cur = STEPS[0][0];
        STEPS.forEach(function (s) { var el = $(s[0]); if (el && el.style.display !== 'none' && el.offsetTop <= y) cur = s[0]; });
        [].slice.call(st.children).forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-t') === cur); });
      };
      new MutationObserver(function () { var vis = fs.style.display === 'block'; if (vis && !fs._v) fs.scrollTop = 0; fs._v = vis; sync(); }).observe(fs, { attributes: true, attributeFilter: ['style'] });
      fs.addEventListener('scroll', sync); form.addEventListener('change', sync); setInterval(function () { if (fs.style.display === 'block') sync(); }, 600);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
