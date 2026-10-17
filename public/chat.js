/* Chat i thjeshtë mes kolegëve: "Ekipi" + mesazhe private. */
(function () {
  var A = window.XAPI, ME = window.CRM_ME; if (!A || !ME) return;
  var X = A.X, E = A.E, HDR = { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' };
  var msgs = [], last = 0, convo = '', SK = 'crmChatSeen:' + ME.name, seen = {}; try { seen = JSON.parse(localStorage.getItem(SK) || '{}'); } catch (e) {}
  var pane = document.createElement('div'); pane.id = 'tchat'; pane.className = 'tab-content'; document.getElementById('detyrat').insertAdjacentElement('afterend', pane);
  var _sw = window.switchTab; window.switchTab = function (t) { _sw(t); if (t === 'tchat') { markSeen(); draw(); poll(); } };
  var open = function () { return pane.classList.contains('active'); };
  var inConvo = function (m, c) { return c === '' ? !m.to_name : (m.from_name === c && m.to_name === ME.name) || (m.from_name === ME.name && m.to_name === c); };
  var lastOf = function (c) { return msgs.filter(function (m) { return inConvo(m, c); }).reduce(function (a, m) { return Math.max(a, m.id); }, 0); };
  var unread = function (c) { return msgs.filter(function (m) { return inConvo(m, c) && m.from_name !== ME.name && m.id > (seen[c] || 0); }).length; };
  var totalUnread = function () { return ['' ].concat(others()).reduce(function (a, c) { return a + unread(c); }, 0); };
  var others = function () { return (X.users || []).filter(function (n) { return n !== ME.name; }); };
  function markSeen() { seen[convo] = lastOf(convo); try { localStorage.setItem(SK, JSON.stringify(seen)); } catch (e) {} badge(); }
  var sig = '';
  function cards() {
    var out = []; [''].concat(others()).forEach(function (c) { var u = unread(c); if (!u) return; var l = msgs.filter(function (m) { return inConvo(m, c) && m.from_name !== ME.name; }).pop(); out.push({ convo: c, n: u, from: c === '' ? 'Ekipi · ' + l.from_name : c, text: String(l.text).slice(0, 120) }); });
    return out;
  }
  function pushCards() { var c = cards(), s = JSON.stringify(c); if (s === sig) return; sig = s; if (window.xChatCards) window.xChatCards(c); }
  window.xChatOpen = function (c) { convo = c || ''; window.switchTab('tchat'); };
  window.xChatAck = function (c) { seen[c || ''] = lastOf(c || ''); try { localStorage.setItem(SK, JSON.stringify(seen)); } catch (e) {} badge(); };
  function badge() {
    pushCards();
    var n = totalUnread(), a = [].slice.call(document.querySelectorAll('#xside nav a, #xside nav button, #xside nav div')).filter(function (e) { return /^Chat\b/.test((e.firstChild && e.firstChild.textContent || '').trim()) && e.children.length < 3; })[0];
    if (a) { var b = a.querySelector('.xchb'); if (!b) { b = document.createElement('span'); b.className = 'xchb'; b.style.cssText = 'float:right;background:#b4443b;color:#fff;border-radius:9px;padding:0 7px;font-size:11px'; a.appendChild(b); } b.textContent = n; b.style.display = n ? 'inline' : 'none'; }
  }
  function draw() {
    if (!open()) return;
    var list = [['', 'Ekipi']].concat(others().map(function (n) { return [n, n]; })), cur = msgs.filter(function (m) { return inConvo(m, convo); });
    var left = list.map(function (c) { var u = unread(c[0]); return '<div data-c="' + E(c[0]) + '" style="padding:9px 12px;cursor:pointer;border-radius:6px;' + (c[0] === convo ? 'background:#1f2a44;color:#fff' : '') + '">' + (c[0] === '' ? '👥 ' : '') + E(c[1]) + (u ? ' <span style="float:right;background:#b4443b;color:#fff;border-radius:9px;padding:0 7px;font-size:11px">' + u + '</span>' : '') + '</div>'; }).join('');
    var right = cur.map(function (m) { var me = m.from_name === ME.name, t = new Date(m.at); return '<div style="display:flex;justify-content:' + (me ? 'flex-end' : 'flex-start') + ';margin:6px 0"><div style="max-width:72%;padding:8px 12px;border-radius:12px;background:' + (me ? '#dbe8ff' : '#eef1f6') + '"><small style="color:#6b7280">' + (me ? 'Ti' : E(m.from_name)) + ' · ' + String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ' · ' + E(window.xFd(String(m.at).slice(0, 10))) + '</small><br>' + E(m.text).replace(/\n/g, '<br>') + '</div></div>'; }).join('');
    pane.innerHTML = A.sec('Chat me kolegët', '<div style="display:flex;gap:14px;height:62vh"><div style="width:200px;overflow:auto;border-right:1px solid #e5e8ee;padding-right:8px">' + left + '</div><div style="flex:1;display:flex;flex-direction:column"><div id="chm" style="flex:1;overflow:auto;padding:4px 8px">' + (right || '<div style="color:#6b7280;padding:20px">Asnjë mesazh ende. Shkruaj të parin.</div>') + '</div><div style="display:flex;gap:8px;margin-top:8px"><textarea id="chi" rows="2" style="flex:1" placeholder="Shkruaj mesazh… (Enter = dërgo, Shift+Enter = rresht i ri)"></textarea><button class="btn btn-primary" id="chs">Dërgo</button></div></div></div>');
    var box = document.getElementById('chm'); if (box) box.scrollTop = box.scrollHeight;
  }
  pane.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('[data-c]'); if (c) { convo = c.getAttribute('data-c'); markSeen(); draw(); return; }
    if (e.target.id === 'chs') send();
  });
  pane.addEventListener('keydown', function (e) { if (e.target.id === 'chi' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  async function send() {
    var el = document.getElementById('chi'), t = el && el.value.trim(); if (!t) return;
    el.value = ''; var r = await fetch('/api/chat', { method: 'POST', headers: HDR, body: JSON.stringify({ to: convo || null, text: t }) });
    if (!r.ok) { if (window.xToast) window.xToast('Mesazhi nuk u dërgua.'); el.value = t; return; }
    await poll(); markSeen(); draw();
  }
  async function poll() {
    try {
      var r = await fetch('/api/chat' + (last ? '?after=' + last : '')); if (!r.ok) return; var n = await r.json(); if (!n.length) return;
      var first = !last; n.forEach(function (m) { msgs.push(m); last = Math.max(last, m.id); });
      if (!first) n.filter(function (m) { return m.from_name !== ME.name && !(open() && inConvo(m, convo)); }).forEach(function (m) {
        if ('Notification' in window && Notification.permission === 'granted' && !document.hasFocus()) try { var d = new Notification('Chat – ' + m.from_name, { body: m.text.slice(0, 120), tag: 'chat-' + m.id, requireInteraction: true }); d.onclick = function () { window.focus(); d.close(); window.xChatOpen(m.to_name ? m.from_name : ''); }; } catch (e) {}
      });
      if (open()) { var keep = document.getElementById('chi'), v = keep ? keep.value : ''; markSeen(); draw(); var k2 = document.getElementById('chi'); if (k2 && v) k2.value = v; }
      badge();
    } catch (e) {}
  }
  window.xChatState = function () { return { msgs: msgs, unread: unread, totalUnread: totalUnread }; };
  var cn = 0; poll(); setInterval(function () { if (document.hidden && (cn++ % 3)) return; poll(); }, 8000); setInterval(badge, 3000);
})();
