/* หน้าเช็คอิน + หน้าที่นั่ง: แสดงรายชื่อทั้งคณะ */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const url = f => 'file://' + join(ROOT, f);
/* คอนเทนเนอร์บางตัวมี chromium ติดมาแล้วคนละเวอร์ชันกับ playwright */
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launch = existsSync(PINNED) ? { executablePath: PINNED } : {};
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const b = await chromium.launch(launch);

const GUESTS = [{ n: 'สมชาย ใจดี', d: 'แพ้กุ้ง' }, { n: 'สมหญิง รักดี', d: '' }, { n: 'ก้อง ดีงาม', d: 'มังสวิรัติ' }];
const TEXT = '1. สมชาย ใจดี (แพ้กุ้ง)\n2. สมหญิง รักดี\n3. ก้อง ดีงาม (มังสวิรัติ)';

async function checkinPage(rowExtra, label) {
  const ctx = await b.newContext();
  await ctx.addInitScript(() => localStorage.setItem('slkey', 'x'));
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  JS ERROR: ' + e.message); fails++; });
  await p.route('**script.google.com**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ rows: [Object.assign({ name: 'สมชาย ใจดี และ สมหญิง รักดี และ ก้อง ดีงาม',
      code: 'SL-ABC', going: 'yes', seats: 3, table: '7', food: '', diet: 'สมชาย: แพ้กุ้ง', note: 'ยินดีด้วย' }, rowExtra)] })
  }));
  await p.goto(url('checkin.html'));
  await p.waitForSelector('.row', { timeout: 15000 });
  await p.locator('.row').first().click();
  await p.waitForTimeout(200);
  const has = await p.locator('#sheet .g-cell.roster').count();
  const txt = has ? (await p.locator('#sheet .g-cell.roster b').textContent()) : '';
  ok(has === 1 && txt.includes('ก้อง ดีงาม (มังสวิรัติ)'), label);
  await ctx.close();
}

console.log('\nหน้าเช็คอิน · checkin.html');
await checkinPage({ guestsText: TEXT }, 'ชีตส่ง guestsText (ข้อความ) → โชว์รายชื่อครบ');
await checkinPage({ guests: GUESTS }, 'ชีตส่ง guests (array) → โชว์รายชื่อครบ');
await checkinPage({ guests: JSON.stringify(GUESTS) }, 'ชีตส่ง guests (JSON string) → โชว์รายชื่อครบ');

{ // ชีตตัวเดิมที่ยังไม่มีคอลัมน์ใหม่ ต้องไม่พัง
  const ctx = await b.newContext();
  await ctx.addInitScript(() => localStorage.setItem('slkey', 'x'));
  const p = await ctx.newPage();
  p.on('pageerror', e => { console.log('  JS ERROR: ' + e.message); fails++; });
  await p.route('**script.google.com**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ rows: [{ name: 'เดี่ยว คนเดียว', code: 'SL-XYZ', going: 'yes', seats: 1, table: '3' }] }) }));
  await p.goto(url('checkin.html'));
  await p.waitForSelector('.row', { timeout: 15000 });
  await p.locator('.row').first().click();
  await p.waitForTimeout(200);
  ok(await p.locator('#sheet .g-cell.roster').count() === 0 && await p.locator('#sheet .g-cell.tb').count() === 1,
     'ชีตตัวเดิม (ไม่มีคอลัมน์ใหม่) → การ์ดแขกเหมือนเดิม ไม่พัง');
  await ctx.close();
}

console.log('\nหน้าที่นั่ง · table.html');
for (const [extra, label] of [
  [{ guestsText: TEXT }, 'guestsText → โชว์รายชื่อใต้เลขโต๊ะ'],
  [{ guests: GUESTS }, 'guests array → โชว์รายชื่อใต้เลขโต๊ะ'],
  [{}, 'ชีตตัวเดิม → การ์ดที่นั่งเหมือนเดิม ไม่พัง']]) {
  const p = await b.newPage();
  p.on('pageerror', e => { console.log('  JS ERROR: ' + e.message); fails++; });
  await p.route('**script.google.com**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify(Object.assign({ ok: true, name: 'สมชาย ใจดี และคณะ', table: '7', seats: 3 }, extra)) }));
  await p.goto(url('table.html') + '?c=SL-ABC');
  await p.waitForSelector('.card .tbl', { timeout: 15000 });
  await p.waitForTimeout(150);
  const n = await p.locator('.card .roster').count();
  const want = Object.keys(extra).length ? 1 : 0;
  const txt = n ? await p.locator('.card .roster').textContent() : '';
  ok(n === want && (!want || txt.includes('ก้อง ดีงาม (มังสวิรัติ)')), label);
  await p.close();
}

await b.close();
console.log('\n' + (fails ? '✗ ' + fails + ' ข้อไม่ผ่าน' : '✓ ผ่านทั้งหมด'));
process.exit(fails ? 1 : 0);
