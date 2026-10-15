# CRM Studio Kontabiliteti – aplikacion për Vercel

Aplikacion me hyrje me llogari, të dhëna të përbashkëta për ekipin, role (administrator / kontabilist), PDF në server, fjalëkalime klientësh të enkriptuara, regjistër veprimesh dhe kopje rezervë. Faqja kryesore (`public/index.html`) është CRM-ja; `public/shim.js` e lidh me serverin.

## 0. Diagnostikim i gabimit 500
Hap `/api/health`: tregon cilat variabla mungojnë (`DATABASE_URL`, `AUTH_SECRET`, `DATA_KEY`) dhe nëse lidhja me bazën punon. Pas çdo ndryshimi të variablave bëj **Redeploy**.

## Plani Hobby i Vercel
Projekti përshtatet me Hobby: 10 funksione serverless (kufiri është 12; `login`, `logout`, `whoami` dhe `password` janë bashkuar te `api/auth.js`, URL-të mbeten të njëjta me rewrites te `vercel.json`) dhe një cron ditor (`/api/cron-daily`, Hobby lejon vetëm një herë në ditë; ekzekutimi mund të vonohet brenda orës 06:00). Mos shto funksione të reja te `api/`; shtoji si veprim brenda një skedari ekzistues. Kufiri i trupit të kërkesës në Vercel është 4.5 MB (PDF-ja zmadhohet ~33% në base64), prandaj PDF-të lejohen deri në **3 MB** (ngjeshi para ngarkimit). Logjet e funksioneve ruhen vetëm 1 orë në Hobby; përdor Regjistrin e veprimeve dhe `/api/health`. Hobby nuk lejohet për përdorim komercial sipas kushteve të Vercel; për studio reale kalo në Pro.

## Si funksionojnë detyrat standarde
Detyrat standarde **nuk krijohen në ditën 1** dhe nuk ruhen në bazë: llogariten çdo herë kur hapet faqja, nga profili fiskal i çdo klienti (formular klienti -> seksioni "Profili fiskal") dhe nga lista te Detyrat -> Lista e detyrimeve.
- Detyrimet mujore i përkasin muajit të mëparshëm; afati është një ditë e muajit pasardhës: faturat 6, librat 12, TVSH 14, magazina 14, listëpagesa 20, Financë 5 20, tatim qeraje 20 (plus ato që shton vetë). Kur afati bie ditë pushimi/festë, afati efektiv tërhiqet në ditën e punës më parë.
- Një detyrë shfaqet te "Sot" **14 ditë para afatit** (vjetoret 45 ditë para) dhe qëndron deri sa të shënohet "U krye" (maksimumi 60 ditë me vonesë). P.sh. TVSH-ja e shtatorit (afati 14 tetor) shfaqet nga 30 shtatori.
- Detyra nuk gjenerohet nëse klienti nuk e ka atë detyrim (pa TVSH, pa punonjës, i pezulluar, inaktiv). Nëse në formularin e klientit vendos **Data e kontratës**, nuk gjenerohen detyrime me afat para asaj date.

## Përgjegjësit
- **Përgjegjësi kryesor** (formular klienti, seksioni 5) merr gjithçka.
- Poshtë tij listohen vetëm detyrimet që vlejnë për klientin; për secilin mund të zgjedhësh një koleg tjetër (p.sh. TVSH te Beni, listëpagesa te Ana). Ruhet te `fx.resps`; ajo që lihet "Si kryesori" shkon te kryesori.
- Kontabilisti sheh te "Sot" vetëm detyrat ku ai është përgjegjës (sipas deklaratës); administratori i sheh të gjitha ose filtron sipas kolegut.

## Njoftimet
- Çdo njoftim është specifik dhe ka lidhje: **detyrat e ekipit** (caktim, koment, mbyllje) çojnë te detyra te "Detyrat e mia"; **klientët** (klient i ri, caktim/heqje përgjegjësie për një deklaratë, ndryshim i profilit fiskal, tarifës, statusit) çojnë te dosja e klientit; përmbledhja ditore e detyrave standarde (një në ditë, vetëm nëse ke detyra që mbarojnë brenda 3 ditëve) çon te "Sot".
- Nëse një koleg ka ruajtur ndërkohë, klikimi rifreskon vetë faqen dhe pastaj të çon te vendi i duhur. Njoftimi shënohet i lexuar vetëm kur e klikon (ose "Shëno të gjitha").
- Shenja "↻ Të dhëna të reja" në krye shfaqet kur kolegët kanë ruajtur; nuk numërohet si njoftim.
- Njoftimi për detyrat standarde që hyjnë në afat gjenerohet nga shfletuesi kur hapet CRM-ja (serveri nuk i njeh); cron-i ditor e mbulon vetëm detyrat manuale.

## Pamja
Pamja përbëhet nga `public/theme.css` (tema: ngjyra, dendësi, butona, tabela) dhe `public/shell.js` (menu anësore e grupuar sipas punës, kokë me kërkim klienti, njoftime dhe menu përdoruesi, formulari i klientit si panel anësor, listë klientësh me menu veprimesh). Logjika nuk ndryshon: `shell.js` i rilidh elementët ekzistues, ndaj skedat e vjetra janë të fshehura, jo hequr. Nëse del ndonjë gabim pamjeje, hiq dy rreshtat `theme.css` dhe `shell.js` nga `index.html` për të rikthyer pamjen e vjetër.

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

## Detyra mes kolegëve, koha automatike, xhiro (përditësim)
- Detyrë me 1–2 përgjegjës (`us`), cilido e mbyll; "Cakto detyrë një kolegu" te Detyrat e mia.
- Koha llogaritet vetë nga caktimi te mbyllja (`at` → `doneTs`, `mins`); rihapja e ruan kohën e mëparshme.
- Detyrat e përsëritura mujore marrin emrin e muajit pasardhës ("Kontribute Gusht" → "Kontribute Shtator"; Dhjetor → Janar + viti).
- Xhiroja: kur arrin 85% të kufirit të radhës (kufijtë e tabelës së tatim-taksave vendore; `X.set.xhPct` e ndryshon përqindjen), shfaqet çdo 3 ditë te "Sot" me fushë për ta përditësuar; kur përditësimi tregon se kaloi një kufi, del "U rivlerësua".

## Shërbime të veçanta, referues, datat e detyrimeve (përditësim)
- `public/services.js`: tabet "Shërbime të veçanta" (proces me faturim/tarifë, kohë automatike) dhe "Referuesit"; eksport TVSH me një rresht për muaj (CSV, UTF-8, ndarës `;`) me TVSH kreditore e bartur në kolonën e fundit.
- Forma juridike "Përfaqësues tatimor"; fushat "Nënshtetësia e administratorit/përfaqësuesit" dhe "Referuar nga".
- Detyrimet nuk gjenerohen për periudha para aktivizimit (data më e vonë mes dataKontrate dhe regjistrimit).
- Pagesa e parë e studios: cikli nga aktivizimi deri një muaj më pas; opsion "U mor paraprakisht" (te konvertimi i NIPT-it ose te detyra).
- Detyrim i ri mujor: emri pastrohet nga muaji/viti, `from` = periudha e parë; hapet më 1 të muajit pasues.

## Përfaqësues tatimor, kontrata sipas llojit, shërbime të lidhura me detyrat
- Forma "Përfaqësues tatimor": i vetmi detyrim fiskal është TVSH (të gjitha të tjerat çaktivizohen në `ok()`, yearly dhe xhiro).
- Kontratat: lloji "Përfaqësim tatimor" (shoqëri e huaj, shteti, nr. regjistrimi), vlera e shërbimit; fushat shfaqen sipas llojit.
- Çdo shërbim i veçantë krijon detyrë të lidhur (`sid`/`tid`): njoftim, "Detyrat e mia", kohë automatike.
- Nënshtetësia për çdo ortak (te lista e ortakëve).
- `tests/rules.test.js` provon kodin e vërtetë të index.html dhe services.js.

## Njoftime, aprovim dhe sinkronizim i drejtpërdrejtë (v8)
- `public/alerts.js`: kartat poshtë djathtas rrinë derisa t'i mbyllësh (Hape / E kuptova / U krye); njoftim në desktop (Notification API, kërkon leje; punon ndërsa skeda e CRM-së është e hapur).
- Ndryshimi i një klienti njofton përgjegjësit + administratorët me "E aprovova" ose "Kthe si detyrë" (krijon detyrë për autorin). Veprim i ri në `/api/notifications`: `{say:{name,text,link}}`.
- Të dhënat e kolegëve hyjnë pa rifreskim (`xLiveSync` në `shim.js`) kur nuk ke formular të hapur ose ruajtje në pritje.
