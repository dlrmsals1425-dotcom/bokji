import { expect, test } from "@playwright/test";

/** Y1: 기준 중위소득 2026·2027 두 해를 적용 날짜와 함께 (빌드 때 만든 화면이라 연도를 고르지 않음) */
test("데이터·판정 기준: 2026년·2027년 기준 중위소득 표 @mobile", async ({ page }) => {
  await page.goto("/about#income");
  const t26 = page.locator("table.median-table", { has: page.locator("caption", { hasText: "2026년 (2026년 12월 31일까지)" }) });
  const t27 = page.locator("table.median-table", { has: page.locator("caption", { hasText: "2027년 (2027년 1월 1일부터)" }) });
  await expect(t26).toBeVisible();
  await expect(t27).toBeVisible();
  await expect(t27.locator("tbody tr").first()).toContainText("1인");
  await expect(t27.locator("tbody tr").nth(3)).toContainText("4인");
  const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(w).toBeLessThanOrEqual(0);
});
