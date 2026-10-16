/** (2026-10-16 재테스트) 통합돌봄 메뉴판의 '전국' 사업을 '전국 공통'으로 적지 않음 · 검색 '초기화' 버튼 이름 */
import { expect, test } from "@playwright/test";

test("국가건강검진(용인 메뉴판): '중앙부처 사업 · 경기 용인시 안내', 소관은 어느 지역 안내에 실린 사업인지 @mobile", async ({ page }) => {
  await page.goto("/p/g41460.icare-0085-1489589-1-1-20");
  const main = page.locator("main");
  await expect(main.getByRole("heading", { level: 1 })).toContainText("국가건강검진", { timeout: 20_000 });
  await expect(main).toContainText("중앙부처 사업 · 경기 용인시 안내");
  await expect(main).toContainText("중앙부처 (경기 용인시 통합돌봄 안내에 실린 사업)");
  await expect(main).not.toContainText("전국 공통 사업");
});

test("검색: 버튼 이름은 '검색 조건 초기화' — 검색어·조건만 지우고 사는 곳은 그대로", async ({ page }) => {
  await page.goto("/search?q=기초연금&life=senior");
  await expect(page.locator("#s-sido option")).not.toHaveCount(1, { timeout: 20_000 });
  await page.locator("#s-sido").selectOption("41000");
  const reset = page.getByTestId("search-reset");
  await expect(reset).toHaveText("검색 조건 초기화");
  await reset.click();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.locator("#sq")).toHaveValue("");
  await expect(page.locator("#s-sido")).toHaveValue("41000");
});
