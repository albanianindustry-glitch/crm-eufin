// Ngarkimi i PDF-ve (dokumente provë): kthen { url, name } që ruhet te klienti/detyra.
export const MAX_BYTES = 3 * 1024 * 1024;   // kufiri i serverit: ~4.4M karaktere base64
export function readDataUrl(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Skedari nuk u lexua.')); r.readAsDataURL(file); }); }
export function checkPdf(file) {
  if (!file) throw new Error('Zgjidh një skedar PDF.');
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new Error('Lejohen vetëm skedarë PDF.');
  if (file.size > MAX_BYTES) throw new Error('Skedari është shumë i madh (maksimumi 3 MB).');
}
export async function uploadPdf(file) {
  checkPdf(file);
  const response = await fetch('/api/file', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' }, body: JSON.stringify({ data: await readDataUrl(file), name: file.name }) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Ngarkimi i dokumentit dështoi.');
  return { url: json.url, name: file.name };
}
