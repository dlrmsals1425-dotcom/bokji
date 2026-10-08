/** QA 7차 (6차 프로덕션 검증 claude-code-fixes.md) P3 신청 기한 줄, T1 10대 본인 화면 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { DIM_BY_ID, EMPTY_EXTRAS, buildView, dimAvailable, needsChildren, scoreV2, teenSelf, topPicksV2, type Extras, type Situation } from "@/lib/client/v2";
import { dueRows, summaryDueRows } from "@/lib/client/money";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 9 };
const NOW = new Date("2026-10-09T12:00:00+09:00");
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
function screen(text: string) {
  const sit = sitOf(text);
  const view = buildView(scoreV2(progsFor(sit.profile), sit), sit, 12);
  const picks = topPicksV2(view, 5, sit);
  const lead = (gs: typeof picks) => gs.map((g) => g[0].s.program);
  const dues = summaryDueRows(lead(picks), lead(view.fit), lead(view.office), sit.profile.children, NOW).map((d) => `${d.program.name} ${d.due.text}`);
  return { sit, view, picks: picks.map((g) => g[0].s.program.name), dues };
}
const P = (o: Partial<Program> & { id: string; name: string }): Program => ({ regionCode: "00000", level: "national", source: "gov24", ...o }) as Program;

describe("P3 '신청 기한이 있는 것'이 상황과 맞음", () => {
  it("dueRows: 12개월 내내 접수(사실상 상시)는 빼고, '출생 후 N'은 아기·임신일 때만", () => {
    const ps = [
      P({ id: "all", name: "대학생 청소년교육지원장학금", due: { kind: "annual", text: "매년 3~2월", quote: "", months: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2] } }),
      P({ id: "birth", name: "선천성 난청검사 및 보청기 지원", due: { kind: "after", text: "출생 후 1년 이내", quote: "" } }),
      P({ id: "oct", name: "어떤 사업", due: { kind: "annual", text: "매년 10월", quote: "", months: [10] } }),
    ];
    expect(dueRows(ps, NOW, 4, { children: ["6-12"] }).map((r) => r.program.id)).toEqual(["oct"]);
    expect(dueRows(ps, NOW, 4, { children: null }).map((r) => r.program.id)).toEqual(["oct"]);
    expect(dueRows(ps, NOW, 4, { children: ["0-1"] }).map((r) => r.program.id)).toEqual(["oct", "birth"]);
    expect(dueRows(ps, NOW, 4, { children: ["pregnant"] }).map((r) => r.program.id)).toEqual(["oct", "birth"]);
  });
  it.each([
    ["고등학교 자퇴한 열일곱살이에요 수원", /대학생 청소년교육지원장학금/],
    ["학교 안 다니는 열여섯살 안산", /대학생 청소년교육지원장학금/],
    ["장인어른 모시고 삽니다 부천", /청소년자문단/],
    ["아이 키우는 엄마 안산", /청소년자문단/],
    ["초등학생 아들 키우는 아빠 수원", /선천성 난청/],
  ])("%s → 해당 줄 없음", (text, re) => {
    expect(screen(text).dues.join(" | ")).not.toMatch(re);
  });
  it("아기 엄마는 출생 기한 유지", () => {
    expect(screen("용인 사는 8개월 아기 엄마예요").dues.join(" | ")).toMatch(/출생 후/);
  });
});

describe("T1 10대 본인 화면", () => {
  const teen = () => screen("학교 안 다니는 열여섯살 안산");
  it("10대 본인 판별", () => {
    expect(teenSelf(teen().sit)).toBe(true);
    expect(teenSelf(sitOf("안양 스물여덟 구직 중이에요"))).toBe(false);
    expect(teenSelf(sitOf("고등학생 딸 키우는 엄마 안산"))).toBe(false);
  });
  it("소득 질문은 집 전체(부모님·보호자 포함), '모름' 안내", () => {
    const q = DIM_BY_ID.income.q("self", teen().sit);
    expect(q).toContain("부모님·보호자 포함");
    expect(q).toContain("모름");
    expect(DIM_BY_ID.income.q("self", sitOf("안양 스물여덟 구직 중이에요"))).toBe("가구 전체의 한 달 소득은 얼마쯤인가요?");
  });
  it("자녀 질문을 하지 않음", () => {
    const { sit, view } = teen();
    expect(dimAvailable(DIM_BY_ID.children, sit)).toBe(false);
    expect(view.questions.map((q) => q.dim.id)).not.toContain("children");
    expect(dimAvailable(DIM_BY_ID.children, sitOf("안양 스물여덟 구직 중이에요"))).toBe(true);
  });
  it("자녀가 있어야 하는 사업(기저귀·한부모 아동양육비·부모급여)은 '자녀 필요'로 구별", () => {
    const progs = progsFor(teen().sit.profile);
    const byName = (n: string) => progs.find((p) => p.name.includes(n))!;
    expect(needsChildren(byName("부모급여"))).toBe(true);
    expect(needsChildren(byName("학교 밖 청소년 건강검진"))).toBe(false);
  });
  it("10대 본인 상위 5개에 대학생 사업 없음", () => {
    for (const t of ["고등학교 자퇴한 열일곱살이에요 수원", "학교 안 다니는 열여섯살 안산"]) expect(screen(t).picks.join(" | ")).not.toMatch(/대학생|대학교/);
  });
});
