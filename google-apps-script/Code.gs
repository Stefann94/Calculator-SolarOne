/**
 * Calculator Casa Verde – SolarOne.ro
 *
 * Primește datele trimise din calculator, le salvează în Google Sheet
 * și trimite două emailuri: unul către firmă și unul către client.
 * Instrucțiuni de instalare: INSTRUCTIUNI.md
 */

/* ===== Setări – modifică aici ===== */
const COMPANY_EMAIL = 'office@solarone.ro';   // ← adresa firmei care primește notificările
const SEND_TO_CLIENT = true;                  // trimite rezultatul și clientului
const SENDER_NAME = 'SolarOne.ro';
const SHOP_URL = 'https://www.solarone.ro/';
const SITE_URL = 'https://calculator.solarone.ro/';
const SHEET_NAME = 'Calculator';
const COOLDOWN_MIN = 10;                      // aceeași adresă primește / generează max. 1 set de emailuri la 10 minute

/* ===== Reguli calculator (identice cu site-ul) ===== */
const AFM_MAX = 15000;
const MIN_OWN_PCT = 0.25;
const ALLOWED_KWH = [16.1, 20, 32.2, 48.3];

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);

    // câmp ascuns completat doar de roboți
    if (d.website) return json({ ok: true });

    const email = String(d.email || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(email)) return json({ ok: false, error: 'email' });
    if (d.consent !== true) return json({ ok: false, error: 'consent' });

    const kwh = Number(d.baterie_kwh);
    const investitie = Math.round(Number(d.valoare_investitie));
    const aport = Math.round(Number(d.aport_propriu));
    if (ALLOWED_KWH.indexOf(kwh) < 0 || !(investitie > 0) || !(aport >= 0) || aport > investitie) {
      return json({ ok: false, error: 'date' });
    }
    const minAport = Math.max(Math.ceil(investitie * MIN_OWN_PCT), investitie - AFM_MAX, 0);
    if (aport < minAport) return json({ ok: false, error: 'aport' });

    // punctajul se recalculează aici, nu se preia din browser
    const r = score(investitie, aport, kwh);
    const lead = {
      data: Utilities.formatDate(new Date(), 'Europe/Bucharest', 'dd.MM.yyyy HH:mm'),
      email: email,
      invertor: String(d.invertor || '').replace(/[<>]/g, '').slice(0, 60),
      kwh: kwh,
      investitie: investitie,
      aport: aport,
      finantare: r.finantare,
      pOwn: r.pOwn,
      pBat: r.pBat,
      total: r.total
    };

    const cache = CacheService.getScriptCache();
    const key = 'lead_' + Utilities.base64EncodeWebSafe(email);
    const recent = cache.get(key) !== null;
    const quota = MailApp.getRemainingDailyQuota();

    let status = 'trimis';
    if (recent) status = 'fără email (repetat în ' + COOLDOWN_MIN + ' min)';
    else if (quota < (SEND_TO_CLIENT ? 2 : 1)) status = 'fără email (limită zilnică atinsă)';

    saveToSheet(lead, status);

    if (status === 'trimis') {
      cache.put(key, '1', COOLDOWN_MIN * 60);
      sendCompanyEmail(lead);
      if (SEND_TO_CLIENT) sendClientEmail(lead);
    }
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  }
}

// Verificare rapidă că aplicația web e publicată: deschide URL-ul în browser.
function doGet() {
  return ContentService.createTextOutput('Calculator Casa Verde – serviciul de email funcționează.');
}

/* ===== Punctaj ===== */
function score(investitie, aport, kwh) {
  const finantare = Math.min(AFM_MAX, investitie - aport);
  const pOwn = finantare <= 0 ? 50 : Math.min(50, 30 * aport / finantare);
  const pBat = Math.min(50, kwh * 2.5);
  return { finantare: finantare, pOwn: pOwn, pBat: pBat, total: pOwn + pBat };
}

function label(total) {
  if (total < 75) return { text: 'Punctaj redus', color: '#C62E2E', bg: '#FDECEC' };
  if (total <= 90) return { text: 'Punctaj mediu', color: '#B86E00', bg: '#FFF3D1' };
  return { text: 'Punctaj foarte bun', color: '#1E8E4E', bg: '#E1F5EA' };
}

function tip(l) {
  const best = Math.max(Math.ceil(l.investitie * 5 / 8), Math.ceil(l.investitie * MIN_OWN_PCT), l.investitie - AFM_MAX);
  if (l.pBat < 50 && l.pOwn < 50) return 'Cu o baterie de minimum 20 kWh și un aport propriu mai mare poți ajunge la punctajul maxim.';
  if (l.pBat < 50) return 'Cu o baterie de 20 kWh sau mai mare obții 50 de puncte la capacitatea de stocare.';
  if (l.pOwn < 50) return 'Mărind aportul propriu la ' + lei(best) + ' obții 50 de puncte la contribuția proprie.';
  return 'Configurația ta obține punctajul maxim pe ambele criterii.';
}

/* ===== Google Sheet ===== */
function saveToSheet(l, status) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) {
      sh.appendRow(['Data', 'Email', 'Invertor', 'Baterie (kWh)', 'Investiție (lei)', 'Aport propriu (lei)',
        'Finanțare AFM (lei)', 'Punctaj contribuție', 'Punctaj baterie', 'Punctaj total', 'Status email']);
      sh.getRange(1, 1, 1, 11).setFontWeight('bold').setBackground('#EAF1FF');
      sh.setFrozenRows(1);
    }
    sh.appendRow([l.data, cell(l.email), cell(l.invertor), l.kwh, l.investitie, l.aport, l.finantare,
      round1(l.pOwn), round1(l.pBat), round1(l.total), status]);
  } finally {
    lock.releaseLock();
  }
}

/* ===== Emailuri ===== */
function sendCompanyEmail(l) {
  const rows = [
    ['Email client', '<a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>'],
    ['Invertor', esc(l.invertor)],
    ['Baterie', String(l.kwh).replace('.', ',') + ' kWh'],
    ['Valoare investiție', lei(l.investitie)],
    ['Aport propriu', lei(l.aport)],
    ['Finanțare AFM', lei(l.finantare)],
    ['Punctaj contribuție', pts(l.pOwn) + ' / 50 p'],
    ['Punctaj baterie', pts(l.pBat) + ' / 50 p'],
    ['<b>Punctaj total</b>', '<b>' + pts(l.total) + ' / 100 p</b>']
  ].map(function (r) {
    return '<tr><td style="padding:8px 12px;border-bottom:1px solid #E3E8F0;color:#5B6B82">' + r[0] +
      '</td><td style="padding:8px 12px;border-bottom:1px solid #E3E8F0;color:#10213F">' + r[1] + '</td></tr>';
  }).join('');

  const html = wrap(
    '<h2 style="margin:0 0 6px;color:#061B3A;font-size:20px">Calcul nou în Calculatorul Casa Verde</h2>' +
    '<p style="margin:0 0 16px;color:#5B6B82">' + l.data + ' · clientul a fost de acord să primească oferte pe email.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:15px">' + rows + '</table>' +
    '<p style="margin:18px 0 0;color:#5B6B82;font-size:13px">Apasă „Răspunde” pentru a-i scrie direct clientului.</p>'
  );

  MailApp.sendEmail({
    to: COMPANY_EMAIL,
    replyTo: l.email,
    name: SENDER_NAME + ' – Calculator',
    subject: 'Calculator Casa Verde: ' + l.email + ' – ' + pts(l.total) + ' puncte',
    htmlBody: html,
    body: 'Calcul nou: ' + l.email + ', ' + l.invertor + ', baterie ' + l.kwh + ' kWh, investiție ' + lei(l.investitie) +
      ', aport ' + lei(l.aport) + ', punctaj ' + pts(l.total) + ' / 100.'
  });
}

function sendClientEmail(l) {
  const lb = label(l.total);
  const html = wrap(
    '<p style="margin:0 0 4px;color:#5B6B82">Punctajul tău estimat Casa Verde</p>' +
    '<div style="font-size:48px;font-weight:900;color:#061B3A;line-height:1.1">' + pts(l.total) +
    '<span style="font-size:18px;color:#5B6B82;font-weight:600"> / 100 puncte</span></div>' +
    '<div style="margin:6px 0 18px;font-weight:600;color:' + lb.color + '">' + lb.text + '</div>' +
    '<table style="width:100%;border-collapse:collapse;font-size:15px">' +
    '<tr><td style="padding:8px 0;border-bottom:1px solid #E3E8F0">Contribuție proprie</td><td style="padding:8px 0;border-bottom:1px solid #E3E8F0;text-align:right"><b>' + pts(l.pOwn) + '</b> / 50 p</td></tr>' +
    '<tr><td style="padding:8px 0;border-bottom:1px solid #E3E8F0">Capacitate baterie (' + String(l.kwh).replace('.', ',') + ' kWh)</td><td style="padding:8px 0;border-bottom:1px solid #E3E8F0;text-align:right"><b>' + pts(l.pBat) + '</b> / 50 p</td></tr>' +
    '<tr><td style="padding:8px 0;color:#5B6B82">Investiție / aport / finanțare AFM</td><td style="padding:8px 0;text-align:right;color:#5B6B82">' + lei(l.investitie) + ' / ' + lei(l.aport) + ' / ' + lei(l.finantare) + '</td></tr>' +
    '</table>' +
    '<p style="margin:18px 0;padding-top:14px;border-top:1px solid #DDE1E7">' + tip(l) + '</p>' +
    '<a href="' + SHOP_URL + '" style="display:inline-block;background:#F7B500;color:#1B2430;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:6px">Vizitează magazinul SolarOne.ro</a>' +
    '<p style="margin:18px 0 0;color:#5B6B82;font-size:13px">Ai întrebări despre dosarul Casa Verde? Răspunde la acest email și un consultant SolarOne te va ajuta.</p>' +
    '<p style="margin:10px 0 0;color:#8A97AB;font-size:12px">Calcul orientativ, fără garanția aprobării dosarului. Ai primit acest email pentru că ai folosit <a href="' + SITE_URL + '" style="color:#8A97AB">calculatorul Casa Verde</a>.</p>'
  );

  MailApp.sendEmail({
    to: l.email,
    replyTo: COMPANY_EMAIL,
    name: SENDER_NAME,
    subject: 'Punctajul tău Casa Verde: ' + pts(l.total) + ' din 100',
    htmlBody: html,
    body: 'Punctajul tău estimat Casa Verde: ' + pts(l.total) + ' / 100 (contribuție proprie ' + pts(l.pOwn) +
      ' p, baterie ' + pts(l.pBat) + ' p). ' + tip(l) + ' ' + SHOP_URL
  });
}

function wrap(inner) {
  return '<div style="background:#F4F5F7;padding:24px 12px;font-family:Segoe UI,Arial,sans-serif;color:#1B2430">' +
    '<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #DDE1E7;border-radius:8px;overflow:hidden">' +
    '<div style="padding:14px 22px;font-weight:700;font-size:16px;border-bottom:2px solid #F7B500">SolarOne.ro · Calculator Casa Verde</div>' +
    '<div style="padding:22px">' + inner + '</div></div></div>';
}

/* ===== Utilitare ===== */
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cell(s) { // împiedică interpretarea textului ca formulă în Sheets
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function lei(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' lei'; }
function round1(n) { return Math.round(n * 10) / 10; }
function pts(n) { return round1(n).toFixed(1).replace('.', ','); }

/* ===== Test: rulează o dată din editor (autorizează scriptul și trimite un exemplu firmei) ===== */
function testTrimitere() {
  const r = score(18050, 9000, 20);
  const lead = {
    data: Utilities.formatDate(new Date(), 'Europe/Bucharest', 'dd.MM.yyyy HH:mm'),
    email: COMPANY_EMAIL, invertor: '6 kW monofazic', kwh: 20, investitie: 18050, aport: 9000,
    finantare: r.finantare, pOwn: r.pOwn, pBat: r.pBat, total: r.total
  };
  saveToSheet(lead, 'test');
  sendCompanyEmail(lead);
  sendClientEmail(lead); // ajunge tot la adresa firmei, ca să vezi cum arată emailul pentru client
}
