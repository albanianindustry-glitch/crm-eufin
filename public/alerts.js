/* Njoftime që rrinë poshtë djathtas derisa t'i mbyllësh (+ njoftim në desktop), dhe rrjedha e aprovimit të ndryshimeve. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, HDR = { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' };
  var SK = 'crmDesk:' + ME.name, shown = {}; try { shown = JSON.parse(localStorage.getItem(SK) || '{}'); } catch (e) {}
  var cur = [], noBanner = false, chat = [], box = document.createElement('div');
  box.id = 'xnt'; box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:4000;width:370px;max-width:94vw;max-height:84vh;overflow:auto;display:flex;flex-direction:column;gap:10px;font:13px Segoe UI,Arial';
  document.body.appendChild(box);
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var P = function (l) { try { return typeof l === 'string' ? JSON.parse(l) : (l || null); } catch (e) { return null; } };
  var cname = function (id) { var c = (typeof clients !== 'undefined' ? clients : []).find(function (x) { return String(x.id) === String(id); }); return c ? c.emriKompanise : 'klienti'; };
  var post = function (b) { return fetch('/api/notifications', { method: 'POST', headers: HDR, body: JSON.stringify(b) }); };
  var gone = function (id) { cur = cur.filter(function (n) { return n.id !== id; }); render(); };
  var done = function (n) { post({ id: n.id }); gone(n.id); };
  var go = function (n) { var l = n.link; if (l && window.xOpenLink) window.xOpenLink(typeof l === 'string' ? l : JSON.stringify(l)); done(n); };
  var myOpenTask = function (l) {
    if (!l || l.t !== 'task') return null;
    var t = (X.mt || []).find(function (x) { return String(x.id) === String(l.id); });
    return t && t.st !== 'done' && (t.us && t.us.length ? t.us : [t.u]).indexOf(ME.name) >= 0 ? t : null;
  };
  var btn = function (a, id, label, cls) { return '<button data-a="' + a + '" data-id="' + id + '" style="border:0;border-radius:5px;padding:6px 10px;cursor:pointer;font:inherit;' + (cls || 'background:#eef1f6;color:#1f2a44') + '">' + label + '</button>'; };

  function render() {
    var h = '';
    if ('Notification' in window && Notification.permission === 'default' && !noBanner)
      h += '<div style="background:#fff;border:1px solid #d9dee7;border-left:4px solid #b4801e;border-radius:8px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.18)">Aktivizo njoftimet në desktop që t’i shohësh edhe kur je në një faqe tjetër.<div style="margin-top:8px;display:flex;gap:6px">' + btn('perm', 0, 'Aktivizo', 'background:#1f2a44;color:#fff') + btn('nob', 0, 'Jo tani') + '</div></div>';
    chat.forEach(function (c) {
      h += '<div style="background:#fff;border:1px solid #d9dee7;border-left:4px solid #1d7a46;border-radius:8px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.18)"><div style="font-weight:600">💬 ' + E(c.from) + (c.n > 1 ? ' <small>(' + c.n + ' mesazhe të reja)</small>' : '') + '</div><div style="color:#374151;margin-top:2px">' + E(c.text) + '</div><div style="margin-top:8px;display:flex;gap:6px">' +
        '<button data-a="chgo" data-c="' + E(c.convo) + '" style="border:0;border-radius:5px;padding:6px 10px;cursor:pointer;font:inherit;background:#1f2a44;color:#fff">Hape bisedën</button><button data-a="chack" data-c="' + E(c.convo) + '" style="border:0;border-radius:5px;padding:6px 10px;cursor:pointer;font:inherit;background:#eef1f6;color:#1f2a44">E kuptova</button></div></div>';
    });
    cur.slice(0, 4).forEach(function (n) {
      var l = P(n.link), rv = l && l.rv && ME.role === 'admin', t = myOpenTask(l), b = '';
      b += btn('go', n.id, rv ? 'Shiko klientin' : 'Hape', 'background:#1f2a44;color:#fff');
      if (rv) b += btn('ok', n.id, 'E aprovova', 'background:#1d7a46;color:#fff') + btn('back', n.id, 'Kthe si detyrë', 'background:#b4443b;color:#fff');
      else { if (t) b += btn('fin', n.id, 'U krye', 'background:#1d7a46;color:#fff'); b += btn('ack', n.id, 'E kuptova'); }
      h += '<div style="background:#fff;border:1px solid #d9dee7;border-left:4px solid ' + (rv ? '#b4801e' : '#2a5298') + ';border-radius:8px;padding:10px 12px;box-shadow:0 6px 20px rgba(0,0,0,.18)"><div style="font-weight:600">' + E(n.text) + '</div><small style="color:#6b7280">' + E(new Date(n.at).toLocaleString('sq-AL')) + (rv ? ' · pret aprovimin tënd' : '') + '</small><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + b + '</div></div>';
    });
    if (cur.length > 4) h += '<div style="text-align:right;color:#1f2a44;background:#fff;border-radius:6px;padding:4px 10px">+ ' + (cur.length - 4) + ' njoftime të tjera (shiko “Njoftime” lart)</div>';
    box.innerHTML = h;
  }
  box.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('button[data-a]'); if (!el) return;
    var a = el.getAttribute('data-a'), id = +el.getAttribute('data-id'), n = cur.find(function (x) { return x.id === id; }), l = n && P(n.link);
    if (a === 'chgo' || a === 'chack') { var cv = el.getAttribute('data-c'); if (a === 'chgo') { if (window.xChatOpen) window.xChatOpen(cv); } else if (window.xChatAck) window.xChatAck(cv); return; }
    if (a === 'perm') { Notification.requestPermission().then(render); return; }
    if (a === 'nob') { noBanner = true; render(); return; }
    if (!n) return;
    if (a === 'go') { if (l && l.rv) { if (window.xOpenLink) window.xOpenLink(typeof n.link === 'string' ? n.link : JSON.stringify(n.link)); } else go(n); }   // njoftimi i aprovimit mbetet derisa të vendosësh
    else if (a === 'ack') done(n);
    else if (a === 'fin') { var t = myOpenTask(l); if (t) (window.xMine || window.xMt)(t.id, 'done'); done(n); }
    else if (a === 'ok') {
      post({ say: { name: l.by, text: ME.name + ' e aprovoi ndryshimin tënd te klienti ' + cname(l.id) + ' (' + l.what + ')', link: { t: 'client', id: l.id } } });
      done(n); if (window.xToast) window.xToast('U aprovua. ' + l.by + ' u njoftua.');
    } else if (a === 'back') {
      var why = prompt('Pse e kthen? (shkurt, p.sh. “afati i gabuar”). Ndryshimi kthehet si detyrë te ' + l.by + '.', ''); if (why === null) return;
      X.mt = X.mt || [];
      X.mt.push({ id: uid(), title: 'Korrigjo: ' + l.what + ' – ' + cname(l.id), cid: l.id, due: A.TODAY, prio: 'n', rec: '', desc: 'Kthyer nga ' + ME.name + (why ? ': ' + why : ''), u: l.by, us: [l.by], st: 'todo', by: ME.name, at: new Date().toISOString() });
      A.sv(); done(n); if (window.xToast) window.xToast('U kthye si detyrë te ' + l.by + '.');
    }
  });
  function desk(n) {
    if (!('Notification' in window) || Notification.permission !== 'granted' || shown[n.id]) return;
    shown[n.id] = 1; var k = Object.keys(shown); if (k.length > 200) delete shown[k[0]]; try { localStorage.setItem(SK, JSON.stringify(shown)); } catch (e) {}
    try { var d = new Notification('Studio Kontabiliteti', { body: n.text, tag: 'crm-' + n.id, requireInteraction: true }); d.onclick = function () { window.focus(); d.close(); go(n); }; } catch (e) {}
  }
  window.xNotifyPush = function (items) { cur = (items || []).filter(function (n) { return !n.read; }); cur.forEach(desk); render(); };

  window.xChatCards = function (l) { chat = l || []; render(); };

  /* Sinkronizim i drejtpërdrejtë: rinjeh të dhënat në vend, pa rifreskuar faqen */
  window.xReloadAll = function () {
    try {
      loadData();
      var nx = {}; try { nx = JSON.parse(localStorage.getItem('crmX') || '{}'); } catch (e) {}
      Object.keys(X).forEach(function (k) { delete X[k]; });
      Object.assign(X, { done: {}, k: [], fu: {}, cat: [], mt: [], sv: [], ref: [] }, nx);
      if (typeof re === 'function') re();
      window.dispatchEvent(new Event('crm:sync'));
    } catch (e) { location.reload(); }
  };
})();
