#!/usr/bin/env node
/* แปะฟีเจอร์ "รายชื่อผู้ร่วมงานรายคน" กลับลง index.html หลังหลังบ้านเจนการ์ดใหม่
 *
 *   node scripts/apply-party-patch.mjs            # แปะลง index.html
 *   node scripts/apply-party-patch.mjs --check    # เช็คเฉย ๆ ไม่เขียนไฟล์
 *
 * ทุก edit มี mark ของตัวเอง — แปะซ้ำได้ไม่พัง ตัวไหนลงแล้วจะข้าม
 * ถ้าหา anchor ไม่เจอแปลว่า renderer เปลี่ยนโครง ต้องไปดู docs/party-roster.md
 * แล้วอัปเดต scripts/party-patch.json ตาม
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGET = join(ROOT, 'index.html');
const CHECK = process.argv.includes('--check');

const edits = JSON.parse(readFileSync(join(ROOT, 'scripts/party-patch.json'), 'utf8'));
let html = readFileSync(TARGET, 'utf8');

let applied = 0, already = 0;
const missing = [];

for (const e of edits) {
  if (html.includes(e.mark)) { already++; console.log(`  = ${e.name} — ลงอยู่แล้ว`); continue; }
  const hits = html.split(e.find).length - 1;
  if (hits !== 1) { missing.push({ ...e, hits }); console.log(`  ✗ ${e.name} — หา anchor ไม่เจอ (${hits} ที่)`); continue; }
  html = html.replace(e.find, e.repl);
  applied++;
  console.log(`  + ${e.name}`);
}

if (missing.length) {
  console.error(`\n✗ แปะไม่ครบ ${missing.length}/${edits.length} จุด — renderer น่าจะเปลี่ยนโครงแล้ว`);
  console.error('  ดู docs/party-roster.md §3 แล้วอัปเดต scripts/party-patch.json ให้ตรงโครงใหม่');
  process.exit(1);
}

if (CHECK) {
  console.log(`\n${applied ? `ยังขาด ${applied} จุด (โหมด --check ไม่เขียนไฟล์)` : 'ครบแล้วทุกจุด'}`);
  process.exit(applied ? 1 : 0);
}

if (applied) {
  writeFileSync(TARGET, html);
  console.log(`\n✓ แปะเพิ่ม ${applied} จุด (มีอยู่แล้ว ${already}) → index.html`);
  console.log('  รันเทสต์ต่อ: node test/rsvp-party.mjs && node test/roster-pages.mjs');
} else {
  console.log(`\n✓ ครบแล้วทั้ง ${already} จุด ไม่ต้องแก้อะไร`);
}
