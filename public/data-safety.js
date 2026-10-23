/* Redaction for client exports and local backup files. */
(function () {
  var SECRET_FIELDS = ['passwordEAlbania', 'passwordEFiling', 'passwordProgramiFiskal', 'passwordCertifikata'];

  window.crmRedactClients = function (clients) {
    if (!Array.isArray(clients)) throw new TypeError('Lista e klientëve nuk është e vlefshme.');
    return clients.map(function (client) {
      var copy = Object.assign({}, client);
      SECRET_FIELDS.forEach(function (field) {
        if (field in copy) copy[field] = '';
      });
      return copy;
    });
  };

  window.crmRedactBackup = function (backup) {
    var copy = Object.assign({}, backup);
    if (typeof copy.crmClients === 'string') {
      copy.crmClients = JSON.stringify(window.crmRedactClients(JSON.parse(copy.crmClients)));
    }
    return copy;
  };
})();
