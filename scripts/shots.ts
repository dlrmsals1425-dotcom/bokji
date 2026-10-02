/** 헤드리스 Chromium 으로 데모 스크린샷 저장: npx tsx scripts/shots.ts [baseURL] */
import { chromium, type Page } from "@playwright/test";
import path from "node:path";
import { PRESETS } from "../src/lib/client/presets";

const BASE = process.argv[2] ?? "http://localhost:3217";
const OUT = path.resolve(__dirname, "../shots");

const PROFILE = {
  sido: "41000", sigungu: "41110", age: "75-79", householdSize: 1, traits: ["single"], children: [],
  income: "unknown", benefits: ["basic_pension"], housing: "own", car: "0", activity: "none",
  care: ["daily"], disability: "unknown", disabilitySeverity: "unknown",
};

async function seed(page: Page) {
  await page.goto(BASE + "/");
  await page.evaluate((p) => localStorage.setItem("bn.profile.v1", JSON.stringify(p)), PROFILE);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ko-KR", deviceScaleFactor: 1 });
  const page = await desk.newPage();

  await page.goto(BASE + "/");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${OUT}/01-home-desktop.png` });
  await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });

  // 입력: 2단계(나와 가구)에 선택값이 보이는 상태
  await page.goto(BASE + "/check");
  await page.getByLabel("시·도").selectOption("41000");
  await page.getByLabel("시·군·구").selectOption("41110");
  await page.getByTestId("next").click();
  const pick = (legend: string, opt: string) => page.getByRole("group", { name: legend }).getByText(opt, { exact: true }).click();
  await pick("본인 나이", "75~79세");
  await pick("함께 사는 가구원 수 (본인 포함)", "1명");
  await pick("가구 특성", "1인 가구");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/02-input-desktop.png` });
  await page.screenshot({ path: `${OUT}/input-step.png` });

  // 서비스 찾기: 생애주기(어르신) + 관심주제(돌봄) 필터
  await page.goto(BASE + "/search?life=senior&topic=" + encodeURIComponent("보호·돌봄"));
  await page.getByTestId("program-card").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.screenshot({ path: `${OUT}/search.png` });
  await page.setViewportSize({ width: 1280, height: 800 });

  await seed(page);
  await page.goto(BASE + "/results");
  await page.getByTestId("program-card").first().waitFor();
  await page.screenshot({ path: `${OUT}/03-results-desktop.png` });

  await page.getByTestId("result-list").getByRole("link", { name: "기초연금", exact: true }).first().click();
  await page.getByTestId("reasons").waitFor();
  await page.screenshot({ path: `${OUT}/04-detail-desktop.png` });
  await page.screenshot({ path: `${OUT}/04b-detail-desktop-full.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/detail.png`, fullPage: true });

  // 통합돌봄 출처(신청처 정보 없음 → 대체 안내) 상세
  await page.goto(BASE + "/p/g41110.icare-0085-1489588-1-1-30");
  await page.getByTestId("apply-fallback").waitFor();
  await page.screenshot({ path: `${OUT}/05-detail-fallback-desktop.png` });

  // 예시 상황별 결과 (데스크톱, 추천 5개 + 탭 + 상위 카드가 보이도록 세로 1300px)
  const tall = await browser.newContext({ viewport: { width: 1280, height: 1300 }, locale: "ko-KR", deviceScaleFactor: 1 });
  const t = await tall.newPage();
  for (const ps of PRESETS) {
    await t.goto(`${BASE}/results?example=${ps.id}`);
    await t.getByTestId("top-picks").waitFor();
    await t.getByTestId("result-list").getByTestId("program-card").first().waitFor();
    await t.waitForLoadState("networkidle");
    await t.evaluate(() => window.scrollTo(0, 0));
    await t.screenshot({ path: `${OUT}/scenario-${ps.id}.png` });
  }

  // 자동으로 받는 혜택 (목록 아래 접힌 영역): 접힌 상태 → 펼친 상태
  await t.goto(`${BASE}/results?example=seongnam-single-parent`);
  await t.getByTestId("top-picks").waitFor();
  const sec = t.getByTestId("auto-section");
  await sec.scrollIntoViewIfNeeded();
  await t.evaluate(() => {
    const el = document.querySelector('[data-testid="auto-section"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 700);
  });
  await t.screenshot({ path: `${OUT}/auto-section-collapsed.png` });
  await t.getByTestId("auto-toggle").click();
  await sec.getByTestId("program-card").first().waitFor();
  await t.evaluate(() => {
    const el = document.querySelector('[data-testid="auto-section"]') as HTMLElement;
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 90);
  });
  await t.screenshot({ path: `${OUT}/auto-section-expanded.png` });

  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
  const m = await mob.newPage();
  await seed(m);
  await m.goto(BASE + "/results");
  await m.getByTestId("program-card").first().waitFor();
  await m.screenshot({ path: `${OUT}/06-results-mobile.png` });
  await m.goto(BASE + "/");
  await m.waitForLoadState("networkidle");
  await m.screenshot({ path: `${OUT}/07-home-mobile.png` });
  await m.screenshot({ path: `${OUT}/home-mobile.png`, fullPage: true });
  await m.goto(`${BASE}/results?example=bucheon-disability`);
  await m.getByTestId("top-picks").waitFor();
  await m.waitForLoadState("networkidle");
  await m.evaluate(() => window.scrollTo(0, 0));
  await m.screenshot({ path: `${OUT}/scenario-bucheon-disability-mobile.png` });

  await browser.close();
  console.log("saved to", OUT);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
