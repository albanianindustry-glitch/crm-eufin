# Arkitektura e re (v16) dhe plani i rindërtimit modul pas moduli

## Parimi
Rindërtimi bëhet sipas "strangler": moduli i ri zëvendëson të vjetrin kur është i plotë dhe i provuar. Të dy punojnë mbi **të njëjtat të dhëna**, ndaj nuk ka migrim të rrezikshëm dhe nuk ka dy burime të së vërtetës. Moduli i vjetër (`/`) mbetet për pjesët që s'janë rindërtuar ende; moduli i ri jeton te `/app/`.

## Shtresat
```
public/app/                  Aplikacioni i ri (module ES, pa build, pa varësi të jashtme)
  core/   html.js (shabllon me escape automatik), api.js, router.js, actions.js (ngjarje me delegim), ui.js (modal, toast), format.js
  modules/clients|tasks|approvals   çdo modul: pamje + formularë + veprime
  main.js (guaska: sesioni, navigimi, rrugët), boot.js, index.html, app.css
api/v2.js                    Një funksion serverless (router): /api/v2/<burimi>[/<id>[/<veprimi>]]
api/_v2-clients|tasks|approvals.js   Shërbimet (DTO, validim, rregulla)
api/_v2-tasks-domain.js      Domen i pastër: makina e gjendjeve të detyrave (pa DB, pa HTTP)
api/_v2-http.js              Ura drejt rrugës së provuar të ruajtjes (/api/store): leje, miratime, bashkim, auditim, njoftime
api/store.js, _perm.js …     Rregullat e ruajtjes (të pandryshuara; përdoren nga të dyja aplikacionet)
```
Siguria e ndërfaqes është e ndërtuar në themel: `html``…``` bën escape për çdo vlerë të interpoluar, ndaj XSS nuk mund të futet nga një fushë teksti. Asnjë `onclick` inline: veprimet kalojnë nga `data-action` me delegim. Asnjë e dhënë klienti nuk ruhet në `localStorage`.

## Kontrata e API v2 (JSON; gabimet: `{ error: <kod>, message: <tekst>, … }`)
| Rruga | Metoda | Përshkrimi |
|---|---|---|
| `/session` | GET | përdoruesi dhe ekipi |
| `/clients` | GET, POST | lista (me numrin e detyrave dhe kërkesave), krijimi (NIPT unik, validim) |
| `/clients/:id` | GET, PATCH, DELETE | dosja e plotë; PATCH: admini ruan, kontabilisti krijon kërkesë (202); DELETE vetëm admin |
| `/clients/:id/secrets` | GET, PUT | kredencialet (vetëm admin; asnjëherë në DTO e klientit) |
| `/tasks` | GET, POST | detyrat me lejet për përdoruesin aktual |
| `/tasks/:id` | PATCH, DELETE | vetëm krijuesi ose admini |
| `/tasks/:id/command` | POST | `start`, `complete`, `approve`, `reject`, `reopen` (makina e gjendjeve në server) |
| `/tasks/:id/comments` | POST | koment |
| `/obligations/today`, `/monthly?period=`, `/annual` | GET | detyrimet e hapura (me përgjegjës, afat efektiv), matrica mujore, matrica vjetore |
| `/obligations/team` | GET | ngarkesa e detyrimeve sipas anëtarit (e hapur për të gjithë) |
| `/obligations/done` | POST | shëno/zhbëj një detyrim (TVSH kyçet derisa të mbyllen librat) |
| `/obligations/action` | POST | xhiro, njoftim, pagesë paraprake, rinovim afati, kontratë (rinovim/jo-rinovim), ndjekje |
| `/approvals` | GET | kërkesat në pritje / automatike / vendimet (admin) |
| `/approvals/:id/decision` | POST | `approved` ose `rejected` (+ arsye) |
| `/approvals/clear-automatic` | POST | pastron plotësimet automatike të vjetra |

Kufizim i Vercel Hobby: **12 funksione**. Tani janë 12 (`v2.js` i fundit). Çdo modul i ri shtohet te `v2.js` si rrugë, jo si funksion i ri.

## Si shtohet një modul
1. Domen i pastër (nëse ka rregulla) në `api/_v2-<modul>-domain.js` + teste njësi.
2. Shërbim `api/_v2-<modul>.js` mbi `mutateKey`/`readState` + rrugët te `v2.js`.
3. Pamje te `public/app/modules/<modul>/`, regjistrim rrugësh te `main.js`.
4. Teste: API (`tests/integration/v2.test.js` si model) dhe ndërfaqe (`app.test.js`: klikime dhe shkrim të vërtetë në DOM).

## Gjendja dhe plani
| Moduli | Gjendja |
|---|---|
| Klientët (listë, filtra, formular me validim, dosje e plotë, kredenciale) | **i rindërtuar** |
| Detyrat (të miat / ekipi, përgjegjës, kohë, aprovim në dy hapa, përsëritje, komente) | **i rindërtuar** |
| Miratimet | **i rindërtuar** |
| Sot + Detyrimet mujore/vjetore (motori i afateve, festat, pagesat, xhiroja, skadimet, kontratat, hapat pas regjistrimit, matrica, plani i muajit) | **i rindërtuar** (motor i pastër me 14 teste; Dogana dhe Fondet e klientëve ende s'hyjnë te "Sot" i ri) |
| Aplikime NIPT → klient | më pas |
| TVSH, Kontrata, Dokumente (ngarkim PDF), Faturimi, Dogana, Fondet, Raporte | më pas |
| Ekipi, Chat, Auditimi, Njoftimet | më pas |

## Faza e fundit: motori i ruajtjes
Sot të dhënat ruhen si dokumente JSON (`kv`). Meqë gjithçka e re kalon nga shërbimet `_v2-*`, kalimi te tabela relacionale (klientë, detyra, kërkesa) bëhet duke ndërruar vetëm `mutateKey`/`readState`, pa ndryshuar ndërfaqen. Kjo bëhet pasi modulet e mbetura të jenë rindërtuar.


## Politika e miratimit (v17)
Miratohet vetëm **ndryshimi i një vlere ekzistuese**. Ruhen menjëherë (pa kërkesë): plotësimi i parë i një fushe të zbrazët, shtimi i dokumenteve dhe ortakëve, klientët e rinj dhe kontratat e reja. Kërkojnë gjithmonë miratim: ndryshimi/fshirja e vlerave ekzistuese, caktimi i përgjegjësve, zëvendësimi i PDF-së së kontratës. Vlerat default (TVSH, tatim fitimi) s'fshihen kurrë nga një kërkesë. Kërkesat e vjetra që janë plotësime të para zbatohen automatikisht, zhurma pastrohet (`/approvals/clear-automatic`).

## Çfarë mbetet te moduli i vjetër
Dogana (deklarata doganore), Fondet e klientëve, shërbimet e veçanta, onboarding i shërbimeve, aplikime NIPT, TVSH (deklarimet e detajuara), kontratat (krijim/PDF), dokumentet (ngarkim), faturimi, raportet, ekipi, chat, auditimi. Detyrimet e Doganës dhe të Fondeve shfaqen ende vetëm te "Sot" i vjetër (`/`).


## Dokumentet provë dhe njoftimet (v18)
- **Sot** tregon vetëm detyrimet dhe detyrat e përgjegjësit; admini sheh të gjitha. Pamja e ekipit është te Detyrat → Ekipi (detyra manuale + detyrime sipas anëtarit).
- **Rinovimi i kontratës** kërkon datën e re dhe PDF-në e kontratës. Kontabilisti e dërgon për miratim (admini e hap dokumentin te kërkesa); pas miratimit PDF ruhet te dosja e klientit si provë (kategoria Kontratë) dhe lidhet me kontratën. Admini e ruan menjëherë.
- **Detyrat me provë** (`evidence`): mbyllja kërkon PDF; ruhet te klienti (kategoria Provë) kur detyra mbyllet përfundimisht. Mbyllja në dy hapa e njofton kolegun dhe ai e lexon dokumentin para aprovimit.
- **Njoftimet:** zile me panel dhe shirit i butë lart për njoftimet e reja (rifreskim çdo 20 s); “Hap” të çon direkt te detyra (`#/tasks?open=ID`), kërkesa ose klienti.
- **Klienti:** ID e administratorit dhe e ortakëve (PDF), data e certifikatës elektronike dhe afati i administratorit, kredencialet e-Albania/e-Filing (vetëm admini). Plotësimi i parë i këtyre ruhet pa miratim; zëvendësimi kërkon miratim.
