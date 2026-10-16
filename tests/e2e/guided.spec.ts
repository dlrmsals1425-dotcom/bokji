/** 질문 따라 찾기 (2026-10-16): 홈 두 갈래 → 누구 → 사는 곳(현재 위치/직접) → 질문 5개 → 드문 사항 → 결과 */
import { expect, test, type Page, type Request } from "@playwright/test";

const MARKERS = ["37.26", "127.02", "incomeManwon", "bn.profile", "householdSize", "75-79", "35-39"];
function expectPrivate(requests: Request[], origin: string) {
  for (const r of requests) {
    const url = decodeURIComponent(r.url());
    expect(r.method(), url).toBe("GET");
    expect(url.startsWith(origin) || url.startsWith("data:"), `외부 요청 ${url}`).toBeTruthy();
    for (const m of MARKERS) expect(url.includes(m), `${m} in ${url}`).toBeFalsy();
  }
}

/** 질문마다 첫 보기로 답하며 끝 화면까지 (질문 수를 돌려준다) */
async function answerAll(page: Page): Promise<number> {
  let n = 0;
  for (let i = 0; i < 12; i++) {
    const phase = await page.getByTestId("guided").getAttribute("data-phase");
    if (phase === "rare") {
      await page.getByTestId("gq-rare-ok").click();
      await expect(page.getByTestId("guided")).toHaveAttribute("data-phase", "done", { timeout: 20_000 });
    } else if (phase === "done") return n;
    else {
      const q = page.getByTestId("gq-question");
      await expect(q).toBeVisible();
      const before = await q.getAttribute("data-dim");
      await q.locator(".gq-opt").first().click();
      n++;
      // 같은 질문이 화면에서 사라질 때까지 (다음 질문 또는 드문 사항·끝 화면)
      await expect(page.locator(`[data-testid="gq-question"][data-dim="${before}"]`)).toHaveCount(0, { timeout: 20_000 });
    }
  }
  return n;
}

test.describe("질문 따라 찾기", () => {
  test("홈 → 부모님 → 지역 직접 고르기 → 질문 5개 → 해당 없음 → 결과 (입력·위치는 기기 밖으로 안 나감) @mobile", async ({ page, baseURL }) => {
    const requests: Request[] = [];
    page.on("request", (r) => requests.push(r));
    await page.goto("/");
    await page.getByTestId("start-guided").click();
    await expect(page).toHaveURL(/\/ask$/);
    await page.getByTestId("gq-parent").click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("부모님은 어디에 사세요?");
    await expect(page.getByTestId("gq-sido").locator("option")).not.toHaveCount(1, { timeout: 20_000 });
    await page.getByTestId("gq-sido").selectOption("41000");
    await page.getByTestId("gq-sigungu").selectOption({ label: "수원시" });
    await page.getByTestId("gq-region-ok").click();

    // 첫 질문은 나이, 부모님 찾기에는 '18세 이하'가 없다
    const q = page.getByTestId("gq-question");
    await expect(q).toHaveAttribute("data-dim", "age", { timeout: 30_000 });
    await expect(page.getByTestId("gq-a-0-18")).toHaveCount(0);
    await expect(page.getByText("질문 1 / 5")).toBeVisible();
    const ask0 = Number(await page.getByTestId("gq-ask").innerText());
    await page.getByTestId("gq-a-75-79").click();
    await expect(page.getByText("질문 2 / 5")).toBeVisible({ timeout: 20_000 });
    expect(Number(await page.getByTestId("gq-ask").innerText())).toBeLessThan(ask0);

    // 이전 → 같은 나이 질문으로
    await page.getByTestId("gq-back").click();
    await expect(q).toHaveAttribute("data-dim", "age");
    await page.getByTestId("gq-a-75-79").click();
    await expect(page.getByText("질문 2 / 5")).toBeVisible({ timeout: 20_000 });

    const n = await answerAll(page);
    expect(n).toBe(4);
    await expect(page.getByTestId("gq-done")).toBeVisible();
    await page.getByTestId("gq-results").click();
    await expect(page).toHaveURL(/\/results\?for=parent$/);
    await expect(page.getByTestId("parent-results-banner")).toBeVisible({ timeout: 20_000 });
    expectPrivate(requests, baseURL!);
  });

  test.describe("현재 위치", () => {
    test.use({ geolocation: { latitude: 37.2636, longitude: 127.0286 }, permissions: ["geolocation"] });
    test("나 → 현재 위치(수원)를 확인 → 10대 보기 → 지금 결과 보기", async ({ page }) => {
      await page.goto("/ask");
      await page.getByTestId("gq-self").click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(/수원.*복지를 받으시나요\?/, { timeout: 30_000 });
      await page.getByTestId("gq-here").click();
      await expect(page.getByTestId("gq-question")).toHaveAttribute("data-dim", "age", { timeout: 30_000 });
      await expect(page.getByTestId("gq-a-0-18")).toBeVisible();
      await page.getByTestId("gq-a-35-39").click();
      await expect(page.getByText("질문 2 / 5")).toBeVisible({ timeout: 20_000 });
      await page.getByTestId("gq-now").click();
      await expect(page).toHaveURL(/\/results$/);
      await expect(page.getByTestId("top-picks")).toBeVisible({ timeout: 20_000 });
    });
  });

  test.describe("위치 권한 거절", () => {
    test.use({ permissions: [] });
    test("현재 위치를 못 쓰면 직접 고르기로", async ({ page }) => {
      await page.goto("/ask");
      await page.getByTestId("gq-self").click();
      await expect(page.getByTestId("gq-loc-error")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("gq-pick")).toBeVisible();
    });
  });
});
