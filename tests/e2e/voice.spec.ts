import { expect, test, type Page } from "@playwright/test";

/**
 * Local UI integration only. Constructors are replaced before application JS runs.
 * No real microphone, speech service, or external STT is used.
 */
type MockSnapshot = { starts: number; stops: number; aborts: number; lang: string };
type MockSpeech = {
  snapshots: () => MockSnapshot[];
  result: (index: number, text: string, final: boolean, late: boolean) => void;
  error: (index: number, code: string, late: boolean) => void;
  end: (index: number, late: boolean) => void;
};
type VoiceWindow = Window & { __voiceMock: MockSpeech };

async function installSpeech(page: Page, supported = true) {
  await page.addInitScript(({ enabled }) => {
    type ResultEvent = { resultIndex: number; results: { isFinal: boolean; length: number; 0: { transcript: string; confidence: number } }[] };
    type Handlers = {
      onstart: (() => void) | null;
      onresult: ((event: ResultEvent) => void) | null;
      onerror: ((event: { error: string; message: string }) => void) | null;
      onend: (() => void) | null;
    };
    class FakeRecognition implements Handlers {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onstart: Handlers["onstart"] = null;
      onresult: Handlers["onresult"] = null;
      onerror: Handlers["onerror"] = null;
      onend: Handlers["onend"] = null;
      captured: Handlers | null = null;
      starts = 0;
      stops = 0;
      aborts = 0;
      constructor() { instances.push(this); }
      start() {
        this.starts += 1;
        this.captured = { onstart: this.onstart, onresult: this.onresult, onerror: this.onerror, onend: this.onend };
        queueMicrotask(() => this.onstart?.());
      }
      stop() { this.stops += 1; }
      abort() { this.aborts += 1; }
    }
    const instances: FakeRecognition[] = [];
    const mock = {
      snapshots: () => instances.map(({ starts, stops, aborts, lang }) => ({ starts, stops, aborts, lang })),
      result: (index: number, text: string, final: boolean, late: boolean) => {
        const instance = instances[index];
        if (!instance) throw new Error("Missing synthetic recognition instance " + index);
        const handler = late ? instance.captured?.onresult : instance.onresult;
        handler?.({ resultIndex: 0, results: [{ isFinal: final, length: 1, 0: { transcript: text, confidence: 0.99 } }] });
      },
      error: (index: number, code: string, late: boolean) => {
        const instance = instances[index];
        const handler = late ? instance.captured?.onerror : instance.onerror;
        handler?.({ error: code, message: "Synthetic browser recognition error" });
      },
      end: (index: number, late: boolean) => {
        const instance = instances[index];
        const handler = late ? instance.captured?.onend : instance.onend;
        handler?.();
      },
    };
    Object.defineProperty(window, "__voiceMock", { configurable: true, value: mock });
    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: enabled ? FakeRecognition : undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: enabled ? FakeRecognition : undefined });
  }, { enabled: supported });
}

const snapshots = (page: Page) => page.evaluate(() => (window as unknown as VoiceWindow).__voiceMock.snapshots());
const emitResult = (page: Page, index: number, text: string, final = true, late = false) =>
  page.evaluate(({ index, text, final, late }) => (window as unknown as VoiceWindow).__voiceMock.result(index, text, final, late), { index, text, final, late });
const emitError = (page: Page, index: number, code: string, late = false) =>
  page.evaluate(({ index, code, late }) => (window as unknown as VoiceWindow).__voiceMock.error(index, code, late), { index, code, late });
const emitEnd = (page: Page, index: number, late = false) =>
  page.evaluate(({ index, late }) => (window as unknown as VoiceWindow).__voiceMock.end(index, late), { index, late });

async function openSituation(page: Page, supported = true) {
  await installSpeech(page, supported);
  await page.goto("/situation?for=self&new=1");
  await expect(page.getByTestId("v2-text")).toBeVisible();
  await expect(page.getByTestId("voice-choice")).toBeVisible();
}

async function startVoice(page: Page) {
  const index = (await snapshots(page)).length;
  await page.getByTestId("voice-consent").check();
  await page.getByTestId("voice-start").click();
  await expect.poll(async () => (await snapshots(page))[index]?.starts).toBe(1);
  expect((await snapshots(page))[index].lang).toBe("ko-KR");
  return index;
}

async function expectNoProposal(page: Page) {
  await expect(page.getByTestId("voice-confirm")).toHaveCount(0);
}

test.describe("jinwoo 말로 찾기 — 가짜 SpeechRecognition", () => {
  test("동의와 시작 뒤 final을 확인해야 입력칸에만 넣고 자동 제출하지 않음 @mobile", async ({ page }) => {
    await openSituation(page);
    expect(await snapshots(page)).toHaveLength(0);
    await expect(page.getByTestId("voice-start")).toBeDisabled();
    await page.getByTestId("voice-consent").check();
    expect(await snapshots(page)).toHaveLength(0);
    const index = await startVoice(page);
    await emitResult(page, index, "수원시에서", false);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue("");
    const ageBefore = await page.locator("#age").inputValue();
    await emitResult(page, index, "수원시에 사는 만 35세입니다.");
    await emitEnd(page, index);
    await expect(page.getByTestId("voice-transcript")).toHaveValue("수원시에 사는 만 35세입니다.");
    await expect(page.getByTestId("voice-confirm")).toHaveText(/입력칸에 넣기/);
    await expect(page.getByTestId("v2-text")).toHaveValue("");
    await page.getByTestId("voice-transcript").fill("수원시에 사는 만 36세입니다.");
    await page.getByTestId("voice-confirm").click();
    await expect(page.getByTestId("v2-text")).toHaveValue("수원시에 사는 만 36세입니다.");
    await expect(page).toHaveURL(/\/situation\?for=self&new=1$/);
    await expect(page.locator("#age")).toHaveValue(ageBefore);
    await expect(page.getByTestId("v2-understood")).toHaveCount(0);
    await expect(page.getByTestId("v2-fill")).toBeEnabled();
  });

  test("기존 문장 뒤 공백으로 한 번만 이어 붙이고 late final도 중복 삽입하지 않음 @mobile", async ({ page }) => {
    await openSituation(page);
    const original = "월세로 살고 있어요.";
    const transcript = "일자리를 찾고 있어요.";
    await page.getByTestId("v2-text").fill(original);
    const index = await startVoice(page);
    await emitResult(page, index, transcript);
    await expect(page.getByTestId("voice-confirm")).toBeVisible();
    await expect(page.getByTestId("v2-text")).toHaveValue(original);
    await page.getByTestId("voice-confirm").evaluate((element) => {
      (element as HTMLButtonElement).click();
      (element as HTMLButtonElement).click();
    });
    await expect(page.getByTestId("v2-text")).toHaveValue(original + " " + transcript);
    await emitResult(page, index, transcript, true, true);
    await emitEnd(page, index, true);
    await expect(page.getByTestId("v2-text")).toHaveValue(original + " " + transcript);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-understood")).toHaveCount(0);
  });

  test("미지원 브라우저는 기존 입력과 수동 문장 채우기를 유지", async ({ page }) => {
    await openSituation(page, false);
    await expect(page.getByTestId("voice-status")).toContainText(/지원|사용할 수 없/);
    expect(await snapshots(page)).toHaveLength(0);
    await page.getByTestId("v2-text").fill("수원시에 사는 만 35세입니다.");
    await page.getByTestId("v2-fill").click();
    await expect(page.getByTestId("v2-understood")).toBeVisible();
    await expect(page).toHaveURL(/\/situation/);
  });

  test("권한 거절은 기존 입력을 바꾸지 않으며 수동 입력을 유지", async ({ page }) => {
    await openSituation(page);
    const original = "이 문장은 직접 적었습니다.";
    await page.getByTestId("v2-text").fill(original);
    const index = await startVoice(page);
    await emitError(page, index, "not-allowed");
    await emitEnd(page, index, true);
    await expect(page.getByTestId("voice-status")).toContainText(/권한|허용/);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue(original);
    await expect(page.getByTestId("v2-fill")).toBeEnabled();
  });

  test("취소 전 저장된 final 콜백이 늦게 와도 기존 입력·제안은 그대로", async ({ page }) => {
    await openSituation(page);
    const original = "기존 입력";
    await page.getByTestId("v2-text").fill(original);
    const index = await startVoice(page);
    await page.getByTestId("voice-cancel").click();
    await expect.poll(async () => (await snapshots(page))[index].aborts).toBeGreaterThan(0);
    await emitResult(page, index, "취소한 발화", true, true);
    await emitEnd(page, index, true);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue(original);
  });

  test("동의를 철회하면 진행 중 인식을 취소하고 다시 시작하지 않음", async ({ page }) => {
    await openSituation(page);
    const original = "직접 적은 내용";
    await page.getByTestId("v2-text").fill(original);
    const index = await startVoice(page);
    await page.getByTestId("voice-consent").uncheck();
    await expect.poll(async () => (await snapshots(page))[index].aborts).toBe(1);
    await emitResult(page, index, "동의 철회 전 음성", true, true);
    await emitError(page, index, "network", true);
    await expectNoProposal(page);
    await expect(page.getByTestId("voice-start")).toBeDisabled();
    await expect(page.getByTestId("voice-status")).toContainText("취소");
    await expect(page.getByTestId("v2-text")).toHaveValue(original);
  });

  test("탭 숨김은 진행 중 인식과 확인 대기 문장을 모두 폐기", async ({ page }) => {
    for (const review of [false, true]) {
      await openSituation(page);
      await page.getByTestId("v2-text").fill("보존할 기존 문장");
      const index = await startVoice(page);
      if (review) {
        await emitResult(page, index, "아직 확인하지 않은 문장");
        await expect(page.getByTestId("voice-transcript")).toBeVisible();
      }
      // Headless visibility is simulated; this checks the page lifecycle handler.
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect.poll(async () => (await snapshots(page))[index].aborts).toBe(1);
      await emitResult(page, index, "탭 숨김 전 늦은 결과", true, true);
      await emitEnd(page, index, true);
      await expectNoProposal(page);
      await expect(page.getByTestId("voice-status")).toContainText("취소");
      await expect(page.getByTestId("v2-text")).toHaveValue("보존할 기존 문장");
    }
  });

  test("인식 중 직접 문장을 고치면 이전 발화를 폐기 @mobile", async ({ page }) => {
    await openSituation(page);
    await page.getByTestId("v2-text").fill("처음 입력");
    const index = await startVoice(page);
    await page.getByTestId("v2-text").fill("사용자가 새로 고친 입력");
    await emitResult(page, index, "오래된 음성 입력", true, true);
    await emitEnd(page, index, true);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue("사용자가 새로 고친 입력");
  });

  test("인식 제안 이후 문장을 수정해도 확인으로 예전 결과를 넣지 못함", async ({ page }) => {
    await openSituation(page);
    const index = await startVoice(page);
    await emitResult(page, index, "수정 전 음성 문장");
    await expect(page.getByTestId("voice-confirm")).toBeVisible();
    await page.getByTestId("v2-text").fill("직접 적은 새 문장");
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue("직접 적은 새 문장");
  });

  test("누구 선택을 바꾸면 다른 대상의 늦은 발화를 폐기", async ({ page }) => {
    await openSituation(page);
    await page.getByTestId("v2-text").fill("본인에 관한 입력");
    const index = await startVoice(page);
    await page.getByTestId("mode-parent").click();
    await expect(page.getByTestId("v2-situation")).toHaveAttribute("data-mode", "parent");
    const afterModeChange = await page.getByTestId("v2-text").inputValue();
    await emitResult(page, index, "본인의 오래된 음성", true, true);
    await emitEnd(page, index, true);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue(afterModeChange);
    await expect(page.getByTestId("v2-situation")).toHaveAttribute("data-mode", "parent");
  });

  test("현재 문장으로 아래 칸을 채우면 진행 중 음성의 결과는 폐기", async ({ page }) => {
    await openSituation(page);
    const original = "수원시에 사는 만 35세입니다.";
    await page.getByTestId("v2-text").fill(original);
    const index = await startVoice(page);
    await page.getByTestId("v2-fill").click();
    await expect(page.getByTestId("v2-understood")).toBeVisible();
    await emitResult(page, index, "이전 인식 결과", true, true);
    await emitEnd(page, index, true);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue(original);
  });

  test("화면을 벗어난 뒤 늦은 결과는 입력 화면을 열거나 이동시키지 않음", async ({ page }) => {
    await openSituation(page);
    const index = await startVoice(page);
    await page.locator(".crumbs a").first().click();
    await expect(page).toHaveURL(/\/$/);
    await emitResult(page, index, "화면 이동 전 인식", true, true);
    await emitEnd(page, index, true);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("voice-confirm")).toHaveCount(0);
  });

  test("재녹음 이후 이전 세션의 late 콜백이 최신 제안을 덮지 않음", async ({ page }) => {
    await openSituation(page);
    const old = await startVoice(page);
    await page.getByTestId("voice-cancel").click();
    const current = await startVoice(page);
    await emitResult(page, current, "새롭게 말한 상황");
    await expect(page.getByTestId("voice-transcript")).toHaveValue("새롭게 말한 상황");
    await emitResult(page, old, "이전 상황", true, true);
    await emitEnd(page, old, true);
    await expect(page.getByTestId("voice-transcript")).toHaveValue("새롭게 말한 상황");
    await page.getByTestId("voice-confirm").click();
    await expect(page.getByTestId("v2-text")).toHaveValue("새롭게 말한 상황");
  });

  test("중지 후 무음 종료는 기존 입력을 지우거나 unknown으로 바꾸지 않음", async ({ page }) => {
    await openSituation(page);
    const original = "무음 전 기존 입력";
    await page.getByTestId("v2-text").fill(original);
    const index = await startVoice(page);
    await page.getByTestId("voice-stop").click();
    expect((await snapshots(page))[index].stops).toBe(1);
    await emitEnd(page, index);
    await expectNoProposal(page);
    await expect(page.getByTestId("v2-text")).toHaveValue(original);
    await expect(page.getByTestId("v2-fill")).toBeEnabled();
  });

  test("500자 초과 발화·이어 붙인 문장은 조용히 자르지 않고 안내", async ({ page }) => {
    for (const [original, transcript] of [["", "가".repeat(501)], ["나".repeat(490), "다".repeat(20)]]) {
      await openSituation(page);
      await page.getByTestId("v2-text").fill(original);
      const index = await startVoice(page);
      await emitResult(page, index, transcript);
      const confirm = page.getByTestId("voice-confirm");
      await expect.poll(async () => /500/.test(await page.getByTestId("voice-choice").innerText()) || await confirm.count() > 0).toBe(true);
      if (await confirm.count() && await confirm.isEnabled()) await confirm.click();
      await expect(page.getByTestId("voice-choice")).toContainText(/500/);
      await expect(page.getByTestId("v2-text")).toHaveValue(original);
      await expect(page).toHaveURL(/\/situation/);
    }
  });
});
