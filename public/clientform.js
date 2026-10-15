/* Formulari i klientit: seksione logjike, fusha që shfaqen vetëm kur kanë kuptim,
   parapamje e detyrimeve që gjenerohen dhe përgjegjës për çdo deklaratë (fx.resps). */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, $ = function (id) { return document.getElementById(id); }, form = $('clientForm');
  if (!form || !$('submitBtn')) return;
  var v = function (id) { return ($(id) || {}).value || ''; };
  var box = function (id) { var e = $(id); return e ? e.closest('.form-group,label') : null; };
  var byTitle = function (t) { return [].slice.call(form.querySelectorAll('.ortaket-section')).filter(function (s) { return ((s.querySelector('h3') || {}).textContent || '').indexOf(t) >= 0; })[0]; };

  var css = document.createElement('style');
  css.textContent = '.xsec{border:1px solid #e1e5ec;border-radius:10px;padding:16px 18px;margin:0 0 18px;background:#fafbfc}.xsec>h3,.xsec>summary{font-size:1.1em;font-weight:600;color:#1e3c72;margin:0 0 12px;cursor:default}.xsec>summary{cursor:pointer}' +
    '.xnote{font-size:.88em;color:#4b5563;margin-top:10px;line-height:1.5}.xchip{display:inline-block;background:#eef3fb;border-radius:12px;padding:2px 10px;margin:2px 4px 2px 0;font-size:.88em}';
  document.head.appendChild(css);

  // ---- 1. Ndërtimi i seksioneve (ID-të e fushave mbeten të njëjta; ndryshon vetëm vendi)
  function mk(id, title, ids, details, open) {
    var el = document.createElement(details ? 'details' : 'div'); el.className = 'xsec'; el.id = id;
    el.innerHTML = details ? '<summary>' + title + '</summary>' : '<h3>' + title + '</h3>';
    if (details && open) el.open = true;
    var g = document.createElement('div'); g.className = 'form-grid'; el.appendChild(g);
    ids.forEach(function (i) { var b = typeof i === 'string' ? box(i) : i; if (b) g.appendChild(b); });
    return el;
  }
  var oldFirst = form.firstElementChild, oldDocAdmin = byTitle('Dokumenti i Administratorit'), oldAdr = byTitle('Adresat'), oldOrt = byTitle('Ortak'), oldFisc = byTitle('Profili fiskal');
  var rent = $('xrent'), notes = $('shenimet') && $('shenimet').closest('.form-group');
  var s1 = mk('xs_id', '1 · Kush është klienti', ['fx_lloji', 'fx_forma', 'emriKompanise', 'nipt', 'administratori', 'fx_shtet', 'fx_ref', 'fx_new', 'fx_regj']);
  var s2 = mk('xs_contact', '2 · Kontakti', ['nrKontakti', 'emailBiznes']);
  var s3 = mk('xs_rel', '3 · Marrëdhënia me studion', ['statusKlient', 'fx_pezullim', 'tarifaMujore', 'dataKontrate', 'statusPagese', 'dataFaturesFundit']);
  var s5 = mk('xs_resp', '5 · Kush është përgjegjës', ['fx_resp']);
  var s6 = mk('xs_logins', '6 · Certifikata dhe hyrjet në sisteme', ['afatiAdministratori', 'certifikataElektronike', 'passwordCertifikata', 'usernameEAlbania', 'passwordEAlbania', 'usernameEFiling', 'passwordEFiling', 'usernameProgramiFiskal', 'passwordProgramiFiskal'], true, false);
  var respBox = document.createElement('div'); respBox.id = 'xresps'; respBox.className = 'form-grid'; respBox.style.marginTop = '10px';
  var hint = document.createElement('div'); hint.className = 'xnote';
  hint.textContent = 'Përgjegjësi kryesor merr gjithçka që nuk ka përgjegjës të veçantë. Më poshtë listohen vetëm detyrimet që vlejnë për këtë klient; zgjidh një koleg tjetër për një deklaratë të caktuar. Ai njoftohet kur ruan klientin.';
  s5.appendChild(hint); s5.appendChild(respBox);

  // Profili fiskal (seksioni ekzistues) merr TVSH-në dhe xhiron, dhe një parapamje.
  if (oldFisc) {
    oldFisc.classList.remove('ortaket-section'); oldFisc.classList.add('xsec'); oldFisc.id = 'xs_fiscal';
    oldFisc.querySelector('h3').textContent = '4 · Profili fiskal – çfarë detyrash gjeneron';
    var g4 = oldFisc.querySelector('.form-grid');
    ['xhiroBiznes', 'statusTVSH'].forEach(function (i) { var b = box(i); if (b) g4.insertBefore(b, g4.firstChild); });
    var prev = document.createElement('div'); prev.id = 'xprev'; prev.className = 'xnote'; oldFisc.appendChild(prev);
  }
  var anchor = $('submitBtn').parentElement;
  [s1, s2, s3, oldFisc, rent, s5, s6, oldDocAdmin, oldAdr, oldOrt, notes].forEach(function (n) { if (n) form.insertBefore(n, anchor); });
  if (oldFirst && oldFirst.classList.contains('form-grid') && !oldFirst.children.length) oldFirst.remove();
  var fl = box('fx_resp'); if (fl) { var lb = fl.querySelector('label'); if (lb) lb.textContent = 'Përgjegjësi kryesor'; }
  // Seksioni i vjetër "Ortakët" përmban "Ortak": mbetet i njohur për xSync (sec('Ortak')); ne nuk e riemërtuam.

  // ---- 2. Detyrimet që vlejnë për klientin (sipas gjendjes aktuale të formularit)
  var baseGetFx = window.getFx;
  var SL = { fit: 'Deklarata vjetore e tatim fitimit', vend: 'Kontroll tatim-taksa vendore', diva: 'DIVA/DVAP', pay: 'Arkëtimi i pagesës së studios', onb: 'Hapat pas regjistrimit', fonde: 'Pagesat nga fondet e klientit' };
  window.xKindLabel = function (k) {
    if (SL[k]) return SL[k];
    var m = (A.MT || []).filter(function (x) { return x[0] === k; })[0]; if (m) return m[1];
    var c = (X.cat || []).filter(function (x) { return x.id === k; })[0]; return c ? c.name : k;
  };
  var divaOn = function (f) { return !!(f.dual || (+f.inc2 || 0) >= 500 || (+f.gross || 0) >= 1200000); };
  function pseudo() { return { id: -1, statusTVSH: v('statusTVSH'), tarifaMujore: v('tarifaMujore'), fx: baseGetFx() }; }
  function applicable() {
    var c = pseudo(), f = c.fx, out = [];
    if (f.lloji === 'individ') { if (divaOn(f)) out.push(['diva', 'DIVA/DVAP – deklarimi vjetor personal']); }
    else {
      (A.MT || []).forEach(function (m) { if (A.ok(c, m[3])) out.push([m[0], m[1]]); });
      var trf = f.forma === 'Përfaqësues tatimor'; // vetëm TVSH
      if (!trf) out.push(['fit', 'Deklarata vjetore e tatim fitimit' + (f.forma ? ' (' + f.forma + ')' : '')]);
      if (f.vendore && !trf) out.push(['vend', SL.vend]);
      (X.cat || []).filter(function (k) { return k.fr === 'y' && A.ok(c, k.ap); }).forEach(function (k) { out.push([k.id, k.name]); });
      if (f.fonde && !trf) out.push(['fonde', SL.fonde]);
      if (f.regj && !trf) out.push(['onb', SL.onb]);
    }
    if (+c.tarifaMujore) out.push(['pay', SL.pay]);
    return out;
  }

  // ---- 3. Përgjegjësit sipas detyrimit
  var cur = {}, sig = '';
  function renderResps() {
    var L = applicable(), us = X.users || [], s = L.map(function (r) { return r[0] + r[1]; }).join('|') + '#' + us.join('|');
    if (s === sig) return; sig = s;
    respBox.innerHTML = L.length ? L.map(function (r) {
      var val = cur[r[0]] || '';
      var o = '<option value="">Si kryesori</option>' + us.map(function (u) { return '<option' + (u === val ? ' selected' : '') + '>' + E(u) + '</option>'; }).join('');
      if (val && us.indexOf(val) < 0) o += '<option selected>' + E(val) + '</option>';
      return '<div class="form-group"><label>' + E(r[1]) + '</label><select data-k="' + E(r[0]) + '">' + o + '</select></div>';
    }).join('') : '<small>Plotëso lloji dhe profilin fiskal; këtu shfaqen detyrimet e klientit.</small>';
  }
  respBox.addEventListener('change', function (e) { var k = e.target.getAttribute('data-k'); if (k) { if (e.target.value) cur[k] = e.target.value; else delete cur[k]; } });
  window.getFx = function () { var f = baseGetFx(), o = {}; applicable().forEach(function (r) { if (cur[r[0]]) o[r[0]] = cur[r[0]]; }); f.resps = o; return f; };
  var baseSetFx = window.setFx;
  window.setFx = function (f) { baseSetFx(f); cur = Object.assign({}, (f && f.resps) || {}); sig = ''; window.xSync(); };
  form.addEventListener('reset', function () { cur = {}; sig = ''; });

  // ---- 4. Fusha dinamike
  function preview(f, active) {
    var el = $('xprev'); if (!el) return;
    if (!active) { el.innerHTML = 'Klienti është inaktiv: nuk gjenerohen detyrime automatike.'; return; }
    var c = pseudo(), mo = (A.MT || []).filter(function (m) { return A.ok(c, m[3]); }).map(function (m) { return '<span class="xchip">' + E(m[1]) + ' · ' + m[2] + '</span>'; });
    var an = [];
    if (f.lloji === 'individ') an.push('<span class="xchip">DIVA/DVAP ' + (divaOn(f) ? '· plotësohen kriteret' : '· nuk plotësohen kriteret (kontrollo dypunësimin ose të ardhurat)') + '</span>');
    else if (f.forma === 'Përfaqësues tatimor') an.push('<span class="xchip">Përfaqësues tatimor · vetëm TVSH</span>');
    else { an.push('<span class="xchip">Tatim fitimi' + (f.forma ? ' (' + f.forma + ')' : ' · zgjidh formën juridike') + '</span>'); if (f.vendore) an.push('<span class="xchip">Tatim-taksa vendore</span>'); }
    if (+v('tarifaMujore')) an.push('<span class="xchip">Pagesa e studios · 10</span>');
    el.innerHTML = '<b>Detyrime automatike për këtë klient</b> <small>(numri = dita e muajit pasardhës)</small><br>' + (mo.length ? mo.join('') : (f.lloji === 'individ' ? '' : 'Asnjë detyrim mujor.')) + '<br>' + an.join('') +
      (f.lloji !== 'individ' && f.forma !== 'Përfaqësues tatimor' && v('statusTVSH') !== 'me_tvsh' ? '<br><small>Pa TVSH: faturat, librat dhe deklarimi i TVSH-së nuk gjenerohen.</small>' : '');
  }
  function sync() {
    var f = baseGetFx(), biz = f.lloji !== 'individ', st = v('statusKlient'), active = st !== 'inaktiv', show = function (e, on) { if (e) e.style.display = on ? '' : 'none'; };
    show($('xs_fiscal'), active); show($('xs_resp'), active);
    show(box('statusPagese'), active); show(box('dataFaturesFundit'), active);
    // Individ: emri është emri i personit; "Administratori" nuk ka kuptim.
    show(box('administratori'), biz); $('administratori').required = biz;
    if (!biz) $('administratori').value = v('emriKompanise');
    var l1 = form.querySelector('label[for="emriKompanise"]'); if (l1) l1.textContent = biz ? 'Emri i kompanisë *' : 'Emri dhe mbiemri *';
    var l3 = form.querySelector('label[for="dataKontrate"]'); if (l3) l3.textContent = 'Data e kontratës (detyrimet me afat para saj nuk gjenerohen)';
    var l2 = form.querySelector('label[for="administratori"]'); if (l2) l2.textContent = 'Administratori *';
    // Dypunësimi plotëson vetë kriterin e DIVA; atëherë të ardhurat nuk duhen.
    show(box('fx_inc2'), !biz && !f.dual); show(box('fx_gross'), !biz && !f.dual);
    // Hyrjet: individi ka vetëm e-Albania.
    ['usernameEFiling', 'passwordEFiling', 'usernameProgramiFiskal', 'passwordProgramiFiskal'].forEach(function (i) { show(box(i), biz); });
    var sm = s6.querySelector('summary'); if (sm) sm.textContent = '6 · ' + (biz ? 'Certifikata dhe hyrjet në sisteme' : 'Hyrja në e-Albania');
    preview(f, active); if (active) renderResps();
  }
  var _x = window.xSync;
  window.xSync = function () { if (_x) _x(); sync(); };
  var tm; var later = function () { clearTimeout(tm); tm = setTimeout(function () { window.xSync(); }, 60); };
  form.addEventListener('input', later); form.addEventListener('change', later); form.addEventListener('reset', function () { setTimeout(function () { window.xSync(); }, 0); });
  form.addEventListener('submit', function () { if (v('fx_lloji') === 'individ') $('administratori').value = v('emriKompanise'); }, true);
  // Kur kolegët shtohen/hiqen, rifresko listën.
  setInterval(function () { if ($('xs_resp') && $('xs_resp').style.display !== 'none') { renderResps(); } }, 4000);
  window.xSync();
})();
