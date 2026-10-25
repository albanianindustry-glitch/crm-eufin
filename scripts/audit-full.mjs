import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { checkX, divertClients, dupNipt } from '../api/_perm.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(root, 'audit-results');
const checks = [];
const STATUSES = ['PASS', 'FAIL', 'NOT IMPLEMENTED', 'NOT VERIFIED'];
const PRIORITIES = {
  'CLIENT-DELETE-APPROVAL': 'P1', 'CLIENT-ID-REPLACEMENT': 'P1',
  'CRM-X-FINANCE-HISTORY-PERMISSIONS': 'P1', 'CLIENT-TABLE-ESCAPING': 'P1',
  'SERVER-DOMAIN-INPUT-VALIDATION': 'P1', 'BACKUP-COVERAGE': 'P1',
  'BROWSER-CLIENT-EXPORT-SECRET-REDACTION': 'P1', 'VAT-APPROVAL-ENFORCEMENT': 'P1',
  'CLIENT-DELETE-REFERENCES': 'P1', 'PDF-SIGNATURE-VALIDATION': 'P2', 'STORE-AUDIT-ATOMICITY': 'P2',
};

function add(id, status, evidence, details = '') {
  if (!STATUSES.includes(status)) throw new Error(`Invalid audit status: ${status}`);
  checks.push({ id, status, priority: PRIORITIES[id] || null, evidence, details });
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (['.git', 'node_modules', 'audit-results', 'test-results'].includes(entry.name)) return [];
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function command(executable, args, timeoutMs = 120_000, env = process.env) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 12 * 1024 * 1024,
  });
  return {
    code: result.status ?? 1,
    timedOut: result.error?.code === 'ETIMEDOUT',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error ? `${result.error.code || ''} ${result.error.message}`.trim() : '',
  };
}

function attrs(source) {
  const result = {};
  for (const match of source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? true;
  }
  return result;
}

const plainText = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const lineOf = (file, text) => {
  const source = readFileSync(join(root, file), 'utf8');
  const index = source.indexOf(text);
  return index < 0 ? null : source.slice(0, index).split('\n').length;
};
const ref = (file, text) => `${file}${lineOf(file, text) ? `#L${lineOf(file, text)}` : ''}`;

function inventory() {
  const files = filesUnder(root).map((path) => relative(root, path).replaceAll('\\', '/')).sort();
  const apiFiles = files.filter((path) => path.startsWith('api/') && path.endsWith('.js'));
  const endpoints = apiFiles.filter((path) => !path.split('/').at(-1).startsWith('_'));
  const apiText = apiFiles.map((path) => readFileSync(join(root, path), 'utf8')).join('\n');
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  const environmentVariables = [...new Set([...apiText.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]))].sort();
  const tables = [...apiText.matchAll(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([^`]+)\)/g)].map((match) => ({
    name: match[1],
    columns: match[2].replace(/\s+/g, ' ').trim(),
    evidence: ref('api/_lib.js', `CREATE TABLE IF NOT EXISTS ${match[1]}`),
  }));
  const indexes = [...apiText.matchAll(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]+)\)/gi)].map((match) => ({
    unique: Boolean(match[1]), name: match[2], table: match[3], columns: match[4].trim(),
  }));
  const foreignKeys = [...apiText.matchAll(/FOREIGN KEY\s*\(([^)]+)\)\s+REFERENCES\s+(\w+)\s*\(([^)]+)\)/gi)].map((match) => ({
    columns: match[1], references: `${match[2]}(${match[3]})`,
  }));
  const migrations = [...apiText.matchAll(/ALTER TABLE\s+(\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)\s+([^`]+)/gi)].map((match) => ({
    table: match[1], column: match[2], definition: match[3].trim(),
  }));
  const functionPattern = /(?:export\s+)?(?:async\s+)?function\s+([\w$]+)|(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:function|(?:\([^)]*\)|[\w$]+)\s*=>)|window\.([\w$]+)\s*=/g;
  const functions = [];
  const imports = [];
  const methods = [];
  for (const file of files.filter((path) => /\.(?:js|mjs)$/.test(path))) {
    const source = readFileSync(join(root, file), 'utf8');
    for (const match of source.matchAll(functionPattern)) functions.push({ file, name: match[1] || match[2] || match[3] });
    for (const match of source.matchAll(/^\s*import\s+(?:[^'"\n]+\s+from\s+)?['"]([^'"]+)['"]/gm)) imports.push({ file, target: match[1] });
    if (file.startsWith('api/') && !file.split('/').at(-1).startsWith('_')) {
      methods.push({ file, methods: [...new Set([...source.matchAll(/req\.method\s*===?\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/g)].map((item) => item[1]))].sort() });
    }
  }

  const html = readFileSync(join(root, 'public/index.html'), 'utf8');
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const forms = [...markup.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)].map((formMatch) => {
    const formAttrs = attrs(formMatch[1]);
    const fields = [...formMatch[2].matchAll(/<(input|select|textarea)\b([^>]*)>/gi)].map((fieldMatch) => {
      const fieldAttrs = attrs(fieldMatch[2]);
      const id = String(fieldAttrs.id || '');
      const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const labelMatch = id ? markup.match(new RegExp(`<label[^>]*for=["']${escapedId}["'][^>]*>([\\s\\S]*?)<\\/label>`, 'i')) : null;
      return {
        tag: fieldMatch[1].toLowerCase(), id: id || null, name: fieldAttrs.name || null,
        type: fieldAttrs.type || (fieldMatch[1].toLowerCase() === 'input' ? 'text' : null),
        required: Boolean(fieldAttrs.required), label: labelMatch ? plainText(labelMatch[1]) : null,
      };
    });
    return { id: formAttrs.id || null, method: formAttrs.method || 'get', fields };
  });
  const buttons = [...markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi)].map((match) => {
    const button = attrs(match[1]);
    return { label: plainText(match[2]) || button['aria-label'] || button.title || '(unlabeled)', id: button.id || null,
      type: button.type || 'submit', inlineHandler: Boolean(button.onclick) };
  });
  const links = [...markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)].map((match) => {
    const link = attrs(match[1]);
    return { label: plainText(match[2]) || link['aria-label'] || '(unlabeled)', href: link.href || null };
  });
  const dynamicSources = files.filter((path) => path.startsWith('public/') && /\.(?:js|html)$/.test(path)).map((file) => {
    const source = readFileSync(join(root, file), 'utf8');
    if (file !== 'public/index.html') return { file, source, lineOffset: 0 };
    const pieces = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
      .filter((match) => !attrs(match[1]).src)
      .map((match) => ({ source: match[2], lineOffset: source.slice(0, match.index).split('\n').length - 1 }));
    return { file, source: pieces.map((piece) => piece.source).join('\n'), pieces };
  });
  const dynamicControls = [];
  for (const item of dynamicSources) {
    const pieces = item.pieces || [{ source: item.source, lineOffset: item.lineOffset }];
    for (const piece of pieces) {
      const controlPattern = /<(button|input|select|textarea|a)\b([^>]*)>(?:([\s\S]*?)<\/\1\s*>)?/gi;
      for (const match of piece.source.matchAll(controlPattern)) {
        const control = attrs(match[2]);
        const kind = match[1].toLowerCase();
        const label = plainText(match[3] || '') || control['aria-label'] || control.title || control.placeholder || control.name || control.id || '(dynamic label)';
        const line = piece.lineOffset + piece.source.slice(0, match.index).split('\n').length;
        dynamicControls.push({
          file: item.file, line, kind, label, id: typeof control.id === 'string' ? control.id : null,
          type: typeof control.type === 'string' ? control.type : null,
          handler: control.onclick || control.onchange || control.oninput || null,
        });
      }
    }
  }
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);

  return {
    files, apiFiles, endpoints,
    package: {
      name: packageJson.name, version: packageJson.version, engines: packageJson.engines,
      scripts: packageJson.scripts, dependencies: packageJson.dependencies || {}, devDependencies: packageJson.devDependencies || {},
    },
    vercelConfig: vercel,
    environmentVariables,
    apiPaths: [...endpoints.map((path) => `/api/${path.slice(4, -3)}`), '/api/login', '/api/logout', '/api/whoami', '/api/password'],
    tables, indexes, foreignKeys, migrations,
    keyValueDataKeys: ['crmClients', 'crmAplikime', 'crmNdryshime', 'crmDeklarimeTVSH', 'crmX', 'crmReq'],
    apiMethods: methods, functions, imports, forms,
    fields: forms.flatMap((form) => form.fields.map((field) => ({ form: form.id, ...field }))),
    buttons, links,
    dynamicControls,
    inlineScripts: scripts.filter((match) => !attrs(match[1]).src).map((match) => match[2]),
    externalScripts,
    dynamicModules: ['public/shell.js', 'public/tasks.js', 'public/services.js', 'public/clientform.js', 'public/ux.js', 'public/billing.js', 'public/chat.js', 'public/approvals.js', 'public/audit.js'],
  };
}

function checkBusinessRules() {
  const accountant = { name: 'Audit Accountant', role: 'accountant' };
  const current = JSON.stringify([{ id: 1, emriKompanise: 'Audit Client', nipt: 'AUDIT-1' }]);
  const deletion = divertClients(current, '[]', accountant);
  add('CLIENT-DELETE-APPROVAL', !deletion.requests.length && !JSON.parse(deletion.value).length ? 'FAIL' : 'PASS',
    ref('api/_perm.js', 'export function divertClients'),
    'Pure-function probe with synthetic data: deletion bypasses approval and removes the existing row.');

  const replacement = JSON.stringify([{ id: 2, emriKompanise: 'Replacement', nipt: 'AUDIT-1' }]);
  const replaced = divertClients(current, replacement, accountant);
  add('CLIENT-ID-REPLACEMENT', !replaced.requests.length && dupNipt(current, replacement) === '' ? 'FAIL' : 'PASS',
    ref('api/_perm.js', 'export function divertClients'),
    'Pure-function probe with synthetic data: replacing the client ID preserves an existing NIPT without an approval request.');

  const before = JSON.stringify({ fat: [{ id: 'f1', amount: 100 }], hist: [] });
  const after = JSON.stringify({ fat: [{ id: 'f1', amount: 1 }], hist: [{ id: 'h1', by: 'Admin', t: 'Approved' }] });
  const violations = checkX(before, after, accountant);
  add('CRM-X-FINANCE-HISTORY-PERMISSIONS', violations.length ? 'PASS' : 'FAIL', ref('api/_perm.js', 'const STATUS ='),
    'Pure-function probe: accountant changes billing data and appends a history row; authorization violations returned: ' + violations.length + '.');
}

function countSummary() {
  return Object.fromEntries(STATUSES.map((status) => [status, checks.filter((check) => check.status === status).length]));
}

function makeMarkdown(report) {
  const inv = report.inventory;
  const lines = [
    '# CRM Audit Run', '',
    `- Timestamp: ${report.generatedAt}`,
    `- Target: ${report.target}`,
    `- Runtime: ${report.runtime}`,
    `- Counts: ${Object.entries(report.summary).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    `- Risk priorities: ${Object.entries(report.prioritySummary).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    '- Completeness: partial. Static parsing cannot certify dynamic UI behavior or database state.', '',
    '## Check Results', '| ID | Status | Priority | Evidence | Details |', '|---|---|---|---|---|',
    ...checks.map((check) => `| ${check.id} | **${check.status}** | ${check.priority || '—'} | ${check.evidence} | ${check.details.replaceAll('|', '\\|').replaceAll('\n', ' ')} |`),
    '', '## Inventory Summary',
    `- Source/config/doc/test files: ${inv.files.length}`,
    `- API endpoint files: ${inv.endpoints.length}; API paths including auth rewrite aliases: ${inv.apiPaths.length}`,
    `- Tables from DDL: ${inv.tables.length}; declared indexes: ${inv.indexes.length}; foreign keys: ${inv.foreignKeys.length}; ALTER ADD COLUMN migrations: ${inv.migrations.length}`,
    `- JSON key-value data buckets: ${inv.keyValueDataKeys.join(', ')}`,
    `- Package: ${inv.package.name}@${inv.package.version}; Node ${inv.package.engines?.node || 'unspecified'}; scripts=${Object.keys(inv.package.scripts || {}).join(', ')}; dependencies=${Object.keys(inv.package.dependencies).join(', ')}; devDependencies=${Object.keys(inv.package.devDependencies).join(', ')}`,
    `- Vercel: rewrites=${inv.vercelConfig.rewrites?.length || 0}; security header rules=${inv.vercelConfig.headers?.length || 0}; cron=${(inv.vercelConfig.crons || []).map((cron) => `${cron.path} ${cron.schedule}`).join(', ') || 'none'}`,
    `- API environment variable names (values not collected): ${inv.environmentVariables.join(', ')}`,
    `- Static HTML forms: ${inv.forms.length}; fields: ${inv.fields.length}; buttons: ${inv.buttons.length}; links: ${inv.links.length}`,
    `- Dynamic template controls detected: ${inv.dynamicControls.length} (buttons=${inv.dynamicControls.filter((item) => item.kind === 'button').length}; fields=${inv.dynamicControls.filter((item) => ['input', 'select', 'textarea'].includes(item.kind)).length}; links=${inv.dynamicControls.filter((item) => item.kind === 'a').length}). Inventory only; behavior remains NOT VERIFIED.`,
    `- JS functions/handlers detected by regex: ${inv.functions.length}; imports: ${inv.imports.length}; inline script blocks: ${inv.inlineScripts.length}; external scripts: ${inv.externalScripts.length}`,
    '- The function/import inventory is heuristic; it is not a semantic call graph.',
    '- The static UI inventory excludes dynamically generated forms, controls, modal contents and navigation.', '',
    '### UI / Data / API Flow Map',
    '- Login/users: public/login.html -> api/auth.js -> users; account administration -> api/users.js -> users/notifs.',
    '- Client/application/change/VAT forms: public/index.html + clientform.js -> shim.js localStorage bridge -> api/store.js -> kv buckets crmClients/crmAplikime/crmNdryshime/crmDeklarimeTVSH.',
    '- Tasks/contracts/services/funds/billing/reports: tasks.js/services.js/billing.js and inline index modules -> crmX bucket -> api/store.js -> kv; existing client/contract approval requests use crmReq.',
    '- Client/contract PDF references live in JSON buckets; file contents use api/file.js -> files table.',
    '- Notifications/chat/audit: alerts.js/chat.js/audit.js -> matching API endpoints -> notifs/chat/audit tables.',
    '- Daily manual-task digest: cron-daily.js reads crmX and writes notifs; standard obligation calculation runs in the browser, not cron.',
    '- api/export.js exports kv data only; browser backup reads a subset of localStorage buckets.', '',
    '### Documented Unimplemented Features',
    '- D-06 duplicate-document detection: NOT IMPLEMENTED (AUDIT-v13).',
    '- F-02 owner indicators in the team task table: NOT IMPLEMENTED (AUDIT-v13).',
    '- F-03 daily work/performance report: NOT IMPLEMENTED (daily reminders are not this report).',
    '- F-06 document replace/delete lifecycle: NOT IMPLEMENTED (AUDIT-v13).',
    '- F-07 collaborative document editing/versioning: NOT IMPLEMENTED (AUDIT-v13).',
    '- Client dossier redesign: NOT IMPLEMENTED (AUDIT-v13).', '',
    '### Role / API Authorization Matrix (static evidence only)',
    '- Administrator: PASS for server-side users/audit/export gates and decrypted client bootstrap; full action coverage NOT VERIFIED.',
    '- Accountant: PASS for server-side task/service/history checks present in checkX; FAIL for crmX financial/history omissions and client deletion/ID replacement approval bypasses (see checks).',
    '- Both authenticated roles: file upload/download accepted by session guard; per-record file ownership NOT VERIFIED.',
    '- Accountant writes to crmAplikime and crmNdryshime have no dedicated server policy branch detected: NOT VERIFIED pending business-policy confirmation.',
    '- CRM data buckets are JSON documents in kv; SQL schema has no foreign keys, so cross-record integrity is application-enforced.', '',
    '### API Paths', ...inv.apiPaths.map((path) => `- ${path}`), '',
    '### Database Tables', ...inv.tables.map((table) => `- ${table.name}: ${table.columns} (${table.evidence})`), '',
    '### Indexes / Foreign Keys / Migrations',
    ...inv.indexes.map((index) => `- INDEX ${index.name} on ${index.table}(${index.columns})${index.unique ? ' UNIQUE' : ''}`),
    ...(inv.foreignKeys.length ? inv.foreignKeys.map((fk) => `- FOREIGN KEY ${fk.columns} REFERENCES ${fk.references}`) : ['- No FOREIGN KEY declarations detected.']),
    ...inv.migrations.map((migration) => `- ALTER ${migration.table} ADD ${migration.column} ${migration.definition}`), '',
    '### Static Forms And Fields',
    ...inv.forms.map((form) => `- ${form.id || '(no id)'} (${form.method}): ${form.fields.map((field) => `${field.id || field.name || field.tag}${field.required ? ' *' : ''}${field.label ? ` [${field.label}]` : ''}`).join(', ')}`), '',
    '### Static Buttons',
    ...inv.buttons.map((button) => `- ${button.label}; id=${button.id || 'none'}; type=${button.type}; inline handler=${button.inlineHandler}`), '',
    '### Dynamic Template Controls (source inventory only; behavior NOT VERIFIED)',
    ...inv.dynamicControls.map((control) => `- ${control.file}#L${control.line}: ${control.kind} “${control.label}”; id=${control.id || 'none'}; type=${control.type || 'none'}; handler=${control.handler ? 'present' : 'not inline'}`), '',
    '### External UI Modules', ...inv.externalScripts.map((file) => `- ${file}`), '',
    '### Static Imports', ...inv.imports.map((item) => `- ${item.file} -> ${item.target}`), '',
    '### Detected Functions By File',
    ...[...new Set(inv.functions.map((item) => item.file))].map((file) => `- ${file}: ${inv.functions.filter((item) => item.file === file).map((item) => item.name).join(', ')}`), '',
    '### Dynamically Rendered Modules Not Fully Inventoried', ...inv.dynamicModules.map((file) => `- ${file}: NOT VERIFIED`), '',
  ];
  return lines.join('\n');
}

function main() {
  const inv = inventory();
  add('DYNAMIC-UI-SOURCE-INVENTORY', 'PASS', 'public/*.js + inline scripts in public/index.html',
    `Detected ${inv.dynamicControls.length} dynamic HTML controls from template/source strings. Detection is heuristic and does not prove runtime presence or behavior.`);
  add('STATIC-INVENTORY', 'PASS', 'Filesystem + source parsing',
    `${inv.files.length} project files; ${inv.endpoints.length} API endpoint files; ${inv.tables.length} tables; ${inv.forms.length} static forms; ${inv.fields.length} static fields; ${inv.buttons.length} static buttons. Dynamic UI excluded.`);

  let syntaxFailed = false;
  const jsFiles = inv.files.filter((path) => /\.(?:js|mjs)$/.test(path));
  for (const file of jsFiles) {
    const result = command(process.execPath, ['--check', join(root, file)], 15_000);
    const status = result.code === 0 ? 'PASS' : 'FAIL';
    if (status === 'FAIL') syntaxFailed = true;
    add(`SYNTAX:${file}`, status, file, result.error || result.stdout + result.stderr || 'node --check passed.');
  }
  inv.inlineScripts.forEach((source, index) => {
    try {
      new Script(source, { filename: `public/index.html#inline-${index + 1}` });
      add(`SYNTAX:index-inline-${index + 1}`, 'PASS', `public/index.html inline script ${index + 1}`, 'Compiled by vm.Script.');
    } catch (error) {
      syntaxFailed = true;
      add(`SYNTAX:index-inline-${index + 1}`, 'FAIL', `public/index.html inline script ${index + 1}`, error.message);
    }
  });

  const unit = command('npm', ['test'], 120_000);
  const unitOutput = unit.stdout + unit.stderr;
  const unitCounts = unitOutput.match(/ℹ tests (\d+)[\s\S]*?ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/);
  const unitStatus = unit.code === 0 ? 'PASS' : unit.timedOut ? 'NOT VERIFIED' : 'FAIL';
  add('UNIT-TESTS', unitStatus, 'npm test',
    unitCounts ? `tests=${unitCounts[1]}; pass=${unitCounts[2]}; fail=${unitCounts[3]}.` : `${unit.error}\n${unitOutput.slice(-1800)}`.trim());

  const depAudit = command('npm', ['audit', '--json'], 120_000);
  let depStatus = depAudit.code === 0 ? 'PASS' : 'NOT VERIFIED';
  let depDetails = (depAudit.error + '\n' + depAudit.stdout + depAudit.stderr).slice(-2500);
  try {
    const parsed = JSON.parse(depAudit.stdout);
    const vulnerabilities = parsed.metadata?.vulnerabilities || {};
    const total = Number(vulnerabilities.total || 0);
    depStatus = depAudit.code !== 0 ? 'NOT VERIFIED' : total ? 'FAIL' : 'PASS';
    depDetails = `total=${total}; critical=${vulnerabilities.critical || 0}; high=${vulnerabilities.high || 0}; moderate=${vulnerabilities.moderate || 0}; low=${vulnerabilities.low || 0}`;
  } catch {
    depStatus = 'NOT VERIFIED';
    depDetails = 'npm audit JSON was unavailable or unparsable; check registry/network access and the lockfile.';
  }
  add('DEPENDENCY-AUDIT', depStatus, 'npm audit --json', depDetails);
  checkBusinessRules();

  const html = readFileSync(join(root, 'public/index.html'), 'utf8');
  add('CLIENT-TABLE-ESCAPING', /function renderTableKliente[\s\S]*?<td><strong>\$\{c\.emriKompanise\}<\/strong><\/td>/.test(html) ? 'FAIL' : 'NOT VERIFIED',
    ref('public/index.html', '<td><strong>${c.emriKompanise}</strong></td>'),
    'Static check found client-controlled fields interpolated into an innerHTML template without escaping; browser impact not dynamically verified.');

  const deleteClient = html.match(/function deleteClient\(id\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] || '';
  add('CLIENT-DELETE-REFERENCES', deleteClient.includes('clients = clients.filter') && !/X\.|\.docs|\.mt|\.k/.test(deleteClient) ? 'FAIL' : 'NOT VERIFIED',
    ref('public/index.html', 'function deleteClient(id)'),
    'Client deletion removes only the client array entry; linked task/contract/document/fund records are not checked or cascaded in this handler.');

  const fileApi = readFileSync(join(root, 'api/file.js'), 'utf8');
  add('PDF-SIGNATURE-VALIDATION', fileApi.includes('application\\/pdf;base64') && !fileApi.includes('%PDF-') ? 'FAIL' : 'NOT VERIFIED',
    ref('api/file.js', 'const m = d.match'), 'Upload accepts a declared PDF data URI without checking the decoded PDF signature/parser validity.');

  const storeSource = readFileSync(join(root, 'api/store.js'), 'utf8');
  const validationBranch = /typeof value !== 'string'|value\.length >|JSON\.parse\(value\)|Array\.isArray\(parsed\)/g;
  const validationChecks = [...storeSource.matchAll(validationBranch)].length;
  add('SERVER-DOMAIN-INPUT-VALIDATION', validationChecks <= 4 ? 'FAIL' : 'NOT VERIFIED', ref('api/store.js', 'typeof value !== \'string\''),
    `Store validates JSON/type/size/container shape (${validationChecks} generic guards counted), but no field-level schemas/ranges/required-field rules were detected.`);

  const backupKeys = html.match(/const KEYS=\[([^\]]+)\]/)?.[1] || '';
  add('BACKUP-COVERAGE', !backupKeys.includes('crmReq') && html.includes('Kopje rezervë e plotë') ? 'FAIL' : 'NOT VERIFIED',
    ref('public/index.html', 'const KEYS=[\'crmClients\''), 'Local “full backup” omits crmReq and API file records; no restore test against a disposable DB was run.');

  const bootstrap = readFileSync(join(root, 'api/bootstrap.js'), 'utf8');
  add('BROWSER-CLIENT-EXPORT-SECRET-REDACTION', bootstrap.includes('decClients(v)') && html.includes('JSON.stringify(clients, null, 2)') ? 'FAIL' : 'NOT VERIFIED',
    ref('public/index.html', 'JSON.stringify(clients, null, 2)'), 'Admin bootstrap includes decrypted client fields and the browser JSON export serializes client objects; no export file was generated.');

  const store = readFileSync(join(root, 'api/store.js'), 'utf8');
  add('VAT-APPROVAL-ENFORCEMENT', !store.includes("if (key === 'crmDeklarimeTVSH')") ? 'FAIL' : 'NOT VERIFIED',
    ref('api/store.js', 'if (u.role !== \'admin\' && cur)'), 'The approval-diversion branch handles clients/contracts, not VAT declarations; save path can persist them before any notification.');
  add('STORE-AUDIT-ATOMICITY', store.includes('RETURNING version') && store.includes("await audit(u.email, merged ? 'save-merge' : 'save'") ? 'FAIL' : 'NOT VERIFIED',
    ref('api/store.js', 'RETURNING version'), 'Database value write and audit insert are separate statements; audit failure can follow a committed data write. Not reproduced against Postgres.');

  const apiExport = readFileSync(join(root, 'api/export.js'), 'utf8');
  add('SERVER-EXPORT-REDACTION', apiExport.includes('blankClients(r.value)') ? 'PASS' : 'NOT VERIFIED',
    ref('api/export.js', 'blankClients(r.value)'), 'Static check confirms the server JSON export blanks client password fields.');

  add('NOTIFICATION-SENDER-AUTHZ', 'NOT VERIFIED', ref('api/notifications.js', "if (req.method === 'POST' && b.say)"),
    'Any authenticated user may send arbitrary text to another named user; test spoofing and downstream trust in staging.');
  add('FILE-RECORD-OWNERSHIP', 'NOT VERIFIED', ref('api/file.js', 'SELECT data FROM files'),
    'Authenticated file reads are not scoped to client/document ownership; team-wide policy is not explicit.');
  add('AUTH-RATE-LIMIT', 'NOT VERIFIED', ref('api/auth.js', 'SELECT count(*)::int AS c FROM login_attempts'),
    'Proxy IP trust, concurrency and lockout behavior require staging/API tests.');
  add('APPROVAL-CONCURRENCY', 'NOT VERIFIED', ref('api/store.js', "const row = (await sql`SELECT value FROM kv WHERE key = 'crmReq'`)[0]"),
    'Approval queue read/append/write does not use the kv version compare; concurrent requests may be lost. Requires DB race test.');
  add('APPROVAL-STALE-COMPARISON', 'NOT VERIFIED', ref('public/approvals.js', 'function stale(r)'),
    'Stale check compares display values truncated to 70 characters; same-prefix long values may be treated as unchanged.');

  const missingTests = [
    ['E2E-APPROVALS', 'Approval request/approve/reject/audit chain including VAT'],
    ['E2E-CLIENTS', 'Create/edit/delete/import/dedup and data persistence'],
    ['E2E-DOCUMENTS', 'PDF upload/download/archive/replace/delete/orphans'],
    ['E2E-CONTRACTS', 'Contract CRUD with linked document and approval'],
    ['E2E-HISTORY', 'Client history and audit filters/retention'],
    ['E2E-TASKS', 'Assignment, roles, recurrence, completion and races'],
    ['E2E-MONTHLY', 'Monthly/annual generation, holidays, leap years and idempotency'],
    ['E2E-REPORTS', 'Report formulas compared with independently calculated fixtures'],
    ['E2E-SYNC', 'Two-user live sync, merge and conflict behavior'],
    ['API-DB-INTEGRATION', 'Role enforcement, schema, transaction/error behavior'],
  ];
  const unimplementedFeatures = [
    ['FEATURE-D06-DUPLICATE-DOCUMENTS', 'Duplicate-document detection'],
    ['FEATURE-F02-TEAM-OWNER-INDICATORS', 'Owner indicators in the team task table'],
    ['FEATURE-F03-DAILY-WORK-REPORT', 'Daily work/performance report; daily reminders are not this report'],
    ['FEATURE-F06-DOCUMENT-LIFECYCLE', 'Document replace/delete lifecycle'],
    ['FEATURE-F07-COLLABORATIVE-DOCUMENTS', 'Collaborative document editing/versioning'],
    ['FEATURE-DOSSIER-REDESIGN', 'Client dossier redesign'],
    ['FEATURE-TASK-EDIT', 'Editing existing task definitions'],
    ['FEATURE-TASK-DUE-TIME', 'Time-of-day task deadlines'],
    ['FEATURE-TEAM-TASK-FILTERS', 'Filters for the team task board'],
    ['FEATURE-TASK-PAUSE-STAGES', 'Pause/resume task stages and clock'],
    ['FEATURE-SOFT-DELETE', 'Recoverable soft-delete instead of permanent deletion'],
    ['FEATURE-CLIENT-RESPONSIBLE-FILTER', 'Filter clients by responsible accountant'],
    ['FEATURE-REPORT-ROLE-SPLIT', 'Role-specific reporting access/output'],
    ['FEATURE-DIVA-DVAP-EMPLOYEE', 'DIVA/DVAP generation for employees'],
    ['FEATURE-PASSWORD-RESET-MFA', 'Email password recovery and multi-factor authentication'],
  ];
  for (const [id, feature] of unimplementedFeatures) {
    const source = id.startsWith('FEATURE-') && ['FEATURE-TASK-EDIT', 'FEATURE-TASK-DUE-TIME', 'FEATURE-TEAM-TASK-FILTERS', 'FEATURE-TASK-PAUSE-STAGES', 'FEATURE-SOFT-DELETE', 'FEATURE-CLIENT-RESPONSIBLE-FILTER', 'FEATURE-REPORT-ROLE-SPLIT', 'FEATURE-DIVA-DVAP-EMPLOYEE'].includes(id) ? 'docs/AUDIT-v11.md' : 'docs/AUDIT-v13.md';
    add(id, 'NOT IMPLEMENTED', source, `${feature} is explicitly marked missing in the current audit documentation.`);
  }
  for (const [id, detail] of missingTests) add(id, 'NOT IMPLEMENTED', 'tests/e2e/', `${detail}: no staging fixtures and cleanup harness exist.`);

  const baseUrl = process.env.CRM_BASE_URL || '';
  let origin = '';
  try { origin = new URL(baseUrl).origin; } catch {}
  const safeStaging = process.env.CRM_AUDIT_TARGET === 'staging'
    && origin
    && origin === process.env.CRM_AUDIT_ALLOWED_ORIGIN
    && process.env.CRM_AUDIT_CONFIRM_STAGING === 'I_CONFIRM_STAGING'
    && process.env.CRM_ADMIN_EMAIL && process.env.CRM_ADMIN_PASSWORD
    && process.env.CRM_ACCOUNTANT_EMAIL && process.env.CRM_ACCOUNTANT_PASSWORD;
  if (!safeStaging) {
    add('E2E-ROLE-SMOKE', 'NOT VERIFIED', 'tests/e2e/crm-stress.spec.js',
      'Business-data read-only smoke not run; login writes an authentication audit event. Requires CRM_AUDIT_TARGET=staging, exact origin allowlist, CRM_AUDIT_CONFIRM_STAGING=I_CONFIRM_STAGING, and admin/accountant credentials from environment.');
  } else {
    for (const [role, email, password] of [
      ['admin', process.env.CRM_ADMIN_EMAIL, process.env.CRM_ADMIN_PASSWORD],
      ['accountant', process.env.CRM_ACCOUNTANT_EMAIL, process.env.CRM_ACCOUNTANT_PASSWORD],
    ]) {
      const result = command('npx', ['--no-install', 'playwright', 'test', 'tests/e2e/crm-stress.spec.js', '--reporter=line'], 240_000, {
        ...process.env, CRM_AUDIT_ROLE: role,
        ...(role === 'admin' ? { CRM_ADMIN_EMAIL: email, CRM_ADMIN_PASSWORD: password } : { CRM_ACCOUNTANT_EMAIL: email, CRM_ACCOUNTANT_PASSWORD: password }),
      });
      add(`E2E-ROLE-SMOKE:${role}`, result.code === 0 ? 'PASS' : result.timedOut ? 'NOT VERIFIED' : 'FAIL',
        `staging origin ${origin}`, result.error || (result.stdout + result.stderr).slice(-5000));
    }
  }

  add('INLINE-SYNTAX-SUMMARY', syntaxFailed ? 'FAIL' : 'PASS', 'node --check + vm.Script',
    `${jsFiles.length} JS/MJS files and ${inv.inlineScripts.length} inline script blocks checked.`);

  const report = {
    generatedAt: new Date().toISOString(),
    target: safeStaging ? `staging:${origin}` : 'local only; no staging target configured',
    runtime: process.version,
    inventory: inv,
    checks,
    summary: countSummary(),
    prioritySummary: Object.fromEntries(['P0', 'P1', 'P2', 'P3'].map((priority) => [priority, checks.filter((check) => check.priority === priority).length])),
  };
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `audit-full-${stamp}.json`);
  const markdownPath = join(outDir, `audit-full-${stamp}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(markdownPath, makeMarkdown(report) + '\n');
  console.log(`Report: ${relative(root, markdownPath)}`);
  console.log(`Inventory/data: ${relative(root, jsonPath)}`);
  console.log(`Counts: ${JSON.stringify(report.summary)}`);
  process.exitCode = report.summary.FAIL ? 1 : 0;
  console.log(`Audit exit code: ${process.exitCode}`);
}

main();
