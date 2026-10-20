# Auditim i CRM-së – gjendja pas v11 (16.10.2026)

Klasifikimi: **F** = funksionon · **FP** = funksionon pjesërisht · **N** = nuk funksionon · **NI** = nuk është implementuar · **NV** = nuk është verifikuar.
Çdo "FP/F" pas v11 është provuar me teste njësie mbi kodin e vërtetë; verifikimi me llogari reale (admin + përdorues i zakonshëm) mbetet për ty.

| # | Problemi (nga raporti) | Shkaku i verifikuar në kod | Ndryshimi në v11 | Pas v11 |
|---|---|---|---|---|
| 2.1 | Përdoruesi i zakonshëm bën Fillo/Kryer/Fshi në detyrat e kolegëve | Asnjë kontroll as në ndërfaqe as në API (`xMt`, `xMtDel`) | `api/_perm.js` + kontroll në `api/store.js` (403, ndryshimi anulohet te përdoruesi); butonat fshihen sipas `xCan`. Rregullat: statusi = përgjegjësi; përcaktimi/fshirja = krijuesi; admini gjithçka | **FP** (vetëm detyrat, shërbimet, historiku) |
| 2.2 | Admini sheh 13 detyra, Laura 5 | Nuk është defekt: `scopeX` i jep jo-adminit vetëm detyrat ku është përgjegjës ose krijues | Politika u dokumentua; s'u ndryshua | **F** sipas politikës (kërkon konfirmimin tënd) |
| 2.3 | Filtri "Shiko detyrat e" | Nuk u prek | – | **NV** |
| 2.4 | Modifiko detyrën | Nuk ekziston | – | **NI** |
| 2.5 | Ora e afatit | Nuk ekziston | – | **NI** |
| 2.6 | Filtrat te Detyrat e ekipit | Nuk ekzistojnë | – | **NI** |
| 2.7 | Faza, pezullim/rifillim i kohës | Nuk ekziston | – | **NI** |
| 2.8 | Fshirja dhe historiku i detyrave | Fshirje e plotë pa gjurmë | Kufizim sipas rolit; çdo fshirje (detyrë, shërbim, kontratë) shkon te Regjistri i veprimeve; detyra e fshirë e lidhur me klient shkon te historiku i klientit. Pa "fshirje të butë" | **FP** |
| 2.9 | Tekst afati "ditë pushimi" | Nuk u gjet tekst statik me këtë përmbajtje në kod | – | **NV** (duhet një pamje ose shembull) |
| 3.1 | Statusi i shërbimit ndryshon sipas përdoruesit | Statusi lexohej nga detyra e lidhur, që është e fshehur nga `scopeX` për përdoruesin tjetër, kështu ai shihte statusin e vjetër të shërbimit | Statusi kopjohet te shërbimi sa herë ndryshon detyra; admini njehson statuset e vjetra gjatë hapjes; butonat vetëm për përgjegjësin/krijuesin | **FP** (testuar njësi; provo Enejd/Laura) |
| 3.2 | Faturimi i shërbimeve | Në rregull | – | **F** |
| 4 | Kontratë–Dokument | Kontrata s'kishte lidhje me PDF-në (vetëm emër); fshirja linte dokument të vetmuar; s'kishte modifikim | `id` i përbashkët kontratë↔dokument; buton "📎 PDF"; "Modifiko"; fshirja pyet: arkivo PDF-në ose fshije; gjurmë në historik | **FP** (kontratat e vjetra mbeten pa lidhje; modifikimi përmes dritareve të thjeshta) |
| 5.1 | Dokumentet e ngarkuara në kartelë | Kartela tregonte vetëm ato që mungojnë | Seksioni "Dokumente të ngarkuara" (me hapje; të arkivuarat shënohen) | **FP** (nuk listohen ID-ja e administratorit dhe dokumentet e ortakëve) |
| 5.2 | Kërkesë ndryshimi për përgjegjësin/të dhëna të ndjeshme | Përdoruesi i zakonshëm i ndryshon direkt; njoftimi (Aprovo/Kthe) vjen pas faktit | – | **NI** (kërkon vendim: cilat fusha janë të ndjeshme) |
| 5.3 | Fshirja e klientëve | API e bllokon jo-adminin (v10) | – | **FP** (kontrolli i lidhjeve para fshirjes **NV**) |
| 5.4 | Filtri sipas përgjegjësit | Nuk ekziston | – | **NI** |
| 5.5 | Historiku në kartelë | Nuk ekzistonte | `X.hist`: kontrata (shtim/ndryshim/fshirje), detyra të fshira; vetëm-shtim i imponuar në server. Ndryshimet e fushave te klienti ende vetëm në Regjistrin e admin | **FP** |
| 6 | Referuesit për përdoruesin e zakonshëm | Në kod `X.ref` nuk filtrohet sipas rolit; s'u riprodhua | Lista rifreskohet sa herë hapet zgjedhësi | **NV** |
| 7 | Rolet dhe API | Kontrolle vetëm për klientët (fshirje, fjalëkalime) | Shtuar detyrat, shërbimet, historiku. Mbeten pa kufizim: faturimi, kontratat, aplikimet, TVSH | **FP** |
| 8 | Raportet dhe formulat | Nuk u prekën | – | **NV** (ndarja e raporteve sipas rolit **NI**) |
| 9.1 | Detyrime para aktivizimit | v10 filtron periudhat para datës më të vonë mes kontratës dhe regjistrimit | – | **FP** (provo Antonio Pirozzi PF) |
| 9.2 | "Librat" për PF pa TVSH me punonjës | Zbatohen vetëm për klientë me TVSH | – | **NV** – nevojitet rregulli i saktë |
| 9.3 | Detyrim i personalizuar jo për të gjithë | Nuk u riprodhua | – | **NV** (duhen emrat e klientëve që mungonin) |
| 9.4 | DIVA/DVAP për punonjësit | Nuk ekziston | – | **NI** |
| 10 | Deklarimi TVSH, Chat | Pa vendim / në zhvillim | – | pa ndryshim |

**Para deploy-it:** bëj kopje rezervë nga Klientët → "Eksport, import dhe kopje rezervë". Ndryshimet e v11 shtojnë fusha (`id`, `doc`, `hist`, `st` te shërbimet), nuk fshijnë të dhëna.
