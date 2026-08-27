/* ฟอร์ม RSVP: ชิปจำนวน + รายชื่อรายคน + payload */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const url = f => 'file://' + join(ROOT, f);
/* คอนเทนเนอร์บางตัวมี chromium ติดมาแล้วคนละเวอร์ชันกับ playwright */
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const launch = existsSync(PINNED) ? { executablePath: PINNED } : {};

const CARD = url('index.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };

const b = await chromium.launch(launch);
const ctx = await b.newContext();
const page = await ctx.newPage();
let posted = null;
await page.route('**script.google.com**', r => {
  const d = r.request().postData();
  if (d) posted = d;
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
});
await page.route('**api.qrserver.com**', r => r.abort());
page.on('pageerror', e => { console.log('  JS ERROR: ' + e.message); fails++; });

// ── invite for 10 seats ───────────────────────────────────────────────
await page.goto(CARD + '?to=' + encodeURIComponent('สมชาย ใจดี') + '&n=10', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#rsvpForm', { timeout: 20000 });
await page.waitForTimeout(400);

console.log('\nเชิญ 10 ที่นั่ง (?n=10)');
ok(await page.locator('.seg-cnt button').count() === 10, 'ชิปเลขขึ้นครบ 10 ปุ่ม');
ok(await page.locator('.seg-cnt').evaluate(e => e.classList.contains('grid')), 'ใช้เลย์เอาต์ชิป (grid)');
ok(await page.locator('#partyWrap').isHidden(), 'ยังไม่ตอบรับ → รายชื่อยังไม่ขึ้น');
ok(await page.locator('#g2wrap').isHidden() && await page.locator('#dietWrap').isHidden(),
   'ช่องผู้ติดตามเดี่ยว + แพ้อาหารรวม ถูกซ่อน');

await page.evaluate(() => document.querySelector('.seg-att button[data-att="yes"]').click());
await page.waitForTimeout(150);
ok(await page.locator('#partyWrap .party-row').count() === 1, 'ตอบรับแล้ว ค่าเริ่มต้น = 1 ท่าน');
ok((await page.locator('#pn1').textContent()).trim() === 'สมชาย ใจดี', 'ท่านที่ 1 ดึงชื่อจากช่องบนอัตโนมัติ');

for (const k of [5, 10, 3]) {
  await page.evaluate(n => document.querySelector('.seg-cnt button[data-cnt="' + n + '"]').click(), k);
  await page.waitForTimeout(120);
  const rows = await page.locator('#partyWrap .party-row').count();
  const names = await page.locator('#partyWrap input.pr-name').count();
  const diets = await page.locator('#partyWrap input.pr-diet').count();
  ok(rows === k && names === k - 1 && diets === k,
     `กด ${k} → ${rows} การ์ด · ช่องชื่อ ${names} (+ท่านที่1 จากช่องบน) · ช่องแพ้อาหาร ${diets}`);
}

// ── ค่าที่พิมพ์ต้องไม่หายตอนเปลี่ยนจำนวน ────────────────────────────
await page.evaluate(() => document.querySelector('.seg-cnt button[data-cnt="5"]').click());
await page.waitForTimeout(120);
await page.fill('#pd1', 'แพ้กุ้ง');
await page.fill('#pn2', 'สมหญิง รักดี');
await page.fill('#pd2', 'มังสวิรัติ');
await page.fill('#pn3', 'ก้อง ดีงาม');
await page.fill('#pn4', 'ใบเตย สดใส');
await page.fill('#pn5', 'ปีเตอร์ แสนดี');
await page.fill('#pd5', 'ไม่ทานเนื้อวัว');
await page.evaluate(() => document.querySelector('.seg-cnt button[data-cnt="2"]').click());
await page.waitForTimeout(100);
await page.evaluate(() => document.querySelector('.seg-cnt button[data-cnt="5"]').click());
await page.waitForTimeout(120);
console.log('\nกดสลับจำนวนไปกลับ');
ok(await page.inputValue('#pn3') === 'ก้อง ดีงาม' && await page.inputValue('#pd5') === 'ไม่ทานเนื้อวัว',
   'ชื่อ/อาหารที่พิมพ์ไว้ยังอยู่ครบหลังเปลี่ยนจำนวนไปกลับ');

// ── validation: เว้นชื่อว่าง ─────────────────────────────────────────
console.log('\nตรวจความครบถ้วน');
await page.fill('#pn4', '');
await page.evaluate(() => document.getElementById('sendBtn').click());
await page.waitForTimeout(250);
ok(posted === null, 'ชื่อไม่ครบ → ไม่ส่งขึ้นชีต');
ok((await page.locator('#rsvpNote').getAttribute('class') || '').includes('err'), 'ขึ้นข้อความเตือนสีแดง');
ok(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'pn4',
   'เคอร์เซอร์กระโดดไปช่องที่ยังว่าง (pn4)');

// ── ส่งจริง ──────────────────────────────────────────────────────────
await page.fill('#pn4', 'ใบเตย สดใส');
await page.fill('#gmsg', 'ยินดีด้วยนะ');
await page.evaluate(() => document.getElementById('sendBtn').click());
await page.waitForTimeout(1200);
console.log('\npayload ที่ส่งขึ้นชีต');
ok(!!posted, 'ยิง POST ออกไปแล้ว');
if (posted) {
  const p = JSON.parse(posted);
  console.log(JSON.stringify(p, null, 2).split('\n').map(l => '        ' + l).join('\n'));
  ok(p.seats === '5', 'seats = 5');
  ok(p.guests.length === 5, 'guests[] ครบ 5 คน');
  ok(p.guests[0].n === 'สมชาย ใจดี' && p.guests[0].d === 'แพ้กุ้ง', 'ท่านที่ 1 ชื่อ+อาหารถูก');
  ok(p.name === 'สมชาย ใจดี และ สมหญิง รักดี และ ก้อง ดีงาม และ ใบเตย สดใส และ ปีเตอร์ แสนดี',
     'name รวมชื่อทุกท่าน (ชีตตัวเดิมอ่านได้)');
  ok(p.diet.includes('สมชาย ใจดี: แพ้กุ้ง') && p.diet.includes('ปีเตอร์ แสนดี: ไม่ทานเนื้อวัว'),
     'diet ผูกชื่อไว้กับอาหารของแต่ละคน');
  ok(p.guestsText.split('\n').length === 5, 'guestsText 5 บรรทัด');
  ok(/^SL-/.test(p.code), 'มีรหัสแขก ' + p.code);
}
ok(await page.locator('.done-party').count() === 1, 'การ์ดยืนยันโชว์รายชื่อให้ทวน');

// ── เชิญ 1 ที่นั่ง → ต้องซ่อนตัวเลือกจำนวน ──────────────────────────
console.log('\nเชิญ 1 ที่นั่ง (?n=1)');
const p2 = await ctx.newPage();
await p2.route('**script.google.com**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await p2.goto(CARD + '?to=' + encodeURIComponent('เดี่ยว คนเดียว') + '&n=1', { waitUntil: 'domcontentloaded' });
await p2.waitForSelector('#rsvpForm', { timeout: 20000 });
await p2.waitForTimeout(300);
ok(await p2.locator('#seatsBlock').isHidden(), 'ซ่อนคำถามจำนวนทั้งช่อง');
await p2.evaluate(() => document.querySelector('.seg-att button[data-att="yes"]').click());
await p2.waitForTimeout(150);
ok(await p2.locator('#partyWrap .party-row').count() === 1, 'มีการ์ดเดียว (ตัวเอง)');
ok(await p2.locator('#pd1').count() === 1, 'ยังมีช่องแพ้อาหารของตัวเอง');

// ── ลิงก์ทั่วไป ไม่มี n= → คงพฤติกรรมเดิม 2 ปุ่ม ───────────────────
console.log('\nลิงก์ทั่วไป (ไม่มี ?n= → ใช้ CFG.maxSeats)');
const p3 = await ctx.newPage();
await p3.route('**script.google.com**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await p3.goto(CARD, { waitUntil: 'domcontentloaded' });
await p3.waitForSelector('#rsvpForm', { timeout: 20000 });
await p3.waitForTimeout(300);
const cap = await p3.evaluate(() => Number(window.CFG && window.CFG.maxSeats) || 0);
ok(await p3.locator('.seg-cnt button').count() === Math.min(cap || 2, 10),
   'จำนวนชิปตรงกับ CFG.maxSeats ของการ์ด (= ' + cap + ')');

await b.close();
console.log('\n' + (fails ? '✗ ' + fails + ' ข้อไม่ผ่าน' : '✓ ผ่านทั้งหมด'));
process.exit(fails ? 1 : 0);
