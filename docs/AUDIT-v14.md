# Auditim v14 – gjetje, rregullime dhe provat

Metoda: leximi i kodit + ekzekutim i API-së reale mbi Postgres në memorie (PGlite) + ngarkim i `index.html` të plotë në jsdom (administrator dhe kontabilist). Testet njësi ekzistuese kalonin edhe me këto gabime, sepse e ekzekutonin kodin në sandbox ku funksionet që mungonin jepeshin si global.

## Gabime të gjetura dhe të rregulluara

| # | Rëndësia | Gjetja | Rregullimi |
|---|----------|--------|------------|
| 1 | Kritike | Miratimi i kërkesave dhe konvertimi i aplikimit dështonin gjithmonë (409): `CASE WHEN … ELSE 1 / 0` vlerësohet nga planifikuesi i PostgreSQL edhe kur kushti është i vërtetë | `ELSE 1 / (SELECT 0)` te `api/store.js` (2 vende) |
| 2 | Kritike | Kontabilisti fshinte klientë (një ose të gjithë) dhe boshatiste deklarimet TVSH | 403 për jo-admin; `forbiddenRemovals` për TVSH, ndryshime, aplikime të aprovuara |
| 3 | Kritike | Faturimi: "Gjenero" hidhte `act is not defined` (`act`/`stM` jashtë fushëveprimit) | `act`, `stM` te `XAPI`; `billing.js` përdor `A.act()`/`A.stM()` |
| 4 | Kritike | Kontratat: `ADMIN` i papërcaktuar (fshirje/ndryshim hidhte gabim) | `const ADMIN` te `index.html` |
| 5 | Kritike | Detyrat e përsëritura: mbyllja hidhte `nextTitle is not defined` | `nextTitle` te `XAPI` |
| 6 | Lartë | Kërkesa të rreme miratimi në çdo ruajtje nga kontabilisti (default `statusTVSH`/`statusTatimFitim`), klienti i ri humbte me 409 të gabuar | Ruajtje vetëm kur plotësohet diçka; serveri nuk i numëron default-et si ndryshim; kërkesat identike pa dublikatë; ruajtje e përzier (ndryshim + klient i ri) funksionon; klienti i konvertuar merr default-et |
| 7 | Lartë | XSS i ruajtur në emra klientësh, emra detyrimesh etj.; `htmlJsArg` i papërcaktuar; CSV me formula/thonjëza | `escapeHtmlValue` kudo, `htmlJsArg`, `csvCell`; test dinamik me HTML në çdo fushë |
| 8 | Lartë | Fshirja e klientit bllokohej për çdo klient me njoftim caktimi dhe jepte 500 me një njoftim me lidhje të prishur | Njoftimet nuk numërohen si referencë; lidhja e njoftimit ruhet gjithmonë si JSON i vlefshëm |
| 9 | Mesme | Miratimi dështonte kur rreshti `crmX` s'ekzistonte; krahasim i enkriptuar me të dekriptuar | Krahasim i saktë, kontroll vetëm kur ka ndryshim |
| 10 | Mesme | Gabim `xCan is not defined` në çdo ngarkim | Rendi fillestar shtyhet pas `DOMContentLoaded` |
| 11 | Mesme | `typeof re` gjithmonë `undefined` (alerts/approvals nuk rifreskonin pamjen) | Përdoret `window.XAPI.re` |
| 12 | Mesme | `addM`: 31.01 + 1 muaj = 03.03 | Kufizim në ditën e fundit të muajit |
| 13 | Mesme | Festat: `10-19` e vjetruar, mungonin 05.09, 22.11, Pashkët, Bajramet; festa e fundjavës s'zhvendosej | Kalendar sipas Bankës së Shqipërisë 2026 (të gjitha ditët e mbyllura përputhen) |
| 14 | Mesme | Njoftime pa dërgues (imitim i administratorit) | Teksti nis gjithmonë me emrin e dërguesit |
| 15 | Mesme | Admini dëbohej kur ndryshonte fjalëkalimin e vet nga paneli | Cookie e re për veten |
| 16 | Mesme | Bllokim hyrjeje: një zyrë pas një IP-je bllokohej nga 8 gabime; llogaria e adminit bllokohej nga jashtë | 8 gabime për çiftin email+IP, tavane 40 për email/IP; krahasim bcrypt gjithmonë |
| 17 | Mesme | Auditimi filtronte vetëm 3000 rreshtat e fundit | Filtrim në SQL |
| 18 | Mesme | ID të dyfishta klientësh anashkalonin NIPT-in unik | 400 për ID të munguara/të dyfishta |
| 19 | Mesme | Të dhënat e klientëve (me fjalëkalime të dekriptuara për adminin) mbeteshin në shfletues pas daljes; humbje e ndryshimeve në mbyllje skede | Pastrim në dalje/401/faqen e hyrjes; paralajmërim `beforeunload`; dalja ruan ndryshimet në pritje |
| 20 | Ulët | Mungonte `.env.example`; `CRON_SECRET` i padokumentuar; README 10 vs 11 funksione | Shtuar/korrigjuar |

## Teste
- `npm test`: 99 teste njësi (billing dhe approvals-ui korrigjuar që të mos fshehin gabime).
- `npm run test:integration`: 16 teste API mbi Postgres të vërtetë (PGlite) + 7 teste ndërfaqeje në jsdom.

## Çfarë mbetet e hapur (e ndershme)
- **Nuk është provuar mbi Neon të vërtetë dhe shfletues të vërtetë.** Para vendosjes: ekzekuto `npm run test:all`, bëj deploy në një mjedis provë, kontrollo një miratim, një konvertim aplikimi dhe një faturim, vetëm pastaj në prodhim. Transaksionet (`sql.transaction`) janë provuar me shtresën PGlite, jo me drajverin HTTP të Neon.
- Bajramet për 2027+ nuk janë të përfshira (data lunare); shtoji te `ISL` çdo vit.
- Rregullat tatimore (afate 6/12/14/20, kufij xhiroje, tatime) nuk verifikohen nga kodi; kërkojnë ekspert tatimor. Zhvendosja e afatit në ditën e punës **para** festës është zgjedhje e dokumentuar e projektit; konfirmoje me ligjin.
- `shell.js`, `ux.js`, `clientform.js`, `chat.js` u shqyrtuan më pak thellë se pjesa tjetër; skedarët PDF të papërdorur nuk pastrohen automatikisht; chat, njoftime dhe auditim rriten pa kufi (të merret parasysh pas disa muajsh).
- Ruajtja në `localStorage` + XHR sinkron në nisje mbetet arkitekturë e projektit (rreziku i bllokimit të faqes me shumë të dhëna).


## v15 – pamja profesionale (kërkuar pas testimit nga përdoruesi)
- **Kërkesat për miratim**: tani tregojnë emrin e fushës dhe vlera të formatuara (p.sh. *Tarifa mujore: 5.000 Lekë → 5.100 Lekë*), emrin e klientit (link te dosja) dhe kërkuesin. Kërkesat e vjetra që janë vetëm plotësim automatik i vlerave default ndahen në një njoftim dhe pastrohen me një klik (`dismiss_auto`, vetëm admin).
- **Dosja e klientit** është faqe e plotë (jo popup): kokë me statuse, KPI (tarifa, pagesa, detyra, kontrata, dokumente), të dhëna kontakti, përgjegjës, ortakë, dhe skeda për Detyra / Kontrata / Dokumente / Historik / Shënime.
- **Detyrat e ekipit** janë tabelë: detyra, klienti, përgjegjës, caktuar nga, afati (me ditët e vonesës), statusi, koha (po zgjat / kohëzgjatja e kryerjes), kryer nga dhe kur; filtra sipas personit, statusit, afatit dhe kërkim; përmbledhje e ngarkesës për çdo anëtar. Detyrat e reja ruajnë kush i caktoi dhe kur; "Fillo" regjistron fillimin për matjen e kohës.
- Teste të reja: `tests/integration/pro.test.js` (5 teste). Nuk u verifikua pamja vizuale në shfletues real (mjedisi i testimit s'ka shfletues).
