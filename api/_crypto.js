// Funksione të pastra (pa bazë të dhënash): enkriptimi i fjalëkalimeve të klientëve dhe mbrojtja e tyre sipas rolit.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const SECRET_FIELDS = ['passwordEAlbania', 'passwordEFiling', 'passwordProgramiFiskal', 'passwordCertifikata'];

const key = () => {
  const k = Buffer.from(process.env.DATA_KEY || '', 'base64');
  if (k.length !== 32) throw new Error('DATA_KEY duhet të jetë 32 bajt në base64 (openssl rand -base64 32).');
  return k;
};

export function encField(v) {
  if (!v || String(v).startsWith('enc:')) return v;
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(String(v), 'utf8'), c.final()]);
  return 'enc:' + [iv, c.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}

export function decField(v) {
  if (!v || !String(v).startsWith('enc:')) return v;
  const [iv, tag, ct] = v.slice(4).split('.').map((s) => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

function mapClients(json, fn) {
  const a = JSON.parse(json);
  a.forEach((c) => SECRET_FIELDS.forEach((f) => { if (f in c) c[f] = fn(c[f]); }));
  return JSON.stringify(a);
}
export const encClients = (j) => mapClients(j, encField);
export const decClients = (j) => mapClients(j, decField);
export const blankClients = (j) => mapClients(j, () => '');

// Kontabilisti nuk i sheh fjalëkalimet; kur ruan, mbeten ato të ruajturat (të enkriptuara).
export function keepSecrets(newJson, oldJson) {
  const n = JSON.parse(newJson), o = JSON.parse(oldJson || '[]');
  n.forEach((c) => {
    const p = o.find((x) => x.id === c.id);
    if (p) SECRET_FIELDS.forEach((f) => { c[f] = p[f] || ''; });
  });
  return JSON.stringify(n);
}
