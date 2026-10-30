export class ApiError extends Error {
  constructor(status, body) { super((body && body.message) || 'Veprimi nuk u krye.'); this.status = status; this.code = (body && body.error) || 'error'; this.details = body || {}; }
}
let onUnauthenticated = () => {};
export const setUnauthenticatedHandler = (fn) => { onUnauthenticated = fn; };

export async function api(method, path, body) {
  const response = await fetch('/api/v2' + path, {
    method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'crm' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null; try { json = await response.json(); } catch { json = null; }
  if (response.status === 401) { onUnauthenticated(); throw new ApiError(401, json || { message: 'Sesioni ka skaduar.' }); }
  if (!response.ok) throw new ApiError(response.status, json);
  return json;
}
export const get = (p) => api('GET', p);
export const post = (p, b = {}) => api('POST', p, b);
export const patch = (p, b) => api('PATCH', p, b);
export const put = (p, b) => api('PUT', p, b);
export const del = (p) => api('DELETE', p);
