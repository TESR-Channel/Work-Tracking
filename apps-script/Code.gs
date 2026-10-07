/**
 * TESR Time Clock — Google Apps Script backend
 * ฐานข้อมูล = Google Sheet นี้
 *   Employees : รายชื่อพนักงาน
 *   Records   : บันทึกเข้า–ออกรายวัน (1 แถว = 1 คน 1 วัน)
 *   Settings  : ตั้งค่า (พิกัดออฟฟิศ รัศมี เวลาเข้างาน PIN แอดมิน)
 *   Holidays  : วันหยุดบริษัท (ไม่นับเป็นวันขาด)
 *   สรุป yyyy-MM : ชีตสรุปรายเดือน (สร้างอัตโนมัติทุกคืน)
 *
 * ติดตั้ง: รันฟังก์ชัน setup() 1 ครั้ง แล้ว Deploy เป็น Web app
 */

const TZ = 'Asia/Bangkok';
const S_EMP = 'Employees', S_REC = 'Records', S_SET = 'Settings', S_HOL = 'Holidays';
const EMP_H = ['id', 'code', 'name', 'position', 'photo', 'active'];
const REC_H = ['date', 'empId', 'code', 'name', 'in', 'out', 'lateMin', 'inDist', 'outDist', 'updatedAt'];
const DEFAULTS = {
  office: 'TESR HQ · นนทบุรี', lat: 13.8621, lng: 100.5144, radius: 1000,
  start: '08:30', end: '17:30', grace: 0, workdays: '1,2,3,4,5', appUrl: '', adminPin: '1234'
};
const TH_MF = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const TH_D = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];

/* ===================== ติดตั้ง ===================== */
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TZ);
  [[S_EMP, EMP_H], [S_REC, REC_H], [S_SET, ['key', 'value']], [S_HOL, ['date', 'name']]].forEach(([n, h]) => {
    const s = ensure_(n, h);
    s.getRange(1, 1, s.getMaxRows(), s.getMaxColumns()).setNumberFormat('@');
  });
  const set = sheet_(S_SET), cur = readSettings_();
  Object.keys(DEFAULTS).forEach(k => { if (!(k in cur)) set.appendRow([k, String(DEFAULTS[k])]); });
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SECRET')) props.setProperty('SECRET', Utilities.getUuid());
  installTriggers();
  SpreadsheetApp.getActive().toast('ติดตั้งเรียบร้อย · อย่าลืมเปลี่ยน adminPin ในชีต Settings', 'TESR Time Clock', 8);
}

function installTriggers() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'nightly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('nightly').timeBased().everyDays(1).atHour(23).nearMinute(30).create();
}

/** ทุกคืน: อัปเดตชีตสรุปเดือนนี้ และวันที่ 1 ปิดยอดเดือนก่อน */
function nightly() {
  const now = new Date();
  buildMonth_(fmt_(now, 'yyyy-MM'));
  if (Number(fmt_(now, 'd')) === 1) buildMonth_(fmt_(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM'));
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('TESR Time Clock')
    .addItem('อัปเดตสรุปเดือนนี้', 'menuThisMonth')
    .addItem('อัปเดตสรุปเดือนก่อน', 'menuLastMonth')
    .addSeparator()
    .addItem('ติดตั้ง / ซ่อมระบบ (setup)', 'setup')
    .addToUi();
}
function menuThisMonth() { buildMonth_(fmt_(new Date(), 'yyyy-MM')); }
function menuLastMonth() { const n = new Date(); buildMonth_(fmt_(new Date(n.getFullYear(), n.getMonth() - 1, 1), 'yyyy-MM')); }

/* ===================== Web API ===================== */
function doGet(e) { return out_(route_((e && e.parameter) || {})); }
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return out_(route_(p));
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route_(p) {
  try {
    const pub = { init: init_, my: my_, punch: punch_, photo: photo_ };
    if (pub[p.action]) return { ok: true, data: pub[p.action](p) };
    const adm = {
      login: () => true, today: today_, month: month_, saveEmp: saveEmp_, delEmp: delEmp_,
      saveSettings: saveSettings_, qr: qr_, buildMonth: q => ({ url: buildMonth_(q.month) })
    };
    if (adm[p.action]) {
      if (String(p.pin || '') !== String(readSettings_().adminPin)) throw new Error('รหัส PIN แอดมินไม่ถูกต้อง');
      return { ok: true, data: adm[p.action](p) };
    }
    throw new Error('ไม่รู้จักคำสั่ง: ' + p.action);
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ---------- public ---------- */
function init_() {
  return { settings: publicSettings_(), employees: employees_().map(pubEmp_), today: todayStr_(), now: fmt_(new Date(), 'HH:mm') };
}

function my_(p) {
  return records_().filter(r => r.empId === p.empId && r.date.indexOf(p.month) === 0);
}

function punch_(p) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const s = readSettings_();
    const emp = employees_().find(e => e.id === p.empId);
    if (!emp) throw new Error('ไม่พบพนักงานคนนี้ในระบบ');
    const date = todayStr_(), time = fmt_(new Date(), 'HH:mm');
    if (String(p.token || '') !== tokenFor_(date)) throw new Error('QR Code ไม่ถูกต้องหรือหมดอายุ (ใช้ได้เฉพาะ QR ของวันนี้)');
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) throw new Error('ไม่ได้รับพิกัด GPS จากมือถือ');
    const dist = Math.round(haversine_(lat, lng, s.lat, s.lng));
    if (dist > s.radius) throw new Error('อยู่ห่างออฟฟิศ ' + fmtDist_(dist) + ' เกินรัศมีที่อนุญาต ' + fmtDist_(s.radius));

    const sh = sheet_(S_REC), rows = sh.getDataRange().getValues();
    const stamp = new Date().toISOString();
    for (let i = 1; i < rows.length; i++) {
      if (normDate_(rows[i][0]) === date && String(rows[i][1]) === emp.id) {
        if (normTime_(rows[i][5])) throw new Error('วันนี้ลงเวลาเข้า–ออกครบแล้ว');
        sh.getRange(i + 1, 6).setNumberFormat('@').setValue(time);
        sh.getRange(i + 1, 9, 1, 2).setNumberFormat('@').setValues([[String(dist), stamp]]);
        const r = recObj_(rows[i]); r.out = time; r.outDist = dist;
        return { kind: 'out', rec: r };
      }
    }
    const late = lateMin_(time, s);
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, REC_H.length).setNumberFormat('@')
      .setValues([[date, emp.id, emp.code, emp.name, time, '', String(late), String(dist), '', stamp]]);
    return { kind: 'in', rec: { date: date, empId: emp.id, in: time, out: '', late: late, inDist: dist, outDist: null } };
  } finally {
    lock.releaseLock();
  }
}

function photo_(p) {
  const emp = employees_().find(e => e.id === p.empId);
  if (!emp) throw new Error('ไม่พบพนักงานคนนี้ในระบบ');
  const m = String(p.data || '').match(/^data:(image\/\w+);base64,(.+)$/);
  if (!m) throw new Error('ไฟล์รูปไม่ถูกต้อง');
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], emp.code + '.jpg');
  const folder = photoFolder_();
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const url = 'https://lh3.googleusercontent.com/d/' + file.getId();
  setEmpField_(emp.id, 'photo', url);
  return { url: url };
}

/* ---------- admin ---------- */
function today_() {
  const d = todayStr_();
  return { employees: employees_().map(pubEmp_), records: records_().filter(r => r.date === d), today: d };
}

function month_(p) {
  const m = p.month;
  const recs = records_().filter(r => r.date.indexOf(m) === 0);
  return { employees: employeesForMonth_(recs).map(pubEmp_), records: recs, workdays: workdays_(m), holidays: holidays_(m), today: todayStr_() };
}

function saveEmp_(p) {
  const e = p.emp || {};
  if (!e.name || !e.code) throw new Error('ต้องกรอกชื่อและรหัสพนักงาน');
  const sh = sheet_(S_EMP), rows = sh.getDataRange().getValues();
  if (e.id) {
    for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === e.id) {
      sh.getRange(i + 1, 2, 1, 3).setNumberFormat('@').setValues([[e.code, e.name, e.pos || '']]);
      return { id: e.id };
    }
  }
  if (rows.slice(1).some(r => String(r[1]) === e.code && String(r[5]) !== 'FALSE')) throw new Error('รหัสพนักงาน ' + e.code + ' มีอยู่แล้ว');
  const id = 'e' + Utilities.getUuid().slice(0, 8);
  sh.getRange(sh.getLastRow() + 1, 1, 1, EMP_H.length).setNumberFormat('@').setValues([[id, e.code, e.name, e.pos || '', '', 'TRUE']]);
  return { id: id };
}

/** ลบแบบเก็บประวัติไว้: ซ่อนจากรายชื่อ แต่ข้อมูลเดือนเก่ายังอยู่ */
function delEmp_(p) { setEmpField_(p.id, 'active', 'FALSE'); return true; }

function saveSettings_(p) {
  const allow = ['office', 'lat', 'lng', 'radius', 'start', 'end', 'grace', 'workdays', 'appUrl', 'adminPin'];
  const sh = sheet_(S_SET), rows = sh.getDataRange().getValues();
  Object.keys(p.settings || {}).forEach(k => {
    if (allow.indexOf(k) < 0) return;
    const v = String(p.settings[k]);
    if (k === 'adminPin' && v.length < 4) return;
    const i = rows.findIndex(r => r[0] === k);
    if (i > 0) sh.getRange(i + 1, 2).setNumberFormat('@').setValue(v);
    else sh.appendRow([k, v]);
  });
  return publicSettings_();
}

function qr_() {
  const d = todayStr_(), t = tokenFor_(d), s = readSettings_();
  const payload = s.appUrl ? s.appUrl.replace(/[?#].*$/, '') + '?t=' + t : 'TESR-ATTEND|' + d + '|' + t;
  return { date: d, token: t, payload: payload };
}

/* ===================== ชีตสรุปรายเดือน ===================== */
function buildMonth_(m) {
  const ss = SpreadsheetApp.getActive(), s = readSettings_();
  const recs = records_().filter(r => r.date.indexOf(m) === 0);
  const emps = employeesForMonth_(recs);
  const work = workdays_(m), today = todayStr_();
  const [y, mo] = m.split('-').map(Number);

  const summary = [], detail = [];
  emps.forEach(e => {
    const mine = recs.filter(r => r.empId === e.id);
    const by = {}; mine.forEach(r => by[r.date] = r);
    const dates = Array.from(new Set(work.concat(mine.map(r => r.date)))).sort();
    let present = 0, absent = 0, lateDays = 0, lateSum = 0, noOut = 0, mins = 0;
    dates.forEach(d => {
      const r = by[d], dow = TH_D[dateObj_(d).getDay()];
      let st;
      if (r) {
        present++; if (r.late > 0) { lateDays++; lateSum += r.late; }
        if (r.out) mins += toMin_(r.out) - toMin_(r.in); else if (d < today) noOut++;
        st = r.late > 0 ? 'สาย' : 'มา';
        if (work.indexOf(d) < 0) st += ' (วันหยุด)';
      } else if (d === today) st = 'ยังไม่เข้างาน';
      else { absent++; st = 'ขาด'; }
      detail.push([d, dow, e.code, e.name, st, r ? r.in : '', r ? (r.out || (d < today ? 'ไม่ได้เช็คเอาท์' : '')) : '', r ? r.late : '']);
    });
    summary.push([e.code, e.name, e.pos, work.filter(d => d < today || by[d]).length, present, absent, lateDays, lateSum, noOut, Math.round(mins / 6) / 10]);
  });

  const name = 'สรุป ' + m;
  let sh = ss.getSheetByName(name);
  if (sh) sh.clear(); else sh = ss.insertSheet(name);
  sh.getRange(1, 1).setValue('สรุปการลงเวลา เดือน' + TH_MF[mo - 1] + ' ' + (y + 543)).setFontSize(14).setFontWeight('bold');
  sh.getRange(2, 1).setValue('เวลาเข้างาน ' + s.start + (s.grace ? ' (ผ่อนผัน ' + s.grace + ' นาที)' : '') + ' · อัปเดตล่าสุด ' + fmt_(new Date(), 'dd/MM/yyyy HH:mm')).setFontColor('#6b625a');

  const sumH = ['รหัส', 'ชื่อ', 'ตำแหน่ง', 'วันทำงาน', 'มาทำงาน (วัน)', 'ขาด (วัน)', 'มาสาย (วัน)', 'สายรวม (นาที)', 'ลืมเช็คเอาท์', 'ชั่วโมงทำงาน'];
  head_(sh.getRange(4, 1, 1, sumH.length).setValues([sumH]));
  if (summary.length) {
    sh.getRange(5, 1, summary.length, 1).setNumberFormat('@');
    sh.getRange(5, 1, summary.length, sumH.length).setValues(summary);
  }

  const d0 = 5 + summary.length + 2;
  sh.getRange(d0 - 1, 1).setValue('รายละเอียดรายวัน').setFontWeight('bold');
  const detH = ['วันที่', 'วัน', 'รหัส', 'ชื่อ', 'สถานะ', 'เข้างาน', 'ออกงาน', 'สาย (นาที)'];
  head_(sh.getRange(d0, 1, 1, detH.length).setValues([detH]));
  if (detail.length) {
    [1, 3, 6, 7].forEach(c => sh.getRange(d0 + 1, c, detail.length, 1).setNumberFormat('@'));
    sh.getRange(d0 + 1, 1, detail.length, detH.length).setValues(detail);
    const bg = detail.map(r => {
      const c = r[4].indexOf('ขาด') === 0 ? '#fbe1df' : r[4].indexOf('สาย') === 0 ? '#fbead6' : null;
      return Array(detH.length).fill(c);
    });
    sh.getRange(d0 + 1, 1, detail.length, detH.length).setBackgrounds(bg);
  }
  sh.setFrozenRows(0);
  sh.setColumnWidth(1, 95); sh.setColumnWidth(2, 170); sh.setColumnWidth(3, 150);
  for (let c = 4; c <= 10; c++) sh.setColumnWidth(c, 105);
  return ss.getUrl() + '#gid=' + sh.getSheetId();
}

function head_(rg) { rg.setFontWeight('bold').setBackground('#8B0000').setFontColor('#ffffff'); }

/* ===================== helpers ===================== */
function sheet_(n) { return SpreadsheetApp.getActive().getSheetByName(n) || ensure_(n, n === S_EMP ? EMP_H : n === S_REC ? REC_H : n === S_HOL ? ['date', 'name'] : ['key', 'value']); }
function ensure_(n, h) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(n);
  if (!s) { s = ss.insertSheet(n); s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold'); s.setFrozenRows(1); }
  return s;
}
function fmt_(d, f) { return Utilities.formatDate(d, TZ, f); }
function todayStr_() { return fmt_(new Date(), 'yyyy-MM-dd'); }
function dateObj_(s) { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function normDate_(v) { return v instanceof Date ? fmt_(v, 'yyyy-MM-dd') : String(v || '').trim(); }
function normTime_(v) { if (v instanceof Date) return fmt_(v, 'HH:mm'); const s = String(v || '').trim(); return /^\d:\d\d$/.test(s) ? '0' + s : s; }
function toMin_(t) { const p = String(t).split(':').map(Number); return p[0] * 60 + p[1]; }
function lateMin_(t, s) { return Math.max(0, toMin_(t) - toMin_(s.start) - (Number(s.grace) || 0)); }
function fmtDist_(m) { return m >= 1000 ? (m / 1000).toFixed(2) + ' กม.' : m + ' ม.'; }
function haversine_(a, b, c, d) {
  const R = 6371000, t = x => x * Math.PI / 180, dl = t(c - a), dg = t(d - b);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function tokenFor_(date) {
  const secret = PropertiesService.getScriptProperties().getProperty('SECRET') || 'tesr';
  const sig = Utilities.computeHmacSha256Signature(date, secret);
  return Utilities.base64EncodeWebSafe(sig).replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
}

function readSettings_() {
  const s = SpreadsheetApp.getActive().getSheetByName(S_SET);
  const o = {};
  if (s) s.getDataRange().getValues().slice(1).forEach(r => { if (r[0]) o[r[0]] = r[1] instanceof Date ? fmt_(r[1], 'HH:mm') : String(r[1]); });
  ['lat', 'lng', 'radius', 'grace'].forEach(k => { if (k in o) o[k] = Number(o[k]); });
  ['start', 'end'].forEach(k => { if (k in o) o[k] = normTime_(o[k]); });
  return o;
}
function publicSettings_() {
  const s = readSettings_(); delete s.adminPin;
  s.workdays = String(s.workdays || '1,2,3,4,5').split(',').map(Number);
  return s;
}
function allEmployees_() {
  return sheet_(S_EMP).getDataRange().getValues().slice(1).filter(r => r[0]).map(r => ({
    id: String(r[0]), code: String(r[1]), name: String(r[2]), pos: String(r[3] || ''), photo: String(r[4] || ''), active: String(r[5]) !== 'FALSE'
  }));
}
function employees_() { return allEmployees_().filter(e => e.active); }
function employeesForMonth_(recs) {
  const ids = {}; recs.forEach(r => ids[r.empId] = 1);
  return allEmployees_().filter(e => e.active || ids[e.id]);
}
function pubEmp_(e) { return { id: e.id, code: e.code, name: e.name, pos: e.pos, photo: e.photo }; }
function setEmpField_(id, field, val) {
  const sh = sheet_(S_EMP), rows = sh.getDataRange().getValues(), col = EMP_H.indexOf(field) + 1;
  for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === id) { sh.getRange(i + 1, col).setNumberFormat('@').setValue(val); return; }
  throw new Error('ไม่พบพนักงาน');
}
function recObj_(r) {
  return {
    date: normDate_(r[0]), empId: String(r[1]), in: normTime_(r[4]), out: normTime_(r[5]),
    late: Number(r[6]) || 0, inDist: r[7] === '' ? null : Number(r[7]), outDist: r[8] === '' ? null : Number(r[8])
  };
}
function records_() { return sheet_(S_REC).getDataRange().getValues().slice(1).filter(r => r[0]).map(recObj_); }
function holidays_(m) {
  return sheet_(S_HOL).getDataRange().getValues().slice(1).map(r => ({ date: normDate_(r[0]), name: String(r[1] || '') }))
    .filter(h => h.date.indexOf(m) === 0);
}
/** วันทำงานของเดือน (ถึงวันนี้) ตามวันทำงานใน Settings และไม่รวมวันหยุดในชีต Holidays */
function workdays_(m) {
  const s = publicSettings_(), hol = {}, today = todayStr_();
  holidays_(m).forEach(h => hol[h.date] = 1);
  const [y, mo] = m.split('-').map(Number), out = [];
  for (let d = new Date(y, mo - 1, 1); d.getMonth() === mo - 1; d.setDate(d.getDate() + 1)) {
    const k = fmt_(d, 'yyyy-MM-dd');
    if (k > today) break;
    if (s.workdays.indexOf(d.getDay()) >= 0 && !hol[k]) out.push(k);
  }
  return out;
}
function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('TESR Time Clock · Photos');
  props.setProperty('PHOTO_FOLDER', f.getId());
  return f;
}
