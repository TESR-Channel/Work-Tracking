/* เซิร์ฟเวอร์ของระบบ
 * ปัจจุบัน: Supabase Edge Function (เร็ว ~0.2–0.5 วิ) · ฐานข้อมูล Postgres + ที่เก็บรูป
 * สำรอง (ระบบเดิม): Google Apps Script — ถ้าจะกลับไปใช้ ให้เปลี่ยน URL เป็น .../exec แล้วลบบรรทัด TESR_BACKEND
 *   https://script.google.com/macros/s/AKfycbwG4sb1Y_CFZc_hfp8iT1Tk_3rAXAmZsZno4SnTEiFwxqKujS3thEMwxYBQhc2UhgO8/exec
 * ปล่อย URL ว่าง = โหมดทดลอง (ข้อมูลสมมุติในเบราว์เซอร์) */
window.TESR_API_URL = 'https://urwlybaqxfdzgxopcnpy.supabase.co/functions/v1/tesr';
window.TESR_BACKEND = 'supabase';
