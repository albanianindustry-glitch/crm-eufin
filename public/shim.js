/* DATAT-START: 'sq-AL' bie në format amerikan (9/23/2027) në shumë shfletues; e detyrojmë dd.mm.yyyy */
(function () {
  var orig = Date.prototype.toLocaleDateString, origT = Date.prototype.toLocaleString;
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  Date.prototype.toLocaleDateString = function (l, o) {
    if (l !== 'sq-AL' || o || isNaN(this)) return orig.call(this, l, o);
    return p(this.getDate()) + '.' + p(this.getMonth() + 1) + '.' + this.getFullYear();
  };
  Date.prototype.toLocaleString = function (l, o) {
    if (l !== 'sq-AL' || o || isNaN(this)) return origT.call(this, l, o);
    return p(this.getDate()) + '.' + p(this.getMonth() + 1) + '.' + this.getFullYear() + ' ' + p(this.getHours()) + ':' + p(this.getMinutes());
  };
  (typeof window !== 'undefined' ? window : this).xFd = function (s) { return /^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(8, 10) + '.' + String(s).slice(5, 7) + '.' + String(s).slice(0, 4) : (s || ''); };
})();
/* DATAT-END */
/* Shtresa e sinkronizimit: CRM-ja lexon/shkruan localStorage; kjo e lidh me serverin. */
(function () {
  var KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX'], V = {}, BASE = {}, ME = null;
  var HDR = { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' };
  var rawSet = Storage.prototype.setItem;

  var x = new XMLHttpRequest();
  x.open('GET', '/api/bootstrap', false);
  try { x.send(); } catch (e) { document.write('<p style="font-family:sans-serif;padding:30px">Nuk ka lidhje me serverin.</p>'); return; }
  if (x.status === 401) { location.replace('/login.html'); return; }
  if (x.status !== 200) { var em = ''; try { em = JSON.parse(x.responseText).error || ''; } catch (e) {} document.write('<p style="font-family:sans-serif;padding:30px;line-height:1.6">Serveri ktheu gabim (' + x.status + ').<br><b>' + esc(em) + '</b><br><small>Diagnostikim: hap <a href="/api/health">/api/health</a> për të parë çfarë mungon.</small></p>'); return; }
  var B = JSON.parse(x.responseText); ME = B.me; window.CRM_ME = ME;
  KEYS.forEach(function (k) {
    localStorage.removeItem(k);
    if (B.data[k]) { rawSet.call(localStorage, k, B.data[k].value); V[k] = B.data[k].version; BASE[k] = B.data[k].value; }
  });
  var cx = {}; try { cx = JSON.parse(localStorage.getItem('crmX') || '{}'); } catch (e) {}
  cx.users = B.users; rawSet.call(localStorage, 'crmX', JSON.stringify(cx));

  var timers = {}, busy = {}, cache = {}, pend = {};
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (KEYS.indexOf(k) >= 0) { pend[k] = 1; clearTimeout(timers[k]); timers[k] = setTimeout(function () { flush(k); }, 700); }
  };
  // Sinkronizim i drejtpërdrejtë: vetëm kur nuk ka ruajtje në pritje, formular të hapur ose shkrim në vazhdim
  async function liveSync(force) {
    if (!force && KEYS.some(function (k) { return busy[k] || pend[k]; })) return false;
    var a = document.activeElement, cf = document.getElementById('clientForm');
    // bllokohet vetëm nëse po shkruan diçka në një fushë (jo te chat) ose ke formular/dritare të hapur
    var typing = a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !/^(checkbox|radio|button|submit)$/.test(a.type || '') && String(a.value || '') !== '' && !(a.closest && a.closest('#tchat'));
    if (!force && (typing || document.querySelector('.modal.active') || (cf && cf.offsetParent !== null))) return false;
    try {
      var r = await fetch('/api/bootstrap'); if (!r.ok) return false;
      var B2 = await r.json(), changed = [];
      KEYS.forEach(function (k) { if (B2.data[k]) { if (BASE[k] !== B2.data[k].value) changed.push(k); rawSet.call(localStorage, k, B2.data[k].value); V[k] = B2.data[k].version; BASE[k] = B2.data[k].value; } });
      var cx2 = {}; try { cx2 = JSON.parse(localStorage.getItem('crmX') || '{}'); } catch (e) {}
      cx2.users = B2.users; rawSet.call(localStorage, 'crmX', JSON.stringify(cx2));
      window.CRM_STALE = null; if (changed.length && window.xReloadAll) window.xReloadAll();
      return changed;
    } catch (e) { return false; }
  }
  window.xLiveSync = liveSync;
  function toast(t, bad) {
    var e = document.getElementById('xtoast');
    if (!e) { e = document.createElement('div'); e.id = 'xtoast'; e.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:3000;padding:8px 14px;border-radius:5px;font:13px Segoe UI,Arial;color:#fff;background:#1f2a44'; document.body.appendChild(e); }
    e.style.background = bad ? '#b4443b' : '#1f2a44'; e.textContent = t; e.style.display = 'block';
    clearTimeout(e._t); e._t = setTimeout(function () { e.style.display = 'none'; }, bad ? 6000 : 1800);
  }
  async function flush(k) {
    if (busy[k]) { timers[k] = setTimeout(function () { flush(k); }, 500); return; }
    busy[k] = 1; pend[k] = 0;
    try {
      var v = localStorage.getItem(k), m = v.match(/data:application\/pdf;base64,[A-Za-z0-9+\/=]+/g) || [];
      for (var i = 0; i < m.length; i++) {
        var d = m[i], ck = d.length + ':' + d.slice(60, 140) + d.slice(-80);
        if (cache[ck]) { v = v.split(d).join(cache[ck]); continue; }
        if (d.length > 4400000) { alert('PDF-ja është shumë e madhe (maksimumi rreth 3 MB) dhe nuk u ruajt.'); v = v.split(d).join(''); continue; }
        var r0 = await fetch('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' }, body: JSON.stringify({ data: d }) });
        if (!r0.ok) throw new Error('file');
        cache[ck] = (await r0.json()).url; v = v.split(d).join(cache[ck]);
      }
      if (m.length) rawSet.call(localStorage, k, v);
      var put = function (extra) { return fetch('/api/store', { method: 'PUT', headers: HDR, body: JSON.stringify(Object.assign({ key: k, value: v, version: V[k] || 0 }, extra || {})) }); };
      var r = await put();
      if (r.status === 409) r = await put({ base: BASE[k] != null ? BASE[k] : (k === 'crmX' ? '{}' : '[]') });
      if (r.status === 409) { alert('Një koleg ka ruajtur ndryshime para teje dhe ato nuk u bashkuan. Faqja do të rifreskohet; përsërit ndryshimin e fundit.'); location.reload(); return; }
      if (r.status === 401) { location.replace('/login.html'); return; }
      if (r.status === 403) { var jp = await r.json().catch(function () { return {}; }); if (jp.error === 'perm') { alert((jp.message || 'Veprim i paautorizuar.') + '\nNdryshimi u anulua.'); pend[k] = 0; await liveSync(true); return; } }
      if (!r.ok) throw new Error('save');
      var j = await r.json(); V[k] = j.version;
      if (j.merged) { rawSet.call(localStorage, k, j.value); BASE[k] = j.value; toast('Ndryshimet e kolegut u bashkuan me tuajat. Faqja po rifreskohet.'); setTimeout(function () { location.reload(); }, 1300); return; }
      BASE[k] = v; toast('U ruajt');
    } catch (e) { toast('Ruajtja dështoi. Kontrollo lidhjen.', true); }
    finally { busy[k] = 0; }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var bk = document.getElementById('xbk'); if (bk) bk.style.display = 'none';
    [].slice.call(document.querySelectorAll('button')).forEach(function (b) { if (/Rikthe kopjen rezervë/.test(b.textContent)) b.remove(); });
    var bar = document.createElement('div');
    bar.id = 'xbar';
    bar.style.cssText = 'position:fixed;top:10px;right:14px;z-index:2000;background:#fff;border:1px solid #d9dee7;border-radius:6px;padding:6px 12px;font:13px Segoe UI,Arial;color:#1f2937;display:flex;gap:12px;align-items:center';
    bar.innerHTML = '<span>' + esc(ME.name) + ' (' + (ME.role === 'admin' ? 'administrator' : 'kontabilist') + ')</span><a href="#" id="nstale" style="display:none;color:#b4443b;text-decoration:none">↻ Të dhëna të reja</a><a href="#" id="nbell" style="color:#1f2a44;text-decoration:none">Njoftime <b id="ncnt" style="background:#b4443b;color:#fff;border-radius:9px;padding:0 6px;display:none">0</b></a><a href="#" id="pwopen" style="color:#1f2a44">Fjalëkalimi</a>' +
      (ME.role === 'admin' ? '<a href="#" id="uopen" style="color:#1f2a44">Ekipi</a><a href="#" id="aopen" style="color:#1f2a44">Regjistri</a><a href="#" id="xexp" style="color:#1f2a44">Kopje rezervë</a>' : '') + '<a href="#" id="uout" style="color:#1f2a44">Dil</a>';
    document.body.appendChild(bar);
    var np = document.createElement('div'); np.id = 'xnp'; np.style.cssText = 'position:fixed;top:48px;right:14px;z-index:2100;width:340px;max-width:92vw;max-height:60vh;overflow:auto;background:#fff;border:1px solid #d9dee7;border-radius:6px;padding:8px 12px;font:13px Segoe UI,Arial;display:none'; document.body.appendChild(np);
    var pollN = async function () { try {
      var r = await fetch('/api/notifications'); if (!r.ok) return;
      var j = await r.json(); if (window.xNotifyPush) xNotifyPush(j.items); var st = window.CRM_STALE, n = j.unread, c = document.getElementById('ncnt'), sc = document.getElementById('nstale');
      c.textContent = n; c.style.display = n ? 'inline' : 'none';
      if (sc) { sc.style.display = st ? 'inline' : 'none'; sc.title = st ? st.text : ''; }
      if (window._nprev !== undefined && n > window._nprev && window.xToast) xToast('Njoftim i ri: ' + ((j.items.filter(function (x) { return !x.read; })[0] || j.items[0] || {}).text || ''));
      window._nprev = n;
      document.title = (n ? '(' + n + ') ' : '') + document.title.replace(/^\(\d+\) /, '');
      np.innerHTML = (j.unread ? '<div style="text-align:right;padding:2px 0 6px"><a href="#" id="nreadall" style="color:#1f2a44;font-size:12px">Shëno të gjitha si të lexuara</a></div>' : '') +
        j.items.map(function (x) {
          var lk = x.link ? ' data-link="' + esc(x.link) + '" style="cursor:pointer;' : ' style="';
          return '<div data-nid="' + x.id + '"' + lk + 'padding:7px 0;border-bottom:1px solid #eef1f5;' + (x.read ? 'color:#6b7280' : 'font-weight:600') + '">' + esc(x.text) + '<br><small style="font-weight:400">' + esc(new Date(x.at).toLocaleString('sq-AL')) + (x.link ? ' · <span style="color:#2a5298">hape →</span>' : '') + '</small></div>';
        }).join('') || '<div style="padding:8px 0;color:#6b7280">Asnjë njoftim.</div>';
    } catch (e) {} };
    // A ka ruajtur dikush tjetër që nga hapja? Atëherë rifreskojmë para se të shkojmë te detyra, që ajo të ekzistojë.
    var isStale = async function () { try { var r = await fetch('/api/store'); if (!r.ok) return false; var q = await r.json(); return KEYS.some(function (k) { return q[k] && q[k] > (V[k] || 0); }); } catch (e) { return false; } };
    var goLink = async function (link) {
      if (!link) return;
      if (await isStale()) {
        if (await liveSync()) { if (window.xOpenLink) window.xOpenLink(link); return; }
        try { sessionStorage.setItem('crmGoto', link); } catch (e) {}
        await new Promise(function (ok) { setTimeout(ok, 900); });
        for (var i = 0; i < 10 && Object.keys(busy).some(function (k) { return busy[k]; }); i++) await new Promise(function (ok) { setTimeout(ok, 400); });
        location.reload(); return;
      }
      if (window.xOpenLink) window.xOpenLink(link);
    };
    np.onclick = async function (e) {
      if (e.target.id === 'nreadall') { e.preventDefault(); await fetch('/api/notifications', { method: 'POST', headers: HDR, body: '{}' }); return pollN(); }
      var el = e.target.closest && e.target.closest('[data-nid]'); if (!el) return;
      e.preventDefault();
      try { await fetch('/api/notifications', { method: 'POST', headers: HDR, body: JSON.stringify({ id: +el.getAttribute('data-nid') }) }); } catch (x) {}
      np.style.display = 'none'; pollN();
      goLink(el.getAttribute('data-link'));
    };
    document.getElementById('nstale').onclick = function (e) { e.preventDefault(); location.reload(); };
    document.getElementById('nbell').onclick = async function (e) { e.preventDefault(); var show = np.style.display === 'none'; np.style.display = show ? 'block' : 'none'; if (show) await pollN(); };
    pollN(); (function () { var n = 0; setInterval(function () { if (document.hidden && (n++ % 3)) return; pollN(); }, 10000); })();
    document.getElementById('pwopen').onclick = async function (e) { e.preventDefault(); var cur = prompt('Fjalëkalimi aktual:'); if (!cur) return; var nw = prompt('Fjalëkalimi i ri (min. 10 karaktere):'); if (!nw) return;
      var r = await fetch('/api/password', { method: 'POST', headers: HDR, body: JSON.stringify({ current: cur, password: nw }) }); var j = await r.json(); alert(r.ok ? 'Fjalëkalimi u ndryshua.' : (j.error || 'Gabim.')); };
    document.getElementById('uout').onclick = async function (e) { e.preventDefault(); await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'crm' } }); location.href = '/login.html'; };
    if (ME.role === 'admin') {
      var md = document.createElement('div'); md.className = 'modal'; md.id = 'umodal';
      md.innerHTML = '<div class="modal-content" style="max-width:720px"><div class="modal-header"><h3>Përdoruesit</h3><button class="close-modal" id="uclose">×</button></div><div id="ulist"></div>' +
        '<h4 style="margin:18px 0 8px">Shto përdorues të ri</h4><div class="form-grid"><div class="form-group"><label>Emri</label><input id="un"></div><div class="form-group"><label>Email</label><input id="ue" type="email"></div>' +
        '<div class="form-group"><label>Fjalëkalimi fillestar (min. 10)</label><input id="up" type="text"></div><div class="form-group"><label>Roli</label><select id="ur"><option value="accountant">Kontabilist</option><option value="admin">Administrator</option></select></div></div>' +
        '<button class="btn btn-primary" id="uadd">Shto përdoruesin</button><div id="umsg" style="margin-top:10px;color:#b4443b"></div></div>';
      document.body.appendChild(md);
      var api = async function (m, b) { var r = await fetch('/api/users', { method: m, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' }, body: b ? JSON.stringify(b) : undefined }); return { ok: r.ok, j: await r.json() }; };
      var draw = async function () {
        var r = await api('GET'); document.getElementById('ulist').innerHTML = '<div class="table-section"><table style="min-width:0"><thead><tr><th>Emri</th><th>Email</th><th>Roli</th><th></th></tr></thead><tbody>' +
          r.j.map(function (u) { return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + (u.role === 'admin' ? 'Administrator' : 'Kontabilist') + '</td><td><button class="btn btn-secondary btn-small" data-pw="' + u.id + '">Fjalëkalim i ri</button> <button class="btn btn-danger btn-small" data-del="' + u.id + '">Fshi</button></td></tr>'; }).join('') + '</tbody></table></div>';
      };

      var am = document.createElement('div'); am.className = 'modal'; am.id = 'amodal';
      am.innerHTML = '<div class="modal-content" style="max-width:900px"><div class="modal-header"><h3>Regjistri i veprimeve</h3><button class="close-modal" id="aclose">×</button></div><div id="alist"></div></div>';
      document.body.appendChild(am);
      document.getElementById('aclose').onclick = function () { am.classList.remove('active'); };
      document.getElementById('aopen').onclick = async function (e) {
        e.preventDefault(); am.classList.add('active');
        var r = await fetch('/api/audit'); var j = r.ok ? await r.json() : [];
        document.getElementById('alist').innerHTML = '<div class="table-section"><table style="min-width:0"><thead><tr><th>Data</th><th>Përdoruesi</th><th>Veprimi</th><th>Detaje</th></tr></thead><tbody>' +
          j.map(function (a) { return '<tr><td>' + esc(new Date(a.at).toLocaleString('sq-AL')) + '</td><td>' + esc(a.user_email) + '</td><td>' + esc(a.action) + '</td><td>' + esc(a.detail) + '</td></tr>'; }).join('') + '</tbody></table></div>';
      };
      document.getElementById('xexp').onclick = async function (e) {
        e.preventDefault(); var r = await fetch('/api/export'); if (!r.ok) return alert('Eksportimi dështoi.');
        var b = await r.blob(), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'crm-rezerve-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      };
      document.getElementById('uopen').onclick = function (e) { e.preventDefault(); if (window.xGo2) xGo2('tsk', 'tteam'); };
      document.getElementById('uclose').onclick = function () { md.classList.remove('active'); };
      document.getElementById('uadd').onclick = async function () {
        var r = await api('POST', { name: document.getElementById('un').value.trim(), email: document.getElementById('ue').value, password: document.getElementById('up').value, role: document.getElementById('ur').value });
        document.getElementById('umsg').textContent = r.ok ? '' : (r.j.error || 'Gabim.');
        if (r.ok) { ['un', 'ue', 'up'].forEach(function (i) { document.getElementById(i).value = ''; }); draw(); }
      };
      document.getElementById('ulist').onclick = async function (e) {
        var d = e.target.getAttribute('data-del'), p = e.target.getAttribute('data-pw');
        if (d && confirm('Të fshihet ky përdorues?')) { var r = await api('DELETE', { id: +d }); if (!r.ok) alert(r.j.error); draw(); }
        if (p) { var pw = prompt('Fjalëkalimi i ri (min. 10 karaktere):'); if (pw) { var r2 = await api('PATCH', { id: +p, password: pw }); alert(r2.ok ? 'Fjalëkalimi u ndryshua.' : r2.j.error); } }
      };
    }
    var stN = 0;
  setInterval(async function () {
      if (document.hidden && (stN++ % 4)) return;
      try {
        if (Object.keys(busy).some(function (k) { return busy[k]; })) return;
        var r = await fetch('/api/store'); if (r.status === 401) return location.replace('/login.html');
        var s = await r.json();
        var ch = KEYS.filter(function (k) { return s[k] && s[k] > (V[k] || 0); });
        if (ch.length) {
          var LB = { crmClients: 'Klientët', crmAplikime: 'Aplikimet NIPT', crmNdryshime: 'Ndryshimet', crmDeklarimeTVSH: 'TVSH', crmX: 'Detyrat dhe të dhënat e përbashkëta' }, by = s._by || {};
          var who = ch.map(function (k) { return by[k]; }).filter(Boolean)[0];
          window.CRM_STALE = { text: (who ? who + ' ruajti' : 'Kolegët kanë ruajtur') + ' ndryshime te: ' + ch.map(function (k) { return LB[k]; }).join(', ') + '.' };
          pollN();
          liveSync().then(function (ch) { if (ch) pollN(); });   // sinkron i heshtur: pa njoftim kur vetëm rifreskon të dhënat
        }
      } catch (e) {}
    }, 5000);
  });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
})();
