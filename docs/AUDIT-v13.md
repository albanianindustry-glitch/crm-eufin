# Auditim i CRM-së – gjendja pas v13 (18.10.2026)

Klasifikimi: **F** funksionon · **FP** funksionon pjesërisht · **NI** nuk është implementuar · **NV** nuk është verifikuar. Çdo F/FP është provuar me teste njësie mbi kodin e vërtetë (75 teste); verifikimi me llogari reale mbetet për ty.

## Politikat e vendosura nga ti (zbatuara)
- Të gjithë përdoruesit i shohin të gjitha detyrat (Detyrat e ekipit). Veprimet kufizohen: statusi = përgjegjësi; përcaktimi/fshirja = krijuesi; admini gjithçka (server).
- Asgjë nuk ndryshon pa miratimin e administratorit: **klientët ekzistues** dhe **kontratat ekzistuese** (modifikim/fshirje). Klientët dhe kontratat e reja krijohen direkt. Ndryshimi kthehet në kërkesë; vetëm admini miraton/refuzon (Administrim → Kërkesa për miratim).
- Detyra me klient i caktohet vetëm përgjegjësit të klientit ose administratorit (server).
- "Librat e blerjeve dhe shitjeve" për të gjithë subjektet (përveç përfaqësuesit tatimor: vetëm TVSH). Deklarimi TVSH: pa ndryshim.

## Raporti i 18.10.2026
| Pika | Gjendja | Ndryshimi | Pas v13 |
|---|---|---|---|
| D-01 NIPT i dyfishtë | Pa kontroll | Serveri refuzon NIPT-in e ri që përsëritet (pa hapësira/shkronja të vogla); dublikatet e vjetra nuk bllokojnë ruajtjen. Pa paralajmërim në formular | **FP** |
| D-02 Njoftim "xhiro" për telefon | Krahasimi i vlerave `''`, `0`, `'0'` i trajtonte si ndryshim; telefoni/email/administratori s'ishin të vëzhguar | Vlera bosh/0 njësohen; shtuar numri i kontaktit, email-i, administratori, emri, NIPT. (Shkaku nxirret nga kodi, nuk u riprodhua live) | **F** |
| D-03 Historiku | Vetëm tabela `audit` e fshehur; "Historia" e klientit bosh | Administrim → **Auditimi** me filtra (tekst, përdorues, veprim, datë). Çdo ndryshim klienti regjistrohet me fushë, vlerë të vjetër → të re; kërkesat dhe vendimet gjithashtu. Historiku në kartelë tregon vetëm kontrata/detyra | **FP** |
| D-04 Statusi i shërbimeve | Detyra e lidhur e fshehur për përdoruesin tjetër | Statusi kopjohet te shërbimi; të gjithë shohin të gjitha detyrat | **FP** (rivërteto live) |
| D-05 Profili fiskal | Opsionet mbeteshin të zgjedhshme | Për përfaqësuesin tatimor opsionet çaktivizohen me shpjegim. Formularët PF/SHPK: pret vendim biznesi | **FP** |
| D-06 Dokumente të përsëritura | Pa kontroll | – | **NI** |
| D-07 Kufiri PDF te Kontrata | Skedari >3 MB injorohej heshturazi | Alarm dhe ndalim përpara ruajtjes (3 MB, njësoj si Dokumentet; serveri e kontrollon) | **FP** |
| D-08 Miratime të gabuara | Njoftimi "aprovo" shkonte te përgjegjësit edhe për veprimet e adminit | Veprimet e adminit njoftojnë vetëm informues; "E aprovova/Kthe si detyrë" vetëm për adminin; modifikimet e jo-adminit janë kërkesa; njoftimi nuk zhduket kur hap klientin | **F** |
| F-01 Klienti te detyra | Mungonte | Fushë klienti (opsionale) te "Cakto detyrë"; kolegët kufizohen te përgjegjësit e klientit. Forma e adminit dhe e shërbimeve: vetëm kontrolli në server | **FP** |
| F-02 Një/dy përgjegjës | Pa tregues te tabela e ekipit | – | **NI** (te "Detyrat e mia" shfaqen) |
| F-03 Raport ditor | Nuk ekziston | – | **NI** |
| F-04 Vonesat | Nuk ruheshin | Ruhet `late` (në afat/me vonesë) në mbyllje. Raportet: jo | **FP** |
| F-05 Sinkronizimi | – | Të gjithë shohin detyrat; statuset te shërbimet | **FP** |
| F-06 Dokumente: fshi/zëvendëso | Nuk ekziston | – | **NI** |
| F-07 Redaktim bashkëpunues i dokumenteve | Nuk ekziston | Vetëm analizë (shih përgjigjen) | **NI** |
| §5 Kontratë↔dokument | – | Ri-ngarkimi i kontratës së rinovuar te Modifiko; arkivimi/zëvendësimi lë gjurmë | **FP** |
| F-08 Gjenerimi mujor | – | – | **NV** |
| F-09 Librat PF pa TVSH | Mungonin | Librat për të gjithë subjektet | **F** |
| F-10 Eufin Consult dy herë | Nuk u riprodhua | Shumë e mundshme: dublikat nga testi D-01. Kontrollo te Klientët dhe fshij/bashko të dytin | **NV** |
| §7 Ridizenjimi i dosjes | – | Pas stabilizimit të logjikës (sipas planit tënd) | **NI** |
