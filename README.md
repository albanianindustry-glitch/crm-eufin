# CRM Studio Kontabiliteti – aplikacion për Vercel

Aplikacion me hyrje me llogari, të dhëna të përbashkëta për ekipin, role (administrator / kontabilist), PDF në server, fjalëkalime klientësh të enkriptuara, regjistër veprimesh dhe kopje rezervë. Faqja kryesore (`public/index.html`) është CRM-ja; `public/shim.js` e lidh me serverin.

## 0. Diagnostikim i gabimit 500
Hap `/api/health`: tregon cilat variabla mungojnë (`DATABASE_URL`, `AUTH_SECRET`, `DATA_KEY`) dhe nëse lidhja me bazën punon. Pas çdo ndryshimi të variablave bëj **Redeploy**.

## Plani Hobby i Vercel
Projekti përshtatet me Hobby: 10 funksione serverless (kufiri është 12; `login`, `logout`, `whoami` dhe `password` janë bashkuar te `api/auth.js`, URL-të mbeten të njëjta me rewrites te `vercel.json`) dhe një cron ditor (`/api/cron-daily`, Hobby lejon vetëm një herë në ditë; ekzekutimi mund të vonohet brenda orës 06:00). Mos shto funksione të reja te `api/`; shtoji si veprim brenda një skedari ekzistues. Hobby nuk lejohet për përdorim komercial sipas kushteve të Vercel; për studio reale kalo në Pro.

## 1. Variablat e mjedisit
Shih `.env.example`. Gjenero vlerat:
- `AUTH_SECRET`: `openssl rand -base64 48`
- `DATA_KEY`: `openssl rand -base64 32` (saktësisht 32 bajt). **Ruaje edhe jashtë Vercel (menaxher fjalëkalimesh).** Pa të, fjalëkalimet e ruajtura të klientëve nuk dekriptohen.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: vetëm për hyrjen e parë.

## 2. Vendosja në Vercel
1. Ngarko dosjen në një depo private në GitHub.
2. Vercel -> **Add New -> Project**, zgjidh depon, preset **Other** (pa komandë ndërtimi).
3. Te projekti: **Storage -> Neon (Postgres)** dhe lidhe; kjo vendos `DATABASE_URL`.
4. Shto `AUTH_SECRET`, `DATA_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` te **Environment Variables**, pastaj **Redeploy**.
5. Hap faqen dhe hyr. Tabelat krijohen vetë. Te **Përdoruesit** (lart djathtas) shto kolegët me email dhe fjalëkalim fillestar (min. 10 karaktere).
6. Ndrysho fjalëkalimin e administratorit (Përdoruesit -> Fjalëkalim i ri), pastaj hiq `ADMIN_PASSWORD` nga variablat.
7. Lidh një domen të studios (Vercel -> Domains), p.sh. `crm.studioja.al`.

## 3. Lista e kontrollit para përdorimit real
- [ ] `npm test` kalon (teste për enkriptimin, fjalëkalimet dhe bashkimin e ndryshimeve).
- [ ] Depoja është **private** dhe `.env` nuk është ngarkuar.
- [ ] `DATA_KEY` është ruajtur edhe jashtë Vercel.
- [ ] U provua hyrja me dy llogari: administrator dhe kontabilist. Kontabilisti nuk duhet të shohë fjalëkalimet e klientëve.
- [ ] U provua ruajtja nga dy shfletues njëkohësisht: dy ndryshime në klientë të ndryshëm duhet të ruhen të dyja; në të njëjtën fushë regjistrohet "save-merge".
- [ ] U ngarkua një PDF dhe u hap pas daljes/hyrjes.
- [ ] Neon: aktivizo kopjen rezervë/rikthimin në çast (Point-in-Time Restore) sipas planit që ke, dhe provo një rikthim.
- [ ] Monitorim: një shërbim (p.sh. UptimeRobot) që kontrollon `https://domeni-yt/api/health`.
- [ ] Vendos një ditë çdo javë për **Kopje rezervë** (lart djathtas, vetëm administrator) dhe ruaje skedarin jashtë sistemit.
- [ ] Konsulto një jurist për detyrimet e mbrojtjes së të dhënave personale të klientëve (ID, dokumente, kredenciale).

## 4. Çfarë mbulon siguria
- Fjalëkalimet e përdoruesve: bcrypt. Sesion: cookie HttpOnly, Secure, SameSite=Lax, 7 ditë; ndryshimi i fjalëkalimit e mbyll sesionin e vjetër.
- Kufizim përpjekjesh hyrjeje (8 në 15 minuta sipas email-it dhe IP-së).
- Mbrojtje CSRF: çdo kërkesë që ndryshon të dhëna kërkon kokën `X-Requested-With`.
- Fjalëkalimet e e-Albania, e-Filing, programit fiskal dhe certifikatës: enkriptim AES-256-GCM me `DATA_KEY` para se të ruhen; vetëm administratori i sheh.
- Ruajtje me version dhe **bashkim automatik**: nëse dy kolegë ndryshojnë njëkohësisht, sistemi bashkon ndryshimet për rekord dhe për fushë (p.sh. njëri ndryshon tarifën e një klienti, tjetri statusin e një tjetri: të dyja ruhen). Nëse ndryshojnë të njëjtën fushë, fiton ai që ruan i fundit dhe regjistrohet "save-merge" te regjistri.
- Kokat e sigurisë (CSP, HSTS, X-Frame-Options etj.) te `vercel.json`.
- Regjistri i veprimeve (hyrje, ruajtje, ngarkime, ndryshime përdoruesish) dhe faqja e tij për administratorin.

## 5. Kufizime të njohura (faza 2)
- **Modeli i të dhënave:** klientët, detyrat, kontratat etj. ruhen si dokumente JSON me version (tabela `kv`), jo si tabela relacionale. Nuk ka kërkim në bazë, leje për klient të veçantë, as bashkim automatik të ndryshimeve të njëkohshme. Për ekip të vogël funksionon; për rritje duhet migrimi në tabela relacionale me API për çdo rekord (rekomandohet Next.js + TypeScript + Prisma/Drizzle).
- Bashkimi rregullon konfliktet për rekord/fushë, por lista pa "id" brenda një rekordi (p.sh. ortakët, dokumentet e një klienti) nuk bashkohet; atje fiton ruajtja e fundit. Pas çdo bashkimi faqja rifreskohet.
- Nuk ka rikthim fjalëkalimi me email (administratori e ndryshon) dhe nuk ka autentikim me dy faktorë.
- PDF-të janë maksimumi rreth 3 MB (kufiri i kërkesës në Vercel) dhe ruhen në bazën e të dhënave; për shumë skedarë përdor Vercel Blob ose S3.
- Email-et nuk dërgohen nga aplikacioni.
- Nuk ka teste automatike për ndërfaqen (vetëm për enkriptimin); testet e plota duhen shtuar para rritjes së ekipit.
- Eksporti nuk përfshin PDF-të dhe as fjalëkalimet e klientëve.
