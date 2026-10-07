/** QA 3차 리포트(R1~R7·C3·M2·N6 등) 회귀 테스트 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import {
  DIM_BY_ID, EMPTY_EXTRAS, SPECIAL_STATUS, answersFor, buildView, classifyOne, needsOccupation, notForPersons, plainLine, scoreV2, topPicksV2, withTopic,
  type Extras, type Situation,
} from "@/lib/client/v2";
import { howTo } from "@/lib/client/howto";
import { refineProgram, refineRule, textMedianCap } from "@/lib/data/refine";
import { detailBucket } from "@/lib/data/bucket";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";
import type { Rule } from "@/lib/engine/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 7 };
const P = (s: string, hint?: "self" | "parent") => parseSituation(s, regions, today, { hint });
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);

/** 확인 화면의 병합과 같게: 문장 → 상황 */
function sitOf(text: string, hint?: "self" | "parent"): Situation {
  const r = P(text, hint);
  const p: Profile = { ...EMPTY_PROFILE };
  for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
  const b: Extras["benefits"] = {};
  r.profile.benefits?.forEach((k) => (b[k] = true));
  r.benefitsNo?.forEach((k) => (b[k] = false));
  const tr: Extras["traits"] = {};
  r.profile.traits?.forEach((k) => (tr[k] = true));
  const ex = parsedExtras(r);
  return { profile: p, x: { ...EMPTY_EXTRAS, benefits: b, traits: tr, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? hint ?? "self" };
}
function picksOf(sit: Situation) {
  const p = sit.profile;
  const progs = [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
  const view = buildView(scoreV2(progs, sit), sit, 12);
  return { view, picks: topPicksV2(view, 5, sit).map((g) => g[0]) };
}
const nat = load("public/bundles/v1/national.json").map(refineProgram);
const byId = (id: string) => nat.find((p) => p.id === id)!;

describe("R1 나이 표현", () => {
  it("'이십대 후반' · '삼십대 초반' → 범위", () => {
    expect(P("이십대 후반이고 안양에서 혼자 자취해요").ageRange).toEqual([26, 29]);
    expect(P("삼십대 초반 신혼부부 고양").ageRange).toEqual([30, 33]);
  });
  it("'아빠는 예순다섯 평택' — 조사 없는 고유어 나이", () => {
    const r = P("저는 딸이고 아빠는 예순다섯 평택 사세요");
    expect(r.mode).toBe("parent");
    expect(r.ageRange).toEqual([65, 65]);
    expect(P("서른 명 정도 수원").ageRange).toBeUndefined();
    expect(P("집에서 쉰 지 3년 수원 사는 30살").ageRange).toEqual([30, 30]);
  });
  it("'할아버지 혼자 사세요' → 만 65세 이상으로 보고 확인 화면에 표시", () => {
    const r = P("하남에 할아버지 혼자 사세요 거동이 불편하세요");
    expect(r.mode).toBe("parent");
    expect(r.ageRange).toEqual([65, 120]);
    expect(r.ageChoices).toContain("80+");
    expect(r.understood.map((u) => u.label).join(" ")).toContain("65세 이상으로 봤어요");
  });
  it("'마흔 넘은 싱글맘' → 본인·한부모·자녀 1명·40세 이상", () => {
    const r = P("마흔 넘은 싱글맘 시흥");
    expect(r.mode).toBe("self");
    expect(r.profile.traits).toContain("single_parent");
    expect(r.profile.householdSize).toBe(2);
    expect(r.ageRange?.[0]).toBe(40);
  });
  it("문장이 그럴듯하면 '먼저 확인할 5가지'가 비지 않음", () => {
    for (const s of ["이십대 후반이고 안양에서 혼자 자취해요", "저는 딸이고 아빠는 예순다섯 평택 사세요", "삼십대 초반 신혼부부 고양", "하남에 할아버지 혼자 사세요 거동이 불편하세요", "마흔 넘은 싱글맘 시흥"]) {
      expect(picksOf(sitOf(s)).picks.length, s).toBeGreaterThanOrEqual(3);
    }
  });
});
