/** 원문 글자 정리 후 상세 화면: npx tsx scripts/shots-detail-entities.ts [baseURL]
 *  shots/detail-entities-fixed.png — 지역아동센터 지원: 지원대상(선정 기준 펼침) · 지원내용
 */
import { chromium } from "@playwright/test";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3217";
const OUT = path.resolve(__dirname, "../shots/detail-entities-fixed.png");

(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR" })).newPage();
  await page.goto(BASE + "/p/n.bokjiro-WLF00001107");
  await page.locator("#sec-target").waitFor({ timeout: 20_000 });
  const more = page.locator("#sec-target").getByRole("button", { name: "원문 더 보기" });
  for (let i = 0; i < (await more.count()); i++) await more.nth(i).click();
  await page.waitForTimeout(300);
  const t = await page.locator("#sec-target").boundingBox();
  const bn = await page.locator("#sec-benefit").boundingBox();
  const y = Math.max(0, (t?.y ?? 0) - 16);
  await page.screenshot({ path: OUT, fullPage: true, clip: { x: 0, y, width: 1280, height: Math.min(2600, (bn ? bn.y + bn.height : y + 1600) - y + 16) } });
  const txt = await page.locator("main").innerText();
  console.log(JSON.stringify({ entities: (txt.match(/&#\d+;|&[a-z]+;/g) ?? []).length, pua: (txt.match(/[\uE000-\uF8FF\uFFFD]/g) ?? []).length }));
  await b.close();
})();
