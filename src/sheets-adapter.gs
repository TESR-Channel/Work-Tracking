/**
 * TESR Time Clock — Google Apps Script backend
 * --------------------------------------------------------------
 * ไฟล์นี้สร้างอัตโนมัติจาก src/sheets-adapter.gs + assets/core.js
 * วางทั้งไฟล์ลงใน Apps Script ของ Google Sheet แล้วรัน setup() 1 ครั้ง
 *
 * ชีตที่ใช้
 *   Employees    รายชื่อพนักงาน + บัญชีเข้าระบบ (รหัสผ่านเก็บแบบ hash เท่านั้น) + สิทธิ์ลาต่อปี
 *   Records      เวลาเข้า–ออกรายวัน (1 แถว = 1 คน 1 วัน)
 *   Leaves       ใบลา + ผลอนุมัติ (เก็บเป็นหลักฐาน)
 *   Adjustments  คำขอแก้เวลา + ผลอนุมัติ
 *   Holidays     วันหยุดบริษัท
 *   Settings     ตั้งค่าระบบ
 *   สรุป yyyy-MM สรุปรายเดือนสำหรับทำเงินเดือน (สร้างใหม่ทุกคืน)
 */

const TZ = 'Asia/Bangkok';
const TH_MF = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_D = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
const ST_TH = { ok: 'มา', late: 'สาย', absent: 'ขาด', leave: 'ลา', pending: 'ยังไม่เข้างาน', holiday: 'วันหยุด', off: 'วันหยุดประจำสัปดาห์', future: '' };

/* ===================== Web API ===================== */
function doGet(e) { return json_({ ok: true, data: 'TESR Time Clock API' }); }
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return json_(TC.handle(SheetsAdapter_(), p));
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ===================== ติดตั้ง / เมนู / ตั้งเวลา ===================== */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(TC.TABLES).forEach(k => ensureTable_(TC.TABLES[k]));
  const set = ensureSettings_();
  const cur = readSettingsRaw_();
  Object.keys(TC.DEFAULTS).forEach(k => { if (!(k in cur)) set.appendRow([k, String(TC.DEFAULTS[k])]); });
  set.getRange('A:B').setNumberFormat('@');
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid() + Utilities.getUuid());
  installTriggers();
  ss.toast('ติดตั้งเรียบร้อย · เข้าหน้าแอดมินด้วย admin / tesr1234 แล้วเปลี่ยนรหัสผ่านทันที', 'TESR Time Clock', 10);
}
function installTriggers() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'nightly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('nightly').timeBased().everyDays(1).atHour(23).nearMinute(30).create();
}
/** ทุกคืน 23:30 อัปเดตชีตสรุปเดือนนี้ · วันที่ 1 ปิดยอดเดือนก่อนด้วย */
function nightly() {
  const n = new Date();
  buildSheet_(Utilities.formatDate(n, TZ, 'yyyy-MM'));
  if (Utilities.formatDate(n, TZ, 'd') === '1') buildSheet_(Utilities.formatDate(new Date(n.getFullYear(), n.getMonth() - 1, 1), TZ, 'yyyy-MM'));
}
function buildSheet_(m) { return TC_internalBuild_(SheetsAdapter_(), m); }
function onOpen() {
  SpreadsheetApp.getUi().createMenu('TESR Time Clock')
    .addItem('อัปเดตสรุปเดือนนี้', 'menuThisMonth')
    .addItem('อัปเดตสรุปเดือนก่อน', 'menuLastMonth')
    .addSeparator()
    .addItem('ติดตั้ง / ซ่อมระบบ (setup)', 'setup')
    .addItem('รีเซ็ตรหัสผ่านแอดมินเป็นค่าเริ่มต้น', 'resetAdminPassword')
    .addToUi();
}
function menuThisMonth() { buildSheet_(Utilities.formatDate(new Date(), TZ, 'yyyy-MM')); }
function menuLastMonth() { const n = new Date(); buildSheet_(Utilities.formatDate(new Date(n.getFullYear(), n.getMonth() - 1, 1), TZ, 'yyyy-MM')); }
/** กรณีลืมรหัสแอดมิน: รันจากเมนูในชีต (ต้องเป็นเจ้าของชีตเท่านั้น) แล้วเข้าด้วย admin / tesr1234 */
function resetAdminPassword() {
  const A = SheetsAdapter_();
  A.setSetting('adminUser', 'admin'); A.setSetting('adminHash', '');
  SpreadsheetApp.getActive().toast('รีเซ็ตแล้ว: admin / tesr1234 · เข้าระบบแล้วเปลี่ยนรหัสทันที', 'TESR Time Clock', 10);
}
/** ทริกเกอร์ทำงานในฐานะเจ้าของชีต จึงออก token แอดมินอายุ 10 นาทีภายในเพื่อเรียก buildMonth ผ่าน router ปกติ */
function TC_internalBuild_(A, m) {
  const now = A.now();
  const res = TC.handle(A, { action: 'buildMonth', month: m, token: internalAdminToken_(A, now) });
  if (!res.ok) throw new Error(res.error);
  return res.data.url;
}
function internalAdminToken_(A, now) {
  const raw = A.getSettings();
  const v = A.hmac('v|' + (raw.adminHash || '')).slice(0, 8);
  const p = ['admin', 'admin', v, now.ms + 600000].join('.');
  return p + '.' + A.hmac(p);
}

/* ===================== Sheets adapter ===================== */
function SheetsAdapter_() {
  const ss = SpreadsheetApp.getActive();
  const cache = {};
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || 'tesr-time-clock';
  const sc = CacheService.getScriptCache();
  function load(t) {
    if (cache[t.name]) return cache[t.name];
    const sh = ensureTable_(t), v = sh.getDataRange().getValues(), head = v[0].map(String);
    const out = [];
    for (let i = 1; i < v.length; i++) {
      const o = { _row: i + 1 }; let any = false;
      head.forEach((k, j) => { if (!k) return; o[k] = norm_(v[i][j], k); if (o[k] !== '') any = true; });
      if (any) out.push(o);
    }
    cache[t.name] = { sh, head, rows: out };
    return cache[t.name];
  }
  function writeRow(t, row, obj) {
    const d = load(t);
    const vals = d.head.map(k => obj[k] === undefined || obj[k] === null ? '' : String(obj[k]));
    d.sh.getRange(row, 1, 1, d.head.length).setNumberFormat('@').setValues([vals]);
  }
  return {
    rows: t => load(t).rows,
    insert(t, obj) { const d = load(t); const row = d.sh.getLastRow() + 1; writeRow(t, row, obj); const o = Object.assign({ _row: row }, obj); d.rows.push(o); return o; },
    update(t, ref, patch) { const d = load(t); Object.assign(ref, patch); writeRow(t, ref._row, ref); },
    remove(t, ref) { const d = load(t); d.sh.deleteRow(ref._row); delete cache[t.name]; },
    getSettings: readSettingsRaw_,
    setSetting(k, v) {
      const sh = ensureSettings_(), vals = sh.getDataRange().getValues();
      for (let i = 1; i < vals.length; i++) if (String(vals[i][0]) === k) { sh.getRange(i + 1, 2).setNumberFormat('@').setValue(String(v)); return; }
      sh.appendRow([k, String(v)]);
    },
    now() { const d = new Date(); return { date: Utilities.formatDate(d, TZ, 'yyyy-MM-dd'), time: Utilities.formatDate(d, TZ, 'HH:mm'), iso: Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ss"), ms: d.getTime() }; },
    sha256(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join(''); },
    hmac(s) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, secret)).replace(/[^A-Za-z0-9]/g, '').slice(0, 32); },
    uuid() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); },
    cacheGet: k => sc.get(k),
    cachePut: (k, v, s) => sc.put(k, v, s),
    lock(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } },
    savePhoto(emp, mime, b64) {
      const folder = photoFolder_();
      const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b64), mime, emp.code + '-' + Date.now() + '.jpg'));
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return 'https://lh3.googleusercontent.com/d/' + file.getId();
    },
    buildMonthSheet: writeMonthSheet_
  };
}

function ensureTable_(t) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(t.name);
  if (!sh) {
    sh = ss.insertSheet(t.name);
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight('bold').setBackground('#0d0b0a').setFontColor('#C9A84C');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), t.cols.length).setNumberFormat('@');
    return sh;
  }
  // เพิ่มคอลัมน์ที่ขาด (อัปเกรดจากเวอร์ชันเก่า)
  const lastCol = Math.max(1, sh.getLastColumn());
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = t.cols.filter(c => head.indexOf(c) < 0);
  if (missing.length) sh.getRange(1, head.filter(String).length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return sh;
}
function ensureSettings_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Settings');
  if (!sh) { sh = ss.insertSheet('Settings'); sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange('A:B').setNumberFormat('@'); }
  return sh;
}
function readSettingsRaw_() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Settings'), o = {};
  if (!sh) return o;
  sh.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) o[String(r[0])] = norm_(r[1], String(r[0])); });
  return o;
}
function norm_(v, k) {
  if (v instanceof Date) return v.getFullYear() < 1901 ? Utilities.formatDate(v, TZ, 'HH:mm') : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const s = v === null || v === undefined ? '' : String(v).trim();
  return /^\d:\d\d$/.test(s) ? '0' + s : s;
}
function photoFolder_() {
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('PHOTO_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('TESR Time Clock · Photos');
  props.setProperty('PHOTO_FOLDER', f.getId());
  return f;
}

/* ===================== ชีตสรุปรายเดือน ===================== */
function writeMonthSheet_(m, rep, S, now) {
  const ss = SpreadsheetApp.getActive(), today = now.date, [y, mo] = m.split('-').map(Number);
  const LT = TC.LEAVE_TYPES, types = Object.keys(LT);
  const name = 'สรุป ' + m;
  let sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);

  sh.getRange(1, 1).setValue('สรุปการทำงาน เดือน' + TH_MF[mo - 1] + ' ' + (y + 543) + ' · ' + S.company).setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1).setValue('เวลางานบริษัท ' + S.start + '–' + S.end + (S.grace ? ' (ผ่อนผัน ' + S.grace + ' นาที)' : '') + ' · คนที่มีเวลางานของตัวเองนับสายตามเวลาของคนนั้น · นับถึงวันที่ ' + today + ' · อัปเดต ' + now.iso.replace('T', ' ')).setFontColor('#6b625a');

  const sumH = ['รหัส', 'ชื่อ', 'ตำแหน่ง', 'เวลางาน', 'วันทำงาน', 'มาทำงาน', 'ขาด (วัน)', 'มาสาย (ครั้ง)', 'สายรวม (นาที)']
    .concat(types.map(t => LT[t] + ' (วัน)')).concat(['ลืมเช็คเอาท์', 'ชั่วโมงในออฟฟิศ']);
  const sum = rep.map(r => [r.emp.code, r.emp.name, r.emp.position, (r.emp.shiftStart || S.start) + '–' + (r.emp.shiftEnd || S.end), r.t.workdays, r.t.present, r.t.absent, r.t.lateDays, r.t.lateMin]
    .concat(types.map(t => r.t.leave[t] || 0)).concat([r.t.noOut, r.t.hours]));
  head_(sh.getRange(4, 1, 1, sumH.length).setValues([sumH]));
  if (sum.length) { sh.getRange(5, 1, sum.length, 1).setNumberFormat('@'); sh.getRange(5, 1, sum.length, sumH.length).setValues(sum); }

  const d0 = 5 + sum.length + 2;
  sh.getRange(d0 - 1, 1).setValue('รายละเอียดรายวัน').setFontWeight('bold');
  const detH = ['วันที่', 'วัน', 'รหัส', 'ชื่อ', 'สถานะ', 'เข้างาน', 'ออกงาน', 'สาย (นาที)', 'การลา', 'หมายเหตุ'];
  head_(sh.getRange(d0, 1, 1, detH.length).setValues([detH]));
  const det = [], bg = [];
  rep.forEach(r => r.days.forEach(x => {
    if (x.date > today) return;
    if (!x.work && !x.rec && !(x.leave && x.leave.status === 'approved')) return;
    const lv = x.leave ? LT[x.leave.type] + (x.leave.part !== 'full' ? ' (' + TC.PART[x.leave.part] + ')' : '') + (x.leave.status !== 'approved' ? ' [รออนุมัติ]' : '') : '';
    const out = x.rec ? (x.rec.out || (x.date < today ? 'ไม่ได้เช็คเอาท์' : '')) : '';
    det.push([x.date, TH_D[x.dow], r.emp.code, r.emp.name, ST_TH[x.st] || '', x.rec ? x.rec.in : '', out, x.rec ? x.late : '', lv, x.rec && x.rec.note ? x.rec.note : (x.holiday || '')]);
    const c = x.st === 'absent' ? '#fbe1df' : x.st === 'late' ? '#fbead6' : x.st === 'leave' ? '#e3ecfb' : null;
    bg.push(Array(detH.length).fill(c));
  }));
  if (det.length) {
    [1, 3, 6, 7].forEach(c => sh.getRange(d0 + 1, c, det.length, 1).setNumberFormat('@'));
    sh.getRange(d0 + 1, 1, det.length, detH.length).setValues(det).setBackgrounds(bg);
  }
  sh.setColumnWidth(1, 95); sh.setColumnWidth(2, 170); sh.setColumnWidth(3, 130);
  for (let c = 4; c <= sumH.length; c++) sh.setColumnWidth(c, 100);
  return ss.getUrl() + '#gid=' + sh.getSheetId();
}
function head_(rg) { rg.setFontWeight('bold').setBackground('#8B0000').setFontColor('#ffffff').setWrap(true); }

/* ===================== core logic (เหมือนกับ assets/core.js) ===================== */
