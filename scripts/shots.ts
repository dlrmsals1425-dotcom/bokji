/** 헤드리스 Chromium 으로 데모 스크린샷 저장: npx tsx scripts/shots.ts [baseURL] */
import { chromium, type Page } from "@playwright/test";
import path from "node:path";

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

  await seed(page);
  await page.goto(BASE + "/results");
  await page.getByTestId("program-card").first().waitFor();
  await page.screenshot({ path: `${OUT}/03-results-desktop.png` });

  await page.getByRole("link", { name: "기초연금", exact: true }).first().click();
  await page.getByTestId("reasons").waitFor();
  await page.screenshot({ path: `${OUT}/04-detail-desktop.png` });
  await page.screenshot({ path: `${OUT}/04b-detail-desktop-full.png`, fullPage: true });

  // 통합돌봄 출처(신청처 정보 없음 → 대체 안내) 상세
  await page.goto(BASE + "/p/g41110.icare-0085-1489588-1-1-30");
  await page.getByTestId("apply-fallback").waitFor();
  await page.screenshot({ path: `${OUT}/05-detail-fallback-desktop.png` });

  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ko-KR" });
  const m = await mob.newPage();
  await seed(m);
  await m.goto(BASE + "/results");
  await m.getByTestId("program-card").first().waitFor();
  await m.screenshot({ path: `${OUT}/06-results-mobile.png` });
  await m.goto(BASE + "/");
  await m.waitForLoadState("networkidle");
  await m.screenshot({ path: `${OUT}/07-home-mobile.png` });

  await browser.close();
  console.log("saved to", OUT);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
