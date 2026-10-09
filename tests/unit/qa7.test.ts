/** QA 7차 (2026-10-09, 6차 프로덕션 검증 claude-code-fixes.md) 회귀 테스트 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, buildView, scoreV2, topPicksV2, type Extras, type Situation, type V2View } from "@/lib/client/v2";
import { situationOf } from "@/lib/client/start";
import { PRESETS } from "@/lib/client/presets";
import { refineProgram } from "@/lib/data/refine";
import { evaluateRule } from "@/lib/engine/evaluate";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 9 };
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);

function sitOf(text: string): Situation {
  const r = parseSituation(text, regions, today);
  const p: Profile = { ...EMPTY_PROFILE };
  for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
  const b: Extras["benefits"] = {};
  r.profile.benefits?.forEach((k) => (b[k] = true));
  r.benefitsNo?.forEach((k) => (b[k] = false));
  const tr: Extras["traits"] = {};
  r.profile.traits?.forEach((k) => (tr[k] = true));
  const ex = parsedExtras(r);
  return { profile: p, x: { ...EMPTY_EXTRAS, benefits: b, traits: tr, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? "self" };
}
const progsCache = new Map<string, Program[]>();
function progsFor(p: Profile) {
  const k = `${p.sido}/${p.sigungu}`;
  if (!progsCache.has(k)) progsCache.set(k, [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram));
  return progsCache.get(k)!;
}
function viewOf(sit: Situation) {
  const view = buildView(scoreV2(progsFor(sit.profile), sit), sit, 12);
  return { view, picks: topPicksV2(view, 5, sit).map((g) => g[0].s.program.name) };
}
const BUCKETS = ["fit", "office", "ask", "no"] as const;
const bucketOf = (view: V2View, name: string) => BUCKETS.find((b) => view[b].some((g) => g.some((i) => i.s.program.name === name))) ?? null;

const NES = "국민취업지원제도";
const nes = () => refineProgram(load("public/bundles/v1/national.json").find((p) => p.name === NES)!);

describe("M4 국민취업지원제도 — '일 안 함'은 구직자로 보지 않음, 원문 나이(15~69세)는 확인할 조건 문구로", () => {
  it("일하지 않음(구직 여부 모름)은 '받으실 수 있어요'가 아님, 구직 중은 그대로", () => {
    const rule = nes().rule;
    const base = { ...EMPTY_PROFILE, sido: "41", sigungu: "41110", income: "32" as Profile["income"] };
    expect(evaluateRule(rule, { ...base, age: "25-29", activity: "job_seeking" }).tier).toBe("eligible");
    expect(evaluateRule(rule, { ...base, age: "40-49", activity: "none" }).tier).not.toBe("eligible");
    expect(evaluateRule(rule, { ...base, age: "40-49", activity: "employed" }).tier).toBe("ineligible");
    expect(evaluateRule(rule, { ...base, age: "25-29", activity: "job_seeking" }).reasons.map((r) => r.text)).toContain("추가로 확인할 조건: 만 15~69세 구직자 (원문)");
  });
  it("수원 어르신 예시(75~79세, 일 안 함): 받으실 수 있어요에 없음", () => {
    const pre = PRESETS.find((p) => p.id === "suwon-senior")!;
    const { view, picks } = viewOf(situationOf(pre.profile, pre.x, pre.mode ?? "self"));
    expect(bucketOf(view, NES)).not.toBe("fit");
    expect(picks).not.toContain(NES);
  });
  it("구직·실직 문장은 그대로 상위 5개", () => {
    expect(viewOf(sitOf("안양 스물여덟 구직 중이에요")).picks).toContain(NES);
    expect(viewOf(sitOf("화성 동탄 살아요 실직했어요")).picks).toContain(NES);
  });
});
