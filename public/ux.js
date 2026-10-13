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
})();
