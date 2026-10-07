import { expect, test, type Page, type Request } from "@playwright/test";

/** 입력 프로필 값이 네트워크로 나가지 않는지 확인하기 위한 표식 */
const PROFILE_MARKERS = ["75-79", "basic_pension", "daily", "single", "householdSize", "bn.profile"];

function pick(page: Page, legend: string, option: string) {
  return page.getByRole("group", { name: legend }).getByText(option, { exact: true }).click();
}

test.describe("로그인 없는 전체 흐름", () => {
  test("홈 → 5단계 입력 → 3단계 결과(필터) → 상세 → 기기에서 지우기", async ({ page }) => {
    const requests: Request[] = [];
    page.on("request", (r) => requests.push(r));

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("내 조건");
    // 로그인 화면·비밀번호 입력이 없어야 한다. 로그인은 '준비 중' 비활성 버튼만.
    await expect(page.locator("input[type=password]")).toHaveCount(0);
    const loginBtn = page.getByRole("button", { name: /로그인 준비 중/ });
    await expect(loginBtn).toBeDisabled();

    await page.getByTestId("start-self").click();
    await expect(page).toHaveURL(/\/check/);

    // 1단계: 지역은 필수
    await page.getByTestId("next").click();
    await expect(page.getByRole("alert").filter({ hasText: "시군구를 선택" })).toBeVisible();
    await page.getByLabel("시·도").selectOption({ label: "경기도 (시범 지역)" });
    await page.getByLabel("시·군·구").selectOption({ label: "수원시" });
    await expect(page.getByText("경기도는 시범 지역이에요")).toBeVisible();
    await page.getByTestId("next").click();

    // 2단계: 나와 가구
    await pick(page, "본인 나이", "75~79세");
    await pick(page, "함께 사는 가구원 수 (본인 포함)", "1명");
    await pick(page, "가구 특성", "1인 가구");
    await page.getByTestId("next").click();

    // 3단계: 자녀
    await pick(page, "자녀(또는 임신) 나이대", "자녀 없음");
    await page.getByTestId("next").click();

    // 4단계: 소득은 '모름' 그대로, 수급 상태만
    await expect(page.getByRole("group", { name: "가구 소득 (기준 중위소득 대비)" }).getByRole("radio", { name: "모름 / 건너뛰기" })).toBeChecked();
    await pick(page, "받고 있는 수급·자격", "기초연금");
    await pick(page, "주거 형태", "자가");
    await page.getByTestId("next").click();

    // 5단계: 민감 정보(선택)
    await pick(page, "돌봄이 필요한 상황", "일상생활 도움 필요");
    await page.getByTestId("finish").click();

    // 결과
    await expect(page).toHaveURL(/\/results$/);
    const tabEligible = page.getByTestId("tab-eligible");
    await expect(tabEligible).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("수원시");
    const count = async (tier: string) => Number((await page.getByTestId(`tab-${tier}`).locator(".n").innerText()).replace(/,/g, ""));
    const e0 = await count("eligible");
    const l0 = await count("likely");
    const c0 = await count("check");
    expect(e0).toBeGreaterThan(0);
    expect(l0).toBeGreaterThan(0);
    expect(c0).toBeGreaterThan(0);
    await expect(page.getByTestId("result-list").getByTestId("program-card").first()).toBeVisible();
    await expect(page.getByTestId("result-list").getByTestId("program-card").first().locator(".status.tier-eligible")).toBeVisible();
    // '조건 충족'에 기초연금이 있어야 한다 (75세·기초연금 수급)
    await expect(page.getByTestId("result-list").getByRole("link", { name: "기초연금", exact: true })).toBeVisible();
    // 맞춤 추천 5개
    await expect(page.getByTestId("top-picks").locator("ol > li")).toHaveCount(5);

    // 필터: 기관 유형을 바꾸면 탭 개수도 함께 바뀐다
    await page.getByTestId("tab-likely").click();
    // 기관·분야 좁히기는 접혀 있다 → 펼쳐서 기관 유형 선택
    await expect(page.getByLabel("기관 유형")).toBeHidden();
    await page.getByTestId("filter-toggle").click();
    await page.getByLabel("기관 유형").selectOption("local");
    const l1 = await count("likely");
    expect(l1).toBeLessThan(l0);
    expect(await count("eligible")).toBeLessThanOrEqual(e0);
    await expect(page.getByText(/필터 적용/)).toBeVisible();
    await page.getByLabel("기관 유형").selectOption("");
    expect(await count("likely")).toBe(l0);

    // 교육청 서비스는 기본 숨김 → 체크하면 개수가 늘어난다
    await page.getByTestId("tab-likely").click();
    const beforeEdu = await count("likely");
    const eduLabel = await page.locator("label", { has: page.getByTestId("include-edu") }).innerText();
    const eduN = Number(eduLabel.match(/\((\d[\d,]*)개\)/)![1].replace(/,/g, ""));
    await page.getByTestId("include-edu").check();
    const afterEdu = await count("likely");
    // 같은 이름의 사업은 한 카드로 묶으므로 늘어난 카드 수는 교육청 묶음 수 이하
    expect(afterEdu).toBeGreaterThanOrEqual(beforeEdu);
    expect(afterEdu).toBeLessThanOrEqual(beforeEdu + eduN);
    if (eduN > 0) expect(afterEdu).toBeGreaterThan(beforeEdu);
    await page.getByTestId("include-edu").uncheck();
    expect(await count("likely")).toBe(beforeEdu);

    // 농림축산어업·사업자 대상도 기본 숨김
    const indLabel = await page.locator("label", { has: page.getByTestId("include-industry") }).innerText();
    const indN = Number(indLabel.match(/\((\d[\d,]*)개\)/)![1].replace(/,/g, ""));
    await page.getByTestId("include-industry").check();
    const afterInd = await count("likely");
    expect(afterInd).toBeLessThanOrEqual(beforeEdu + indN);
    if (indN > 0) expect(afterInd).toBeGreaterThan(beforeEdu);
    await page.getByTestId("include-industry").uncheck();

    // 기관·시설 운영 지원도 기본 숨김 (체크하면 목록 또는 '자동으로 받는 혜택'에 나타남)
    const opLabel = await page.locator("label", { has: page.getByTestId("include-operator") }).innerText();
    const opN = Number(opLabel.match(/\((\d[\d,]*)개\)/)![1].replace(/,/g, ""));
    await page.getByTestId("include-operator").check();
    const afterOp = await count("likely");
    expect(afterOp).toBeGreaterThanOrEqual(beforeEdu);
    expect(afterOp).toBeLessThanOrEqual(beforeEdu + opN);
    await page.getByTestId("include-operator").uncheck();
    expect(await count("likely")).toBe(beforeEdu);

    // 목록 길이 = 탭 개수 (처음 10개 + 더 보기)
    const shown = await page.getByTestId("result-list").getByTestId("program-card").count();
    expect(shown).toBe(Math.min(10, beforeEdu));
    if (beforeEdu > 10) {
      await page.getByTestId("more").click();
      expect(await page.getByTestId("result-list").getByTestId("program-card").count()).toBe(Math.min(30, beforeEdu));
    }

    // 상세
    await page.getByTestId("tab-eligible").click();
    await page.getByTestId("result-list").getByTestId("program-card").first().locator("h3 a").click();
    await expect(page).toHaveURL(/\/p\//);
    await expect(page.getByTestId("reasons")).toBeVisible();
    await expect(page.getByTestId("sources")).toContainText("수집일");
    await expect(page.getByTestId("sources")).toContainText("원문 기준일");
    await expect(page.getByText("소관기관")).toBeVisible();
    await expect(page.getByRole("button", { name: /신청 준비 체크리스트/ })).toBeDisabled();

    // 네트워크: 정적 자원·번들 GET 만, 프로필 값 없음
    for (const r of requests) {
      const url = r.url();
      expect(r.method(), url).toBe("GET");
      for (const m of PROFILE_MARKERS) expect(url.includes(m), `${m} in ${url}`).toBeFalsy();
      expect(r.postData() ?? "").toBe("");
    }
    const bundleReqs = requests.filter((r) => r.url().includes("/bundles/v1/"));
    expect(bundleReqs.length).toBeGreaterThan(0);

    // 기기에서 지우기
    await page.goto("/results");
    await page.getByRole("button", { name: /이 기기에서 지우기/ }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => localStorage.getItem("bn.profile.v1"))).toBeNull();
    await page.goto("/results");
    await expect(page.getByText("아직 입력한 정보가 없어요")).toBeVisible();
  });

  test("입력 없이 건너뛰어도 결과가 나온다 (모름만) + 검색 + 큰 글씨", async ({ page }) => {
    await page.goto("/check");
    await page.getByLabel("시·도").selectOption({ label: "서울특별시" });
    await page.getByLabel("시·군·구").selectOption({ label: "종로구" });
    await page.getByTestId("next").click();
    await page.getByRole("button", { name: "지금까지 입력으로 결과 보기" }).click();
    await expect(page.getByTestId("tab-check")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/입력한 항목이 적어/)).toBeVisible();

    await page.goto("/search?q=에너지바우처");
    await expect(page.getByText(/검색 결과 \d+개/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("program-card").first()).toContainText("에너지");

    await page.getByTestId("large-text").click();
    await expect(page.locator("html")).toHaveAttribute("data-large", "1");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-large", "1");
  });

  test("상세 페이지: API 신청방법·연락처와 출처(정부24·복지로) 표시 @mobile", async ({ page }) => {
    await page.goto("/p/n.gov24-SSE000000170");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("기초연금");
    await expect(page.getByText("신청 방법", { exact: true })).toBeVisible();
    await expect(page.locator("#h-apply").locator("..")).toContainText("129");
    await expect(page.getByTestId("apply-fallback")).toHaveCount(0);
    await expect(page.getByTestId("sources")).toContainText("정부24 공공서비스");
    await expect(page.getByTestId("sources")).toContainText("복지로 복지서비스 정보");
    await expect(page.getByText("검수 규칙(1차)").first()).toBeVisible();
  });

  test("상세 페이지: 신청처 정보가 없으면 주민센터·시군구청 안내로 대체 @mobile", async ({ page }) => {
    // 통합돌봄 메뉴판 출처(신청 방법·연락처 비어 있음) 사업
    await page.goto("/p/g41110.icare-0085-1489588-1-1-30");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("가정간호제도");
    await expect(page.getByTestId("apply-fallback")).toContainText("행정복지센터");
    await expect(page.getByTestId("apply-fallback")).toContainText("129");
    await expect(page.getByTestId("official-link")).toHaveAttribute("href", /mohw\.go\.kr/);
    await expect(page.getByRole("link", { name: /12개 질문에 답하면/ })).toBeVisible();
  });

  test("홈의 예시 상황: 한 번에 결과 + 예시 안내 + 추천 5개 @mobile", async ({ page }) => {
    const cases: [string, RegExp][] = [
      ["suwon-senior", /수원시/],
      ["parent-care", /수원시/],
      ["seongnam-single-parent", /성남시/],
      ["goyang-youth", /고양시/],
      ["bucheon-disability", /부천시/],
    ];
    for (const [id, region] of cases) {
      await page.goto("/");
      await page.getByTestId(`preset-${id}`).click();
      await expect(page).toHaveURL(id === "parent-care" ? /\/results\?for=parent/ : /\/results/);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(region, { timeout: 20_000 });
      await expect(page.getByTestId("example-banner")).toContainText("예시 상황");
      await expect(page.getByTestId("top-picks").locator("ol > li")).toHaveCount(5);
      if (id === "parent-care") {
        await expect(page.getByTestId("parent-results-banner")).toBeVisible();
        await expect(page.getByTestId("proxy-apply-note")).toBeVisible();
      }
    }
    // 직접 입력(저장)하면 예시 표시가 사라진다
    await page.goto("/check");
    await page.getByTestId("next").click();
    await page.getByRole("button", { name: "지금까지 입력으로 결과 보기" }).click();
    await expect(page.getByTestId("tab-eligible")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("example-banner")).toHaveCount(0);
  });
  test("자동으로 받는 혜택: 본문·추천과 분리된 접힌 영역, 개수 = 카드 수 @mobile", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("preset-seongnam-single-parent").click();
    await expect(page.getByTestId("top-picks")).toBeVisible({ timeout: 20_000 });
    const sec = page.getByTestId("auto-section");
    await expect(sec).toBeVisible();
    // 본문 목록 바깥(#result-list 밖)에 있고, 기본은 접혀 있다
    await expect(page.getByTestId("result-list").getByTestId("auto-section")).toHaveCount(0);
    await expect(sec).not.toHaveAttribute("open", "");
    await expect(sec.getByTestId("program-card")).toHaveCount(0);
    // 추천·본문 카드에는 '자동 제공'/'기관 추천·선정' 태그가 없다
    await expect(page.getByTestId("top-picks").getByText("자동 제공")).toHaveCount(0);
    await expect(page.getByTestId("result-list").getByTestId("apply-badge").filter({ hasText: /자동 제공|기관 추천/ })).toHaveCount(0);
    const n = Number((await page.getByTestId("auto-count").innerText()).replace(/[^0-9]/g, ""));
    expect(n).toBeGreaterThan(0);
    await page.getByTestId("auto-toggle").click();
    await expect(sec).toHaveAttribute("open", "");
    const cards = sec.getByTestId("program-card");
    await expect(cards).toHaveCount(Math.min(n, 10));
    while (await page.getByTestId("auto-more").count()) await page.getByTestId("auto-more").click();
    await expect(cards).toHaveCount(n);
    await expect(sec.getByTestId("apply-badge").filter({ hasText: /자동 제공|기관 추천/ })).toHaveCount(n);
    await page.getByTestId("auto-toggle").click();
    await expect(sec.getByTestId("program-card")).toHaveCount(0);
  });

  test("부모님 복지 찾기: 홈 CTA → 입력(부모님 문구) → 결과(대리 신청 안내) @mobile", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("start-self")).toBeVisible();
    await expect(page.getByTestId("start-parent")).toBeVisible();
    await page.getByTestId("start-parent").click();
    await expect(page).toHaveURL(/for=parent/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("부모님 복지");
    await expect(page.getByTestId("parent-banner")).toBeVisible();
    await expect(page.getByTestId("mode-parent")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { name: /부모님은 어디에/ })).toBeVisible();
    await page.getByLabel("시·도").selectOption({ label: "경기도 (시범 지역)" });
    await page.getByLabel("시·군·구").selectOption({ label: "수원시" });
    await page.getByTestId("next").click();
    await pick(page, "부모님 나이", "70~74세");
    await pick(page, "함께 사는 가구원 수 (부모님 포함)", "2명");
    await page.getByTestId("next").click();
    await pick(page, "자녀·손자녀(또는 임신) 나이대", "해당 없음");
    await page.getByTestId("next").click();
    await pick(page, "주거 형태", "자가");
    await page.getByTestId("next").click();
    await pick(page, "돌봄이 필요한 상황", "일상생활 도움 필요");
    await page.getByTestId("finish").click();
    await expect(page).toHaveURL(/\/results\?for=parent/);
    await expect(page.getByTestId("parent-results-banner")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("부모님께 신청해 드릴 수 있는");
    await expect(page.getByTestId("top-picks")).toBeVisible();
    await expect(page.getByTestId("proxy-apply-note")).toContainText("주민센터");
    await expect(page.getByTestId("proxy-apply-note")).toContainText("법률 자문이 아닙니다");
    // URL 예시로도 열림
    await page.goto("/results?for=parent&example=parent-care");
    await expect(page.getByTestId("example-banner")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("parent-results-banner")).toBeVisible();
    await expect(page.getByTestId("top-picks").locator("ol > li")).toHaveCount(5);
  });
});
