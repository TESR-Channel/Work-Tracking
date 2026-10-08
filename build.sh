#!/bin/sh
# รวม Sheets adapter + core logic เป็นไฟล์เดียวสำหรับวางใน Apps Script
cd "$(dirname "$0")"
{ cat src/sheets-adapter.gs; echo; sed '/^if (typeof module/d' assets/core.js; } > apps-script/Code.gs
# Supabase Edge Function: core.js + ตัวต่อฐานข้อมูล → supabase/functions/tesr/index.ts
mkdir -p supabase/functions/tesr
{ echo '// @ts-nocheck'; echo '// ไฟล์นี้สร้างจาก ./build.sh — แก้ที่ assets/core.js หรือ src/supabase-edge.ts แทน'; grep '^import ' src/supabase-edge.ts; sed '/^if (typeof module/d' assets/core.js; grep -v '^import ' src/supabase-edge.ts; } > supabase/functions/tesr/index.ts
