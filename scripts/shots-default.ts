/** 기본 흐름(상황 먼저) 스크린샷: npx tsx scripts/shots-default.ts [baseURL]
 *  shots/home.png · home-mobile.png
 *  shots/situation-self.png    — 내 복지 입력 (청년·자녀 질문이 보이는 상태)
 *  shots/situation-parent.png  — 홈 문장 → 부모님 입력 (이렇게 이해했어요)
 *  shots/followup.png          — 운영자 문장 결과 맨 위 추가 질문
 *  shots/scenario-<예시 id>.png (+ scenario-owner-suwon-59.png, scenario-bucheon-disability-mobile.png) — 머리글 ~ 먼저 확인할 5가지
 *  shots/detail.png            — 상세: 내 답과 비교 + 남은 질문
 */
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3217";
const OUT = path.resolve(__dirname, "../shots");
const SENTENCE = "수원시 소재에 계시고 59년생 부모님 두분이 계신다";
const PRESETS = ["suwon-senior", "parent-care", "seongnam-single-parent", "goyang-youth", "bucheon-disability"];

const desktop = (b: Browser) => b.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 1, locale: "ko-KR" });
const mobile = (b: Browser) => b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });

async function fresh(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(BASE + "/");
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  return page;
}
/** 맨 위부터 요소 아래 끝까지 */
async function shotUntil(page: Page, testId: string, file: string, first = false) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const loc = page.getByTestId(testId);
  const box = await (first ? loc.first() : loc).boundingBox();
  const vw = page.viewportSize()!.width;
  const h = box ? Math.ceil(box.y + box.height + 24) : 1000;
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true, clip: { x: 0, y: 0, width: vw, height: h } });
}
async function counts(page: Page) {
  const n = async (id: string) => (await page.getByTestId(id).locator(".n").innerText()).trim();
  return `fit ${await n("v2-n-fit")} · office ${await n("v2-n-office")} · ask ${await n("v2-n-ask")} · no ${await n("v2-n-no")}`;
}
async function picks(page: Page) {
  return (await page.getByTestId("top-picks").locator("ol > li h3").allInnerTexts()).join(" | ");
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // 홈
  for (const [mk, file] of [[desktop, "home.png"], [mobile, "home-mobile.png"]] as const) {
    const ctx = await mk(browser);
    const page = await fresh(ctx);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/${file}`, fullPage: file === "home.png" ? false : false });
    await ctx.close();
  }

  // 내 복지 입력
  {
    const ctx = await desktop(browser);
    const page = await fresh(ctx);
    await page.goto(BASE + "/situation?for=self&new=1");
    await page.waitForFunction(() => ((document.querySelector("#sido") as HTMLSelectElement | null)?.options.length ?? 0) > 1);
    await page.selectOption("#sido", { label: "경기도 (시범 지역)" });
    await page.selectOption("#sigungu", { label: "고양시" });
    await page.selectOption("#age", "30-34");
    await page.selectOption("#hh", "2");
    await page.getByRole("group", { name: "함께 사는(키우는) 자녀는 몇 명인가요?" }).getByText("1명", { exact: true }).click();
    await page.getByTestId("child-ages").getByText("2~5세", { exact: true }).click();
    await page.getByRole("group", { name: "지금 하고 있는 일은요?" }).getByText("일자리를 찾고 있어요", { exact: true }).click();
    await page.getByTestId("v2-income").fill("230");
    await page.screenshot({ path: `${OUT}/situation-self.png`, fullPage: true });
    await ctx.close();
  }

  // 부모님 입력 (홈 문장) → 결과 추가 질문 → 상세
  {
    const ctx = await desktop(browser);
    const page = await fresh(ctx);
    await page.locator("#home-q").fill(SENTENCE);
    await page.locator("#home-q").press("Enter");
    await page.getByTestId("prefill-banner").waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => ((document.querySelector("#sido") as HTMLSelectElement | null)?.options.length ?? 0) > 1);
    await page.screenshot({ path: `${OUT}/situation-parent.png`, fullPage: true });
    await page.getByTestId("prefill-confirm").click();
    await page.getByTestId("top-picks").waitFor({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    console.log("owner-suwon-59 |", await counts(page), "|", await picks(page));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByTestId("v2-followup").scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, Math.max(0, (document.querySelector("[data-testid=v2-followup]") as HTMLElement).getBoundingClientRect().top + window.scrollY - 24)));
    await page.screenshot({ path: `${OUT}/followup.png` });
    await shotUntil(page, "top-picks", "scenario-owner-suwon-59.png");
    // 상세: '답하면 정해져요' 첫 혜택
    await page.getByTestId("v2-ask").locator("summary").click();
    const first = page.getByTestId("v2-ask").getByTestId("v2-card").first().locator("h3 a");
    console.log("detail:", await first.innerText());
    await first.click();
    await page.getByTestId("explain").waitFor({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await shotUntil(page, "explain", "detail.png");
    await ctx.close();
  }

  // 예시 상황 결과
  for (const id of PRESETS) {
    const ctx = await desktop(browser);
    const page = await fresh(ctx);
    await page.getByTestId(`preset-${id}`).click();
    await page.getByTestId("top-picks").waitFor({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.locator("[data-testid=pick] .rows").first().waitFor();
    console.log(id, "|", await counts(page), "|", await picks(page));
    await shotUntil(page, "top-picks", `scenario-${id}.png`);
    await ctx.close();
  }
  {
    const ctx = await mobile(browser);
    const page = await fresh(ctx);
    await page.getByTestId("preset-bucheon-disability").click();
    await page.getByTestId("top-picks").waitFor({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    await page.locator("[data-testid=pick] .rows").first().waitFor();
    await shotUntil(page, "pick", "scenario-bucheon-disability-mobile.png", true);
    await ctx.close();
  }
  await browser.close();
})();
