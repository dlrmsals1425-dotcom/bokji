/** 운영자 문장 흐름 스크린샷: npx tsx scripts/shots-sentence.ts [baseURL]
 *  shots/sentence-prefill.png (홈 검색창 문장 → '이렇게 이해했어요' 확인)
 *  shots/test-parent-suwon-59.png · -mobile.png (확인 → 부모님 결과)
 */
import { chromium, type Browser } from "@playwright/test";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3217";
const OUT = path.resolve(__dirname, "../shots");
const SENTENCE = "수원시 소재에 계시고 59년생 부모님 두분이 계신다";

async function run(browser: Browser, mobile: boolean) {
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" }
      : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1, locale: "ko-KR" },
  );
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(BASE + "/");
  await page.locator("#home-q").fill(SENTENCE);
  await page.locator("#home-q").press("Enter");
  await page.getByTestId("prefill-banner").waitFor({ timeout: 20_000 });
  if (!mobile) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${OUT}/sentence-prefill.png`, fullPage: true });
  } else {
    await page.getByTestId("prefill-banner").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/sentence-prefill-mobile.png`, fullPage: false });
  }
  await page.getByTestId("prefill-confirm").click();
  await page.getByTestId("top-picks").waitFor({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/test-parent-suwon-59${mobile ? "-mobile" : ""}.png`, fullPage: !mobile });
  if (mobile) {
    await page.evaluate(() => {
      const el = document.querySelector('[data-testid="top-picks"]');
      if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8);
    });
    await page.screenshot({ path: `${OUT}/test-parent-suwon-59-mobile-picks.png` });
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  await run(browser, false);
  await run(browser, true);
  await browser.close();
  console.log("saved: sentence-prefill.png, sentence-prefill-mobile.png, test-parent-suwon-59.png, test-parent-suwon-59-mobile.png, test-parent-suwon-59-mobile-picks.png");
})();
