# Trimiterea emailurilor din Calculatorul Casa Verde

La fiecare calcul, un script Google gratuit:
- trimite un email **firmei**, cu datele clientului și punctajul (poți apăsa „Răspunde” ca să-i scrii direct clientului);
- trimite un email **clientului**, cu punctajul, un sfat și butonul spre magazin;
- salvează calculul într-un **Google Sheet**.

Emailurile pleacă de pe contul Google în care faci pașii de mai jos. Folosește un cont al firmei, de exemplu un Gmail creat pentru asta sau un cont Google Workspace pe `@solarone.ro`.

## 1. Creează tabelul și scriptul (5 minute)

1. Intră pe https://sheets.google.com cu contul firmei și creează un tabel gol, de exemplu „Calculator Casa Verde – clienți”.
2. În tabel: **Extensii → Apps Script**.
3. Șterge tot codul din fișierul `Code.gs` și lipește conținutul fișierului [`Code.gs`](Code.gs) din acest folder.
4. Sus în cod, la `COMPANY_EMAIL`, scrie adresa firmei:
   ```js
   const COMPANY_EMAIL = 'office@solarone.ro';
   ```
5. Apasă **Salvează** (iconița cu discheta).

## 2. Testează și autorizează

1. În bara de sus alege funcția **`testTrimitere`** și apasă **Rulează**.
2. Google cere permisiuni: **Examinează permisiunile**, alegi contul, apoi **Avansat → Accesează proiectul (nesigur)** → **Permite**. Mesajul apare pentru că scriptul e al tău și nu e verificat de Google; e normal.
3. Verifică:
   - la adresa firmei au sosit **2 emailuri**: notificarea și exemplul de email pentru client;
   - în tabel a apărut foaia **Calculator** cu un rând de test (îl poți șterge).

## 3. Publică scriptul ca aplicație web

1. **Implementează → Implementare nouă**.
2. La „Selectează tipul” (rotița) alege **Aplicație web**.
3. Setări:
   - **Execută ca:** *Eu (adresa ta)*
   - **Cine are acces:** *Oricine*
4. **Implementează** și copiază **URL-ul aplicației web** (se termină în `/exec`).
5. Opțional: deschide URL-ul în browser. Trebuie să vezi textul „serviciul de email funcționează”.

## 4. Leagă scriptul de calculator

În `index.html`, caută linia:
```js
var LEAD_ENDPOINT = '';
```
și pune URL-ul copiat:
```js
var LEAD_ENDPOINT = 'https://script.google.com/macros/s/.../exec';
```
Salvează, fă commit și push pe GitHub. Vercel republică automat site-ul.

## Modificări ulterioare ale scriptului

După ce schimbi codul în Apps Script: **Implementează → Gestionează implementările → ✏️ Editează → Versiune: Versiune nouă → Implementează**. URL-ul rămâne același, nu trebuie schimbat nimic în site.

## Bine de știut

- **Limită zilnică de emailuri:** circa **100 de destinatari pe zi** pentru un cont Gmail obișnuit și circa **1.500** pentru Google Workspace. Un calcul consumă 2 emailuri (firmă + client). Când limita se termină, calculele se salvează în continuare în tabel, cu statusul „limită zilnică atinsă”.
- **Protecție anti-abuz:**
  - aceeași adresă de email declanșează emailuri cel mult o dată la 10 minute (`COOLDOWN_MIN`); calculele repetate apar totuși în tabel;
  - un câmp ascuns din formular oprește roboții;
  - punctajul este recalculat în script, deci nu se poate trimite un scor fals.
- **Doar notificare pentru firmă:** dacă nu vrei email către client, pune `const SEND_TO_CLIENT = false;` și publică o versiune nouă.
- **Spam:** dacă primele emailuri ajung în Spam, marchează-le „Nu este spam”. Emailurile trimise de pe un cont Workspace pe domeniul `solarone.ro` ajung mai sigur în Inbox.
