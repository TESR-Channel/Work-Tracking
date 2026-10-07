/* TESR Time Clock — โหมดทดลอง: เก็บข้อมูลตัวอย่างในเบราว์เซอร์ ใช้ logic เดียวกับหลังบ้านจริง (core.js)
 * ข้อมูลในไฟล์นี้เป็นตัวอย่างสมมุติทั้งหมด ไม่ใช่ข้อมูลพนักงานจริง */
var TCMock = (function () {
  var KEY = 'tesr-tc-demo-v6', db = null, cache = {};
  function h(s) {
    var a = 0x811c9dc5, b = 0x9e3779b9;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; }
    return ('0000000' + a.toString(16)).slice(-8) + ('0000000' + b.toString(16)).slice(-8);
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pw(p) { var salt = 'demo' + p.length; return salt + '$' + h(salt + '|' + p); }
  function seed() {
    var S = {}; for (var k in TC.DEFAULTS) S[k] = TC.DEFAULTS[k];
    var people = [
      ['TESR-D01', 'สมชาย ใจดี', 'Male', 'วิศวกร', 'somchai', '0800000001', 'TRUE'],
      ['TESR-D02', 'กมลวรรณ ศรีสุข', 'Female', 'เลขานุการ', 'kamon', '0800000002', '09:20'],
      ['TESR-D03', 'ธนพล วงศ์ทอง', 'Male', 'วิศวกร', 'thanapon', '0800000003', ''],
      ['TESR-D04', 'ปิยะนุช แก้วมณี', 'Female', 'ฝ่ายขาย', 'piyanuch', '0800000004', ''],
      ['TESR-D05', 'วีระพงษ์ บุญมา', 'Male', 'วิศวกร', '', '0800000005', '']
    ];
    var emps = people.map(function (p, i) {
      return { id: 'd' + (i + 1), code: p[0], name: p[1], gender: p[2], email: (p[4] || 'weerapong') + '@example.com', phone: p[5], position: p[3], photo: '', active: 'TRUE',
        username: '', passHash: '', qPersonal: '', qSick: '', qVacation: '', qMaternity: p[2] === 'Female' ? '90' : '', note: 'ตัวอย่าง', shiftStart: p[6] === '09:20' ? '09:20' : '', shiftEnd: p[6] === '09:20' ? '18:20' : '', dayTimes: p[6] === '09:20' ? '3=09:20-12:20' : '' };
    });
    var s = 11; function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    var now = new Date(), T = ymd(now), recs = [], start = TC.util.toMin(S.start);
    var hol = { '2026-10-13': 1, '2026-10-23': 1 };
    for (var d = new Date(now.getFullYear(), now.getMonth() - 1, 1); ymd(d) <= T; d.setDate(d.getDate() + 1)) {
      var k = ymd(d); if (d.getDay() === 0 || d.getDay() === 6 || hol[k]) continue;
      emps.forEach(function (e, i) {
        var isT = k === T;
        if (!isT && rnd() < 0.05) return;
        if (isT && i === 4) return;
        var sh = TC.util.shiftOf(e, { start: S.start, end: S.end, grace: 0 }, k), st0 = TC.util.toMin(sh.start);
        var m = st0 - 4 - Math.floor(rnd() * 20);
        if (rnd() < (i === 3 ? 0.4 : i === 0 ? 0.22 : 0.1)) m = st0 + 1 + Math.floor(rnd() * 35);
        var o = isT ? null : TC.util.toMin(sh.end) + Math.floor(rnd() * 50);
        if (o !== null && rnd() < 0.06) o = TC.util.toMin(sh.end) - 10 - Math.floor(rnd() * 40);
        if (!isT && rnd() < 0.03) o = null;
        var tin = pad(Math.floor(m / 60)) + ':' + pad(m % 60);
        recs.push({ date: k, empId: e.id, code: e.code, name: e.name, in: tin, out: o === null ? '' : pad(Math.floor(o / 60)) + ':' + pad(o % 60),
          lateMin: String(Math.max(0, m - st0)), inDist: String(Math.round(30 + rnd() * 250)), outDist: o === null ? '' : String(Math.round(30 + rnd() * 250)), note: '', updatedAt: '' });
      });
    }
    var add = function (n) { var x = new Date(now); x.setDate(x.getDate() + n); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return ymd(x); };
    var iso = ymd(now) + 'T08:00:00';
    var leaves = [
      { id: 'Ldemo1', empId: 'd2', code: 'TESR-D02', name: 'กมลวรรณ ศรีสุข', type: 'vacation', start: add(6), end: add(7), part: 'full', days: '2', reason: 'พาครอบครัวไปต่างจังหวัด', status: 'pending', createdAt: iso, decidedAt: '', decidedBy: '', adminNote: '' },
      { id: 'Ldemo2', empId: 'd3', code: 'TESR-D03', name: 'ธนพล วงศ์ทอง', type: 'personal', start: add(2), end: add(2), part: 'am', days: '0.5', reason: 'ติดต่อราชการที่อำเภอ', status: 'approved', createdAt: iso, decidedAt: iso, decidedBy: 'admin', adminNote: '' },
      { id: 'Ldemo3', empId: 'd1', code: 'TESR-D01', name: 'สมชาย ใจดี', type: 'sick', start: add(-9), end: add(-9), part: 'full', days: '1', reason: 'ไข้หวัด มีใบรับรองแพทย์', status: 'approved', createdAt: iso, decidedAt: iso, decidedBy: 'admin', adminNote: '' }
    ];
    recs = recs.filter(function (r) { return !(r.empId === 'd1' && r.date === leaves[2].start); });
    var yd = new Date(now); yd.setDate(yd.getDate() - 1);
    var adjs = [{ id: 'Ademo1', empId: 'd4', code: 'TESR-D04', name: 'ปิยะนุช แก้วมณี', date: ymd(yd), in: '', out: '18:20', reason: 'ลืมกดเช็คเอาท์ แบตมือถือหมด', status: 'pending', createdAt: iso, decidedAt: '', decidedBy: '', adminNote: '' }];
    var holidays = [
      { date: '2026-10-13', name: 'วันคล้ายวันสวรรคต ร.9' }, { date: '2026-10-23', name: 'วันปิยมหาราช' },
      { date: '2026-12-07', name: 'ชดเชยวันพ่อแห่งชาติ' }, { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' }, { date: '2026-12-31', name: 'วันสิ้นปี' }
    ];
    var o = { settings: S };
    o[TC.TABLES.EMP.name] = emps; o[TC.TABLES.REC.name] = recs; o[TC.TABLES.LEAVE.name] = leaves; o[TC.TABLES.ADJ.name] = adjs; o[TC.TABLES.HOL.name] = holidays;
    return o;
  }
  function load() {
    if (db) return db;
    try { var v = localStorage.getItem(KEY); if (v) db = JSON.parse(v); } catch (e) {}
    if (!db) { db = seed(); save(); }
    return db;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  function table(t) { var d = load(); return d[t.name] || (d[t.name] = []); }
  var adapter = {
    rows: table,
    insert: function (t, o) { table(t).push(o); save(); return o; },
    update: function (t, ref, patch) { for (var k in patch) ref[k] = patch[k]; save(); },
    remove: function (t, ref) { var a = table(t), i = a.indexOf(ref); if (i >= 0) a.splice(i, 1); save(); },
    getSettings: function () { return load().settings; },
    setSetting: function (k, v) { load().settings[k] = v; save(); },
    now: function () { var d = new Date(); return { date: ymd(d), time: pad(d.getHours()) + ':' + pad(d.getMinutes()), iso: ymd(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()), ms: d.getTime() }; },
    sha256: h,
    hmac: function (s) { return h('demo-secret|' + s) + h(s + '|demo'); },
    uuid: function () { return Math.random().toString(36).slice(2, 12); },
    cacheGet: function (k) { return cache[k]; },
    cachePut: function (k, v) { cache[k] = v; },
    lock: function (fn) { return fn(); },
    savePhoto: function (e, mime, b64, dataUrl) { return dataUrl; },
    saveSelfie: function (e, date, kind, b64, dataUrl) { var id = 'S' + Math.random().toString(36).slice(2, 10); try { localStorage.setItem('tesr-tc-selfie-' + id, dataUrl); } catch (x) {} return id; },
    getSelfie: function (id) { try { return localStorage.getItem('tesr-tc-selfie-' + id) || ''; } catch (x) { return ''; } },
    buildMonthSheet: null
  };
  return {
    adapter: adapter,
    reset: function () { db = seed(); save(); },
    qrToken: function () { return adapter.hmac('qr|' + adapter.now().date).slice(0, 12); }
  };
})();
