/** 문장 해석 스크린샷 (데스크톱): npx tsx scripts/shots-sentence.ts [baseURL]
 *  shots/sentence-yongin-86.png          — 홈 문장 → 이렇게 이해했어요 (소득·같이 사는 사람·배우자 없이 단추)
 *  shots/sentence-yongin-86-results.png  — 확인 → 결과 맨 위 (다시 묻지 않음)
 */
import { chromium, type Page } from "@playwright/test";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3217";
const OUT = path.resolve(__dirname, "../shots");
const SENTENCE = "용인시에 사는 86년생이야, 자녀는 2명이 있어. 월급은 세후 400정도되";

/** 맨 위부터 요소 아래 끝까지 */
async function shotUntil(page: Page, testId: string, file: string) {
  const box = await page.getByTestId(testId).boundingBox();
  const h = Math.ceil((box?.y ?? 0) + (box?.height ?? 800) + 24);
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: 1280, height: Math.min(h, 2400) }, fullPage: true });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(BASE + "/");
  await page.locator("#home-q").fill(SENTENCE);
  await page.locator("#home-q").press("Enter");
  await page.getByTestId("prefill-banner").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shotUntil(page, "prefill-banner", "sentence-yongin-86.png");
  await page.getByTestId("prefill-confirm").click();
  await page.getByTestId("v2-followup").waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await shotUntil(page, "v2-followup", "sentence-yongin-86-results.png");
  await b.close();
  console.log("ok");
})();
