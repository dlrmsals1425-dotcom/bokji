/** 목록 카드에도 어떤 복지인지 원문 요약 한두 줄 (2026-10-16 소유자: '그 밖에 받으실 수 있는 혜택'에 신청 안내만 보임) */
import { expect, test } from "@playwright/test";

test("그 밖에 받으실 수 있는 혜택·확인 목록 카드에 원문 요약 @mobile", async ({ page }) => {
  await page.goto("/results?example=suwon-senior");
  const fit = page.getByTestId("v2-fit");
  await expect(fit.getByTestId("v2-card").first()).toBeVisible({ timeout: 20_000 });
  const cards = fit.getByTestId("v2-card");
  const n = Math.min(await cards.count(), 5);
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const sum = cards.nth(i).locator(".sum");
    await expect(sum).toHaveCount(1);
    expect((await sum.innerText()).trim().length).toBeGreaterThan(5);
  }
});
