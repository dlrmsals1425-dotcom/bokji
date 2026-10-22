import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

const exactFiles = [
  {
    program: "g43110.gov24-571000000197", form: "ordin-21714439",
    title: "학습비 면제 신청서", format: "hwp",
    bytes: 15872, sha256: "c09381d0b67b0ea52a3fc6eafea066f303d9a59c12c725079fb671cc9c071d50",
    condition: "해당 교육 종료 전", excluded: ["ordin-21714441"], writable: true,
  },
  {
    program: "s47000.bokjiro-WLF00004401", form: "agency-47000-bokjiro-wlf00004401-allowance-application",
    title: "경상북도 의사상자 특별위로금·수당지급 신청서", format: "hwp",
    bytes: 15872, sha256: "6402b5bea3df64d266234775f15b05d8dc76c4098391a0c6ae1e73bc9601d552",
    condition: "의사자 유족 월10만원", excluded: ["ordin-22706053"], writable: false,
  },
  {
    program: "g47230.bokjiro-WLF00004929", form: "agency-47230-health-kit-080701",
    title: "임신준비 키트 지원 신청서", format: "hwp",
    bytes: 102912, sha256: "f1e5886e5e39ead2ffe928b62b24b32607a52af14a0bf2f5cdafa65966329005",
    condition: "1가구당 1회", excluded: ["ordin-17542133"], writable: false,
  },
  {
    program: "g11215.gov24-304000000233", form: "ordin-22425515",
    title: "배우자 복지수당 대리 수령 신청서<신설 2025.7.28.>", format: "hwpx",
    bytes: 59139, sha256: "3759d8f21c50aaa43b5960021da8b6a874acf6fdde2caa017dbe36ae792d2909",
    condition: "대리인 계좌 수령", excluded: ["ordin-22425553"], writable: false,
  },
];

for (const item of exactFiles) {
  test(`${item.program}: 용도 조건과 검증된 원본 바이트를 함께 제공한다 @mobile`, async ({ page, request }) => {
    await page.goto(`/p/${item.program}`);
    const panel = page.getByTestId("application-forms");
    await expect(panel.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
    await expect(panel).toContainText(item.condition);
    const original = panel.locator(`a[href^="/forms/files/${item.form}-"]`);
    await expect(original).toHaveCount(1);
    const href = await original.getAttribute("href");
    expect(href).toBe(`/forms/files/${item.form}-${item.sha256.slice(0, 12)}.${item.format}`);
    const response = await request.get(href!);
    expect(response.status()).toBe(200);
    const bytes = await response.body();
    expect(bytes.length).toBe(item.bytes);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(item.sha256);
    for (const id of item.excluded) await expect(panel.locator(`a[href^="/forms/files/${id}-"]`)).toHaveCount(0);
    await expect(panel.getByTestId("paper-writer-link")).toHaveCount(item.writable ? 1 : 0);
    if (item.program === "s47000.bokjiro-WLF00004401") {
      await expect(panel.locator('a[href*="20260820UUWBM0928100205473333"]')).toHaveCount(0);
      await expect(panel).toContainText("통장사본");
    }
    if (item.program === "g43110.gov24-571000000197") await expect(panel).toContainText("일반 강좌 수강신청서나 환불청구서가 아닙니다");
  });
}

test("경북 정부24와 광진 종합사업에서도 같은 원본의 조건부 연결을 유지한다", async ({ page }) => {
  for (const [program, form] of [
    ["s47000.gov24-647000000122", "agency-47000-bokjiro-wlf00004401-allowance-application"],
    ["g11215.bokjiro-WLF00002162", "ordin-22425515"],
  ]) {
    await page.goto(`/p/${program}`);
    const panel = page.getByTestId("application-forms");
    await expect(panel.locator(`a[href^="/forms/files/${form}-"]`)).toHaveCount(1);
    await expect(panel.locator('a[href^="/forms/files/ordin-22425553-"]')).toHaveCount(0);
  }
  await page.goto("/p/g51810.icare-0083-1489635-1-3-6");
  await expect(page.getByTestId("application-forms").locator('a[href^="/forms/files/ordin-17770713-"]')).toHaveCount(0);
});
