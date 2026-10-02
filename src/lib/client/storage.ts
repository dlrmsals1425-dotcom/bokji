"use client";
/**
 * 기기 저장소 (설계서 6.4): 프로필은 서버로 보내지 않고 이 기기에만 저장한다.
 * - 기본: localStorage (다음 방문 때 이어서 보기)
 * - 공용 기기 모드: sessionStorage (브라우저를 닫으면 사라짐)
 * useSyncExternalStore 로 구독 → SSR 에서는 undefined(로딩), 클라이언트에서는 Profile | null.
 */
import { useSyncExternalStore } from "react";
import { EMPTY_PROFILE, type Profile } from "../engine/profile";

const PROFILE_KEY = "bn.profile.v1";
const SETTINGS_KEY = "bn.settings.v1";

export interface Settings {
  large: boolean;
  shared: boolean;
}
const DEFAULT_SETTINGS: Settings = { large: false, shared: false };

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROFILE_KEY || e.key === SETTINGS_KEY || e.key === EXAMPLE_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function safeGet(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/* ---------- settings ---------- */
let settingsCache: { raw: string | null; value: Settings } = { raw: null, value: DEFAULT_SETTINGS };
function readSettings(): Settings {
  const raw = safeGet(localStorage, SETTINGS_KEY);
  if (raw !== settingsCache.raw) {
    let value = DEFAULT_SETTINGS;
    try {
      value = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
    } catch {}
    settingsCache = { raw, value };
  }
  return settingsCache.value;
}

export function setSettings(patch: Partial<Settings>) {
  const prev = readSettings();
  const next = { ...prev, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
  document.documentElement.dataset.large = next.large ? "1" : "0";
  // 공용 기기 모드 전환 시 프로필 저장 위치를 옮긴다
  if (prev.shared !== next.shared) {
    const from = prev.shared ? sessionStorage : localStorage;
    const to = next.shared ? sessionStorage : localStorage;
    const raw = safeGet(from, PROFILE_KEY);
    try {
      from.removeItem(PROFILE_KEY);
      if (raw) to.setItem(PROFILE_KEY, raw);
    } catch {}
  }
  emit();
}

export function useSettings(): Settings | undefined {
  return useSyncExternalStore(subscribe, readSettings, () => undefined);
}

/* ---------- profile ---------- */
let profileCache: { raw: string | null; value: Profile | null } = { raw: null, value: null };
function profileStore(): Storage {
  return readSettings().shared ? sessionStorage : localStorage;
}
function readProfile(): Profile | null {
  const raw = safeGet(profileStore(), PROFILE_KEY);
  if (raw !== profileCache.raw) {
    let value: Profile | null = null;
    try {
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && parsed.sigungu) value = { ...EMPTY_PROFILE, ...parsed };
    } catch {}
    profileCache = { raw, value };
  }
  return profileCache.value;
}

const EXAMPLE_KEY = "bn.example.v1";

/** exampleId: 홈의 '예시 상황'으로 채운 경우 그 id (결과 화면에 '예시' 안내를 띄운다). 직접 입력하면 지운다 */
export function saveProfile(p: Profile, exampleId?: string) {
  try {
    profileStore().setItem(PROFILE_KEY, JSON.stringify(p));
    if (exampleId) profileStore().setItem(EXAMPLE_KEY, exampleId);
    else {
      localStorage.removeItem(EXAMPLE_KEY);
      sessionStorage.removeItem(EXAMPLE_KEY);
    }
  } catch {}
  emit();
}

function readExample(): string | null {
  return safeGet(profileStore(), EXAMPLE_KEY);
}

/** 지금 결과가 예시 상황인지 (예시 id) */
export function useExample(): string | null | undefined {
  return useSyncExternalStore(subscribe, readExample, () => undefined);
}

/** '이 기기에서 지우기' — 두 저장소 모두에서 삭제 */
export function clearProfile() {
  try {
    localStorage.removeItem(PROFILE_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(EXAMPLE_KEY);
    sessionStorage.removeItem(EXAMPLE_KEY);
  } catch {}
  emit();
}

/** undefined = 아직 확인 전(SSR/하이드레이션), null = 저장된 입력 없음 */
export function useProfile(): Profile | null | undefined {
  return useSyncExternalStore(subscribe, readProfile, () => undefined);
}
