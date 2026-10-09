import { expect, test } from "@playwright/test";

/** 결정 6b (2026-10-09): 글꼴을 사이트 안에 두어 첫 방문에 외부(CDN) 연결이 없게 */
test("글꼴은 같은 사이트에서 받고 외부 연결 없음, 본문은 Pretendard로 그려짐 @mobile", async ({ page, baseURL }) => {
  const external: string[] = [];
  const origin = new URL(baseURL!).origin;
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.protocol.startsWith("http") && u.origin !== origin) external.push(u.origin);
  });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/["']/g, "") === "Pretendard Variable" && f.status === "loaded"));
  expect(loaded).toBe(true);
  expect(external).toEqual([]);
});
