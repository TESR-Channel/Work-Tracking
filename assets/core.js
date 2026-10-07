/* =====================================================================
 * TESR Time Clock — core logic
 * ใช้ไฟล์เดียวกันทั้งใน Google Apps Script (หลังบ้านจริง) และโหมดทดลองในเบราว์เซอร์
 * ทุกคำสั่งผ่าน TC.handle(adapter, params) — adapter คือที่เก็บข้อมูล (Google Sheet หรือ localStorage)
 * ===================================================================== */
var TC = (function () {
  var TABLES = {
    EMP: { name: 'Employees', cols: ['id', 'code', 'name', 'gender', 'email', 'phone', 'position', 'photo', 'active', 'username', 'passHash', 'qPersonal', 'qSick', 'qVacation', 'qMaternity', 'note', 'shiftStart', 'shiftEnd', 'workdays', 'satStart', 'satEnd', 'dayTimes', 'deviceId', 'deviceAt', 'startDate'] },
    REC: { name: 'Records', cols: ['date', 'empId', 'code', 'name', 'in', 'out', 'lateMin', 'inDist', 'outDist', 'note', 'updatedAt', 'inPhoto', 'outPhoto', 'flag'] },
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
    adminUser: 'admin', adminHash: '', adminPassword: '',
    selfie: '1', deviceLock: 'warn', selfieDays: '90',
    qrMode: 'static', qrVer: '1', startDate: '', driveFolder: ''
  };
  var DEFAULT_ADMIN_PASSWORD = 'tesr1234';
  var ADJ_WINDOW = 60; // ขอแก้เวลาย้อนหลังได้ไม่เกิน 60 วัน
  var PUBLIC_SETTINGS = ['company', 'office', 'lat', 'lng', 'radius', 'start', 'end', 'grace', 'workdays', 'appUrl', 'qPersonal', 'qSick', 'qVacation', 'qMaternity', 'selfie', 'deviceLock', 'selfieDays', 'qrMode', 'startDate'];
  var ADMIN_SETTINGS = ['driveFolder']; // แอดมินเห็น/แก้ได้ แต่ไม่ส่งให้พนักงาน
  var DEVICE_LOCK = { off: 'ไม่ตรวจ', warn: 'ให้ลงเวลาได้ แต่แจ้งเตือนแอดมิน', block: 'ไม่ให้ลงเวลา' };
  var WRITES = {
    login: 1, register: 1, punch: 1, photo: 1, changePassword: 1, leaveCreate: 1, leaveCancel: 1, adjCreate: 1,
    decide: 1, saveEmp: 1, delEmp: 1, resetLogin: 1, importEmps: 1, saveHoliday: 1, delHoliday: 1,
    saveSettings: 1, changeAdmin: 1, editRecord: 1, buildMonth: 1, resetDevice: 1, rotateQr: 1
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
    s.selfie = !/^(0|false|off|no)$/i.test(String(s.selfie));
    s.deviceLock = DEVICE_LOCK[s.deviceLock] ? s.deviceLock : 'warn';
    s.selfieDays = Math.max(0, num(s.selfieDays, 90));
    s.qrMode = s.qrMode === 'daily' ? 'daily' : 'static';
    s.startDate = isDate(s.startDate) ? s.startDate : '';
    return s;
  }
  function pubSettings(S) { var o = {}; PUBLIC_SETTINGS.forEach(function (k) { o[k] = S[k]; }); return o; }

  /* ---------- data access ---------- */
  function emps(A) { return A.rows(TABLES.EMP); }
  function isActive(e) { return String(e.active).toUpperCase() !== 'FALSE'; }
  function pubEmp(e) { return { id: e.id, code: e.code, name: e.name, gender: e.gender, position: e.position, photo: e.photo, email: e.email, phone: e.phone, shiftStart: e.shiftStart || '', shiftEnd: e.shiftEnd || '', workdays: e.workdays || '', satStart: e.satStart || '', satEnd: e.satEnd || '', dayTimes: e.dayTimes || '', startDate: e.startDate || '', device: e.deviceId ? (e.deviceAt || 'ลงทะเบียนแล้ว') : '' }; }
  function recObj(r) { return { date: r.date, empId: r.empId, in: r.in, out: r.out, lateMin: num(r.lateMin, 0), inDist: num(r.inDist, null), outDist: num(r.outDist, null), note: r.note || '', inPhoto: r.inPhoto || '', outPhoto: r.outPhoto || '', flag: r.flag || '' }; }
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
  /** QR แบบถาวร (พิมพ์ติดผนัง) เปลี่ยนเมื่อแอดมินกด "สร้าง QR ใหม่" · แบบรายวันเปลี่ยนทุกวัน */
  function qrToken(c, date) { return c.S.qrMode === 'daily' ? c.A.hmac('qr|' + date).slice(0, 12) : c.A.hmac('qr|static|' + str(c.S.qrVer || '1')).slice(0, 12); }

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
  /** วันเริ่มใช้ระบบ: ตั้งเองในหน้าตั้งค่า หรือถ้าไม่ได้ตั้ง ใช้วันแรกที่มีคนลงเวลา · ก่อนวันนี้ไม่นับขาด */
  function goLive(c) {
    if (c.S.startDate) return c.S.startDate;
    var first = ''; c.A.rows(TABLES.REC).forEach(function (r) { if (isDate(r.date) && (!first || r.date < first)) first = r.date; });
    return first || c.now.date;
  }
  function myMonth(c) {
    var e = myEmp(c), m = str(c.p.month); c.S.goLive = goLive(c);
    if (!isMonth(m)) throw E('เดือนไม่ถูกต้อง');
    var data = monthData(c, m, [e]);
    data.report = monthReport(m, [e], data.records, data.leaves, data.holidays, c.S, c.now.date)[0];
    data.adjustments = c.A.rows(TABLES.ADJ).filter(function (a) { return a.empId === e.id && String(a.date).indexOf(m) === 0; }).map(adjObj);
    return data;
  }
  /** ตรวจมือถือที่ใช้ลงเวลา: 1 บัญชี = 1 เครื่อง และ 1 เครื่อง = 1 บัญชี (กันฝากเพื่อนลงเวลา) */
  function checkDevice(c, e) {
    var S = c.S, dev = str(c.p.dev).replace(/[^A-Za-z0-9-]/g, '').slice(0, 64), block = S.deviceLock === 'block';
    if (S.deviceLock === 'off') return { flags: [], bind: null };
    if (dev.length < 12) { if (block) throw E('ไม่พบรหัสเครื่อง · รีเฟรชหน้าแล้วลองใหม่', 'DEVICE'); return { flags: ['ไม่มีรหัสเครื่อง'], bind: null }; }
    var flags = [], other = emps(c.A).filter(function (x) { return x.id !== e.id && isActive(x) && str(x.deviceId) === dev; })[0];
    if (other) { if (block) throw E('มือถือเครื่องนี้ลงทะเบียนเป็นของ ' + other.name + ' แล้ว · ลงเวลาแทนคนอื่นไม่ได้', 'DEVICE'); flags.push('ใช้มือถือของ ' + other.name); }
    if (e.deviceId && e.deviceId !== dev) { if (block) throw E('บัญชีนี้ผูกกับมือถืออีกเครื่องหนึ่ง · ถ้าเปลี่ยนเครื่องหรือเปลี่ยนเบราว์เซอร์ ให้แจ้งแอดมินกด "รีเซ็ตมือถือ"', 'DEVICE'); flags.push('ลงเวลาจากเครื่องอื่น'); }
    return { flags: flags, bind: !e.deviceId && !other ? dev : null };
  }
  function punch(c) {
    var e = myEmp(c), S = c.S, date = c.now.date, time = c.now.time;
    if (str(c.p.token2) !== qrToken(c, date)) throw E(c.S.qrMode === 'daily' ? 'QR Code ไม่ถูกต้องหรือหมดอายุ (ใช้ได้เฉพาะ QR ของวันนี้)' : 'QR Code ไม่ถูกต้อง หรือเป็น QR เก่าที่ยกเลิกแล้ว · สแกน QR ที่ติดอยู่ที่ออฟฟิศ');
    var lat = Number(c.p.lat), lng = Number(c.p.lng);
    if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) throw E('ไม่ได้รับพิกัด GPS จากมือถือ');
    var dist = Math.round(haversine(lat, lng, S.lat, S.lng));
    if (dist > S.radius) throw E('อยู่ห่างออฟฟิศ ' + fmtDist(dist) + ' เกินรัศมีที่อนุญาต ' + fmtDist(S.radius));
    var r = c.A.rows(TABLES.REC).filter(function (x) { return x.empId === e.id && x.date === date; })[0];
    if (r && r.out) throw E('วันนี้ลงเวลาเข้า–ออกครบแล้ว');
    var kind = r ? 'out' : 'in', sm = str(c.p.selfie).match(/^data:image\/jpeg;base64,([A-Za-z0-9+\/=]+)$/);
    if (S.selfie && !sm) throw E('กรุณาถ่ายเซลฟี่ยืนยันตัวตนก่อนลงเวลา', 'SELFIE');
    if (sm && sm[1].length > 400000) throw E('รูปเซลฟี่ใหญ่เกินไป');
    var dv = checkDevice(c, e);
    if (dv.bind) c.A.update(TABLES.EMP, e, { deviceId: dv.bind, deviceAt: c.now.iso.slice(0, 10) });
    var pic = sm ? c.A.saveSelfie(e, date, kind, sm[1], str(c.p.selfie)) : '';
    var flag = dv.flags.length ? (kind === 'in' ? 'เข้า: ' : 'ออก: ') + dv.flags.join(', ') : '';
    if (r) {
      var patch = { out: time, outDist: String(dist), outPhoto: pic, updatedAt: c.now.iso };
      if (flag) patch.flag = [str(r.flag), flag].filter(String).join(' · ');
      c.A.update(TABLES.REC, r, patch);
      return { kind: 'out', rec: recObj(merge(r, patch)), flag: flag };
    }
    var rec = merge(stamp(e), { date: date, in: time, out: '', lateMin: String(lateOf(time, shiftOf(e, S, date))), inDist: String(dist), outDist: '', note: '', updatedAt: c.now.iso, inPhoto: pic, outPhoto: '', flag: flag });
    c.A.insert(TABLES.REC, rec);
    return { kind: 'in', rec: recObj(rec), flag: flag };
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
    c.S.goLive = goLive(c);
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
  var EMP_FIELDS = ['code', 'name', 'gender', 'email', 'phone', 'position', 'qPersonal', 'qSick', 'qVacation', 'qMaternity', 'note', 'shiftStart', 'shiftEnd', 'workdays', 'satStart', 'satEnd', 'dayTimes', 'startDate'];
  /** วันทำงาน/เวลาที่เท่ากับค่ามาตรฐานบริษัท → เก็บเป็นค่าว่าง (ให้ตามค่ามาตรฐาน) */
  function normSched(v, S) {
    if (v.workdays && v.workdays === S.workdays.slice().sort().join(',')) v.workdays = '';
    if (v.shiftStart === S.start && v.shiftEnd === S.end) { v.shiftStart = ''; v.shiftEnd = ''; }
    return v;
  }
  function cleanEmp(src) {
    var o = {};
    EMP_FIELDS.forEach(function (k) { if (src[k] !== undefined) o[k] = str(src[k]); });
    if (o.phone !== undefined) o.phone = digits(o.phone);
    if (o.email !== undefined) { o.email = o.email.toLowerCase(); if (o.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.email)) throw E('อีเมลไม่ถูกต้อง: ' + o.email); }
    if (o.startDate !== undefined && o.startDate && !isDate(o.startDate)) throw E('วันเริ่มงานต้องอยู่ในรูปแบบ ปปปป-ดด-วว เช่น 2026-10-08');
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
    var v = normSched(cleanEmp(c.p.emp || {}), c.S), id = str((c.p.emp || {}).id), list = emps(c.A);
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
      var v = normSched(cleanEmp(src), c.S); if (!v.code || !v.name) return;
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
  function resetDevice(c) { c.A.update(TABLES.EMP, findEmp(c, str(c.p.id)), { deviceId: '', deviceAt: '' }); return true; }
  /** แอดมินดูรูปเซลฟี่: ต้องเป็นรูปที่อ้างอิงอยู่ในชีต Records เท่านั้น */
  function selfie(c) {
    var ref = str(c.p.ref);
    var ok = ref && c.A.rows(TABLES.REC).some(function (r) { return r.inPhoto === ref || r.outPhoto === ref; });
    if (!ok) throw E('ไม่พบรูป');
    return { data: c.A.getSelfie(ref) };
  }
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
    if (s.startDate && !isDate(str(s.startDate))) throw E('วันเริ่มใช้ระบบไม่ถูกต้อง');
    PUBLIC_SETTINGS.concat(ADMIN_SETTINGS).forEach(function (k) { if (s[k] !== undefined) c.A.setSetting(k, Array.isArray(s[k]) ? s[k].join(',') : str(s[k])); });
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
    return { date: d, token: t, mode: c.S.qrMode, ver: str(c.S.qrVer || '1'), payload: base ? base + '?t=' + t : 'TESR-ATTEND|' + (c.S.qrMode === 'daily' ? d : 'fixed') + '|' + t };
  }
  /** ยกเลิก QR ที่พิมพ์ไว้ แล้วสร้างชุดใหม่ (ใช้เมื่อ QR หลุดออกไปนอกออฟฟิศ) */
  function rotateQr(c) { c.A.setSetting('qrVer', String(num(c.S.qrVer, 1) + 1)); c.S = settings(c.A); return qr(c); }
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
    c.S.goLive = goLive(c);
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
      var wdays = daysOf(e, S), from = S.goLive || '';
      if (isDate(e.startDate) && e.startDate > from) from = e.startDate;
      var t = { devFlags: 0, workdays: 0, present: 0, lateDays: 0, lateMin: 0, earlyDays: 0, earlyMin: 0, absent: 0, noOut: 0, minutes: 0, leaveDays: 0, leaveToDate: 0, leave: {} };
      Object.keys(LEAVE_TYPES).forEach(function (k) { t.leave[k] = 0; });
      var list = days.map(function (d) {
        var work = wdays.indexOf(dow(d)) >= 0 && !hm[d];
        var r = rby[d] || null, l = lby[d] || null, la = l && l.status === 'approved' ? l : null, late = 0, st, pre = !!from && d < from && !r;
        var sh = shiftOf(e, S, d), early = 0, flags = [];
        if (la && work) { var amt = la.part === 'full' ? 1 : 0.5; t.leave[la.type] = (t.leave[la.type] || 0) + amt; t.leaveDays += amt; if (d <= today) t.leaveToDate += amt; }
        if (work && d <= today && !pre) t.workdays++;
        if (r) {
          t.present++;
          late = la && la.part === 'am' ? 0 : num(r.lateMin, 0);
          if (late > 0) { t.lateDays++; t.lateMin += late; flags.push('late'); }
          if (r.out) {
            t.minutes += Math.max(0, toMin(r.out) - toMin(r.in));
            early = la && la.part === 'pm' ? 0 : Math.max(0, toMin(sh.end) - toMin(r.out));
            if (early > 0) { t.earlyDays++; t.earlyMin += early; flags.push('early'); }
          } else if (d < today) { t.noOut++; flags.push('noOut'); }
          if (r.flag) { t.devFlags++; flags.push('device'); }
          st = late > 0 ? 'late' : 'ok';
        } else if (!work) st = hm[d] ? 'holiday' : 'off';
        else if (pre && !la) st = 'pre';
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
      t.alerts = t.lateDays + t.earlyDays + t.noOut + t.devFlags + (t.absent > 0 ? Math.ceil(t.absent) : 0);
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
        if (x.st === 'pre') notes.push('ยังไม่เริ่มใช้ระบบ');
        if (rec && rec.note) notes.push(rec.note);
        if (rec && rec.flag) notes.push('ตรวจสอบมือถือ: ' + rec.flag);
        c[18] = notes.join(' · ');
        rows.push({ cells: c, total: false, flags: x.flags || [], st: x.st, future: x.date > today });
      });
      var dash = function (v) { return v ? v : '-'; };
      rows.push({ total: true, cells: [e.code, e.name, '', '', 'ยอดรวม', hmm(T.work), hmm(T.late), hmm(T.early), hmm(T.miss), dash(T.absent), dash(T.forgot), dash(T.hol), dash(T.off), dash(T.comp), dash(T.lv.personal), dash(T.lv.sick), dash(T.lv.vacation), dash(T.lv.other),
        'ตรงเวลา ' + (r.t.onTimeRate === null ? '-' : r.t.onTimeRate + '%') + ' · มาทำงาน ' + (r.t.attendRate === null ? '-' : r.t.attendRate + '%')] });
    });
    return { head1: head1, head2: head2, merges: merges, rows: rows };
  }

  /* =================== sync: ส่งข้อมูลทั้งหมดที่ผู้ใช้มีสิทธิ์เห็นในครั้งเดียว =================== *
   * หน้าเว็บเก็บข้อมูลชุดนี้ไว้ แล้วคำนวณหน้าต่างๆ เองในเครื่อง (ด้วยไฟล์ core.js เดียวกัน) จึงเปิดหน้าได้ทันที
   * ไม่ส่งรหัสผ่าน/รหัสเครื่องจริงออกไป (ส่งแค่ว่า "มี" หรือ "ไม่มี") · พนักงานได้เฉพาะข้อมูลของตัวเอง */
  var SYNC_DAYS = 400;
  function strip(r) { var o = {}; for (var k in r) if (k !== '_row') o[k] = r[k]; return o; }
  function maskEmp(e) { var o = strip(e); o.passHash = e.passHash ? 'set' : ''; o.deviceId = e.deviceId ? 'set' : ''; return o; }
  function sync(c) {
    var admin = c.sess.role === 'admin', me = admin ? null : myEmp(c), from = addDays(c.now.date, -SYNC_DAYS);
    var mine = function (r) { return admin || r.empId === me.id; };
    var raw = c.A.getSettings(), st = {};
    if (admin) { for (var k in raw) if (k !== 'adminPassword') st[k] = raw[k]; st.adminHash = raw.adminHash ? 'set' : ''; }
    else { PUBLIC_SETTINGS.forEach(function (k) { if (raw[k] !== undefined) st[k] = raw[k]; }); st.startDate = goLive(c); }
    return {
      role: c.sess.role, id: c.sess.id, ms: c.now.ms, from: from, settings: st,
      tables: {
        Employees: admin ? emps(c.A).map(maskEmp) : [maskEmp(me)],
        Records: c.A.rows(TABLES.REC).filter(function (r) { return mine(r) && String(r.date) >= from; }).map(strip),
        Leaves: c.A.rows(TABLES.LEAVE).filter(mine).map(strip),
        Adjustments: c.A.rows(TABLES.ADJ).filter(mine).map(strip),
        Holidays: c.A.rows(TABLES.HOL).map(strip)
      },
      qr: admin ? qr(c) : null
    };
  }
  /** คำนวณคำสั่ง "อ่าน" ในเครื่องจากข้อมูล sync (ไม่ต้องรอเซิร์ฟเวอร์) */
  var LOCAL = { me: 1, myMonth: 1, myRequests: 1, adminToday: 1, adminMonth: 1, requests: 1, employees: 1, holidays: 1, settings: 1 };
  function local(A, p, role, id) {
    try {
      if (!LOCAL[p.action]) throw E('ต้องถามเซิร์ฟเวอร์');
      var c = { A: A, p: p, now: A.now() }; c.S = settings(A);
      c.sess = { role: role, id: id };
      if (role === 'emp') { c.sess.emp = emps(A).filter(function (x) { return x.id === id; })[0]; if (!c.sess.emp) throw E('ไม่พบข้อมูลพนักงาน', 'AUTH'); }
      var fn = role === 'admin' ? ADMIN[p.action] : EMP[p.action];
      if (!fn) throw E('บัญชีนี้ไม่มีสิทธิ์ใช้งานส่วนนี้', 'FORBIDDEN');
      return { ok: true, data: fn(c) };
    } catch (e) { return { ok: false, error: e.message || String(e), code: e.code || '' }; }
  }

  /* =================== router =================== */
  var PUBLIC = { login: login };
  var EMP = { me: me, myMonth: myMonth, punch: punch, photo: photo, changePassword: changePassword, leaveCreate: leaveCreate, leaveCancel: leaveCancel, adjCreate: adjCreate, myRequests: myRequests, sync: sync };
  var ADMIN = {
    sync: sync,
    adminToday: adminToday, adminMonth: adminMonth, requests: requests, decide: decide, employees: employees, saveEmp: saveEmp,
    importEmps: importEmps, delEmp: delEmp, restoreEmp: restoreEmp, resetLogin: resetLogin, resetDevice: resetDevice, selfie: selfie, holidays: listHolidays, saveHoliday: saveHoliday,
    delHoliday: delHoliday, saveSettings: saveSettings, changeAdmin: changeAdmin, qr: qr, rotateQr: rotateQr, editRecord: editRecord, buildMonth: buildMonth,
    settings: function (c) { return { settings: pubSettings(c.S), admin: { driveFolder: str(c.A.getSettings().driveFolder) }, goLive: goLive(c), adminUser: c.S.adminUser, mustChange: !c.S.adminHash }; }
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
      var data = WRITES[p.action] ? A.lock(function () { return run(A, p); }) : run(A, p), out = { ok: true, data: data };
      // คำสั่งที่เขียนข้อมูล: ส่งข้อมูลชุดใหม่กลับไปในคำตอบเดียวกัน หน้าเว็บจะได้ไม่ต้องโหลดซ้ำ
      if (p.sync && WRITES[p.action]) { try { out.snap = { ok: true, data: run(A, { action: 'sync', token: (data && data.token) || p.token }) }; } catch (e2) {} }
      return out;
    } catch (e) {
      return { ok: false, error: e.message || String(e), code: e.code || '' };
    }
  }

  return {
    handle: handle, local: local, LOCAL: LOCAL, WRITES: WRITES, monthReport: monthReport, exportTable: exportTable, ADJ_WINDOW: ADJ_WINDOW, TABLES: TABLES, LEAVE_TYPES: LEAVE_TYPES, PART: PART, STATUS: STATUS,
    DEFAULTS: DEFAULTS, util: { monthDays: monthDays, dow: dow, addDays: addDays, range: range, toMin: toMin, haversine: haversine, fmtDist: fmtDist, lateOf: lateOf, shiftOf: shiftOf, daysOf: daysOf, parseDays: parseDays, daysText: daysText, scheduleText: scheduleText, parseDayTimes: parseDayTimes, dayTimesText: dayTimesText, customSchedule: customSchedule, isDate: isDate, isTime: isTime }
  };
})();
if (typeof module !== 'undefined') module.exports = TC;
