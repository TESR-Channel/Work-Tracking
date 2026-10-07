#!/bin/sh
# รวม Sheets adapter + core logic เป็นไฟล์เดียวสำหรับวางใน Apps Script
cd "$(dirname "$0")"
{ cat src/sheets-adapter.gs; echo; sed '/^if (typeof module/d' assets/core.js; } > apps-script/Code.gs
