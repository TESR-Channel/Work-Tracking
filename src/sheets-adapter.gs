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
/** GET = ปลุกเซิร์ฟเวอร์ + เตรียมแคชตารางไว้ล่วงหน้า (หน้าเว็บเรียกตอนเปิดหน้า ระหว่างที่ผู้ใช้กำลังพิมพ์รหัส) */
function doGet(e) {
  try { const A = SheetsAdapter_({ readOnly: true }); A.getSettings(); Object.keys(TC.TABLES).forEach(k => A.rows(TC.TABLES[k])); } catch (err) {}
  return json_({ ok: true, data: 'TESR Time Clock API' });
}
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return json_(TC.handle(SheetsAdapter_({ readOnly: !TC.WRITES[p.action] }), p));
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/* ===================== ติดตั้ง / เมนู / ตั้งเวลา ===================== */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(TC.TABLES).forEach(k => ensureTable_(TC.TABLES[k]));
  Object.keys(TC.TABLES).forEach(k => tcDrop_(TC.TABLES[k].name)); tcDrop_('Settings');
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
  try { cleanupSelfies_(); } catch (e) { console.error(e); }
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

/* ===================== แคชตาราง (ให้หน้าเว็บโหลดเร็วขึ้น) =====================
 * คำสั่งที่อ่านอย่างเดียว ใช้ข้อมูลตารางจาก CacheService (เร็วกว่าอ่านชีตมาก) นานสุด 5 นาที
 * ทุกครั้งที่ระบบเขียนข้อมูล หรือมีคนแก้ชีตด้วยมือ (onEdit) แคชของตารางนั้นจะถูกล้างทันที
 * คำสั่งที่เขียนข้อมูลอ่านจากชีตจริงเสมอ จึงไม่มีทางเขียนทับข้อมูลผิดแถว */
const TCACHE_TTL = 300, TCHUNK = 90000;
function tcGen_(sc, name) { let g = sc.get('g:' + name); if (!g) { g = Utilities.getUuid().slice(0, 8); sc.put('g:' + name, g, 21600); } return g; }
function tcDrop_(name) { try { CacheService.getScriptCache().put('g:' + name, Utilities.getUuid().slice(0, 8), 21600); } catch (e) {} }
function tcGet_(sc, name, g) {
  const meta = sc.get('tb:' + name + ':' + g); if (!meta) return null;
  const n = Number(meta), keys = []; for (let i = 0; i < n; i++) keys.push('tb:' + name + ':' + g + ':' + i);
  const got = sc.getAll(keys); let str = '';
  for (const k of keys) { if (got[k] == null) return null; str += got[k]; }
  try { return JSON.parse(str); } catch (e) { return null; }
}
function tcPut_(sc, name, g, data) {
  const str = JSON.stringify(data); if (str.length > 1500000) return;
  const n = Math.ceil(str.length / TCHUNK) || 1, parts = {};
  for (let i = 0; i < n; i++) parts['tb:' + name + ':' + g + ':' + i] = str.substr(i * TCHUNK, TCHUNK);
  if (sc.get('g:' + name) !== g) return; // มีการเขียนระหว่างที่อ่าน → ไม่เก็บ
  sc.putAll(parts, TCACHE_TTL); sc.put('tb:' + name + ':' + g, String(n), TCACHE_TTL);
}
/** แก้ชีตด้วยมือ → ล้างแคชของชีตนั้น */
function onEdit(e) { try { tcDrop_(e.range.getSheet().getName()); } catch (err) {} }

/* ===================== Sheets adapter ===================== */
function SheetsAdapter_(opts) {
  opts = opts || {};
  const ss = SpreadsheetApp.getActive();
  const cache = {};
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || 'tesr-time-clock';
  const sc = CacheService.getScriptCache();
  const useCache = !!opts.readOnly;
  let settingsMemo = null;
  function readSheet(t) {
    let sh = ss.getSheetByName(t.name);
    if (!sh) sh = ensureTable_(t);
    let v = sh.getDataRange().getValues(), head = v[0].map(String);
    if (t.cols.some(c => head.indexOf(c) < 0)) { ensureTable_(t); v = sh.getDataRange().getValues(); head = v[0].map(String); }
    const out = [];
    for (let i = 1; i < v.length; i++) {
      const o = { _row: i + 1 }; let any = false;
      head.forEach((k, j) => { if (!k) return; o[k] = norm_(v[i][j], k); if (o[k] !== '') any = true; });
      if (any) out.push(o);
    }
    return { sh, head, rows: out };
  }
  function load(t) {
    if (cache[t.name]) return cache[t.name];
    if (useCache) {
      const g = tcGen_(sc, t.name), hit = tcGet_(sc, t.name, g);
      if (hit) { cache[t.name] = { sh: null, head: hit.head, rows: hit.rows }; return cache[t.name]; }
      const d = readSheet(t);
      try { tcPut_(sc, t.name, g, { head: d.head, rows: d.rows }); } catch (e) {}
      return (cache[t.name] = d);
    }
    return (cache[t.name] = readSheet(t));
  }
  function sheetOf(t, d) { if (!d.sh) d.sh = ss.getSheetByName(t.name) || ensureTable_(t); return d.sh; }
  function writeRow(t, row, obj) {
    const d = load(t); tcDrop_(t.name);
    const vals = d.head.map(k => obj[k] === undefined || obj[k] === null ? '' : String(obj[k]));
    sheetOf(t, d).getRange(row, 1, 1, d.head.length).setNumberFormat('@').setValues([vals]);
  }
  return {
    rows: t => load(t).rows,
    insert(t, obj) { const d = load(t); const row = sheetOf(t, d).getLastRow() + 1; writeRow(t, row, obj); const o = Object.assign({ _row: row }, obj); d.rows.push(o); return o; },
    update(t, ref, patch) { load(t); Object.assign(ref, patch); writeRow(t, ref._row, ref); },
    remove(t, ref) { const d = load(t); tcDrop_(t.name); sheetOf(t, d).deleteRow(ref._row); delete cache[t.name]; },
    getSettings() {
      if (settingsMemo) return settingsMemo;
      if (useCache) { const g = tcGen_(sc, 'Settings'), hit = tcGet_(sc, 'Settings', g); if (hit) return (settingsMemo = hit); settingsMemo = readSettingsRaw_(); try { tcPut_(sc, 'Settings', g, settingsMemo); } catch (e) {} return settingsMemo; }
      return (settingsMemo = readSettingsRaw_());
    },
    setSetting(k, v) {
      settingsMemo = null; tcDrop_('Settings');
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
    /** เซลฟี่ตอนลงเวลา: เก็บแบบส่วนตัว (ไม่แชร์ลิงก์) แอดมินดูผ่าน API เท่านั้น */
    saveSelfie(emp, date, kind, b64) {
      const file = selfieFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', date + '_' + emp.code + '_' + kind + '.jpg'));
      return file.getId();
    },
    getSelfie(id) {
      let f; try { f = DriveApp.getFileById(id); } catch (e) { return ''; }
      if (f.isTrashed()) return '';
      const all = PropertiesService.getScriptProperties().getProperties(), ok = {};
      Object.keys(all).forEach(k => { if (k.indexOf('SELFIE_FOLDER') === 0) ok[all[k]] = 1; });
      const parents = f.getParents();
      let inside = false; while (parents.hasNext()) if (ok[parents.next().getId()]) inside = true;
      if (!inside) return '';
      return 'data:image/jpeg;base64,' + Utilities.base64Encode(f.getBlob().getBytes());
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
/** โฟลเดอร์เก็บรูป: ถ้าตั้ง "driveFolder" (ลิงก์หรือ ID) ในหน้าตั้งค่า จะสร้างโฟลเดอร์ย่อยไว้ในนั้น */
function subFolder_(propKey, name, fallbackName) {
  const props = PropertiesService.getScriptProperties();
  const m = String(readSettingsRaw_().driveFolder || '').match(/[-\w]{20,}/), parentId = m ? m[0] : '';
  const key = propKey + (parentId ? ':' + parentId : ''), id = props.getProperty(key);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  let f;
  if (parentId) {
    const parent = DriveApp.getFolderById(parentId), it = parent.getFoldersByName(name);
    f = it.hasNext() ? it.next() : parent.createFolder(name);
  } else f = DriveApp.createFolder(fallbackName);
  props.setProperty(key, f.getId());
  return f;
}
function photoFolder_() { return subFolder_('PHOTO_FOLDER', 'รูปโปรไฟล์', 'TESR Time Clock · Photos'); }
function selfieFolder_() { return subFolder_('SELFIE_FOLDER', 'เซลฟี่ลงเวลา (ส่วนตัว)', 'TESR Time Clock · Selfies (private)'); }
/** ลบเซลฟี่ที่เก่ากว่าจำนวนวันที่ตั้งไว้ (Settings: selfieDays · 0 = เก็บตลอด) */
function cleanupSelfies_() {
  const raw = readSettingsRaw_(), days = raw.selfieDays === undefined || raw.selfieDays === '' ? 90 : Number(raw.selfieDays);
  if (!(days > 0)) return 0;
  const cut = Date.now() - days * 86400000, it = selfieFolder_().getFiles();
  let n = 0;
  while (it.hasNext() && n < 400) { const f = it.next(); if (f.getDateCreated().getTime() < cut) { f.setTrashed(true); n++; } }
  return n;
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
