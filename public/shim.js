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
    bar.style.cssText = 'position:fixed;top:10px;right:14px;z-index:2000;background:#fff;border:1px solid #d9dee7;border-radius:6px;padding:6px 12px;font:13px Segoe UI,Arial;color:#1f2937;display:flex;gap:12px;align-items:center';
    bar.innerHTML = '<span>' + esc(ME.name) + ' (' + (ME.role === 'admin' ? 'administrator' : 'kontabilist') + ')</span><a href="#" id="nbell" style="color:#1f2a44;text-decoration:none">Njoftime <b id="ncnt" style="background:#b4443b;color:#fff;border-radius:9px;padding:0 6px;display:none">0</b></a><a href="#" id="pwopen" style="color:#1f2a44">Fjalëkalimi</a>' +
      (ME.role === 'admin' ? '<a href="#" id="uopen" style="color:#1f2a44">Përdoruesit</a><a href="#" id="aopen" style="color:#1f2a44">Regjistri</a><a href="#" id="xexp" style="color:#1f2a44">Kopje rezervë</a>' : '') + '<a href="#" id="uout" style="color:#1f2a44">Dil</a>';
    document.body.appendChild(bar);
    var np = document.createElement('div'); np.style.cssText = 'position:fixed;top:48px;right:14px;z-index:2100;width:340px;max-width:92vw;max-height:60vh;overflow:auto;background:#fff;border:1px solid #d9dee7;border-radius:6px;padding:8px 12px;font:13px Segoe UI,Arial;display:none'; document.body.appendChild(np);
    var pollN = async function () { try { var r = await fetch('/api/notifications'); if (!r.ok) return; var j = await r.json(), c = document.getElementById('ncnt'); c.textContent = j.unread; c.style.display = j.unread ? 'inline' : 'none';
      np.innerHTML = j.items.map(function (n) { return '<div style="padding:7px 0;border-bottom:1px solid #eef1f5;' + (n.read ? 'color:#6b7280' : 'font-weight:600') + '">' + esc(n.text) + '<br><small style="font-weight:400">' + esc(new Date(n.at).toLocaleString('sq-AL')) + '</small></div>'; }).join('') || '<div style="padding:8px 0;color:#6b7280">Asnjë njoftim.</div>'; } catch (e) {} };
    document.getElementById('nbell').onclick = async function (e) { e.preventDefault(); var show = np.style.display === 'none'; np.style.display = show ? 'block' : 'none'; if (show) { await pollN(); await fetch('/api/notifications', { method: 'POST', headers: HDR }); document.getElementById('ncnt').style.display = 'none'; } };
    pollN(); setInterval(pollN, 30000);
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
        if (p) { var pw = prompt('Fjalëkalimi i ri (min. 10 karaktere):'); if (pw) { var r2 = await api('PATCH', { id: +p, password: pw }); alert(r2.ok ? 'Fjalëkalimi u ndryshua.' : r2.j.error); } }
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
  });
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
})();
