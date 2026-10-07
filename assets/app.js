/* TESR Time Clock — shared client helpers (ใช้ทั้งหน้าพนักงานและหน้าแอดมิน) */
(function () {
  try { var l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/webp'; l.href = 'data:image/webp;base64,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'; document.head.appendChild(l);
    /* ไอคอนตอน "เพิ่มไปยังหน้าจอโฮม" บน iPhone: วาดโลโก้บนพื้นเข้มเป็น PNG */
    var im = new Image(); im.onload = function () { try { var c = document.createElement('canvas'); c.width = c.height = 180; var x = c.getContext('2d'); x.fillStyle = '#0d0b0a'; x.fillRect(0, 0, 180, 180); x.drawImage(im, 22, 22, 136, 136); var t = document.createElement('link'); t.rel = 'apple-touch-icon'; t.href = c.toDataURL('image/png'); document.head.appendChild(t); } catch (e) {} }; im.src = l.href;
  } catch (e) {}
})();
var APP = (function () {
  var API_URL = String(window.TESR_API_URL || '').trim();
  var REMOTE = !!API_URL;
  var TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var TH_MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var TH_D = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var TH_DF = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var ST = { ok: ['ok', 'มา'], late: ['late', 'สาย'], absent: ['absent', 'ขาด'], leave: ['leave', 'ลา'], pending: ['idle', 'ยังไม่เข้างาน'], holiday: ['holiday', 'วันหยุด'], off: ['off', 'วันหยุด'], future: ['future', '—'], pre: ['off', 'ยังไม่เริ่มใช้ระบบ'] };
  var REQ = { pending: ['pending-req', 'รออนุมัติ'], approved: ['approved', 'อนุมัติแล้ว'], rejected: ['rejected', 'ไม่อนุมัติ'], cancelled: ['cancelled', 'ยกเลิกแล้ว'] };

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function dObj(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function thDate(s, opt) {
    if (!s) return '';
    var d = dObj(s);
    if (opt === 'long') return 'วัน' + TH_DF[d.getDay()] + 'ที่ ' + d.getDate() + ' ' + TH_MF[d.getMonth()] + ' ' + (d.getFullYear() + 543);
    if (opt === 'year') return d.getDate() + ' ' + TH_M[d.getMonth()] + ' ' + String(d.getFullYear() + 543).slice(2);
    return TH_D[d.getDay()] + ' ' + d.getDate() + ' ' + TH_M[d.getMonth()];
  }
  function thRange(a, b) { return a === b || !b ? thDate(a, 'year') : thDate(a) + ' – ' + thDate(b, 'year'); }
  function thMonth(m) { var p = m.split('-'); return TH_MF[+p[1] - 1] + ' ' + (+p[0] + 543); }
  function addMonth(m, n) { var p = m.split('-'); var d = new Date(+p[0], +p[1] - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function fmtLate(m) { m = +m || 0; if (!m) return '0 นาที'; var h = Math.floor(m / 60); return h ? h + ' ชม. ' + (m % 60) + ' นาที' : m + ' นาที'; }
  function fmtDays(n) { n = +n || 0; return (n % 1 ? n.toFixed(1).replace('.0', '') : String(n)); }
  function initials(n) { return String(n || '?').trim().split(/\s+/).map(function (w) { return w[0]; }).slice(0, 2).join(''); }
  function avatar(e, size) { return '<span class="avatar' + (size ? ' ' + size : '') + '">' + (e && e.photo ? '<img src="' + esc(e.photo) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : esc(initials(e && e.name))) + '</span>'; }
  function person(e, sub) { return '<div class="person">' + avatar(e, 'sm') + '<div style="min-width:0"><div class="nm">' + esc(e.name) + '</div><small>' + esc(sub !== undefined ? sub : (e.position || '') + (e.code ? ' · ' + e.code : '')) + '</small></div></div>'; }
  function pill(kind, text) { return '<span class="pill ' + kind + '">' + esc(text) + '</span>'; }
  function stPill(st) { var s = ST[st] || ['idle', st]; return pill(s[0], s[1]); }
  function reqPill(st) { var s = REQ[st] || ['idle', st]; return pill(s[0], s[1]); }
  function leaveLabel(l) { return (TC.LEAVE_TYPES[l.type] || l.type) + (l.part && l.part !== 'full' ? ' · ' + TC.PART[l.part] : ''); }

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  };
  function toast(t) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(function () { el.hidden = true; }, 3000);
  }

  /** api(action, params) — ส่งคำสั่งไป Apps Script (หรือโหมดทดลอง) พร้อม token ของหน้านั้น */
  /* ---------- API ---------- *
   * Google Apps Script ตอบช้า (1–5 วินาทีต่อครั้ง) จึงทำแบบนี้:
   *  1) เข้าสู่ระบบ/เปิดแอป → ดึงข้อมูลทั้งหมดที่มีสิทธิ์เห็นครั้งเดียว (sync) แล้วเก็บไว้ในเครื่อง
   *  2) ทุกหน้า (ภาพรวม ปฏิทิน รายงาน ฯลฯ) คำนวณในเครื่องด้วย core.js เดียวกับเซิร์ฟเวอร์ → เปิดได้ทันที
   *  3) บันทึกข้อมูล (ลงเวลา อนุมัติ ฯลฯ) ส่งไปเซิร์ฟเวอร์ แล้วได้ข้อมูลชุดใหม่กลับมาในคำตอบเดียวกัน
   *  4) อัปเดตเบื้องหลังทุก 1 นาที และทุกครั้งที่กลับมาเปิดแอป ถ้ามีอะไรเปลี่ยนจะวาดหน้าใหม่ให้เอง */
  var CK = 'tesr-c:', listeners = [];
  function onFresh(fn) { listeners.push(fn); }
  function notify(what) { listeners.forEach(function (fn) { try { fn(what); } catch (e) {} }); }
  /** วาดหน้าใหม่ได้ไหม: ไม่มีหน้าต่าง popup เปิดอยู่ และผู้ใช้ไม่ได้กำลังพิมพ์ */
  function idle() { var m = document.getElementById('modal'), a = document.activeElement; return !(m && !m.hidden) && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); }
  function cacheClear() { try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(CK) === 0) localStorage.removeItem(k); }); } catch (e) {} }
  function post(body, retry) {
    var ctl = window.AbortController ? new AbortController() : null, timer = ctl ? setTimeout(function () { ctl.abort(); }, 30000) : null;
    return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.text(); })
      .then(function (t) { clearTimeout(timer); try { return JSON.parse(t); } catch (e) { var x = new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'); x.bad = 1; throw x; } },
        function (e) { clearTimeout(timer); var x = new Error(e && e.name === 'AbortError' ? 'เซิร์ฟเวอร์ตอบช้าเกินไป ลองใหม่อีกครั้ง' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); x.net = 1; throw x; })
      .catch(function (e) { if (retry > 0) return new Promise(function (ok) { setTimeout(ok, 700); }).then(function () { return post(body, retry - 1); }); throw e; });
  }
  function warmUp() { if (REMOTE) try { fetch(API_URL, { method: 'GET', mode: 'no-cors' }).catch(function () {}); } catch (e) {} }
  /* นาฬิกาตามเวลาเซิร์ฟเวอร์ (เวลาไทย) สำหรับคำนวณในเครื่อง */
  var BKK = null; try { BKK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); } catch (e) {}
  function bkkNow(ms) {
    var d = new Date(ms), p = {};
    if (BKK) BKK.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    else { var t = new Date(ms + 7 * 3600000); p = { year: t.getUTCFullYear(), month: pad(t.getUTCMonth() + 1), day: pad(t.getUTCDate()), hour: pad(t.getUTCHours()), minute: pad(t.getUTCMinutes()), second: pad(t.getUTCSeconds()) }; }
    var date = p.year + '-' + p.month + '-' + p.day, hh = p.hour === '24' ? '00' : p.hour;
    return { date: date, time: hh + ':' + p.minute, iso: date + 'T' + hh + ':' + p.minute + ':' + p.second, ms: ms };
  }
  function snapAdapter(d) {
    var off = d.ms - d.recv;
    return {
      rows: function (t) { return d.tables[t.name] || []; }, getSettings: function () { return d.settings; }, now: function () { return bkkNow(Date.now() + off); },
      setSetting: function () {}, insert: function () {}, update: function () {}, remove: function () {}, lock: function (fn) { return fn(); },
      sha256: function () { return ''; }, hmac: function () { return ''; }, uuid: function () { return ''; }, cacheGet: function () { return null; }, cachePut: function () {}
    };
  }
  function makeApi(tokenKey, onAuthFail) {
    var SK = CK + 'snap:' + tokenKey, snap = null, SA = null, syncing = null;
    var unwrap = function (j) {
      if (!j.ok) { if (j.code === 'AUTH' && onAuthFail) { cacheClear(); snap = null; onAuthFail(); } var e = new Error(j.error || 'เกิดข้อผิดพลาด'); e.code = j.code; throw e; }
      return j.data;
    };
    var sig = function (d) { return d ? JSON.stringify([d.settings, d.tables, d.qr]) : ''; };
    var setSnap = function (d, quiet) {
      var before = sig(snap); d.recv = d.recv || Date.now(); d.got = Date.now();
      snap = d; SA = snapAdapter(d);
      try { localStorage.setItem(SK, JSON.stringify(d)); } catch (e) {}
      if (!quiet && before && before !== sig(d)) notify('sync');
    };
    try { var saved = JSON.parse(localStorage.getItem(SK) || 'null'); if (saved && saved.tables && store.get(tokenKey)) { snap = saved; SA = snapAdapter(saved); } } catch (e) {}
    var syncNow = function () {
      var token = store.get(tokenKey); if (!REMOTE || !token) return Promise.resolve(null);
      if (!syncing) syncing = post({ action: 'sync', token: token }, 1).then(unwrap).then(function (d) { d.recv = Date.now(); setSnap(d); syncing = null; return d; }, function (e) { syncing = null; throw e; });
      return syncing;
    };
    var bg = function (maxAge) { if (snap && Date.now() - (snap.got || 0) > maxAge) syncNow().catch(function () {}); };
    if (REMOTE) {
      setInterval(function () { if (document.visibilityState !== 'hidden') bg(55000); }, 60000);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') bg(15000); });
      window.addEventListener('focus', function () { bg(15000); });
    }
    var inRange = function (params) { var m = params && params.month; return !m || !snap.from || m > snap.from.slice(0, 7); };
    var api = function (action, params) {
      var token = store.get(tokenKey) || '', body = Object.assign({ action: action, token: token }, params || {});
      if (!REMOTE) return new Promise(function (res) { setTimeout(function () { res(JSON.parse(JSON.stringify(TC.handle(TCMock.adapter, body)))); }, 60); }).then(unwrap);
      var write = !!(TC.WRITES && TC.WRITES[action]);
      if (write) {
        body.sync = 1;
        return post(body, action === 'login' ? 1 : 0).then(function (j) { // ลงเวลา/บันทึก ไม่ลองซ้ำเอง กันบันทึกซ้ำ
          if (j.snap && j.snap.ok) { j.snap.data.recv = Date.now(); setSnap(j.snap.data, true); return unwrap(j); }
          var data = unwrap(j);
          return snap ? syncNow().then(function () { return data; }, function () { return data; }) : data;
        });
      }
      if (TC.LOCAL && TC.LOCAL[action] && token) {
        if (!snap) return syncNow().then(function () { return api(action, params); }, function () { return post(body, 1).then(unwrap); });
        if (inRange(params)) {
          var r = TC.local(SA, Object.assign({ action: action }, params || {}), snap.role, snap.id);
          if (r.ok) { bg(30000); return Promise.resolve(JSON.parse(JSON.stringify(r.data))); }
        }
      }
      if (action === 'qr' && snap && snap.qr) { bg(30000); return Promise.resolve(snap.qr); }
      return post(body, 1).then(unwrap);
    };
    api.sync = syncNow;
    api.hasData = function () { return !!snap; };
    return api;
  }
  warmUp();

  /** ปฏิทินรายเดือน (อาทิตย์เป็นวันแรก) — cell(dateStr) คืน {cls, html} */
  function calendar(m, cell) {
    var days = TC.util.monthDays(m), first = TC.util.dow(days[0]), h = '';
    TH_D.forEach(function (d, i) { h += '<div class="dh' + (i === 0 ? ' sun' : '') + '">' + d + '</div>'; });
    for (var i = 0; i < first; i++) h += '<div class="d out"></div>';
    days.forEach(function (d) { var c = cell(d) || {}; h += c.html || ''; });
    return h;
  }

  function readPhoto(file, size, cb) {
    if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'), z = size || 360; c.width = c.height = z;
        var k = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, z, z);
        cb(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { toast('เปิดไฟล์รูปไม่ได้'); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }

  function modal(html, cls) {
    var m = document.getElementById('modal');
    if (!m) { m = document.createElement('div'); m.id = 'modal'; m.className = 'modal'; document.body.appendChild(m); }
    m.innerHTML = '<div class="sheet ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    m.hidden = false;
    m.onclick = function (ev) { if (ev.target === m) closeModal(); };
    var x = m.querySelector('[data-close]'); if (x) x.onclick = closeModal;
    return m;
  }
  function closeModal() { var m = document.getElementById('modal'); if (m) { if (m._onclose) m._onclose(); m._onclose = null; m.hidden = true; m.innerHTML = ''; } }

  function csv(lines) { var q = function (v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; }; return lines.map(function (l) { return l.map(q).join(','); }).join('\r\n'); }
  function parseCsv(text) {
    var rows = [], row = [], cur = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === ',' || ch === '\t') { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return String(c).trim(); }); });
  }
  function download(name, text) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
      a.download = name; document.body.appendChild(a); a.click(); a.remove();
    } catch (e) {}
  }

  /* เสียงแจ้งผล (WebAudio ไม่ต้องโหลดไฟล์) · iOS ต้องเรียก unlock() ระหว่างที่ผู้ใช้แตะหน้าจอ */
  var sound = (function () {
    var ctx = null;
    function unlock() {
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        if (!ctx) ctx = new AC();
        if (ctx.state === 'suspended') ctx.resume();
        var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);
      } catch (e) {}
    }
    function tones(list, type) {
      try {
        if (!ctx) unlock(); if (!ctx) return;
        var t = ctx.currentTime + 0.02;
        list.forEach(function (n) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = type || 'sine'; o.frequency.value = n[0];
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + n[1]);
          o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + n[1] + 0.02); t += n[1] * 0.85;
        });
      } catch (e) {}
    }
    function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
    return {
      unlock: unlock,
      scan: function () { tones([[1320, 0.12]], 'square'); buzz(60); },
      ok: function () { tones([[880, 0.14], [1175, 0.14], [1568, 0.32]]); buzz([80, 60, 120]); },
      warn: function () { tones([[880, 0.16], [660, 0.3]], 'triangle'); buzz([120, 80, 120]); },
      bad: function () { tones([[300, 0.22], [220, 0.4]], 'sawtooth'); buzz([250, 100, 250]); }
    };
  })();

  /* ---------- ตัวเลือกเดือน/ปี: ลูกศร + เลือกเดือน + เลือกปี + ปุ่มเดือนนี้ ---------- */
  function yearsAround(y) { var now = new Date().getFullYear(), a = Math.min(2025, y, now - 1), b = Math.max(now + 1, y), o = []; for (var i = a; i <= b; i++) o.push(i); return o; }
  function monthPicker(id, ym) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7), cur = ymd(new Date()).slice(0, 7);
    return '<div class="mpick" id="' + id + '"><button type="button" class="icon-btn" data-step="-1" aria-label="เดือนก่อน">‹</button>' +
      '<select data-part="m" aria-label="เดือน">' + TH_MF.map(function (n, i) { return '<option value="' + (i + 1) + '"' + (i + 1 === m ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>' +
      '<select data-part="y" aria-label="ปี">' + yearsAround(y).map(function (v) { return '<option value="' + v + '"' + (v === y ? ' selected' : '') + '>' + (v + 543) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="icon-btn" data-step="1" aria-label="เดือนถัดไป">›</button>' +
      (ym !== cur ? '<button type="button" class="btn ghost sm" data-now>เดือนนี้</button>' : '') + '</div>';
  }
  function bindMonthPicker(id, ym, cb) {
    var el = document.getElementById(id); if (!el) return;
    var ms = el.querySelector('[data-part=m]'), ys = el.querySelector('[data-part=y]');
    var pick = function () { cb(ys.value + '-' + pad(+ms.value)); };
    ms.onchange = pick; ys.onchange = pick;
    el.querySelectorAll('[data-step]').forEach(function (b) { b.onclick = function () { cb(addMonth(ym, +b.dataset.step)); }; });
    var nb = el.querySelector('[data-now]'); if (nb) nb.onclick = function () { cb(ymd(new Date()).slice(0, 7)); };
  }
  function yearPicker(id, y) {
    return '<div class="mpick" id="' + id + '"><button type="button" class="icon-btn" data-step="-1" aria-label="ปีก่อน">‹</button><select data-part="y" aria-label="ปี">' +
      yearsAround(y).map(function (v) { return '<option value="' + v + '"' + (v === y ? ' selected' : '') + '>ปี ' + (v + 543) + '</option>'; }).join('') +
      '</select><button type="button" class="icon-btn" data-step="1" aria-label="ปีถัดไป">›</button></div>';
  }
  function bindYearPicker(id, y, cb) {
    var el = document.getElementById(id); if (!el) return;
    el.querySelector('[data-part=y]').onchange = function () { cb(+this.value); };
    el.querySelectorAll('[data-step]').forEach(function (b) { b.onclick = function () { cb(y + +b.dataset.step); }; });
  }

  var ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/></svg>',
    cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    leave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12l4 4v12H4z"/><path d="M8 12h8M8 16h5"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
    gauge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a8 8 0 1116 0"/><path d="M12 14l4-4"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5"/><path d="M16 4.5a3.5 3.5 0 010 7M18 15c2 .6 3.4 2.2 4 5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>'
  };

  return {
    REMOTE: REMOTE, TH_M: TH_M, TH_MF: TH_MF, TH_D: TH_D, TH_DF: TH_DF, ST: ST, REQ: REQ, ICON: ICON,
    pad: pad, ymd: ymd, hm: hm, esc: esc, thDate: thDate, thRange: thRange, thMonth: thMonth, addMonth: addMonth,
    fmtLate: fmtLate, fmtDays: fmtDays, avatar: avatar, person: person, pill: pill, stPill: stPill, reqPill: reqPill, leaveLabel: leaveLabel,
    store: store, toast: toast, makeApi: makeApi, calendar: calendar, readPhoto: readPhoto, modal: modal, closeModal: closeModal,
    csv: csv, parseCsv: parseCsv, download: download, sound: sound, onFresh: onFresh, cacheClear: cacheClear, idle: idle,
    monthPicker: monthPicker, bindMonthPicker: bindMonthPicker, yearPicker: yearPicker, bindYearPicker: bindYearPicker
  };
})();
