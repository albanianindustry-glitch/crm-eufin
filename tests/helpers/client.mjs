export class Client {
  constructor(base, ip = '10.0.0.1') { this.base = base; this.cookie = ''; this.ip = ip; }
  async call(method, url, body, headers = {}) {
    const h = { 'Content-Type': 'application/json', 'X-Requested-With': 'crm', 'x-forwarded-for': this.ip, ...headers };
    if (this.cookie) h.cookie = this.cookie;
    const response = await fetch(this.base + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';')[0];
    const text = await response.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: response.status, json };
  }
  async login(email, password) { return this.call('POST', '/api/login', { email, password }); }
  async boot() { return (await this.call('GET', '/api/bootstrap')).json; }
  async put(key, value, version, extra = {}) { return this.call('PUT', '/api/store', { key, value: typeof value === 'string' ? value : JSON.stringify(value), version, ...extra }); }
  async version(key) { const b = await this.boot(); return b.data[key] ? b.data[key].version : 0; }
  async listRaw(key) { return this.boot(); }
  async list(key) { const b = await this.boot(); return b.data[key] ? JSON.parse(b.data[key].value) : []; }
}
