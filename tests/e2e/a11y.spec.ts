import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** 접근성 점검 (axe-core, WCAG 2.1 A/AA): serious·critical 위반 0건이어야 한다 */
const PAGES: { name: string; path: string; preset?: string; sentence?: string }[] = [
  { name: "홈", path: "/" },
  { name: "입력", path: "/check" },
  { name: "결과(예시: 수원 어르신)", path: "/results", preset: "suwon-senior" },
  { name: "입력(부모님)", path: "/check?for=parent" },
  { name: "입력(문장 해석 확인)", path: "/", sentence: "수원시 소재에 계시고 59년생 부모님 두분이 계신다" },
  { name: "결과(부모님 돌보기)", path: "/results", preset: "parent-care" },
  { name: "상세(기초연금)", path: "/p/n.gov24-SSE000000170" },
  { name: "상세(대체 안내)", path: "/p/g41110.icare-0085-1489588-1-1-30" },
  { name: "검색", path: "/search?q=기초연금" },
  { name: "데이터·판정 기준", path: "/about" },
];

test("axe 접근성: 주요 화면 serious/critical 0건 @mobile", async ({ page }, info) => {
  test.setTimeout(120_000);
  const summary: Record<string, { violations: { id: string; impact: string | null | undefined; nodes: number; help: string }[] }> = {};
  for (const pg of PAGES) {
    if (pg.sentence) {
      await page.goto("/");
      await page.locator("#home-q").fill(pg.sentence);
      await page.locator("#home-q").press("Enter");
      await expect(page.getByTestId("prefill-banner")).toBeVisible({ timeout: 20_000 });
    } else if (pg.preset) {
      await page.goto("/");
      await page.getByTestId(`preset-${pg.preset}`).click();
      await expect(page.getByTestId("top-picks")).toBeVisible({ timeout: 20_000 });
    } else {
      await page.goto(pg.path);
      await page.waitForLoadState("networkidle");
    }
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    summary[pg.name] = { violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
  }
  // 큰 글씨 모드의 결과 화면
  await page.goto("/");
  await page.getByTestId("preset-bucheon-disability").click();
  await expect(page.getByTestId("top-picks")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("large-text").click();
  const rl = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  summary["결과(큰 글씨, 부천 장애인 가구)"] = { violations: rl.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
  await page.getByTestId("large-text").click();
  // 자동으로 받는 혜택 영역을 펼친 상태
  await page.getByTestId("auto-toggle").click();
  await expect(page.getByTestId("auto-section").getByTestId("program-card").first()).toBeVisible();
  const ra = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  summary["결과(자동으로 받는 혜택 펼침)"] = { violations: ra.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
  // v2 시험판: 상황 입력 · 결과(맞지 않아 뺀 혜택 펼침)
  await page.goto("/results?v=2");
  await expect(page.getByTestId("v2-followup")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("v2-no").locator("summary").click();
  const rv = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  summary["결과 v2 시험판 (부천, 뺀 혜택 펼침)"] = { violations: rv.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
  await page.goto("/situation?for=parent&new=1");
  await expect(page.getByTestId("v2-situation")).toBeVisible({ timeout: 20_000 });
  const rs = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  summary["상황 입력 v2 시험판"] = { violations: rs.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help })) };
  fs.mkdirSync("test-results", { recursive: true });
  fs.writeFileSync(`test-results/axe-${info.project.name}.json`, JSON.stringify(summary, null, 2));
  const bad = Object.entries(summary).flatMap(([n, s]) => s.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${n}: ${v.id} (${v.impact}, ${v.nodes}) ${v.help}`));
  expect(bad, bad.join("\n")).toEqual([]);
});
