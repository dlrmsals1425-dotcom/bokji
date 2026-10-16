/** (2026-10-16 소유자) 로그인 없이 기기에서만 쓰는 서비스라 생기지 않을 '준비 중' 기능 단추·문구는 두지 않는다 */
import { expect, test } from "@playwright/test";

test("상세 화면에 '준비 중' 단추가 없다 @mobile", async ({ page }) => {
  await page.goto("/p/n.bokjiro-WLF00001171");
  await expect(page.locator("main").getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/준비 중\)|신청 준비 체크리스트|마감·변경 알림/)).toHaveCount(0);
});
