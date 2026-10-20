/* Ekipi: menaxhim i vërtetë i përdoruesve (llogari me email + fjalëkalim + rol) brenda CRM-së. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var E = A.E, X = A.X, adm = ME.role === 'admin', H = { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' };
  var api = async function (m, b) { var r = await fetch('/api/users', { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }), j = {}; try { j = await r.json(); } catch (e) {} return { ok: r.ok, j: j }; };
  var gen = function () { var c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', a = crypto.getRandomValues(new Uint8Array(12)); return [].map.call(a, function (x) { return c[x % c.length]; }).join(''); };
  var open = function (n) { return (X.mt || []).filter(function (t) { return (t.us && t.us.length ? t.us : [t.u]).indexOf(n) >= 0 && t.st !== 'done'; }).length; };
  var role = function (r) { return r === 'admin' ? 'Administrator' : 'Kontabilist'; };

  window.renderTeam = async function () {
    var el = document.getElementById('tteam');
    if (!adm) { el.innerHTML = A.sec('Ekipi', '<p>Llogaritë i menaxhon administratori.</p>' + (X.users || []).map(function (n) { return '<div class="ortak-item"><span>' + E(n) + '</span><small>' + open(n) + ' detyra të hapura</small></div>'; }).join('')); return; }
    var r = await api('GET'), L = Array.isArray(r.j) ? r.j : []; X.users = L.map(function (u) { return u.name; });
    el.innerHTML = A.sec('Ekipi – llogaritë e përdoruesve',
      '<p style="margin-bottom:10px">Çdo koleg ka llogari të vetën (email + fjalëkalim). Pasi e krijon, jepi email-in dhe fjalëkalimin fillestar; ai e ndryshon vetë te "Fjalëkalimi" lart djathtas. Detyrat caktohen te Detyrat → Detyra të tjera.</p>' +
      '<div class="table-section"><table style="min-width:640px"><thead><tr><th>Emri</th><th>Email</th><th>Roli</th><th>Detyra të hapura</th><th></th></tr></thead><tbody>' +
      L.map(function (u) { var me = u.id === ME.id || u.email === ME.email; return '<tr><td>' + E(u.name) + (me ? ' <small>(ti)</small>' : '') + '</td><td>' + E(u.email) + '</td><td>' + role(u.role) + '</td><td>' + open(u.name) + '</td><td style="white-space:nowrap">' +
        '<button class="btn btn-secondary btn-small" data-a="test" data-id="' + u.id + '">Njoftim provë</button> <button class="btn btn-secondary btn-small" data-a="pw" data-id="' + u.id + '">Fjalëkalim i ri</button> ' +
        (me ? '' : '<button class="btn btn-secondary btn-small" data-a="role" data-id="' + u.id + '" data-r="' + (u.role === 'admin' ? 'accountant' : 'admin') + '">' + (u.role === 'admin' ? 'Bëje kontabilist' : 'Bëje administrator') + '</button> <button class="btn btn-danger btn-small" data-a="del" data-id="' + u.id + '" data-n="' + E(u.name) + '">Fshi</button>') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<h3 style="margin:18px 0 8px">Shto koleg të ri</h3><div class="form-grid"><div class="form-group"><label>Emri dhe mbiemri (unik)</label><input id="tu_n"></div><div class="form-group"><label>Email</label><input id="tu_e" type="email"></div>' +
      '<div class="form-group"><label>Fjalëkalimi fillestar (min. 10)</label><input id="tu_p" value="' + gen() + '"></div><div class="form-group"><label>Roli</label><select id="tu_r"><option value="accountant">Kontabilist</option><option value="admin">Administrator</option></select></div></div>' +
      '<button class="btn btn-primary" id="tu_add">+ Krijo llogarinë</button><div id="tu_m" style="margin-top:10px;color:#b4443b"></div>');
    document.getElementById('tu_add').onclick = async function () {
      var b = { name: document.getElementById('tu_n').value.trim(), email: document.getElementById('tu_e').value, password: document.getElementById('tu_p').value, role: document.getElementById('tu_r').value };
      var x = await api('POST', b); if (!x.ok) { document.getElementById('tu_m').textContent = x.j.error || 'Gabim.'; return; }
      prompt('Llogaria u krijua. Kopjoje dhe ua jep kolegut (email dhe fjalëkalim):', 'Email: ' + b.email.toLowerCase().trim() + '  |  Fjalëkalimi: ' + b.password); renderTeam();
    };
    el.onclick = async function (e) {
      var a = e.target.getAttribute('data-a'), id = +e.target.getAttribute('data-id'); if (!a) return; var x;
      if (a === 'test') { x = await fetch('/api/notifications', { method: 'POST', headers: H, body: JSON.stringify({ test: id }) }); x = { ok: x.ok, j: {} }; if (x.ok) alert('U dërgua njoftimi provë. Përdoruesi e sheh te "Njoftime" brenda 15 sekondash.'); }
      if (a === 'pw') { var pw = gen(); x = await api('PATCH', { id: id, password: pw }); if (x.ok) prompt('Fjalëkalimi i ri (kopjoje dhe jepja kolegut; ai do të dalë nga sistemi):', pw); }
      if (a === 'role') x = await api('PATCH', { id: id, role: e.target.getAttribute('data-r') });
      if (a === 'del') { var n = e.target.getAttribute('data-n'); if (!confirm('Të fshihet ' + n + '? Detyrat e tij mbeten, por pa njoftime.' + (open(n) ? '\nKa ' + open(n) + ' detyra të hapura që duhen ricaktuar.' : ''))) return; x = await api('DELETE', { id: id }); }
      if (x && !x.ok) alert(x.j.error || 'Gabim.'); renderTeam();
    };
  };
  // "Menaxho ekipin" te shiriti i detyrave çon te kjo skedë.
})();
