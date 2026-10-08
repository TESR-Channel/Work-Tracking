/* =====================================================================
 * TESR Time Clock — Supabase Edge Function (แทน Google Apps Script)
 * ใช้ logic ไฟล์เดียวกัน (assets/core.js) · ไฟล์นี้คือส่วนที่ต่อกับฐานข้อมูล Postgres + Storage
 *
 * ข้อมูลทุกตารางเก็บในตาราง public.tc_rows (tbl, key, data jsonb) — 1 แถว = 1 แถวของชีตเดิม
 * ทุกคำขอ: โหลดข้อมูลทั้งหมด → TC.handle คำนวณในหน่วยความจำ → บันทึกเฉพาะแถวที่เปลี่ยน
 * build: ./build.sh รวมไฟล์นี้กับ core.js เป็น supabase/functions/tesr/index.ts
 * ===================================================================== */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SECRET = Deno.env.get('TC_SECRET') || SB_KEY; // ใช้ลงลายเซ็น token / QR (อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น)
const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

const KEYS: Record<string, (o: any) => string> = {
  Employees: o => String(o.id),
  Records: o => String(o.date) + '|' + String(o.empId),
  Leaves: o => String(o.id),
  Adjustments: o => String(o.id),
  Holidays: o => String(o.date)
};
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, apikey', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };

let BKK: Intl.DateTimeFormat | null = null;
try { BKK = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); } catch (_) { /* ใช้ +7 ชม. แทน */ }
function nowBkk() {
  const ms = Date.now(), p: Record<string, string> = {};
  if (BKK) BKK.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  else { const t = new Date(ms + 7 * 3600000), z = (n: number) => String(n).padStart(2, '0'); Object.assign(p, { year: String(t.getUTCFullYear()), month: z(t.getUTCMonth() + 1), day: z(t.getUTCDate()), hour: z(t.getUTCHours()), minute: z(t.getUTCMinutes()), second: z(t.getUTCSeconds()) }); }
  const date = `${p.year}-${p.month}-${p.day}`, hh = p.hour === '24' ? '00' : p.hour;
  return { date, time: `${hh}:${p.minute}`, iso: `${date}T${hh}:${p.minute}:${p.second}`, ms };
}

async function loadAll() {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('tc_rows').select('tbl,key,data').range(from, from + 999);
    if (error) throw new Error('อ่านฐานข้อมูลไม่สำเร็จ: ' + error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function makeAdapter(all: any[]) {
  const tables: Record<string, any[]> = {}, settings: Record<string, string> = {}, cache: Record<string, string> = {};
  const origKey = new WeakMap<object, string>();
  const ups = new Map<string, any>(), dels = new Map<string, any>(), uploads: any[] = [];
  const now = Date.now();
  for (const r of all) {
    if (r.tbl === 'Settings') settings[r.key] = String(r.data?.v ?? '');
    else if (r.tbl === 'Cache') { if (r.data && r.data.exp > now) cache[r.key] = String(r.data.v); }
    else { const o = { ...r.data }; origKey.set(o, r.key); (tables[r.tbl] ||= []).push(o); }
  }
  const put = (tbl: string, key: string, data: any) => { const id = tbl + '\u0000' + key; dels.delete(id); ups.set(id, { tbl, key, data, updated_at: new Date().toISOString() }); };
  const del = (tbl: string, key: string) => { const id = tbl + '\u0000' + key; ups.delete(id); dels.set(id, { tbl, key }); };
  const clean = (o: any) => { const d: any = {}; for (const k in o) if (k !== '_row' && o[k] !== undefined) d[k] = o[k] === null ? '' : String(o[k]); return d; };
  const A: any = {
    rows: (t: any) => (tables[t.name] ||= []),
    insert(t: any, obj: any) { const o = { ...obj }; const k = KEYS[t.name](o); origKey.set(o, k); A.rows(t).push(o); put(t.name, k, clean(o)); return o; },
    update(t: any, ref: any, patch: any) {
      Object.assign(ref, patch); const k = KEYS[t.name](ref), old = origKey.get(ref);
      if (old && old !== k) del(t.name, old);
      origKey.set(ref, k); put(t.name, k, clean(ref));
    },
    remove(t: any, ref: any) { const arr = A.rows(t), i = arr.indexOf(ref); if (i >= 0) arr.splice(i, 1); del(t.name, origKey.get(ref) || KEYS[t.name](ref)); },
    getSettings: () => settings,
    setSetting(k: string, v: any) { settings[k] = String(v); put('Settings', k, { v: String(v) }); },
    now: nowBkk,
    sha256: (s: string) => createHash('sha256').update(s, 'utf8').digest('hex'),
    hmac: (s: string) => createHmac('sha256', SECRET).update(s, 'utf8').digest('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 32),
    uuid: () => randomUUID().replace(/-/g, '').slice(0, 10),
    cacheGet: (k: string) => cache[k] ?? null,
    cachePut(k: string, v: string, sec: number) { cache[k] = String(v); put('Cache', k, { v: String(v), exp: Date.now() + (sec || 600) * 1000 }); },
    lock: (fn: () => any) => fn(),
    savePhoto(e: any, mime: string, b64: string) {
      const path = `${e.code || e.id}-${Date.now()}.jpg`;
      uploads.push({ bucket: 'photos', path, b64, mime: mime || 'image/jpeg' });
      return `${SB_URL}/storage/v1/object/public/photos/${encodeURIComponent(path)}`;
    },
    saveSelfie(e: any, date: string, kind: string, b64: string) {
      const path = `${date}/${e.code || e.id}_${kind}_${randomUUID().slice(0, 8)}.jpg`;
      uploads.push({ bucket: 'selfies', path, b64, mime: 'image/jpeg' });
      return path;
    },
    getSelfie: (ref: string) => '__SIGN__' + ref,
    buildMonthSheet: null
  };
  async function flush() {
    for (const u of uploads) {
      const { error } = await sb.storage.from(u.bucket).upload(u.path, Buffer.from(u.b64, 'base64'), { contentType: u.mime, upsert: true });
      if (error) throw new Error('อัปโหลดรูปไม่สำเร็จ: ' + error.message);
    }
    if (ups.size) { const { error } = await sb.from('tc_rows').upsert([...ups.values()], { onConflict: 'tbl,key' }); if (error) throw new Error('บันทึกไม่สำเร็จ: ' + error.message); }
    for (const d of dels.values()) { const { error } = await sb.from('tc_rows').delete().match(d); if (error) throw new Error('ลบไม่สำเร็จ: ' + error.message); }
  }
  return { A, flush, dirty: () => ups.size + dels.size + uploads.length > 0 };
}

/** ลบเซลฟี่ที่เก่ากว่าที่ตั้งไว้ (วันละครั้ง ตอนแอดมินเปิดระบบ) */
async function cleanupSelfies(days: number) {
  if (!(days > 0)) return;
  const cut = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data } = await sb.storage.from('selfies').list('', { limit: 1000 });
  for (const f of data || []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.name) || f.name >= cut) continue;
    const { data: files } = await sb.storage.from('selfies').list(f.name, { limit: 1000 });
    const paths = (files || []).map(x => f.name + '/' + x.name);
    if (paths.length) await sb.storage.from('selfies').remove(paths);
  }
}

function json(o: any, status = 200) { return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } }); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, data: 'TESR Time Clock API (Supabase)' });
  let p: any = {};
  try { p = JSON.parse(await req.text() || '{}'); } catch (_) { return json({ ok: false, error: 'คำขอไม่ถูกต้อง' }); }
  try {
    const { A, flush, dirty } = makeAdapter(await loadAll());
    const res: any = TC.handle(A, p);
    // บันทึกเสมอ (รวมถึงตอนล็อกอินผิด เพื่อนับครั้งที่ผิด) · ถ้าบันทึกไม่สำเร็จ แจ้งเป็น error
    if (dirty()) await flush();
    if (res.ok && p.action === 'selfie' && res.data && typeof res.data.data === 'string' && res.data.data.indexOf('__SIGN__') === 0) {
      const { data, error } = await sb.storage.from('selfies').createSignedUrl(res.data.data.slice(8), 3600);
      res.data.data = error ? '' : data.signedUrl;
    }
    if (res.ok && p.action === 'sync' && res.data && res.data.role === 'admin') {
      const S = A.getSettings(), key = 'cleanup:' + nowBkk().date;
      if (!A.cacheGet(key)) { A.cachePut(key, '1', 172800); try { await cleanupSelfies(Number(S.selfieDays === undefined || S.selfieDays === '' ? 90 : S.selfieDays)); await flush(); } catch (_) { /* ไม่สำคัญ */ } }
    }
    return json(res);
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || String(e) });
  }
});
