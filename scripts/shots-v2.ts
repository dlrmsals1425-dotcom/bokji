/** v2 시험판(상황 먼저) 스크린샷: npx tsx scripts/shots-v2.ts [baseURL]
 *  shots/v2-situation-input.png  — '내 상황' 입력 (운영자 문장으로 채움, 나머지는 모름)
 *  shots/v2-followup.png         — 결과 맨 위 추가 질문 블록 (답하기 전)
 *  shots/v2-results.png          — '소득 월 300만원' 답한 뒤 (수급·차상위 아님으로 추정) 걸러진 결과
 *  shots/v2-followup-mobile.png · v2-results-mobile.png
 */
import { chromium, type Browser, type Page } from "@playwright/test";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3217";
const OUT = path.resolve(__dirname, "../shots");
const SENTENCE = "수원시 소재에 계시고 59년생 부모님 두분이 계신다";

async function counts(page: Page) {
  const n = async (id: string) => (await page.getByTestId(id).locator(".n").innerText()).trim();
  return `fit ${await n("v2-n-fit")} · office ${await n("v2-n-office")} · ask ${await n("v2-n-ask")} · no ${await n("v2-n-no")}`;
}

async function run(browser: Browser, mobile: boolean) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" }
      : { viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR" },
  );
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(BASE + "/situation?for=parent&new=1");
  await page.getByTestId("v2-text").fill(SENTENCE);
  await page.waitForFunction(() => ((document.querySelector("#sido") as HTMLSelectElement | null)?.options.length ?? 0) > 1);
  await page.getByTestId("v2-fill").click();
  await page.getByTestId("v2-understood").waitFor();
  if (!mobile) await page.screenshot({ path: `${OUT}/v2-situation-input.png`, fullPage: true });
  await page.getByTestId("v2-submit").click();
  await page.getByTestId("v2-followup").waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const before = await counts(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/v2-followup${mobile ? "-mobile" : ""}.png`, fullPage: false });
  if (mobile) {
    await page.getByTestId("v2-followup").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/v2-followup-mobile-q.png` });
  }
  await page.getByTestId("v2-a-income-input").fill("300");
  await page.getByTestId("v2-a-income-ok").click();
  await page.getByTestId("v2-inferred").waitFor();
  const after = await counts(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/v2-results${mobile ? "-mobile" : ""}.png`, fullPage: !mobile });
  console.log(mobile ? "mobile" : "desktop", "| before:", before, "| after 300만원:", after, "| url:", page.url());
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  await run(browser, false);
  await run(browser, true);
  await browser.close();
})();
