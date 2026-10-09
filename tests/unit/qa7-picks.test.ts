/** QA 7차 (6차 프로덕션 검증 claude-code-fixes.md) P4 부모 화면 상위 5개, N6 선발형 장학금 순위 — 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, buildView, needsStatus, scoreV2, topPicksV2, type Extras, type Situation } from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
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
const picksOf = (text: string) => {
  const sit = sitOf(text);
  return topPicksV2(buildView(scoreV2(progsFor(sit.profile), sit), sit, 12), 5, sit).map((g) => g[0].s.program.name);
};

describe("P4 부모 화면 상위 5개에 특수 신분·자녀 본인 신청 체험 사업 없음", () => {
  it("'고등학생 딸 키우는 엄마 안산' → 청소년회복지원시설운영·청소년비즈쿨 없음, 교통비·무상교육 유지", () => {
    const picks = picksOf("고등학생 딸 키우는 엄마 안산").join(" | ");
    expect(picks).not.toMatch(/청소년회복지원시설|비즈쿨/);
    expect(picks).toMatch(/교통비/);
    expect(picks).toMatch(/고등학교 무상교육/);
  });
  it("소년법 처분 대상 사업은 '신청할 때 확인' (처분 여부는 간편 입력으로 묻지 않음)", () => {
    const p = progsFor(sitOf("고등학생 딸 키우는 엄마 안산").profile).find((x) => x.name === "청소년회복지원시설운영")!;
    expect(needsStatus(p)).toMatch(/보호처분/);
  });
  it("10대 본인에게는 비즈쿨 같은 본인 참여 사업을 감점하지 않음", () => {
    expect(picksOf("고등학교 자퇴한 열일곱살이에요 수원").join(" | ")).not.toMatch(/회복지원시설/);
  });
});

describe("N6 성적·분야 한정 장학금은 일반 장학금보다 뒤", () => {
  it.each(["휴학 중인 대학생이에요 안산", "대학원생이에요 성남", "복학 예정인 대학생 부천"])("%s", (t) => {
    const picks = picksOf(t);
    const general = picks.findIndex((n) => /^국가장학금/.test(n));
    const selective = picks.findIndex((n) => /이공계|우수/.test(n));
    expect(general).toBeGreaterThanOrEqual(0);
    if (selective >= 0) expect(selective).toBeGreaterThan(general);
  });
  it("'대학원 다녀요'도 학생", () => {
    expect(parseSituation("대학원 다녀요 용인 스물일곱", regions, today).profile.activity).toBe("student");
  });
});
