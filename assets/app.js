/* TESR Time Clock — shared client helpers (ใช้ทั้งหน้าพนักงานและหน้าแอดมิน) */
var APP = (function () {
  var API_URL = String(window.TESR_API_URL || '').trim();
  var REMOTE = !!API_URL;
  var TH_M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var TH_MF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var TH_D = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
  var TH_DF = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  var ST = { ok: ['ok', 'มา'], late: ['late', 'สาย'], absent: ['absent', 'ขาด'], leave: ['leave', 'ลา'], pending: ['idle', 'ยังไม่เข้างาน'], holiday: ['holiday', 'วันหยุด'], off: ['off', 'วันหยุด'], future: ['future', '—'] };
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
  function makeApi(tokenKey, onAuthFail) {
    return function (action, params) {
      var body = Object.assign({ action: action, token: store.get(tokenKey) || '' }, params || {});
      var p;
      if (REMOTE) {
        p = fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
          .then(function (r) { return r.json(); }, function () { throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'); })
          .catch(function (e) { if (e && e.message && /เชื่อมต่อ/.test(e.message)) throw e; throw new Error('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'); });
      } else {
        p = new Promise(function (res) { setTimeout(function () { res(JSON.parse(JSON.stringify(TC.handle(TCMock.adapter, body)))); }, 120); });
      }
      return p.then(function (j) {
        if (!j.ok) { if (j.code === 'AUTH' && onAuthFail) onAuthFail(); var e = new Error(j.error || 'เกิดข้อผิดพลาด'); e.code = j.code; throw e; }
        return j.data;
      });
    };
  }

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
    csv: csv, parseCsv: parseCsv, download: download
  };
})();
