import { expect, test } from "@playwright/test";

/** 6차 프로덕션 검증 후속 (claude-code-fixes) M4: 75~79세 은퇴 어르신에게 국민취업지원제도 '받으실 수 있어요' + 월 최대 100만원 */
test("M4: 수원 어르신 예시 — 국민취업지원제도가 '받으실 수 있어요'에 없음 @mobile", async ({ page }) => {
  await page.goto("/results?example=suwon-senior");
  await expect(page.getByTestId("money-summary")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("sum-fit")).not.toContainText("국민취업지원제도");
  await expect(page.getByTestId("top-picks")).not.toContainText("국민취업지원제도");
});
