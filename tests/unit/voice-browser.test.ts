import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSpeechSession,
  isSpeechRecognitionSupported,
  type RecognitionErrorEvent,
  type RecognitionResultEvent,
  type SpeechRecognitionLike,
} from "@/lib/voice/browser";
import type { SpeechSession } from "@/lib/voice/types";

class FakeRecognition implements SpeechRecognitionLike {
  lang = "";
  continuous = false;
  interimResults = true;
  maxAlternatives = 9;
  onstart: (() => void) | null = null;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: RecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
}

const result = (text: string, isFinal = true): RecognitionResultEvent => ({
  resultIndex: 0,
  results: [{ isFinal, 0: { transcript: text } }],
});
const sessions: SpeechSession[] = [];
function setup() {
  const recognition = new FakeRecognition();
  const factory = vi.fn(() => recognition);
  const callbacks = { onStart: vi.fn(), onTranscript: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
  const session = createSpeechSession(callbacks, factory);
  sessions.push(session);
  return { recognition, factory, callbacks, session };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", undefined);
});

afterEach(() => {
  sessions.splice(0).forEach((session) => session.cancel());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("browser speech support", () => {
  it("is safe during server rendering and unsupported browsers", () => {
    expect(isSpeechRecognitionSupported()).toBe(false);
    vi.stubGlobal("window", {});
    expect(isSpeechRecognitionSupported()).toBe(false);
  });

  it.each(["SpeechRecognition", "webkitSpeechRecognition"])("detects %s without constructing or starting it", (name) => {
    const Constructor = vi.fn(function () { return new FakeRecognition(); });
    vi.stubGlobal("window", { [name]: Constructor });
    expect(isSpeechRecognitionSupported()).toBe(true);
    expect(Constructor).not.toHaveBeenCalled();
  });

  it("uses the standard constructor before the prefixed fallback, only at start", () => {
    const native = new FakeRecognition();
    const Standard = vi.fn(function () { return native; });
    const Prefixed = vi.fn(function () { return new FakeRecognition(); });
    vi.stubGlobal("window", { SpeechRecognition: Standard, webkitSpeechRecognition: Prefixed });
    const callbacks = { onStart: vi.fn(), onTranscript: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
    const session = createSpeechSession(callbacks);
    sessions.push(session);
    expect(Standard).not.toHaveBeenCalled();
    session.start();
    expect(Standard).toHaveBeenCalledTimes(1);
    expect(Prefixed).not.toHaveBeenCalled();
    expect(native.start).toHaveBeenCalledTimes(1);
  });

  it("reports unsupported once and does not restart the ended session", () => {
    const callbacks = { onStart: vi.fn(), onTranscript: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
    const session = createSpeechSession(callbacks);
    session.start();
    session.start();
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("지원하지"));
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining("직접 입력해 주세요"));
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("single-use recognition session", () => {
  it("constructs on explicit start, configures Korean continuous recognition, and starts only once", () => {
    const { session, factory, recognition, callbacks } = setup();
    session.stop();
    expect(factory).not.toHaveBeenCalled();
    session.start();
    session.start();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition).toMatchObject({ lang: "ko-KR", continuous: true, interimResults: false, maxAlternatives: 1 });
    expect(callbacks.onStart).not.toHaveBeenCalled();
    recognition.onstart?.();
    recognition.onstart?.();
    expect(callbacks.onStart).toHaveBeenCalledTimes(1);
  });

  it("ignores interim/empty results and publishes one final transcript before ending", () => {
    const { session, recognition, callbacks } = setup();
    const order: string[] = [];
    callbacks.onTranscript.mockImplementation(() => { order.push("transcript"); });
    callbacks.onEnd.mockImplementation(() => { order.push("end"); });
    session.start();
    const onResult = recognition.onresult!;
    const onError = recognition.onerror!;
    const onEnd = recognition.onend!;
    onResult(result("두 번째", false));
    onResult(result("  "));
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    onResult(result("  두 번째  "));
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    expect(recognition.abort).not.toHaveBeenCalled();
    session.stop();
    onEnd();
    onResult(result("첫 번째"));
    onError({ error: "network" });
    onEnd();
    session.start();
    expect(callbacks.onTranscript).toHaveBeenCalledExactlyOnceWith("두 번째");
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(order).toEqual(["transcript", "end"]);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(recognition.onresult).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps all final segments in one event so a multiple-choice utterance is not shortened", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    recognition.onresult?.({ resultIndex: 1, results: [
      { isFinal: false, 0: { transcript: "이전 가설" } },
      { isFinal: true, 0: { transcript: "1번 또는" } },
      { isFinal: true, 0: { transcript: "2번" } },
    ] });
    session.stop();
    recognition.onend?.();
    expect(callbacks.onTranscript).toHaveBeenCalledExactlyOnceWith("1번 또는 2번");
  });

  it("keeps listening between final phrases and joins cumulative results without duplication", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    recognition.onresult?.(result("수원시에 살고 있어요."));
    vi.advanceTimersByTime(3_000);
    expect(recognition.stop).not.toHaveBeenCalled();
    expect(recognition.abort).not.toHaveBeenCalled();
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    const cumulative: RecognitionResultEvent = { resultIndex: 1, results: [
      { isFinal: true, 0: { transcript: "수원시에 살고 있어요." } },
      { isFinal: true, 0: { transcript: "일자리를 찾고 있어요." } },
    ] };
    recognition.onresult?.(cumulative);
    recognition.onresult?.({ ...cumulative, resultIndex: 0 });
    session.stop();
    recognition.onend?.();
    expect(callbacks.onTranscript).toHaveBeenCalledExactlyOnceWith("수원시에 살고 있어요. 일자리를 찾고 있어요.");
  });

  it("returns buffered phrases at the deadline even if the browser never sends end", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    recognition.onresult?.(result("끝까지 보존할 문장"));
    vi.advanceTimersByTime(20_000);
    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2_000);
    expect(callbacks.onTranscript).toHaveBeenCalledExactlyOnceWith("끝까지 보존할 문장");
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("cancel discards already recognized phrases instead of publishing them on late end", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    recognition.onresult?.(result("확인 전 문장"));
    const end = recognition.onend!;
    session.cancel();
    end();
    vi.advanceTimersByTime(22_000);
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("preserves final phrases if the browser ends continuous recognition early", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    recognition.onresult?.(result("브라우저가 인식한 문장"));
    recognition.onend?.();
    expect(callbacks.onTranscript).toHaveBeenCalledExactlyOnceWith("브라우저가 인식한 문장");
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("cancel before start permanently prevents microphone use and callbacks", () => {
    const { session, factory, callbacks } = setup();
    session.cancel();
    session.start();
    session.stop();
    expect(factory).not.toHaveBeenCalled();
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
  });

  it("cancel detaches/aborts once and ignores callbacks already queued by the browser", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    const events = { start: recognition.onstart!, result: recognition.onresult!, error: recognition.onerror!, end: recognition.onend! };
    recognition.abort.mockImplementation(() => { events.error({ error: "aborted" }); events.end(); });
    session.cancel();
    session.cancel();
    events.start();
    events.result(result("건너뛰기"));
    events.error({ error: "not-allowed" });
    events.end();
    vi.advanceTimersByTime(20_000);
    session.start();
    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancel during final waiting discards the eventual final result", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    const late = recognition.onresult!;
    session.stop();
    session.cancel();
    late(result("2번"));
    vi.advanceTimersByTime(3_000);
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onEnd).not.toHaveBeenCalled();
  });

  it("stop waits for a final response and ignores repeated stop or late start events", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    session.stop();
    session.stop();
    recognition.onstart?.();
    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    expect(callbacks.onStart).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_999);
    recognition.onresult?.(result("2번"));
    vi.advanceTimersByTime(10_000);
    expect(callbacks.onTranscript).toHaveBeenCalledExactlyOnceWith("2번");
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops after 20 seconds including startup delay and ends after 2 seconds without a response", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    const late = recognition.onresult!;
    vi.advanceTimersByTime(19_999);
    expect(recognition.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(recognition.stop).toHaveBeenCalledTimes(1);
    expect(callbacks.onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_999);
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("결과가 도착하지"));
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(recognition.abort).toHaveBeenCalledTimes(1);
    late(result("2번"));
    session.start();
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a delayed onstart does not extend the 20-second deadline", () => {
    const { session, recognition } = setup();
    session.start();
    vi.advanceTimersByTime(18_000);
    recognition.onstart?.();
    vi.advanceTimersByTime(2_000);
    expect(recognition.stop).toHaveBeenCalledTimes(1);
  });

  it("clears the final deadline if stop synchronously returns a final result", () => {
    const { session, recognition, callbacks } = setup();
    recognition.stop.mockImplementation(() => { recognition.onresult?.(result("월세")); recognition.onend?.(); });
    session.start();
    session.stop();
    expect(callbacks.onTranscript).toHaveBeenCalledExactlyOnceWith("월세");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an end without a final result reports no speech once, never unknown", () => {
    const { session, recognition, callbacks } = setup();
    session.start();
    const end = recognition.onend!;
    recognition.onresult?.(result("건너뛰기", false));
    end();
    end();
    session.start();
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("음성이 들리지"));
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["not-allowed", "허용되지"], ["service-not-allowed", "허용되지"],
    ["audio-capture", "마이크를 사용할 수 없"], ["no-speech", "음성이 들리지"],
    ["network", "연결이 끊겼"], ["aborted", "중단"],
  ])("handles %s as one terminal error, followed by end", (error, message) => {
    const { session, recognition, callbacks } = setup();
    session.start();
    const late = recognition.onresult!;
    const onEnd = recognition.onend!;
    recognition.onerror?.({ error });
    onEnd();
    late(result("1번"));
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(message));
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining("직접 입력해 주세요"));
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(callbacks.onTranscript).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles synchronous permission refusal without leaking browser exception text", () => {
    const { session, recognition, callbacks } = setup();
    recognition.start.mockImplementation(() => { throw new DOMException("provider-private-text", "NotAllowedError"); });
    expect(() => session.start()).not.toThrow();
    session.start();
    expect(callbacks.onError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("허용되지"));
    expect(callbacks.onError.mock.calls.flat().join()).not.toContain("provider-private-text");
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(recognition.start).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles factory failure and stop/abort exceptions without leaving live timers", () => {
    const { session, recognition, callbacks } = setup();
    recognition.stop.mockImplementation(() => { throw new Error("stop failed"); });
    recognition.abort.mockImplementation(() => { throw new Error("abort failed"); });
    session.start();
    expect(() => session.stop()).not.toThrow();
    expect(callbacks.onError).toHaveBeenCalledTimes(1);
    expect(callbacks.onEnd).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const failing = createSpeechSession(callbacks, () => { throw new Error("constructor failed"); });
    expect(() => failing.start()).not.toThrow();
    expect(callbacks.onEnd).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("host cancellation inside the transcript callback suppresses subsequent callbacks", () => {
    const { session, recognition, callbacks } = setup();
    callbacks.onTranscript.mockImplementation(() => { session.cancel(); });
    session.start();
    recognition.onresult?.(result("1번"));
    session.stop();
    recognition.onend?.();
    expect(callbacks.onTranscript).toHaveBeenCalledTimes(1);
    expect(callbacks.onEnd).not.toHaveBeenCalled();
    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
