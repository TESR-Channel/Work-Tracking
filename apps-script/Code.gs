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
 *   สรุป yyyy-MM รายงานรายวันทุกคน + ยอดรวม (รูปแบบเดียวกับไฟล์ Export AllSum เดิม)
 *   KPI yyyy-MM  สรุปต่อคน: แจ้งเตือน, ตรงเวลา %, มาทำงาน %
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
/**
 * สร้าง 2 ชีตต่อเดือน
 *   "สรุป yyyy-MM" : รายวันทุกคนทุกวัน + แถวยอดรวมต่อคน (รูปแบบเดียวกับไฟล์ Export AllSum เดิม)
 *   "KPI yyyy-MM"  : สรุปต่อคนหนึ่งบรรทัด พร้อมแจ้งเตือนและอัตราตรงเวลา / มาทำงาน
 */
function writeMonthSheet_(m, rep, S, now) {
  const ss = SpreadsheetApp.getActive(), [y, mo] = m.split('-').map(Number);
  const tbl = TC.exportTable(m, rep, S, now.date);

  // ---------- รายวัน ----------
  const name = 'สรุป ' + m;
  let sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  const W = tbl.head1.length;
  sh.getRange(1, 1, 2, W).setValues([tbl.head1, tbl.head2]).setFontWeight('bold').setBackground('#8B0000').setFontColor('#ffffff')
    .setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  tbl.merges.forEach(g => sh.getRange(g[0] + 1, g[1] + 1, g[2] - g[0] + 1, g[3] - g[1] + 1).merge());
  if (tbl.rows.length) {
    const body = sh.getRange(3, 1, tbl.rows.length, W);
    body.setNumberFormat('@').setValues(tbl.rows.map(r => r.cells.map(String)));
    const bg = tbl.rows.map(r => {
      const c = r.total ? '#fffdd0' : r.st === 'absent' || r.flags.indexOf('noOut') >= 0 ? '#fbe1df' : r.flags.length ? '#fbead6' : r.st === 'leave' ? '#e3ecfb' : (r.st === 'off' || r.st === 'holiday') ? '#f3f0ec' : null;
      return Array(W).fill(c);
    });
    body.setBackgrounds(bg).setVerticalAlignment('middle');
    sh.getRange(3, 3, tbl.rows.length, W - 3).setHorizontalAlignment('center');
    sh.getRange(3, W, tbl.rows.length, 1).setHorizontalAlignment('left');
    tbl.rows.forEach((r, i) => { if (r.total) sh.getRange(3 + i, 1, 1, W).setFontWeight('bold'); });
  }
  sh.setFrozenRows(2); sh.setFrozenColumns(2);
  [95, 190, 90, 100, 100, 60, 60, 60, 60, 50, 60, 55, 70, 50, 50, 50, 60, 55, 280].forEach((w, i) => sh.setColumnWidth(i + 1, w));

  // ---------- KPI ----------
  const kn = 'KPI ' + m;
  let ks = ss.getSheetByName(kn);
  if (ks) ks.clear(); else ks = ss.insertSheet(kn);
  const LT = TC.LEAVE_TYPES, types = Object.keys(LT);
  ks.getRange(1, 1).setValue('สรุปการทำงาน เดือน' + TH_MF[mo - 1] + ' ' + (y + 543) + ' · ' + S.company).setFontSize(14).setFontWeight('bold');
  ks.getRange(2, 1).setValue('นับถึงวันที่ ' + now.date + ' · อัปเดต ' + now.iso.replace('T', ' ') + ' · สาย/กลับก่อนเทียบกับเวลางานของแต่ละคนในแต่ละวัน').setFontColor('#6b625a');
  const kh = ['รหัส', 'ชื่อ', 'ตำแหน่ง', 'เวลางาน', 'แจ้งเตือน', 'วันทำงาน', 'มาทำงาน', 'ขาด (วัน)', 'มาสาย (ครั้ง)', 'สายรวม (นาที)', 'กลับก่อน (ครั้ง)', 'กลับก่อนรวม (นาที)', 'ลืมบันทึก']
    .concat(types.map(t => LT[t] + ' (วัน)')).concat(['ชั่วโมงในออฟฟิศ', 'ตรงเวลา (%)', 'มาทำงาน (%)']);
  const alertText = t => [t.lateDays ? 'สาย ' + t.lateDays : '', t.earlyDays ? 'กลับก่อน ' + t.earlyDays : '', t.noOut ? 'ลืมบันทึก ' + t.noOut : '', t.absent ? 'ขาด ' + t.absent : ''].filter(String).join(' · ') || 'ปกติ';
  const kr = rep.map(r => [r.emp.code, r.emp.name, r.emp.position, TC.util.scheduleText(r.emp, S), alertText(r.t), r.t.workdays, r.t.present, r.t.absent, r.t.lateDays, r.t.lateMin, r.t.earlyDays, r.t.earlyMin, r.t.noOut]
    .concat(types.map(t => r.t.leave[t] || 0)).concat([r.t.hours, r.t.onTimeRate === null ? '' : r.t.onTimeRate, r.t.attendRate === null ? '' : r.t.attendRate]));
  head_(ks.getRange(4, 1, 1, kh.length).setValues([kh]));
  if (kr.length) {
    ks.getRange(5, 1, kr.length, 1).setNumberFormat('@');
    ks.getRange(5, 1, kr.length, kh.length).setValues(kr);
    ks.getRange(5, 5, kr.length, 1).setBackgrounds(kr.map(r => [r[4] === 'ปกติ' ? '#dff1e7' : '#fbead6']));
  }
  ks.setColumnWidth(1, 90); ks.setColumnWidth(2, 180); ks.setColumnWidth(3, 120); ks.setColumnWidth(4, 230); ks.setColumnWidth(5, 220);
  return ss.getUrl() + '#gid=' + sh.getSheetId();
}
function head_(rg) { rg.setFontWeight('bold').setBackground('#8B0000').setFontColor('#ffffff').setWrap(true); }

/* ===================== core logic (เหมือนกับ assets/core.js) ===================== */

/* =====================================================================
 * TESR Time Clock — core logic
 * ใช้ไฟล์เดียวกันทั้งใน Google Apps Script (หลังบ้านจริง) และโหมดทดลองในเบราว์เซอร์
 * ทุกคำสั่งผ่าน TC.handle(adapter, params) — adapter คือที่เก็บข้อมูล (Google Sheet หรือ localStorage)
 * ===================================================================== */
var TC = (function () {
  var TABLES = {
    EMP: { name: 'Employees', cols: ['id', 'code', 'name', 'gender', 'email', 'phone', 'position', 'photo', 'active', 'username', 'passHash', 'qPersonal', 'qSick', 'qVacation', 'qMaternity', 'note', 'shiftStart', 'shiftEnd', 'workdays', 'satStart', 'satEnd', 'dayTimes'] },
    REC: { name: 'Records', cols: ['date', 'empId', 'code', 'name', 'in', 'out', 'lateMin', 'inDist', 'outDist', 'note', 'updatedAt'] },
    LEAVE: { name: 'Leaves', cols: ['id', 'empId', 'code', 'name', 'type', 'start', 'end', 'part', 'days', 'reason', 'status', 'createdAt', 'decidedAt', 'decidedBy', 'adminNote'] },
    ADJ: { name: 'Adjustments', cols: ['id', 'empId', 'code', 'name', 'date', 'in', 'out', 'reason', 'status', 'createdAt', 'decidedAt', 'decidedBy', 'adminNote'] },
    HOL: { name: 'Holidays', cols: ['date', 'name'] }
  };
  var LEAVE_TYPES = { personal: 'ลากิจ', sick: 'ลาป่วย', vacation: 'ลาพักร้อน', maternity: 'ลาคลอด', unpaid: 'ลาไม่รับค่าจ้าง' };
  var QUOTA = { personal: 'qPersonal', sick: 'qSick', vacation: 'qVacation', maternity: 'qMaternity' };
  var PART = { full: 'เต็มวัน', am: 'ครึ่งวันเช้า', pm: 'ครึ่งวันบ่าย' };
  var STATUS = { pending: 'รออนุมัติ', approved: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' };
  var DEFAULTS = {
    company: 'TESR Co., Ltd.', office: 'TESR Play Ground', lat: '13.8621', lng: '100.5144', radius: '1000',
    start: '09:00', end: '18:00', grace: '0', workdays: '1,2,3,4,5', appUrl: '',
    qPersonal: '7', qSick: '30', qVacation: '6', qMaternity: '0',
    adminUser: 'admin', adminHash: '', adminPassword: ''
  };
  var DEFAULT_ADMIN_PASSWORD = 'tesr1234';
  var ADJ_WINDOW = 60; // ขอแก้เวลาย้อนหลังได้ไม่เกิน 60 วัน
  var PUBLIC_SETTINGS = ['company', 'office', 'lat', 'lng', 'radius', 'start', 'end', 'grace', 'workdays', 'appUrl', 'qPersonal', 'qSick', 'qVacation', 'qMaternity'];
  var WRITES = {
    login: 1, register: 1, punch: 1, photo: 1, changePassword: 1, leaveCreate: 1, leaveCancel: 1, adjCreate: 1,
    decide: 1, saveEmp: 1, delEmp: 1, resetLogin: 1, importEmps: 1, saveHoliday: 1, delHoliday: 1,
    saveSettings: 1, changeAdmin: 1, editRecord: 1, buildMonth: 1
  };

  /* ---------- small helpers (pure) ---------- */
  function E(msg, code) { var e = new Error(msg); e.code = code || ''; return e; }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toMin(t) { if (!t) return 0; var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
  function num(v, d) { if (v === '' || v === null || v === undefined) return d; var n = Number(v); return isFinite(n) ? n : d; }
  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function digits(v) { return str(v).replace(/\D/g, ''); }
  function parse(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function ymd(d) { return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function dow(s) { return parse(s).getUTCDay(); }
  function addDays(s, n) { var d = parse(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function range(a, b) { var out = []; if (!isDate(a) || !isDate(b)) return out; for (var d = a; d <= b && out.length < 400; d = addDays(d, 1)) out.push(d); return out; }
  function monthDays(m) { var p = m.split('-'); var n = new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); var out = []; for (var i = 1; i <= n; i++) out.push(m + '-' + pad(i)); return out; }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function isTime(s) { return /^\d{2}:\d{2}$/.test(s || ''); }
  function isMonth(s) { return /^\d{4}-\d{2}$/.test(s || ''); }
  function haversine(a, b, c, d) {
    var R = 6371000, t = function (x) { return x * Math.PI / 180; }, dl = t(c - a), dg = t(d - b);
    var h = Math.pow(Math.sin(dl / 2), 2) + Math.cos(t(a)) * Math.cos(t(c)) * Math.pow(Math.sin(dg / 2), 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(2) + ' กม.' : Math.round(m) + ' ม.'; }
  function lateOf(t, S) { return t ? Math.max(0, toMin(t) - toMin(S.start) - (S.grace || 0)) : 0; }
  /** เวลางานรายคน (ว่าง = ใช้ของบริษัท) · วันเสาร์ใช้ satStart/satEnd ถ้าตั้งไว้ */
  function shiftOf(e, S, date) {
    var st = isTime(e && e.shiftStart) ? e.shiftStart : S.start, en = isTime(e && e.shiftEnd) ? e.shiftEnd : S.end;
    if (date && dow(date) === 6) { if (isTime(e && e.satStart)) st = e.satStart; if (isTime(e && e.satEnd)) en = e.satEnd; }
    if (date) { var dt = parseDayTimes(e && e.dayTimes)[dow(date)]; if (dt) { st = dt.start; en = dt.end; } }
    return { start: st, end: en, grace: S.grace };
  }
  /** เวลางานเฉพาะบางวัน เช่น "3=09:20-12:20" (วันพุธเลิกเที่ยง) · หลายวันคั่นด้วย ; */
  function parseDayTimes(v) {
    var out = {};
    str(v).split(/[;\n]+/).forEach(function (part) {
      var m = part.trim().match(/^([0-6])\s*=\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!m) return;
      var a = m[2].length === 4 ? '0' + m[2] : m[2], b = m[3].length === 4 ? '0' + m[3] : m[3];
      if (isTime(a) && isTime(b) && b > a) out[+m[1]] = { start: a, end: b };
    });
    return out;
  }
  function dayTimesText(map) { return Object.keys(map).sort().map(function (d) { return d + '=' + map[d].start + '-' + map[d].end; }).join(';'); }
  var SAMPLE_DAY = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  /** วันทำงานรายคน (ว่าง = ใช้ของบริษัท) */
  function parseDays(v) {
    var s = str(v); if (!s) return null;
    var m = s.match(/^([0-6])\s*-\s*([0-6])$/), out = [];
    if (m) { for (var i = +m[1]; ; i = (i + 1) % 7) { out.push(i); if (i === +m[2] || out.length > 7) break; } }
    else s.replace(/[0-6]/g, function (d) { if (out.indexOf(+d) < 0) out.push(+d); return d; });
    return out.length ? out.sort() : null;
  }
  function daysOf(e, S) { return parseDays(e && e.workdays) || S.workdays; }
  var TH_DAY = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  function daysText(list) {
    var order = [1, 2, 3, 4, 5, 6, 0], idx = list.map(function (d) { return order.indexOf(d); }).sort(function (a, b) { return a - b; });
    var run = idx.every(function (v, i) { return i === 0 || v === idx[i - 1] + 1; });
    if (run && idx.length > 2) return TH_DAY[order[idx[0]]] + '–' + TH_DAY[order[idx[idx.length - 1]]];
    return idx.map(function (i) { return TH_DAY[order[i]]; }).join(' ');
  }
  function scheduleText(e, S) {
    var d = daysOf(e, S), sh = shiftOf(e, S);
    var t = daysText(d) + ' ' + sh.start + '–' + sh.end;
    [1, 2, 3, 4, 5, 6, 0].forEach(function (k) {
      if (d.indexOf(k) < 0) return;
      var x = shiftOf(e, S, SAMPLE_DAY[k]);
      if (x.start !== sh.start || x.end !== sh.end) t += ' · ' + TH_DAY[k] + ' ' + x.start + '–' + x.end;
    });
    return t;
  }
  function customSchedule(e) { return !!(str(e.shiftStart) || str(e.shiftEnd) || str(e.workdays) || str(e.satStart) || str(e.satEnd) || str(e.dayTimes)); }
  function overlaps(a1, a2, b1, b2) { return a1 <= b2 && b1 <= a2; }

  /* ---------- settings ---------- */
  function settings(A) {
    var raw = A.getSettings(), s = {};
    for (var k in DEFAULTS) s[k] = (raw[k] !== undefined && str(raw[k]) !== '') ? str(raw[k]) : DEFAULTS[k];
    s.lat = num(s.lat, 0); s.lng = num(s.lng, 0); s.radius = num(s.radius, 1000); s.grace = num(s.grace, 0);
    s.workdays = String(s.workdays).split(',').filter(function (x) { return x !== ''; }).map(Number);
    ['qPersonal', 'qSick', 'qVacation', 'qMaternity'].forEach(function (k) { s[k] = num(s[k], 0); });
    return s;
  }
  function pubSettings(S) { var o = {}; PUBLIC_SETTINGS.forEach(function (k) { o[k] = S[k]; }); return o; }

  /* ---------- data access ---------- */
  function emps(A) { return A.rows(TABLES.EMP); }
  function isActive(e) { return String(e.active).toUpperCase() !== 'FALSE'; }
  function pubEmp(e) { return { id: e.id, code: e.code, name: e.name, gender: e.gender, position: e.position, photo: e.photo, email: e.email, phone: e.phone, shiftStart: e.shiftStart || '', shiftEnd: e.shiftEnd || '', workdays: e.workdays || '', satStart: e.satStart || '', satEnd: e.satEnd || '', dayTimes: e.dayTimes || '' }; }
  function recObj(r) { return { date: r.date, empId: r.empId, in: r.in, out: r.out, lateMin: num(r.lateMin, 0), inDist: num(r.inDist, null), outDist: num(r.outDist, null), note: r.note || '' }; }
  function leaveObj(l) { return { id: l.id, empId: l.empId, code: l.code, name: l.name, type: l.type, start: l.start, end: l.end, part: l.part || 'full', days: num(l.days, 0), reason: l.reason, status: l.status, createdAt: l.createdAt, decidedAt: l.decidedAt, adminNote: l.adminNote || '' }; }
  function adjObj(a) { return { id: a.id, empId: a.empId, code: a.code, name: a.name, date: a.date, in: a.in, out: a.out, reason: a.reason, status: a.status, createdAt: a.createdAt, decidedAt: a.decidedAt, adminNote: a.adminNote || '' }; }
  function holidays(A) { return A.rows(TABLES.HOL).filter(function (h) { return isDate(h.date); }).map(function (h) { return { date: h.date, name: h.name }; }); }
  function holMap(A) { var m = {}; holidays(A).forEach(function (h) { m[h.date] = h.name || 'วันหยุด'; }); return m; }
  function isWork(c, e, d) { if (!c._hol) c._hol = holMap(c.A); return daysOf(e, c.S).indexOf(dow(d)) >= 0 && !c._hol[d]; }
  function leaveDays(c, e, start, end, part) {
    if (part !== 'full') return isWork(c, e, start) ? 0.5 : 0;
    return range(start, end).filter(function (d) { return isWork(c, e, d); }).length;
  }
  function quotaOf(e, S, type) { var col = QUOTA[type]; return col ? num(e[col], S[col]) : null; }
  function usage(c, e, year) {
    var out = {};
    Object.keys(LEAVE_TYPES).forEach(function (t) { out[t] = { label: LEAVE_TYPES[t], quota: quotaOf(e, c.S, t), used: 0, pending: 0 }; });
    c.A.rows(TABLES.LEAVE).forEach(function (l) {
      if (l.empId !== e.id || String(l.start).slice(0, 4) !== String(year) || !out[l.type]) return;
      if (l.status === 'approved') out[l.type].used += num(l.days, 0);
      if (l.status === 'pending') out[l.type].pending += num(l.days, 0);
    });
    Object.keys(out).forEach(function (t) { var u = out[t]; u.left = u.quota === null ? null : u.quota - u.used; });
    return out;
  }
  function stamp(e) { return { empId: e.id, code: e.code, name: e.name }; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  /* ---------- auth ---------- */
  function ver(A, h) { return A.hmac('v|' + (h || '')).slice(0, 8); }
  function sign(c, role, id, v, hours) {
    var p = [role, id, v, c.now.ms + hours * 3600000].join('.');
    return p + '.' + c.A.hmac(p);
  }
  function verify(c, tok) {
    var parts = str(tok).split('.');
    if (parts.length !== 5) return null;
    var p = parts.slice(0, 4).join('.');
    if (c.A.hmac(p) !== parts[4] || +parts[3] < c.now.ms) return null;
    if (parts[0] === 'admin') return parts[2] === ver(c.A, c.S.adminHash) ? { role: 'admin', id: 'admin' } : null;
    var e = emps(c.A).filter(function (x) { return x.id === parts[1]; })[0];
    if (!e || !isActive(e) || parts[2] !== ver(c.A, e.passHash)) return null;
    return { role: 'emp', id: e.id, emp: e };
  }
  function hashPw(A, pw) { var salt = A.uuid(); return salt + '$' + A.sha256(salt + '|' + pw); }
  function checkPw(A, stored, pw) { var s = str(stored), i = s.indexOf('$'); return i > 0 && A.sha256(s.slice(0, i) + '|' + pw) === s.slice(i + 1); }
  function validUser(u) { if (!/^[a-z0-9._@+-]{3,60}$/.test(u)) throw E('ชื่อผู้ใช้ต้องเป็นอีเมล หรือ a-z, 0-9, . _ - ยาว 3–60 ตัว'); }
  /** รหัสผ่านพนักงาน: ถ้ายังไม่เคยตั้งเอง ใช้เบอร์โทรที่บันทึกไว้ (ใส่ขีดหรือเว้นวรรคได้) */
  function empPwOk(A, e, pw) {
    if (e.passHash) return checkPw(A, e.passHash, pw);
    var ph = digits(e.phone); return ph.length >= 9 && digits(pw) === ph;
  }
  function emailOf(e) { return str(e.email).toLowerCase(); }
  function validPw(pw) { if (String(pw).length < 6) throw E('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร'); }
  function throttle(c, key) {
    var n = num(c.A.cacheGet(key), 0);
    if (n >= 5) throw E('ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่');
    return function () { c.A.cachePut(key, String(n + 1), 900); };
  }
  function qrToken(c, date) { return c.A.hmac('qr|' + date).slice(0, 12); }

  /* =================== public actions =================== */
  function login(c) {
    var u = str(c.p.username).toLowerCase(), pw = String(c.p.password || '');
    if (!u || !pw) throw E('กรอกชื่อผู้ใช้และรหัสผ่าน');
    var fail = throttle(c, 'fail:' + u);
    if (c.p.as === 'admin') {
      var ok = u === str(c.S.adminUser).toLowerCase() && (c.S.adminHash ? checkPw(c.A, c.S.adminHash, pw) : pw === DEFAULT_ADMIN_PASSWORD);
      if (!ok) { fail(); throw E('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'); }
      return { role: 'admin', token: sign(c, 'admin', 'admin', ver(c.A, c.S.adminHash), 12), mustChange: !c.S.adminHash, name: c.S.adminUser };
    }
    var e = emps(c.A).filter(function (x) { return isActive(x) && emailOf(x) === u; })[0];
    if (!e || !empPwOk(c.A, e, pw)) { fail(); throw E('อีเมลหรือรหัสผ่านไม่ถูกต้อง'); }
    return { role: 'emp', token: sign(c, 'emp', e.id, ver(c.A, e.passHash), 24 * 60), emp: pubEmp(e) };
  }


  /* =================== employee actions =================== */
  function myEmp(c) { return c.sess.emp; }
  function todayRec(c, empId) {
    var r = c.A.rows(TABLES.REC).filter(function (x) { return x.empId === empId && x.date === c.now.date; })[0];
    return r ? recObj(r) : null;
  }
  function me(c) {
    var e = myEmp(c);
    return {
      emp: pubEmp(e), username: emailOf(e), customPw: !!e.passHash, settings: pubSettings(c.S), today: c.now.date, now: c.now.time,
      shiftToday: shiftOf(e, c.S, c.now.date), workToday: isWork(c, e, c.now.date), schedule: scheduleText(e, c.S),
      rec: todayRec(c, e.id), usage: usage(c, e, c.now.date.slice(0, 4)),
      pending: c.A.rows(TABLES.LEAVE).filter(function (l) { return l.empId === e.id && l.status === 'pending'; }).length +
        c.A.rows(TABLES.ADJ).filter(function (a) { return a.empId === e.id && a.status === 'pending'; }).length
    };
  }
  function myMonth(c) {
    var e = myEmp(c), m = str(c.p.month);
    if (!isMonth(m)) throw E('เดือนไม่ถูกต้อง');
    var data = monthData(c, m, [e]);
    data.report = monthReport(m, [e], data.records, data.leaves, data.holidays, c.S, c.now.date)[0];
    data.adjustments = c.A.rows(TABLES.ADJ).filter(function (a) { return a.empId === e.id && String(a.date).indexOf(m) === 0; }).map(adjObj);
    return data;
  }
  function punch(c) {
    var e = myEmp(c), S = c.S, date = c.now.date, time = c.now.time;
    if (str(c.p.token2) !== qrToken(c, date)) throw E('QR Code ไม่ถูกต้องหรือหมดอายุ (ใช้ได้เฉพาะ QR ของวันนี้)');
    var lat = Number(c.p.lat), lng = Number(c.p.lng);
    if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) throw E('ไม่ได้รับพิกัด GPS จากมือถือ');
    var dist = Math.round(haversine(lat, lng, S.lat, S.lng));
    if (dist > S.radius) throw E('อยู่ห่างออฟฟิศ ' + fmtDist(dist) + ' เกินรัศมีที่อนุญาต ' + fmtDist(S.radius));
    var r = c.A.rows(TABLES.REC).filter(function (x) { return x.empId === e.id && x.date === date; })[0];
    if (r) {
      if (r.out) throw E('วันนี้ลงเวลาเข้า–ออกครบแล้ว');
      c.A.update(TABLES.REC, r, { out: time, outDist: String(dist), updatedAt: c.now.iso });
      return { kind: 'out', rec: recObj(merge(r, { out: time, outDist: dist })) };
    }
    var rec = merge(stamp(e), { date: date, in: time, out: '', lateMin: String(lateOf(time, shiftOf(e, S, date))), inDist: String(dist), outDist: '', note: '', updatedAt: c.now.iso });
    c.A.insert(TABLES.REC, rec);
    return { kind: 'in', rec: recObj(rec) };
  }
  function photo(c) {
    var e = myEmp(c), m = String(c.p.data || '').match(/^data:(image\/\w+);base64,(.+)$/);
    if (!m) throw E('ไฟล์รูปไม่ถูกต้อง');
    if (m[2].length > 900000) throw E('รูปใหญ่เกินไป');
    var url = c.A.savePhoto(e, m[1], m[2], c.p.data);
    c.A.update(TABLES.EMP, e, { photo: url });
    return { url: url };
  }
  function changePassword(c) {
    var e = myEmp(c);
    if (!empPwOk(c.A, e, String(c.p.old || ''))) throw E('รหัสผ่านเดิมไม่ถูกต้อง');
    validPw(c.p.password);
    var h = hashPw(c.A, String(c.p.password));
    c.A.update(TABLES.EMP, e, { passHash: h });
    return { token: sign(c, 'emp', e.id, ver(c.A, h), 24 * 60) };
  }
  function leaveCreate(c) {
    var e = myEmp(c), type = str(c.p.type), start = str(c.p.start), end = str(c.p.end) || start, part = str(c.p.part) || 'full', reason = str(c.p.reason);
    if (!LEAVE_TYPES[type]) throw E('เลือกประเภทการลา');
    if (!isDate(start) || !isDate(end) || end < start) throw E('ช่วงวันที่ไม่ถูกต้อง');
    if (!PART[part]) throw E('เลือกเต็มวันหรือครึ่งวัน');
    if (part !== 'full' && end !== start) throw E('ลาครึ่งวันได้ทีละ 1 วัน');
    if (reason.length < 2) throw E('กรุณาระบุเหตุผลการลา');
    if (start < addDays(c.now.date, -30)) throw E('ยื่นลาย้อนหลังได้ไม่เกิน 30 วัน');
    if (range(start, end).length > 120) throw E('ช่วงลายาวเกินไป');
    var days = leaveDays(c, e, start, end, part);
    if (!days) throw E('ช่วงวันที่เลือกไม่มีวันทำงาน');
    var clash = c.A.rows(TABLES.LEAVE).filter(function (l) {
      return l.empId === e.id && (l.status === 'pending' || l.status === 'approved') && overlaps(start, end, l.start, l.end) &&
        !(part !== 'full' && l.part !== 'full' && l.part !== part && start === l.start);
    })[0];
    if (clash) throw E('มีใบลาช่วงนี้อยู่แล้ว (' + LEAVE_TYPES[clash.type] + ' ' + clash.start + ')');
    var u = usage(c, e, start.slice(0, 4))[type];
    if (u.quota !== null && type !== 'sick' && u.used + u.pending + days > u.quota)
      throw E(u.label + ' เหลือ ' + Math.max(0, u.quota - u.used - u.pending) + ' วัน (รวมที่รออนุมัติ) ไม่พอสำหรับ ' + days + ' วัน');
    var l = merge(stamp(e), { id: 'L' + c.A.uuid(), type: type, start: start, end: end, part: part, days: String(days), reason: reason, status: 'pending', createdAt: c.now.iso, decidedAt: '', decidedBy: '', adminNote: '' });
    c.A.insert(TABLES.LEAVE, l);
    return leaveObj(l);
  }
  function leaveCancel(c) {
    var e = myEmp(c), l = c.A.rows(TABLES.LEAVE).filter(function (x) { return x.id === str(c.p.id) && x.empId === e.id; })[0];
    if (!l) throw E('ไม่พบใบลา');
    if (l.status === 'approved' && l.start <= c.now.date) throw E('ใบลาที่อนุมัติแล้วและเริ่มไปแล้วยกเลิกเองไม่ได้ ติดต่อแอดมิน');
    if (l.status !== 'pending' && l.status !== 'approved') throw E('ใบลานี้ยกเลิกไม่ได้');
    c.A.update(TABLES.LEAVE, l, { status: 'cancelled', decidedAt: c.now.iso, decidedBy: 'employee' });
    return true;
  }
  function adjCreate(c) {
    var e = myEmp(c), date = str(c.p.date), tin = str(c.p.in), tout = str(c.p.out), reason = str(c.p.reason);
    if (!isDate(date) || date > c.now.date) throw E('เลือกวันที่ที่ผ่านมาแล้วหรือวันนี้');
    if (date < addDays(c.now.date, -ADJ_WINDOW)) throw E('ขอแก้เวลาได้ย้อนหลังไม่เกิน ' + ADJ_WINDOW + ' วัน');
    if ((tin && !isTime(tin)) || (tout && !isTime(tout)) || (!tin && !tout)) throw E('ระบุเวลาเข้าและ/หรือเวลาออกที่ถูกต้อง');
    if (tin && tout && tout <= tin) throw E('เวลาออกต้องหลังเวลาเข้า');
    if (reason.length < 2) throw E('กรุณาระบุเหตุผล');
    if (c.A.rows(TABLES.ADJ).some(function (a) { return a.empId === e.id && a.date === date && a.status === 'pending'; })) throw E('มีคำขอแก้เวลาของวันนี้รออนุมัติอยู่แล้ว');
    var a = merge(stamp(e), { id: 'A' + c.A.uuid(), date: date, in: tin, out: tout, reason: reason, status: 'pending', createdAt: c.now.iso, decidedAt: '', decidedBy: '', adminNote: '' });
    c.A.insert(TABLES.ADJ, a);
    return adjObj(a);
  }
  function myRequests(c) {
    var e = myEmp(c);
    var lv = c.A.rows(TABLES.LEAVE).filter(function (l) { return l.empId === e.id; }).map(leaveObj);
    var aj = c.A.rows(TABLES.ADJ).filter(function (a) { return a.empId === e.id; }).map(adjObj);
    var by = function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); };
    return { leaves: lv.sort(by).slice(0, 60), adjustments: aj.sort(by).slice(0, 60), usage: usage(c, e, c.now.date.slice(0, 4)) };
  }

  /* =================== admin actions =================== */
  function monthData(c, m, list) {
    var ids = {}; list.forEach(function (e) { ids[e.id] = 1; });
    var mStart = m + '-01', mEnd = monthDays(m).slice(-1)[0];
    return {
      month: m, today: c.now.date, settings: pubSettings(c.S),
      employees: list.map(pubEmp),
      records: c.A.rows(TABLES.REC).filter(function (r) { return ids[r.empId] && String(r.date).indexOf(m) === 0; }).map(recObj),
      leaves: c.A.rows(TABLES.LEAVE).filter(function (l) { return ids[l.empId] && (l.status === 'approved' || l.status === 'pending') && overlaps(l.start, l.end, mStart, mEnd); }).map(leaveObj),
      holidays: holidays(c.A).filter(function (h) { return h.date.indexOf(m) === 0; })
    };
  }
  function employeesForMonth(c, m) {
    var has = {};
    c.A.rows(TABLES.REC).forEach(function (r) { if (String(r.date).indexOf(m) === 0) has[r.empId] = 1; });
    return emps(c.A).filter(function (e) { return isActive(e) || has[e.id]; });
  }
  function adminToday(c) {
    var list = emps(c.A).filter(isActive), d = c.now.date;
    var data = monthData(c, d.slice(0, 7), list);
    return {
      today: d, now: c.now.time, settings: pubSettings(c.S),
      employees: list.map(function (e) { var o = pubEmp(e); o.workToday = isWork(c, e, d); o.shiftToday = shiftOf(e, c.S, d); return o; }),
      records: data.records.filter(function (r) { return r.date === d; }),
      leaves: data.leaves.filter(function (l) { return l.start <= d && l.end >= d; }),
      holiday: (holMap(c.A))[d] || '',
      pending: pendingList(c)
    };
  }
  function adminMonth(c) {
    var m = str(c.p.month); if (!isMonth(m)) throw E('เดือนไม่ถูกต้อง');
    var list = employeesForMonth(c, m), data = monthData(c, m, list);
    data.report = monthReport(m, list, data.records, data.leaves, data.holidays, c.S, c.now.date);
    return data;
  }
  function pendingList(c) {
    var lv = c.A.rows(TABLES.LEAVE).filter(function (l) { return l.status === 'pending'; }).map(leaveObj);
    var aj = c.A.rows(TABLES.ADJ).filter(function (a) { return a.status === 'pending'; }).map(adjObj);
    return { leaves: lv, adjustments: aj };
  }
  function requests(c) {
    var all = str(c.p.filter) === 'all', list = emps(c.A), byId = {};
    list.forEach(function (e) { byId[e.id] = e; });
    var lv = c.A.rows(TABLES.LEAVE).filter(function (l) { return all || l.status === 'pending'; }).map(function (l) {
      var o = leaveObj(l), e = byId[l.empId];
      if (e) { var u = usage(c, e, String(l.start).slice(0, 4))[l.type]; o.quota = u ? { quota: u.quota, used: u.used, pending: u.pending } : null; o.photo = e.photo; }
      return o;
    });
    var aj = c.A.rows(TABLES.ADJ).filter(function (a) { return all || a.status === 'pending'; }).map(function (a) {
      var o = adjObj(a), r = c.A.rows(TABLES.REC).filter(function (x) { return x.empId === a.empId && x.date === a.date; })[0];
      o.current = r ? { in: r.in, out: r.out } : null; o.photo = byId[a.empId] ? byId[a.empId].photo : '';
      return o;
    });
    var by = function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); };
    return { leaves: lv.sort(by).slice(0, all ? 300 : 999), adjustments: aj.sort(by).slice(0, all ? 300 : 999) };
  }
  function upsertRecord(c, e, date, tin, tout, note) {
    var r = c.A.rows(TABLES.REC).filter(function (x) { return x.empId === e.id && x.date === date; })[0];
    var patch = { updatedAt: c.now.iso, note: note };
    if (tin) { patch.in = tin; patch.lateMin = String(lateOf(tin, shiftOf(e, c.S, date))); }
    if (tout) patch.out = tout;
    if (r) { c.A.update(TABLES.REC, r, patch); return; }
    if (!tin) throw E('วันนี้ยังไม่มีเวลาเข้างาน ต้องระบุเวลาเข้าด้วย');
    c.A.insert(TABLES.REC, merge(stamp(e), merge({ date: date, in: '', out: '', lateMin: '0', inDist: '', outDist: '', note: '' }, patch)));
  }
  function decide(c) {
    var kind = str(c.p.kind), id = str(c.p.id), dec = str(c.p.decision), note = str(c.p.note);
    if (dec !== 'approved' && dec !== 'rejected') throw E('ผลการพิจารณาไม่ถูกต้อง');
    var t = kind === 'leave' ? TABLES.LEAVE : kind === 'adj' ? TABLES.ADJ : null;
    if (!t) throw E('ประเภทคำขอไม่ถูกต้อง');
    var row = c.A.rows(t).filter(function (x) { return x.id === id; })[0];
    if (!row) throw E('ไม่พบคำขอ');
    if (row.status !== 'pending' && !(row.status === 'approved' && dec === 'rejected')) throw E('คำขอนี้ถูกพิจารณาไปแล้ว');
    if (kind === 'adj' && dec === 'approved') {
      var e = emps(c.A).filter(function (x) { return x.id === row.empId; })[0];
      if (!e) throw E('ไม่พบพนักงาน');
      upsertRecord(c, e, row.date, row.in, row.out, 'แก้เวลาตามคำขอ: ' + row.reason);
    }
    c.A.update(t, row, { status: dec, decidedAt: c.now.iso, decidedBy: 'admin', adminNote: note });
    return true;
  }
  function employees(c) {
    var y = c.now.date.slice(0, 4);
    return emps(c.A).map(function (e) {
      var o = pubEmp(e);
      o.active = isActive(e); o.username = emailOf(e); o.customPw = !!e.passHash;
      o.qPersonal = e.qPersonal; o.qSick = e.qSick; o.qVacation = e.qVacation; o.qMaternity = e.qMaternity; o.note = e.note || '';
      o.usage = usage(c, e, y);
      o.schedule = scheduleText(e, c.S); o.custom = customSchedule(e);
      return o;
    });
  }
  var EMP_FIELDS = ['code', 'name', 'gender', 'email', 'phone', 'position', 'qPersonal', 'qSick', 'qVacation', 'qMaternity', 'note', 'shiftStart', 'shiftEnd', 'workdays', 'satStart', 'satEnd', 'dayTimes'];
  function cleanEmp(src) {
    var o = {};
    EMP_FIELDS.forEach(function (k) { if (src[k] !== undefined) o[k] = str(src[k]); });
    if (o.phone !== undefined) o.phone = digits(o.phone);
    if (o.email !== undefined) { o.email = o.email.toLowerCase(); if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) throw E('อีเมลไม่ถูกต้อง: ' + o.email); }
    if (o.workdays !== undefined) { var wd = parseDays(o.workdays); o.workdays = wd ? wd.join(',') : ''; }
    if (o.dayTimes !== undefined) {
      var raw = o.dayTimes.split(/[;\n]+/).filter(function (x) { return x.trim(); }), parsed = parseDayTimes(o.dayTimes);
      if (raw.length !== Object.keys(parsed).length) throw E('เวลางานรายวันไม่ถูกต้อง ใช้รูปแบบ 3=09:20-12:20 (0=อาทิตย์ … 6=เสาร์)');
      o.dayTimes = dayTimesText(parsed);
    }
    ['shiftStart', 'shiftEnd', 'satStart', 'satEnd'].forEach(function (k) { if (o[k] === undefined) return; if (/^\d:\d\d$/.test(o[k])) o[k] = '0' + o[k]; if (o[k] && !isTime(o[k])) throw E('เวลางานต้องอยู่ในรูปแบบ HH:MM เช่น 09:20'); });
    if (o.shiftStart && o.shiftEnd && o.shiftEnd <= o.shiftStart) throw E('เวลาเลิกงานต้องหลังเวลาเข้างาน');
    if (o.satStart && o.satEnd && o.satEnd <= o.satStart) throw E('เวลาเลิกงานวันเสาร์ต้องหลังเวลาเข้างาน');
    return o;
  }
  function saveEmp(c) {
    var v = cleanEmp(c.p.emp || {}), id = str((c.p.emp || {}).id), list = emps(c.A);
    if (!v.code || !v.name) throw E('ต้องกรอกรหัสพนักงานและชื่อ');
    var dup = list.filter(function (e) { return isActive(e) && e.id !== id && str(e.code).toLowerCase() === v.code.toLowerCase(); })[0];
    if (dup) throw E('รหัสพนักงาน ' + v.code + ' ซ้ำกับ ' + dup.name);
    if (!v.email) throw E('ต้องกรอกอีเมล (ใช้เป็นชื่อผู้ใช้เข้าระบบ)');
    checkEmail(c, v.email, id);
    if (id) {
      var e = list.filter(function (x) { return x.id === id; })[0];
      if (!e) throw E('ไม่พบพนักงาน');
      c.A.update(TABLES.EMP, e, v); return { id: id };
    }
    var n = merge({ id: 'e' + c.A.uuid(), active: 'TRUE', photo: '', username: '', passHash: '' }, v);
    c.A.insert(TABLES.EMP, n); return { id: n.id };
  }
  function checkEmail(c, em, exceptId) {
    if (em === str(c.S.adminUser).toLowerCase()) throw E('อีเมล ' + em + ' ซ้ำกับบัญชีแอดมิน');
    var d = emps(c.A).filter(function (e) { return isActive(e) && e.id !== exceptId && emailOf(e) === em; })[0];
    if (d) throw E('อีเมล ' + em + ' ซ้ำกับ ' + d.name);
  }
  function importEmps(c) {
    var rows = c.p.rows || [], added = 0, updated = 0;
    rows.forEach(function (src) {
      var v = cleanEmp(src); if (!v.code || !v.name) return;
      var e = emps(c.A).filter(function (x) { return str(x.code).toLowerCase() === v.code.toLowerCase(); })[0];
      if (v.email) checkEmail(c, v.email, e ? e.id : '');
      if (e) { c.A.update(TABLES.EMP, e, merge(v, { active: 'TRUE' })); updated++; }
      else { c.A.insert(TABLES.EMP, merge({ id: 'e' + c.A.uuid(), active: 'TRUE', photo: '', username: '', passHash: '' }, v)); added++; }
    });
    return { added: added, updated: updated };
  }
  function findEmp(c, id) { var e = emps(c.A).filter(function (x) { return x.id === id; })[0]; if (!e) throw E('ไม่พบพนักงาน'); return e; }
  function delEmp(c) { c.A.update(TABLES.EMP, findEmp(c, str(c.p.id)), { active: 'FALSE' }); return true; }
  function restoreEmp(c) { c.A.update(TABLES.EMP, findEmp(c, str(c.p.id)), { active: 'TRUE' }); return true; }
  function resetLogin(c) { c.A.update(TABLES.EMP, findEmp(c, str(c.p.id)), { passHash: '' }); return true; }
  function listHolidays(c) { return holidays(c.A).sort(function (a, b) { return a.date.localeCompare(b.date); }); }
  function saveHoliday(c) {
    var list = c.p.items || [{ date: c.p.date, name: c.p.name }], n = 0;
    list.forEach(function (h) {
      var d = str(h.date), name = str(h.name) || 'วันหยุด';
      if (!isDate(d)) return;
      var ex = c.A.rows(TABLES.HOL).filter(function (x) { return x.date === d; })[0];
      if (ex) c.A.update(TABLES.HOL, ex, { name: name }); else c.A.insert(TABLES.HOL, { date: d, name: name });
      n++;
    });
    if (!n) throw E('วันที่ไม่ถูกต้อง');
    return listHolidays(c);
  }
  function delHoliday(c) {
    var ex = c.A.rows(TABLES.HOL).filter(function (x) { return x.date === str(c.p.date); })[0];
    if (ex) c.A.remove(TABLES.HOL, ex);
    return listHolidays(c);
  }
  function saveSettings(c) {
    var s = c.p.settings || {};
    PUBLIC_SETTINGS.forEach(function (k) { if (s[k] !== undefined) c.A.setSetting(k, Array.isArray(s[k]) ? s[k].join(',') : str(s[k])); });
    return pubSettings(settings(c.A));
  }
  function changeAdmin(c) {
    var old = String(c.p.old || ''), u = str(c.p.username || c.S.adminUser).toLowerCase(), pw = String(c.p.password || '');
    var okOld = c.S.adminHash ? checkPw(c.A, c.S.adminHash, old) : old === DEFAULT_ADMIN_PASSWORD;
    if (!okOld) throw E('รหัสผ่านเดิมไม่ถูกต้อง');
    validUser(u); validPw(pw);
    if (pw === DEFAULT_ADMIN_PASSWORD) throw E('ห้ามใช้รหัสผ่านเริ่มต้น');
    if (emps(c.A).some(function (e) { return isActive(e) && emailOf(e) === u; })) throw E('ชื่อผู้ใช้นี้ซ้ำกับอีเมลของพนักงาน');
    var h = hashPw(c.A, pw);
    c.A.setSetting('adminUser', u); c.A.setSetting('adminHash', h);
    return { token: sign(c, 'admin', 'admin', ver(c.A, h), 12), name: u };
  }
  function qr(c) {
    var d = c.now.date, t = qrToken(c, d), base = str(c.S.appUrl).replace(/[?#].*$/, '');
    return { date: d, token: t, payload: base ? base + '?t=' + t : 'TESR-ATTEND|' + d + '|' + t };
  }
  function editRecord(c) {
    var e = findEmp(c, str(c.p.empId)), date = str(c.p.date), tin = str(c.p.in), tout = str(c.p.out), note = str(c.p.note) || 'แก้ไขโดยแอดมิน';
    if (!isDate(date)) throw E('วันที่ไม่ถูกต้อง');
    if ((tin && !isTime(tin)) || (tout && !isTime(tout))) throw E('รูปแบบเวลาไม่ถูกต้อง');
    var r = c.A.rows(TABLES.REC).filter(function (x) { return x.empId === e.id && x.date === date; })[0];
    if (!tin && !tout) { if (r) c.A.remove(TABLES.REC, r); return true; }
    if (r && !tout) c.A.update(TABLES.REC, r, { out: '' });
    upsertRecord(c, e, date, tin, tout, note);
    return true;
  }
  function buildMonth(c) {
    var m = str(c.p.month); if (!isMonth(m)) throw E('เดือนไม่ถูกต้อง');
    var list = employeesForMonth(c, m), d = monthData(c, m, list);
    var rep = monthReport(m, list, d.records, d.leaves, d.holidays, c.S, c.now.date);
    return { url: c.A.buildMonthSheet ? c.A.buildMonthSheet(m, rep, c.S, c.now) : '' };
  }

  /* =================== monthly report (pure) =================== */
  /**
   * สถานะรายวัน: ok มา · late สาย · absent ขาด · leave ลาทั้งวัน · pending วันนี้ยังไม่เข้า
   *              holiday วันหยุดบริษัท · off วันหยุดประจำสัปดาห์ · future วันที่ยังมาไม่ถึง
   * ลาครึ่งวันเช้าที่อนุมัติแล้ว ไม่นับสายวันนั้น · ลาครึ่งวันแต่ไม่มาเลย นับขาด 0.5 วัน
   */
  function monthReport(m, empList, recs, lvs, hols, S, today) {
    var hm = {}; hols.forEach(function (h) { hm[h.date] = h.name || 'วันหยุด'; });
    var days = monthDays(m);
    return empList.map(function (e) {
      var rby = {}, lby = {};
      recs.forEach(function (r) { if (r.empId === e.id) rby[r.date] = r; });
      lvs.forEach(function (l) {
        if (l.empId !== e.id || (l.status !== 'approved' && l.status !== 'pending')) return;
        range(l.start, l.end).forEach(function (d) { if (d.indexOf(m) === 0 && (!lby[d] || l.status === 'approved')) lby[d] = l; });
      });
      var wdays = daysOf(e, S);
      var t = { workdays: 0, present: 0, lateDays: 0, lateMin: 0, earlyDays: 0, earlyMin: 0, absent: 0, noOut: 0, minutes: 0, leaveDays: 0, leaveToDate: 0, leave: {} };
      Object.keys(LEAVE_TYPES).forEach(function (k) { t.leave[k] = 0; });
      var list = days.map(function (d) {
        var work = wdays.indexOf(dow(d)) >= 0 && !hm[d];
        var r = rby[d] || null, l = lby[d] || null, la = l && l.status === 'approved' ? l : null, late = 0, st;
        var sh = shiftOf(e, S, d), early = 0, flags = [];
        if (la && work) { var amt = la.part === 'full' ? 1 : 0.5; t.leave[la.type] = (t.leave[la.type] || 0) + amt; t.leaveDays += amt; if (d <= today) t.leaveToDate += amt; }
        if (work && d <= today) t.workdays++;
        if (r) {
          t.present++;
          late = la && la.part === 'am' ? 0 : num(r.lateMin, 0);
          if (late > 0) { t.lateDays++; t.lateMin += late; flags.push('late'); }
          if (r.out) {
            t.minutes += Math.max(0, toMin(r.out) - toMin(r.in));
            early = la && la.part === 'pm' ? 0 : Math.max(0, toMin(sh.end) - toMin(r.out));
            if (early > 0) { t.earlyDays++; t.earlyMin += early; flags.push('early'); }
          } else if (d < today) { t.noOut++; flags.push('noOut'); }
          st = late > 0 ? 'late' : 'ok';
        } else if (!work) st = hm[d] ? 'holiday' : 'off';
        else if (la && la.part === 'full') st = 'leave';
        else if (d > today) st = 'future';
        else if (d === today) st = 'pending';
        else { st = 'absent'; t.absent += la ? 0.5 : 1; flags.push('absent'); }
        return { date: d, dow: dow(d), st: st, work: work, rec: r, leave: l, holiday: hm[d] || '', late: late, early: early, shift: work || r ? { start: sh.start, end: sh.end } : null, flags: flags };
      });
      t.hours = Math.round(t.minutes / 6) / 10;
      var due = t.workdays - t.leaveToDate;
      t.attendRate = due > 0 ? Math.round(Math.min(1, (due - t.absent) / due) * 100) : null;
      t.onTimeRate = t.present ? Math.round((t.present - t.lateDays) / t.present * 100) : null;
      t.alerts = t.lateDays + t.earlyDays + t.noOut + (t.absent > 0 ? Math.ceil(t.absent) : 0);
      return { emp: pubEmp(e), days: list, t: t };
    });
  }

  /* =================== รายงานรายเดือนแบบละเอียด (รูปแบบเดียวกับไฟล์ Export AllSum เดิม) =================== */
  /** ชั่วโมงงานมาตรฐานของวัน: ช่วงเวลางาน หักพักกลางวัน 1 ชม. เมื่อกะยาว 6 ชม.ขึ้นไป (09:00–18:00 = 8:00, 09:20–12:20 = 3:00) */
  function stdMinutes(sh) { var span = toMin(sh.end) - toMin(sh.start); return Math.max(0, span >= 360 ? span - 60 : span); }
  function hmm(m) { m = Math.round(m || 0); return m > 0 ? Math.floor(m / 60) + ':' + pad(m % 60) : ' - '; }
  var EXPORT_LEAVES = [['personal', 'ลากิจ'], ['sick', 'ลาป่วย'], ['vacation', 'ลาพักร้อน'], ['other', 'ลาอื่นๆ']];
  function exportTable(m, rep, S, today) {
    var p = m.split('-');
    var head1 = ['รหัสพนักงาน', 'ชื่อพนักงาน', 'วันที่', 'เวลาทำงาน', 'บันทึกเวลา', 'ชั่วโมง:นาที', '', '', '', 'จำนวน', '', 'จำนวนวันหยุด', '', '', 'จำนวนวันลา', '', '', '', 'หมายเหตุ'];
    var head2 = ['', '', '', '', '', 'ชม.งาน', 'มาสาย', 'กลับก่อน', 'ขาดงาน', 'ไม่มา', 'ลืมบันทึก', 'ประจำปี', 'ประจำสัปดาห์', 'ชดเชย', 'ลากิจ', 'ลาป่วย', 'ลาพักร้อน', 'ลาอื่นๆ', ''];
    var merges = [[0, 0, 1, 0], [0, 1, 1, 1], [0, 2, 1, 2], [0, 3, 1, 3], [0, 4, 1, 4], [0, 5, 0, 8], [0, 9, 0, 10], [0, 11, 0, 13], [0, 14, 0, 17], [0, 18, 1, 18]];
    var rows = [];
    rep.forEach(function (r) {
      var e = r.emp, T = { work: 0, late: 0, early: 0, miss: 0, absent: 0, forgot: 0, hol: 0, off: 0, comp: 0, lv: { personal: 0, sick: 0, vacation: 0, other: 0 } };
      r.days.forEach(function (x) {
        var sh = x.shift || shiftOf(e, S, x.date), std = stdMinutes(sh), rec = x.rec, la = x.leave && x.leave.status === 'approved' ? x.leave : null;
        var c = [e.code, e.name, x.date.slice(8) + '/' + p[1] + '/' + p[0], sh.start + ' ' + sh.end, rec ? (rec.in + (rec.out ? ' ' + rec.out : '')) : '', ' - ', ' - ', ' - ', ' - ', '-', '-', '-', '-', '-', '-', '-', '-', '-', ''];
        var notes = [];
        if (x.date <= today) {
          if (rec && rec.out) {
            var w = Math.max(0, (la && la.part !== 'full' ? std / 2 : std) - x.late - x.early);
            T.work += w; c[5] = hmm(w);
          }
          if (x.late) { T.late += x.late; c[6] = hmm(x.late); }
          if (x.early) { T.early += x.early; c[7] = hmm(x.early); }
          var miss = 0;
          if (x.st === 'absent') { miss = la ? std / 2 : std; T.absent += la ? 0.5 : 1; c[9] = la ? 0.5 : 1; }
          else if (rec && !rec.out && x.date < today) { miss = std; T.forgot++; c[10] = 1; notes.push('ลืมบันทึกเวลาออก'); }
          else miss = x.late + x.early;
          if (miss) { T.miss += miss; c[8] = hmm(miss); }
        }
        if (x.holiday) { if (/ชดเชย/.test(x.holiday)) { T.comp++; c[13] = 1; } else { T.hol++; c[11] = 1; } notes.push(x.holiday); }
        else if (!x.work && !rec) { T.off++; c[12] = 1; }
        if (la && x.work) {
          var k = la.type === 'personal' || la.type === 'sick' || la.type === 'vacation' ? la.type : 'other', amt = la.part === 'full' ? 1 : 0.5;
          T.lv[k] += amt; c[14 + ['personal', 'sick', 'vacation', 'other'].indexOf(k)] = amt;
          notes.push(LEAVE_TYPES[la.type] + (la.part !== 'full' ? ' (' + PART[la.part] + ')' : '') + (la.reason ? ': ' + la.reason : ''));
        } else if (x.leave && x.leave.status === 'pending') notes.push(LEAVE_TYPES[x.leave.type] + ' รออนุมัติ');
        if (rec && rec.note) notes.push(rec.note);
        c[18] = notes.join(' · ');
        rows.push({ cells: c, total: false, flags: x.flags || [], st: x.st, future: x.date > today });
      });
      var dash = function (v) { return v ? v : '-'; };
      rows.push({ total: true, cells: [e.code, e.name, '', '', 'ยอดรวม', hmm(T.work), hmm(T.late), hmm(T.early), hmm(T.miss), dash(T.absent), dash(T.forgot), dash(T.hol), dash(T.off), dash(T.comp), dash(T.lv.personal), dash(T.lv.sick), dash(T.lv.vacation), dash(T.lv.other),
        'ตรงเวลา ' + (r.t.onTimeRate === null ? '-' : r.t.onTimeRate + '%') + ' · มาทำงาน ' + (r.t.attendRate === null ? '-' : r.t.attendRate + '%')] });
    });
    return { head1: head1, head2: head2, merges: merges, rows: rows };
  }

  /* =================== router =================== */
  var PUBLIC = { login: login };
  var EMP = { me: me, myMonth: myMonth, punch: punch, photo: photo, changePassword: changePassword, leaveCreate: leaveCreate, leaveCancel: leaveCancel, adjCreate: adjCreate, myRequests: myRequests };
  var ADMIN = {
    adminToday: adminToday, adminMonth: adminMonth, requests: requests, decide: decide, employees: employees, saveEmp: saveEmp,
    importEmps: importEmps, delEmp: delEmp, restoreEmp: restoreEmp, resetLogin: resetLogin, holidays: listHolidays, saveHoliday: saveHoliday,
    delHoliday: delHoliday, saveSettings: saveSettings, changeAdmin: changeAdmin, qr: qr, editRecord: editRecord, buildMonth: buildMonth,
    settings: function (c) { return { settings: pubSettings(c.S), adminUser: c.S.adminUser, mustChange: !c.S.adminHash }; }
  };
  function run(A, p) {
    var c = { A: A, p: p, now: A.now() };
    c.S = settings(A);
    // เจ้าของชีตตั้งรหัสแอดมินได้ด้วยการพิมพ์ในชีต Settings แถว adminPassword → ระบบเข้ารหัสแล้วลบข้อความออกเอง
    var rawPw = str(A.getSettings().adminPassword);
    if (rawPw) { A.setSetting('adminHash', hashPw(A, rawPw)); A.setSetting('adminPassword', ''); c.S = settings(A); }
    if (PUBLIC[p.action]) return PUBLIC[p.action](c);
    var sess = verify(c, p.token);
    if (!sess) throw E('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 'AUTH');
    c.sess = sess;
    if (sess.role === 'emp' && EMP[p.action]) return EMP[p.action](c);
    if (sess.role === 'admin' && ADMIN[p.action]) return ADMIN[p.action](c);
    throw E('บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN');
  }
  function handle(A, p) {
    p = p || {};
    try {
      var data = WRITES[p.action] ? A.lock(function () { return run(A, p); }) : run(A, p);
      return { ok: true, data: data };
    } catch (e) {
      return { ok: false, error: e.message || String(e), code: e.code || '' };
    }
  }

  return {
    handle: handle, monthReport: monthReport, exportTable: exportTable, ADJ_WINDOW: ADJ_WINDOW, TABLES: TABLES, LEAVE_TYPES: LEAVE_TYPES, PART: PART, STATUS: STATUS,
    DEFAULTS: DEFAULTS, util: { monthDays: monthDays, dow: dow, addDays: addDays, range: range, toMin: toMin, haversine: haversine, fmtDist: fmtDist, lateOf: lateOf, shiftOf: shiftOf, daysOf: daysOf, parseDays: parseDays, daysText: daysText, scheduleText: scheduleText, parseDayTimes: parseDayTimes, dayTimesText: dayTimesText, customSchedule: customSchedule, isDate: isDate, isTime: isTime }
  };
})();
