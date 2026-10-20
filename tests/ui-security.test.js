import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const helperStart = html.indexOf('function escapeHtmlValue(value)');
const rendererStart = html.indexOf('function renderTableKliente', helperStart);
const rendererEnd = html.indexOf('// Format data me ngjyra', rendererStart);
const source = html.slice(helperStart, html.indexOf('// Render Klientët', helperStart))
  + html.slice(rendererStart, rendererEnd);

function renderClient(client) {
  const tbody = { innerHTML: '' };
  const render = new Function('document', 'clients', 'formatDataMeSkadje', `${source}; return renderTableKliente;`)({
    getElementById: () => tbody,
  }, [client], () => '-');
  render();
  return tbody.innerHTML;
}

test('client table escapes stored text and does not put an untrusted id in handlers', () => {
  const markup = renderClient({
    id: 'alert(1)',
    emriKompanise: '<img src=x onerror=alert(1)>',
    nipt: '<svg/onload=alert(1)>',
    administratori: 'A&B',
    nrKontakti: 'contact',
    emailBiznes: '<b>private</b>',
    tarifaMujore: '100',
    statusKlient: 'aktiv',
    statusPagese: 'paguan',
  });

  assert.ok(markup.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(markup.includes('&lt;svg/onload=alert(1)&gt;'));
  assert.ok(markup.includes('A&amp;B'));
  assert.ok(markup.includes('&lt;b&gt;private&lt;/b&gt;'));
  assert.ok(markup.includes('ID klienti e pavlefshme'));
  assert.doesNotMatch(markup, /<img|<svg|<b>private<\/b>|onclick="[^"]*alert\(/i);
});

test('client table keeps actions for a valid integer id', () => {
  const markup = renderClient({
    id: 42,
    emriKompanise: 'Studio Test',
    nipt: 'T-42',
    administratori: 'Admin',
    nrKontakti: '123',
    emailBiznes: 'test@example.invalid',
    tarifaMujore: '100',
    statusKlient: 'aktiv',
    statusPagese: 'paguan',
  });

  assert.match(markup, /onclick="xDosje\(42\)"/);
  assert.match(markup, /onclick="deleteClient\(42\)"/);
});

test('application table escapes imported text and rejects untrusted action ids', () => {
  const helperStart = html.indexOf('function escapeHtmlValue(value)');
  const helperEnd = html.indexOf('// Render Klientët', helperStart);
  const appStart = html.indexOf('function renderTableAplikime(', helperEnd);
  const appEnd = html.indexOf('// Edit/Delete Aplikime', appStart);
  const tbody = { innerHTML: '' };
  const render = new Function('document', 'aplikime',
    html.slice(helperStart, helperEnd) + html.slice(appStart, appEnd) + '; return renderTableAplikime;')({
      getElementById: () => tbody,
    }, [{
      id: 'alert(1)',
      emriKompaniseAplikim: '<img src=x onerror=alert(1)>',
      administratoriAplikim: '<svg/onload=alert(1)>',
      nrKontaktiAplikim: 'contact',
      emailAplikim: '<b>email</b>',
      dataAplikimit: '2026-10-20',
      tarifaMujoreAplikim: 'not-a-number',
      statusAplikim: 'pritje',
    }]);
  render();

  assert.ok(tbody.innerHTML.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(tbody.innerHTML.includes('&lt;svg/onload=alert(1)&gt;'));
  assert.ok(tbody.innerHTML.includes('&lt;b&gt;email&lt;/b&gt;'));
  assert.ok(tbody.innerHTML.includes('ID aplikimi e pavlefshme'));
  assert.doesNotMatch(tbody.innerHTML, /<img|<svg|<b>email<\/b>|onclick="[^"]*alert\(/i);
});
