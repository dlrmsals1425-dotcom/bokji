import { expect, test, type Page } from "@playwright/test";

/** QA 3차 수정 확인 (리뷰 보고서 항목 ID를 제목에 표기, 재현 문장 그대로) */

async function fromHome(page: Page, sentence: string) {
  await page.goto("/");
  await page.locator("#home-q").fill(sentence);
  await page.locator("#home-q").press("Enter");
  await expect(page.getByTestId("prefill-banner")).toBeVisible({ timeout: 20_000 });
}
async function toResults(page: Page, sentence: string) {
  await fromHome(page, sentence);
  await page.getByTestId("prefill-confirm").click();
  await expect(page.getByTestId("v2-results")).toBeVisible({ timeout: 20_000 });
}

test.describe("QA 3차", () => {
  test("R1: '이십대 후반' · '아빠는 예순다섯' · '할아버지' · '싱글맘' → 나이를 읽고 먼저 확인할 5가지가 나옴 @mobile", async ({ page }) => {
    await fromHome(page, "이십대 후반이고 안양에서 혼자 자취해요");
    await expect(page.getByTestId("prefill-banner")).toContainText("20대 후반");
    await fromHome(page, "저는 딸이고 아빠는 예순다섯 평택 사세요");
    await expect(page.getByTestId("prefill-banner")).toContainText("65세");
    await page.getByTestId("prefill-confirm").click();
    await expect(page.getByTestId("top-picks")).toContainText("기초연금", { timeout: 20_000 });
    await fromHome(page, "하남에 할아버지 혼자 사세요 거동이 불편하세요");
    await expect(page.getByTestId("prefill-banner")).toContainText("65세 이상으로 봤어요");
    await page.getByTestId("prefill-confirm").click();
    await expect(page.getByTestId("pick")).toHaveCount(5, { timeout: 20_000 });
    await fromHome(page, "마흔 넘은 싱글맘 시흥");
    await expect(page.getByTestId("prefill-banner")).toContainText("한부모");
  });

  test("M2: '기초수급자에요'라고 했으면 수급 여부를 다시 묻지 않음 @mobile", async ({ page }) => {
    await toResults(page, "동탄사는 할머니 80넘으심 기초수급자에요");
    await expect(page.getByTestId("top-picks")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("v2-q-support")).toHaveCount(0);
  });

  test("R5: 상세 묶음이 늦게 와도 신청처에 '담당 기관에 문의'가 먼저 나오지 않음", async ({ page }) => {
    await page.route("**/bundles/v1/details/**", async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.continue();
    });
    await toResults(page, "남양주 사는데 월세가 너무 부담돼요");
    const place = page.getByTestId("pick-place").first();
    await expect(place).toContainText("불러오는 중", { timeout: 20_000 });
    await expect(page.getByTestId("top-picks")).not.toContainText("담당 기관에 문의");
    await expect(place).not.toContainText("불러오는 중", { timeout: 20_000 });
  });

  test("N6·R6: 남양주 월세 → 국민임대에 '등록 장애인' 없음, 장기전세 문의처가 서울주택도시공사 아님 @mobile", async ({ page }) => {
    await toResults(page, "남양주 사는데 월세가 너무 부담돼요");
    const picks = page.getByTestId("top-picks");
    await expect(picks).toContainText("국민임대", { timeout: 20_000 });
    await expect(page.getByTestId("pick-place").first()).not.toContainText("불러오는 중", { timeout: 20_000 });
    await expect(picks).not.toContainText("등록 장애인");
    await expect(picks).not.toContainText("서울주택도시공사");
  });
});
