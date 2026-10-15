// รูปที่ 4 ของ Full paper CSTI-MJU8: แคปหน้าจอจากเว็บจริง (จอมือถือ 390×844 · ความละเอียด 3 เท่า) แล้วเรียง 4 ภาพเป็นแถวเดียว
//   (ก) เมนูหมวด 1  (ข) เมนูฝึกฟัง  (ค) แยกเสียงตอบผิด: เปิดเสียงวรรณยุกต์ 2 แต่เลือกวรรณยุกต์ 3 (TL-TONE-T2AS3) + คำอธิบาย
//   (ง) เรียงประโยคตอบผิด + "ต่างจากไทยตรงไหน" (ประโยคที่ผูกหน่วยความรู้ข้อผิดคนไทย)
// วิธีใช้ (รากโปรเจกต์):  node scripts/shoot_paper_fig4.cjs
//   ต้องมี playwright-core + Chromium → ระบุด้วย env PLAYWRIGHT_CORE (โฟลเดอร์แพ็กเกจ) และ CHROME (chrome.exe) ถ้าไม่ได้อยู่ที่ค่าเริ่มต้น
// เอาต์พุต: docs/01_เอกสารโครงงาน/fullpaper-รูป/รูป4-หน้าจอ.png (ภาพดิบเก็บในโฟลเดอร์ชั่วคราวของเครื่อง)
// ซ่อนแถบเมนูล่าง (fixed) ตอนแคปเต็มหน้า และครอปแถบหัวแอปออก · ใช้เครื่องใหม่ทุกครั้ง = ข้อมูลผู้เรียนว่าง (สถานะสาธิต)
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core");
const CHROME = process.env.CHROME || "C:/Users/Lenovo/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe";
const BASE = process.env.BASE || "https://intelligent-chinese-tutoring-system.vercel.app";
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "paper-fig4-"));
const FINAL = path.join(__dirname, "..", "docs", "01_เอกสารโครงงาน", "fullpaper-รูป", "รูป4-หน้าจอ.png");
const DRAFT = "คำอธิบายฉบับร่าง";
const HEADER = 62;   // ความสูงแถบหัวแอป (css px) ที่ครอปออก

const box = async (loc) => { const b = await loc.boundingBox(); return b && { x: b.x, y: b.y, w: b.width, h: b.height }; };
const pageY = async (page) => page.evaluate(() => window.scrollY);

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: "th-TH" });
  const page = await ctx.newPage();
  const meta = {};
  const hideNav = () => page.addStyleTag({ content: "nav.fixed{display:none!important}" }); // แถบเมนูล่างแบบ fixed ทับเนื้อหาตอนแคปเต็มหน้า
  const full = async (name, need) => {
    await hideNav();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true });
    meta[name] = need;
    console.log(name, JSON.stringify(need));
  };

  // (ก) เมนูหมวด 1
  await page.goto(BASE + "/learn/category?cat=1", { waitUntil: "networkidle" });
  await page.getByText("ฝึกพูด", { exact: true }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  const speakCard = await box(page.getByRole("link", { name: /^ฝึกพูด/ }));
  const listenCard = await box(page.getByRole("link", { name: /^ฝึกฟัง/ }));
  await full("a-category", { top: 0, bottom: speakCard.y + speakCard.h + 16, cards: [listenCard, speakCard] });

  // (ข) เมนูฝึกฟัง (เข้าจากการ์ดในหมวด เหมือนผู้ใช้จริง)
  await page.getByRole("link", { name: /^ฝึกฟัง/ }).click();
  await page.waitForURL((u) => u.search.includes("group=listen"), { timeout: 30000 });
  await page.getByText("เลือกแบบฝึกได้").waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  const lastCard = await box(page.locator("a.rounded-2xl, button.rounded-2xl").filter({ hasText: "ฟังบทสนทนา" }).first());
  await full("b-listen-menu", { top: 0, bottom: lastCard.y + lastCard.h + 16 });

  // (ค) แยกเสียง: สุ่มจนได้ข้อที่ตอบผิดและมีคำอธิบายจุดผิดคนไทย (ป้ายหน่วยความรู้ + คำอธิบายฉบับร่าง)
  let got = false;
  for (let attempt = 1; attempt <= 150 && !got; attempt++) {
    await page.goto(BASE + "/practice/ear", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /เริ่มฟัง/ }).click();
    await page.getByText(/ข้อ 1\//).waitFor({ timeout: 20000 });
    const choices = page.locator("div.grid.grid-cols-2.gap-3 > button");
    const n = await choices.count();
    // อยากได้ตัวอย่างเดียวกับบทความ: เสียงที่เปิดเป็นวรรณยุกต์ 2 แต่เลือกวรรณยุกต์ 3 (TL-TONE-T2AS3) → แตะตัวเลือกที่มีวรรณยุกต์ 3
    const texts = await choices.allInnerTexts();
    let pick = texts.findIndex((t) => /[ǎěǐǒǔǚ]/.test(t));
    if (pick < 0) continue;
    await choices.nth(pick).click();
    await page.waitForTimeout(500);
    const body = await page.locator("body").innerText();
    if (!body.includes("ถูกต้อง!") && body.includes("เสียง 2 เพี้ยนไปคล้ายเสียง 3")) {
      got = true;
      const fb = page.getByText(DRAFT).first();
      const fbBox = await box(fb);
      const card = await box(page.locator("div.flex.min-h-\\[28vh\\]").first());
      const y = await pageY(page);
      await full("c-ear-wrong", { top: card.y + y - 70, bottom: fbBox.y + fbBox.h + y + 16 });
      console.log("ear attempts:", attempt);
    }
  }
  if (!got) console.log("EAR: ไม่เจอข้อผิดที่มีหน่วยความรู้");

  // (ง) เรียงประโยค: ประโยคที่ผูกหน่วยความรู้ (มีคำอธิบายฉบับร่าง) + วางผิด
  got = false;
  for (let attempt = 1; attempt <= 60 && !got; attempt++) {
    await page.goto(BASE + "/practice?mode=order", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^ตรวจ$/ }).waitFor({ timeout: 20000 });
    const pool = page.locator("[data-pool] > button");
    // วางกลับด้าน (ตัวท้ายก่อน) = เรียงผิดแน่นอนเกือบทุกครั้ง
    for (let k = await pool.count(); k > 0; k--) { await pool.nth(k - 1).click(); await page.waitForTimeout(120); }
    await page.getByRole("button", { name: /^ตรวจ$/ }).click();
    await page.waitForTimeout(500);
    const body = await page.locator("body").innerText();
    if (body.includes("ต่างจากไทยตรงไหน") && body.includes(DRAFT)) {
      got = true;
      const tip = await box(page.getByText(DRAFT).first());
      const y = await pageY(page);
      await full("d-order-wrong", { top: 0, bottom: tip.y + tip.h + y + 16 });
      console.log("order attempts:", attempt);
    }
  }
  if (!got) console.log("ORDER: ไม่เจอประโยคที่ผูกหน่วยความรู้");

  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 1));
  const names = ["a-category", "b-listen-menu", "c-ear-wrong", "d-order-wrong"];
  if (names.some((n) => !meta[n])) { console.log("ภาพไม่ครบ ไม่ประกอบรูป"); await browser.close(); process.exit(1); }

  // ประกอบ: 4 ภาพสูงเท่ากัน (ตัดหัวแอป · สูงพอให้ภาพที่ยาวสุดเห็นครบ) เรียงแถวเดียว + ป้าย (ก)–(ง)
  const H = Math.ceil(Math.max(...names.map((n) => meta[n].bottom))) + 30 - HEADER;
  const GAP = 28, PAD = 12, LAB = 46, W = 4 * 390 + 3 * GAP + 2 * PAD;
  const panels = names.map((n, i) => `<div class="p"><div class="ph"><img src="file:///${path.join(OUT, n + ".png").split(path.sep).join("/")}"></div><div class="lab">(${"กขคง"[i]})</div></div>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}
    #c{display:flex;gap:${GAP}px;padding:${PAD}px;width:${W}px;box-sizing:border-box;font-family:"Leelawadee UI",sans-serif}
    .ph{width:390px;height:${H}px;overflow:hidden;border:1.5px solid #c9d3df;border-radius:16px;box-sizing:content-box}
    .ph img{width:390px;display:block;margin-top:-${HEADER}px}.lab{text-align:center;font-size:24px;line-height:${LAB - 8}px;margin-top:8px;color:#222}
    </style></head><body><div id="c">${panels}</div></body></html>`;
  const htmlPath = path.join(OUT, "compose.html");
  fs.writeFileSync(htmlPath, html);
  const cpage = await (await browser.newContext({ viewport: { width: W, height: H + LAB + 2 * PAD + 4 }, deviceScaleFactor: 2 })).newPage();
  await cpage.goto("file:///" + htmlPath.split(path.sep).join("/"));
  await cpage.waitForTimeout(800);
  await cpage.locator("#c").screenshot({ path: FINAL });
  console.log("wrote", FINAL, fs.statSync(FINAL).size, "bytes · panel height", H, "css px");
  await browser.close();
})();
