/* Shtresa e sinkronizimit: CRM-ja lexon/shkruan localStorage; kjo e lidh me serverin. */
(function () {
  var KEYS = ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX'], V = {}, ME = null;
  var rawSet = Storage.prototype.setItem;

  var BASE = {};
  function stop(msg) { document.addEventListener('DOMContentLoaded', function () { document.body.innerHTML = '<p style="font-family:sans-serif;padding:30px">' + msg + '</p>'; }); return new Promise(function () {}); }
  function apply(B) {
    KEYS.forEach(function (k) { if (B.data[k]) { rawSet.call(localStorage, k, B.data[k].value); V[k] = B.data[k].version; BASE[k] = B.data[k].value; } else localStorage.removeItem(k); });
    var cx = {}; try { cx = JSON.parse(localStorage.getItem('crmX') || '{}'); } catch (e) {}
    cx.users = B.users; rawSet.call(localStorage, 'crmX', JSON.stringify(cx));
  }
  var READY = fetch('/api/bootstrap', { credentials: 'same-origin' }).then(function (r) {
    if (r.status === 401) { location.replace('/login.html'); return new Promise(function () {}); }
    if (r.status !== 200) return stop('Serveri ktheu gabim (' + r.status + '). Kontrollo variablat e mjedisit (AUTH_SECRET, DATA_KEY, DATABASE_URL).');
    return r.json().then(function (B) { ME = B.me; window.CRM_ME = ME; apply(B); });
  }, function () { return stop('Nuk ka lidhje me serverin.'); });
  window.CRM_READY = READY;

  /* MERGE-START: bashkim rresht-për-rresht (sipas id) kur kolegu ka ruajtur përpara teje */
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function mergeArr(b, l, s) {
    var bm = {}, lm = {}, seen = {}, out = [];
    b.forEach(function (r) { bm[r.id] = r; }); l.forEach(function (r) { lm[r.id] = r; });
    s.forEach(function (r) {
      var br = bm[r.id], lr = lm[r.id]; seen[r.id] = 1;
      if (!lr) { if (br && same(br, r)) return; out.push(r); }      // fshirë nga ti dhe pa ndryshuar nga kolegu -> fshihet
      else if (br && same(lr, br)) out.push(r);                      // ti s'e ke ndryshuar -> merr versionin e kolegut
      else out.push(lr);                                              // e ke ndryshuar ti -> ruhet ndryshimi yt
    });
    l.forEach(function (r) { if (!seen[r.id] && (!bm[r.id] || !same(r, bm[r.id]))) out.push(r); }); // të rinj nga ti
    return out;
  }
  function merge(k, b, l, s) {
    var B = JSON.parse(b || (k === 'crmX' ? '{}' : '[]')), L = JSON.parse(l), S = JSON.parse(s);
    if (k !== 'crmX') return JSON.stringify(mergeArr(B, L, S));
    ['detyra', 'notes'].forEach(function (n) { S[n] = mergeArr(B[n] || [], L[n] || [], S[n] || []); });
    return JSON.stringify(S);
  }
  /* MERGE-END */
  async function resolveConflict(k) {
    for (var i = 0; i < 3; i++) {
      var r = await fetch('/api/bootstrap'); if (!r.ok) return false;
      var B = await r.json(), sv = B.data[k]; if (!sv) return false;
      var m = merge(k, BASE[k], localStorage.getItem(k), sv.value);
      var p = await fetch('/api/store', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, value: m, version: sv.version }) });
      if (p.ok) { V[k] = (await p.json()).version; BASE[k] = m; rawSet.call(localStorage, k, m); return true; }
      if (p.status !== 409) return false;
    }
    return false;
  }

  var timers = {}, busy = {}, cache = {};
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (KEYS.indexOf(k) >= 0) { clearTimeout(timers[k]); timers[k] = setTimeout(function () { flush(k); }, 700); }
  };
  function toast(t, bad) {
    var e = document.getElementById('xtoast');
    if (!e) { e = document.createElement('div'); e.id = 'xtoast'; e.style.cssText = 'position:fixed;bottom:14px;right:14px;z-index:3000;padding:8px 14px;border-radius:5px;font:13px Segoe UI,Arial;color:#fff;background:#1f2a44'; document.body.appendChild(e); }
    e.style.background = bad ? '#b4443b' : '#1f2a44'; e.textContent = t; e.style.display = 'block';
    clearTimeout(e._t); e._t = setTimeout(function () { e.style.display = 'none'; }, bad ? 6000 : 1800);
  }
  async function flush(k) {
    if (busy[k]) { timers[k] = setTimeout(function () { flush(k); }, 500); return; }
    busy[k] = 1;
    try {
      var v = localStorage.getItem(k), m = v.match(/data:application\/pdf;base64,[A-Za-z0-9+\/=]+/g) || [];
      for (var i = 0; i < m.length; i++) {
        var d = m[i], ck = d.length + ':' + d.slice(60, 140) + d.slice(-80);
        if (cache[ck]) { v = v.split(d).join(cache[ck]); continue; }
        if (d.length > 4400000) { alert('PDF-ja është shumë e madhe (maksimumi rreth 3 MB) dhe nuk u ruajt.'); v = v.split(d).join(''); continue; }
        var r0 = await fetch('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: d }) });
        if (!r0.ok) throw new Error('file');
        cache[ck] = (await r0.json()).url; v = v.split(d).join(cache[ck]);
      }
      if (m.length) rawSet.call(localStorage, k, v);
      var r = await fetch('/api/store', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: k, value: v, version: V[k] || 0 }) });
      if (r.status === 409) { if (await resolveConflict(k)) { toast('U bashkua me ndryshimet e kolegut'); setTimeout(function () { location.reload(); }, 900); } else toast('Ruajtja dështoi. Rifresko faqen.', true); return; }
      if (r.status === 401) { location.replace('/login.html'); return; }
      if (!r.ok) throw new Error('save');
      V[k] = (await r.json()).version; BASE[k] = v; toast('U ruajt');
    } catch (e) { toast('Ruajtja dështoi. Kontrollo lidhjen.', true); }
    finally { busy[k] = 0; }
  }

  READY.then(function () { (document.readyState === 'loading' ? function (f) { document.addEventListener('DOMContentLoaded', f); } : function (f) { f(); })(function () {
    var bk = document.getElementById('xbk'); if (bk) bk.style.display = 'none';
    [].slice.call(document.querySelectorAll('button')).forEach(function (b) { if (/Rikthe kopjen rezervë/.test(b.textContent)) b.remove(); });
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;top:10px;right:14px;z-index:2000;background:#fff;border:1px solid #d9dee7;border-radius:6px;padding:6px 12px;font:13px Segoe UI,Arial;color:#1f2937;display:flex;gap:12px;align-items:center';
    bar.innerHTML = '<span>' + esc(ME.name) + ' (' + (ME.role === 'admin' ? 'administrator' : 'kontabilist') + ')</span>' +
      (ME.role === 'admin' ? '<a href="#" id="uopen" style="color:#1f2a44">Përdoruesit</a>' : '') + '<a href="#" id="upw" style="color:#1f2a44">Fjalëkalimi im</a>' + (ME.role === 'admin' ? '<a href="#" id="ulog" style="color:#1f2a44">Regjistri</a><a href="#" id="uclean" style="color:#1f2a44">Pastro PDF</a>' : '') + '<a href="#" id="uout" style="color:#1f2a44">Dil</a>';
    document.body.appendChild(bar);
    document.getElementById('uout').onclick = async function (e) { e.preventDefault(); await fetch('/api/logout', { method: 'POST' }); location.href = '/login.html'; };
    function gm(title, html) {
      var m = document.getElementById('gm');
      if (!m) { m = document.createElement('div'); m.className = 'modal'; m.id = 'gm'; m.innerHTML = '<div class="modal-content" style="max-width:900px"><div class="modal-header"><h3 id="gmt"></h3><button class="close-modal" id="gmx">×</button></div><div id="gmb"></div></div>'; document.body.appendChild(m); document.getElementById('gmx').onclick = function () { m.classList.remove('active'); }; }
      document.getElementById('gmt').textContent = title; document.getElementById('gmb').innerHTML = html; m.classList.add('active');
    }
    document.getElementById('upw').onclick = async function (e) {
      e.preventDefault(); var c = prompt('Fjalëkalimi aktual:'); if (!c) return; var n = prompt('Fjalëkalimi i ri (min. 8 karaktere):'); if (!n) return;
      var r = await fetch('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: c, next: n }) }), j = await r.json().catch(function () { return {}; });
      alert(r.ok ? 'Fjalëkalimi u ndryshua.' : (j.error || 'Gabim.'));
    };
    if (ME.role === 'admin') {
      var AL = { login: 'Hyrje', save: 'Ruajtje', 'file-upload': 'Ngarkim PDF', 'user-create': 'Përdorues i ri', 'user-password': 'Fjalëkalim i ndryshuar nga admini', 'user-delete': 'Përdorues i fshirë', 'password-self': 'Ndryshim i fjalëkalimit të vet', cleanup: 'Pastrim PDF' };
      var KN = { crmClients: 'Klientët', crmAplikime: 'Aplikimet', crmNdryshime: 'Ndryshimet', crmDeklarimeTVSH: 'TVSH', crmX: 'Detyrat dhe shënimet' };
      document.getElementById('ulog').onclick = async function (e) {
        e.preventDefault(); var r = await fetch('/api/audit'); if (!r.ok) return alert('Gabim.'); var L = await r.json();
        gm('Regjistri i veprimeve (200 të fundit)', '<div class="table-section"><table style="min-width:0"><thead><tr><th>Koha</th><th>Përdoruesi</th><th>Veprimi</th><th>Detaje</th></tr></thead><tbody>' + L.map(function (x) { return '<tr><td>' + esc(new Date(x.at).toLocaleString('sq-AL')) + '</td><td>' + esc(x.user_email) + '</td><td>' + esc(AL[x.action] || x.action) + '</td><td>' + esc(String(x.detail || '').replace(/^\w+/, function (m) { return KN[m] || m; })) + '</td></tr>'; }).join('') + '</tbody></table></div>');
      };
      document.getElementById('uclean').onclick = async function (e) {
        e.preventDefault(); if (!confirm('Të fshihen PDF-të që nuk i përkasin asnjë rekordi (të zëvendësuara ose të hequra)?')) return;
        var r = await fetch('/api/maintenance', { method: 'POST' }), j = await r.json().catch(function () { return {}; }); alert(r.ok ? 'U fshinë ' + j.deleted + ' skedarë të papërdorur.' : (j.error || 'Gabim.'));
      };
    }
    if (ME.role === 'admin') {
      var md = document.createElement('div'); md.className = 'modal'; md.id = 'umodal';
      md.innerHTML = '<div class="modal-content" style="max-width:720px"><div class="modal-header"><h3>Përdoruesit</h3><button class="close-modal" id="uclose">×</button></div><div id="ulist"></div>' +
        '<h4 style="margin:18px 0 8px">Shto përdorues të ri</h4><div class="form-grid"><div class="form-group"><label>Emri</label><input id="un"></div><div class="form-group"><label>Email</label><input id="ue" type="email"></div>' +
        '<div class="form-group"><label>Fjalëkalimi fillestar (min. 8)</label><input id="up" type="text"></div><div class="form-group"><label>Roli</label><select id="ur"><option value="accountant">Kontabilist</option><option value="admin">Administrator</option></select></div></div>' +
        '<button class="btn btn-primary" id="uadd">Shto përdoruesin</button><div id="umsg" style="margin-top:10px;color:#b4443b"></div></div>';
      document.body.appendChild(md);
      var api = async function (m, b) { var r = await fetch('/api/users', { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }); return { ok: r.ok, j: await r.json() }; };
      var draw = async function () {
        var r = await api('GET'); document.getElementById('ulist').innerHTML = '<div class="table-section"><table style="min-width:0"><thead><tr><th>Emri</th><th>Email</th><th>Roli</th><th></th></tr></thead><tbody>' +
          r.j.map(function (u) { return '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + (u.role === 'admin' ? 'Administrator' : 'Kontabilist') + '</td><td><button class="btn btn-secondary btn-small" data-pw="' + u.id + '">Fjalëkalim i ri</button> <button class="btn btn-danger btn-small" data-del="' + u.id + '">Fshi</button></td></tr>'; }).join('') + '</tbody></table></div>';
      };
      document.getElementById('uopen').onclick = function (e) { e.preventDefault(); md.classList.add('active'); draw(); };
      document.getElementById('uclose').onclick = function () { md.classList.remove('active'); };
      document.getElementById('uadd').onclick = async function () {
        var r = await api('POST', { name: document.getElementById('un').value.trim(), email: document.getElementById('ue').value, password: document.getElementById('up').value, role: document.getElementById('ur').value });
        document.getElementById('umsg').textContent = r.ok ? '' : (r.j.error || 'Gabim.');
        if (r.ok) { ['un', 'ue', 'up'].forEach(function (i) { document.getElementById(i).value = ''; }); draw(); }
      };
      document.getElementById('ulist').onclick = async function (e) {
        var d = e.target.getAttribute('data-del'), p = e.target.getAttribute('data-pw');
        if (d && confirm('Të fshihet ky përdorues?')) { var r = await api('DELETE', { id: +d }); if (!r.ok) alert(r.j.error); draw(); }
        if (p) { var pw = prompt('Fjalëkalimi i ri (min. 8 karaktere):'); if (pw) { var r2 = await api('PATCH', { id: +p, password: pw }); alert(r2.ok ? 'Fjalëkalimi u ndryshua.' : r2.j.error); } }
      };
    }
    setInterval(async function () {
      try {
        if (Object.keys(busy).some(function (k) { return busy[k]; })) return;
        var r = await fetch('/api/store'); if (r.status === 401) return location.replace('/login.html');
        var s = await r.json();
        if (KEYS.some(function (k) { return s[k] && s[k] > (V[k] || 0); }) && !document.getElementById('xnew')) {
          var n = document.createElement('div'); n.id = 'xnew';
          n.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2500;background:#b7791f;color:#fff;text-align:center;padding:8px;font:14px Segoe UI,Arial;cursor:pointer';
          n.textContent = 'Kolegët kanë ruajtur ndryshime të reja. Shtyp këtu për të rifreskuar.'; n.onclick = function () { location.reload(); };
          document.body.appendChild(n);
        }
      } catch (e) {}
    }, 30000);
  }); });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
})();
