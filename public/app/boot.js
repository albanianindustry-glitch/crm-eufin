import { start } from './main.js';
start().catch((e) => { document.getElementById('app').innerHTML = '<div style="padding:40px;font-family:sans-serif"><h2>Nuk u ngarkua aplikacioni</h2><p>' + String(e.message || e).replace(/</g, '&lt;') + '</p><p><a href="/login.html">Hyr</a></p></div>'; });
