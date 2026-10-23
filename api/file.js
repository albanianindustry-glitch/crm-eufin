import { randomUUID } from 'node:crypto';
import { sql, ensure, me, audit, wrap } from './_lib.js';

export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export function validatePdfDataUri(value) {
  const match = String(value || '').match(/^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return { ok: false, status: 400, error: 'Pranohen vetëm PDF.' };

  const bytes = Buffer.from(match[1], 'base64');
  if (bytes.length > MAX_PDF_BYTES) return { ok: false, status: 413, error: 'PDF-ja është shumë e madhe (maksimumi 3 MB).' };
  const header = bytes.subarray(0, 1024).indexOf(Buffer.from('%PDF-'));
  if (bytes.toString('base64').replace(/=+$/, '') !== match[1].replace(/=+$/, '')
    || header < 0
    || bytes.lastIndexOf(Buffer.from('%%EOF')) < Math.max(5, bytes.length - 1024)) {
    return { ok: false, status: 400, error: 'Skedari nuk është PDF i vlefshëm.' };
  }

  return { ok: true, data: match[1], size: bytes.length };
}

export default wrap(async (req, res) => {
  await ensure();
  const u = await me(req);
  if (!u) return res.status(401).json({});
  if (req.method === 'POST') {
    const d = String((req.body || {}).data || '');
    const pdf = validatePdfDataUri(d);
    if (!pdf.ok) return res.status(pdf.status).json({ error: pdf.error });
    const id = randomUUID();
    await sql`INSERT INTO files(id, name, data, size, created_by) VALUES(${id}, ${String((req.body || {}).name || '').slice(0, 200)}, ${pdf.data}, ${pdf.size}, ${u.email})`;
    await audit(u.email, 'file-upload', id);
    return res.json({ url: '/api/file?id=' + id });
  }
  if (req.method === 'GET') {
    const r = await sql`SELECT data FROM files WHERE id = ${String(req.query.id || '')}`;
    if (!r.length) return res.status(404).end();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(Buffer.from(r[0].data, 'base64'));
  }
  res.status(405).end();
});
