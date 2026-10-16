import type { SpeechCallbacks, SpeechSession } from "./types";

/** Minimal structural types: the browser API is not in every lib.dom version. */
export interface RecognitionResultEvent {
  readonly resultIndex?: number;
  readonly results: ArrayLike<{
    readonly isFinal: boolean;
    readonly [index: number]: { readonly transcript: string };
  }>;
}

export interface RecognitionErrorEvent {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export type SpeechRecognitionFactory = () => SpeechRecognitionLike;
type RecognitionConstructor = new () => SpeechRecognitionLike;
type RecognitionWindow = {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

const LISTEN_LIMIT_MS = 20_000;
const FINAL_WAIT_MS = 2_000;
const NO_SPEECH = "음성이 들리지 않았어요. 다시 말하거나 직접 입력해 주세요.";

function recognitionConstructor(): RecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const browser = window as unknown as RecognitionWindow;
  if (typeof browser.SpeechRecognition === "function") return browser.SpeechRecognition;
  if (typeof browser.webkitSpeechRecognition === "function") return browser.webkitSpeechRecognition;
  return undefined;
}

/** Capability check only; does not construct a recognizer or request permission. */
export function isSpeechRecognitionSupported(): boolean {
  return recognitionConstructor() !== undefined;
}

function errorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
    case "NotAllowedError":
    case "SecurityError":
      return "마이크 사용이 허용되지 않았어요. 권한을 확인하거나 직접 입력해 주세요.";
    case "no-speech":
      return NO_SPEECH;
    case "audio-capture":
    case "NotFoundError":
      return "마이크를 사용할 수 없어요. 연결을 확인하거나 직접 입력해 주세요.";
    case "network":
      return "음성 인식 연결이 끊겼어요. 다시 시도하거나 직접 입력해 주세요.";
    case "aborted":
      return "음성 인식이 중단됐어요. 다시 시도하거나 직접 입력해 주세요.";
    case "language-not-supported":
      return "이 브라우저에서 한국어 음성 인식을 사용할 수 없어요. 직접 입력해 주세요.";
    default:
      return "음성 인식을 처리하지 못했어요. 다시 시도하거나 직접 입력해 주세요.";
  }
}

/**
 * Single-use session. Only start() opens recognition; the host owns consent.
 * stop() waits briefly for a final result. cancel() never invokes callbacks.
 * The browser may use its provider's service; no application STT/key is added.
 */
export function createSpeechSession(
  callbacks: SpeechCallbacks,
  factory?: SpeechRecognitionFactory,
): SpeechSession {
  let state: "idle" | "active" | "stopping" | "closed" = "idle";
  let recognition: SpeechRecognitionLike | null = null;
  let listeningTimer: ReturnType<typeof setTimeout> | undefined;
  let finalTimer: ReturnType<typeof setTimeout> | undefined;
  let startNotified = false;
  let cancelled = false;

  const active = () => state === "active" || state === "stopping";

  function release() {
    clearTimeout(listeningTimer);
    clearTimeout(finalTimer);
    listeningTimer = undefined;
    finalTimer = undefined;
    const current = recognition;
    recognition = null;
    if (!current) return;
    // Detach before abort: implementations may synchronously dispatch error/end.
    current.onstart = null;
    current.onresult = null;
    current.onerror = null;
    current.onend = null;
    try {
      current.abort();
    } catch {
      // Already ended/released in the browser; the session is closed regardless.
    }
  }

  function finish(outcome: { transcript: string } | { error: string }) {
    if (!active()) return;
    state = "closed";
    release();
    try {
      if ("transcript" in outcome) callbacks.onTranscript(outcome.transcript);
      else callbacks.onError(outcome.error);
    } finally {
      // A host may cancel synchronously inside onTranscript/onError on unmount.
      if (!cancelled) callbacks.onEnd();
    }
  }

  function stop() {
    if (state !== "active") return;
    state = "stopping";
    clearTimeout(listeningTimer);
    listeningTimer = undefined;
    // Arm first so synchronous final/end from stop() can clear the deadline.
    finalTimer = setTimeout(() => {
      finish({ error: "음성 인식 결과가 도착하지 않았어요. 다시 시도하거나 직접 입력해 주세요." });
    }, FINAL_WAIT_MS);
    try {
      recognition?.stop();
    } catch {
      finish({ error: "음성 인식을 마무리하지 못했어요. 다시 시도하거나 직접 입력해 주세요." });
    }
  }

  return {
    start() {
      if (state !== "idle") return;
      state = "active";
      try {
        if (factory) recognition = factory();
        else {
          const Constructor = recognitionConstructor();
          if (!Constructor) {
            finish({ error: "이 브라우저는 음성 인식을 지원하지 않아요. 직접 입력해 주세요." });
            return;
          }
          recognition = new Constructor();
        }
        recognition.lang = "ko-KR";
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onstart = () => {
          if (state !== "active" || startNotified) return;
          startNotified = true;
          callbacks.onStart();
        };
        recognition.onresult = (event) => {
          if (!active()) return;
          const first = Number.isInteger(event.resultIndex) && event.resultIndex! >= 0
            ? event.resultIndex! : 0;
          const parts: string[] = [];
          for (let index = first; index < event.results.length; index++) {
            const result = event.results[index];
            const text = result?.[0]?.transcript;
            if (result?.isFinal && typeof text === "string" && text.trim()) parts.push(text.trim());
          }
          // Interim/empty results never become an answer or a synthetic skip.
          if (parts.length) finish({ transcript: parts.join(" ") });
        };
        recognition.onerror = (event) => {
          if (active()) finish({ error: errorMessage(event.error) });
        };
        recognition.onend = () => {
          if (active()) finish({ error: NO_SPEECH });
        };
        // Includes startup/permission delay; a missing onstart cannot hang forever.
        listeningTimer = setTimeout(stop, LISTEN_LIMIT_MS);
        recognition.start();
      } catch (error: unknown) {
        const code = error instanceof Error ? error.name : "unknown";
        finish({ error: errorMessage(code) });
      }
    },
    stop,
    cancel() {
      cancelled = true;
      state = "closed";
      release();
    },
  };
}
