# CRM Studio Kontabiliteti – aplikacion për Vercel

Aplikacion me hyrje me llogari (email + fjalëkalim), të dhëna të përbashkëta për ekipin, role (administrator / kontabilist), PDF-të ruhen në server dhe regjistër veprimesh. Faqja kryesore (`public/index.html`) është CRM-ja; `public/shim.js` e lidh me serverin.

## Vendosja në Vercel (hap pas hapi)
1. Krijo një depo në GitHub dhe ngarko përmbajtjen e këtij dosjeje (ose përdor `vercel deploy`).
2. Te vercel.com: **Add New -> Project** dhe zgjidh depon. Preset-i: **Other**. Nuk ka komandë ndërtimi.
3. Bazën e të dhënave: te projekti hap **Storage -> Create / Connect -> Neon (Postgres)** dhe lidhe me projektin. Kjo vendos vetë `DATABASE_URL`.
4. Te **Settings -> Environment Variables** shto:
   - `AUTH_SECRET` – një varg i gjatë i rastësishëm (min. 32 karaktere)
   - `ADMIN_EMAIL` – email-i yt
   - `ADMIN_PASSWORD` – fjalëkalimi fillestar i administratorit
5. **Deploy** (ose Redeploy pas shtimit të variablave).
6. Hap faqen, hyr me `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Tabelat krijohen vetë në hyrjen e parë.
7. Kliko **Përdoruesit** (lart djathtas) dhe shto kolegët me email dhe fjalëkalim fillestar; ua jep ata vetë.
8. Pas hyrjes së parë ndrysho fjalëkalimin e administratorit (Përdoruesit -> Fjalëkalim i ri) dhe hiq `ADMIN_PASSWORD` nga variablat.

## Si funksionon
- **Të dhënat:** CRM-ja ruan çdo koleksion (klientë, aplikime, TVSH, kontrata/detyra...) si një dokument me version te tabela `kv`. Nëse dy persona ruajnë njëkohësisht, i dyti merr paralajmërim dhe faqja rifreskohet, që të mos mbishkruhet puna e tjetrit. Çdo 30 sekonda faqja kontrollon për ndryshime nga kolegët.
- **Role:** administratori menaxhon përdoruesit dhe sheh fjalëkalimet e klientëve (e-Albania, e-Filing, programi fiskal, certifikata). Kontabilisti i sheh të fshehura dhe nuk i mbishkruan.
- **PDF:** ngarkohen në tabelën `files` (maksimumi rreth 3 MB për skedar, kufiri i Vercel) dhe hapen vetëm nga përdoruesit e kyçur.
- **Regjistri:** tabela `audit` ruan hyrjet, ruajtjet, ngarkimet dhe ndryshimet e përdoruesve.

## Kufizime të njohura
- Konflikti zgjidhet me paralajmërim dhe rifreskim, jo me bashkim automatik. Për ekip 2-5 vetë që nuk redaktojnë të njëjtën gjë njëkohësisht, mjafton.
- Nuk ka kufizim përpjekjesh hyrjeje (rate limiting) dhe as rikthim fjalëkalimi me email: administratori e ndryshon fjalëkalimin.
- Fjalëkalimet e klientëve ruhen në bazën e të dhënave (enkriptim në nivel disku nga ofruesi), jo të enkriptuara në aplikacion.
- Email-et nuk dërgohen nga aplikacioni; butonët hapin programin e postës ose WhatsApp.
- Rikthimi i kopjes rezervë është çaktivizuar (serveri është burimi i së vërtetës); eksporti i plotë mbetet.
