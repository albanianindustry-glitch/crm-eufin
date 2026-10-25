/* Auditimi (vetëm administratori): historiku i veprimeve me filtra. Burimi: tabela `audit` në databazë (e pandryshueshme nga përdoruesit). */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME || ME.role !== 'admin') return;
  var E = A.E;
  var AL = { login: 'Hyrje', save: 'Ruajtje', 'save-merge': 'Ruajtje me bashkim', 'file-upload': 'Ngarkim PDF', 'user-create': 'Përdorues i ri', 'user-password': 'Fjalëkalim (nga admini)', 'user-delete': 'Përdorues i fshirë', 'password-self': 'Fjalëkalim i ndryshuar', cleanup: 'Pastrim PDF',
    'client-change': 'Ndryshim klienti', 'task-delete': 'Detyrë e fshirë', 'service-delete': 'Shërbim i fshirë', 'contract-delete': 'Kontratë e fshirë', request: 'Kërkesë për miratim', 'request-approved': 'Kërkesë e miratuar', 'request-rejected': 'Kërkesë e refuzuar' };
  var pane = document.createElement('div'); pane.id = 'taud'; pane.className = 'tab-content'; document.getElementById('detyrat').insertAdjacentElement('afterend', pane);
  var _sw = window.switchTab; window.switchTab = function (t) { _sw(t); if (t === 'taud') { draw(); run(); } };
  var val = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  function draw() {
    if (document.getElementById('au_q')) return;
    pane.innerHTML = A.sec('Auditimi i veprimeve', '<div class="form-grid"><div class="form-group"><label>Kërko (klient, detaj)</label><input id="au_q"></div><div class="form-group"><label>Përdoruesi (email)</label><input id="au_u"></div><div class="form-group"><label>Veprimi</label><select id="au_a"><option value="">Të gjitha</option>' + Object.keys(AL).map(function (k) { return '<option value="' + k + '">' + AL[k] + '</option>'; }).join('') + '</select></div><div class="form-group"><label>Nga data</label><input type="date" id="au_f"></div><div class="form-group"><label>Deri në datë</label><input type="date" id="au_t"></div></div><button class="btn btn-primary" onclick="xAuRun()">Kërko</button> <small>Maksimumi 500 rreshta, nga më i riu. Regjistri nuk mund të ndryshohet nga përdoruesit.</small><div id="au_r" style="margin-top:12px"></div>');
  }
  async function run() {
    var p = new URLSearchParams({ q: val('au_q'), user: val('au_u'), action: val('au_a'), from: val('au_f'), to: val('au_t') }), box = document.getElementById('au_r'); if (!box) return;
    var r = await fetch('/api/audit?' + p.toString()); if (!r.ok) { box.textContent = 'Gabim gjatë leximit.'; return; } var L = await r.json();
    box.innerHTML = '<div class="table-section"><table style="min-width:700px"><thead><tr><th>Koha</th><th>Përdoruesi</th><th>Veprimi</th><th>Detaje</th></tr></thead><tbody>' + (L.map(function (x) { return '<tr><td style="white-space:nowrap">' + E(new Date(x.at).toLocaleString('sq-AL')) + '</td><td>' + E(x.user_email) + '</td><td>' + E(AL[x.action] || x.action) + '</td><td>' + E(x.detail || '') + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="no-data">Asnjë rezultat.</td></tr>') + '</tbody></table></div>';
  }
  window.xAuRun = run;
})();
