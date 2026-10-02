import { describe, expect, it } from "vitest";
import { applyFilters, autoGroups, facetCounts, groupVariants, industryCount, matchesQuery, scoreAll, topPicks, variantKey } from "@/lib/client/results";
import { profileChips } from "@/lib/client/summary";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";
import type { Rule } from "@/lib/engine/types";

const rule = (id: string, review: Rule["review"], logic: Rule["logic"]): Rule => ({
  id, origin: review === "auto" ? "text_extract" : "curated", review, logic, unstructured: [], unstructuredCore: false,
});
const prog = (id: string, over: Partial<Program>): Program => ({
  id, name: id, summary: "", category: "생활지원", orgType: "central", scope: "national",
  sources: [{ source: "bokjiro", id, fetchedAt: "2026-10-02" }], trust: "A",
  rule: rule(id, "auto", null), ...over,
});

const SENIOR = { field: "age", min: 65, label: "만 65세 이상" } as const;
const programs: Program[] = [
  prog("기초연금", { rule: rule("r1", "curated", SENIOR) }),
  prog("노인일자리", { category: "일자리", orgType: "local", scope: "sigungu", rule: rule("r2", "auto", SENIOR) }),
  prog("청년월세", { category: "주거", rule: rule("r3", "curated", { field: "age", min: 19, max: 34, label: "19~34세" }) }),
  prog("상담", { category: "보호·돌봄", orgType: "public_inst", summary: "돌봄 상담" }),
];
const P: Profile = { ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", age: "75-79" };

describe("결과 계산", () => {
  const scored = scoreAll(programs, P);
  it("판정 + 관련도 정렬: 맞은 조건·검수 규칙이 많은 사업이 먼저, 나와 무관한 집단(청년) 대상은 뒤로", () => {
    expect(Object.fromEntries(scored.map((s) => [s.program.id, s.ev.tier]))).toEqual({ 기초연금: "eligible", 노인일자리: "likely", 청년월세: "ineligible", 상담: "check" });
    expect(scored[0].program.id).toBe("기초연금");
    expect(scored[scored.length - 1].program.id).toBe("청년월세");
  });
  it("면별 개수는 다른 축 필터를 반영해 함께 바뀐다", () => {
    const all = facetCounts(scored, { tier: "likely", category: null, org: null, q: "" });
    expect(all.tiers).toEqual({ eligible: 1, likely: 1, check: 1, ineligible: 1 });
    expect(all.orgs.get("local")).toBe(1);
    const centralOnly = facetCounts(scored, { tier: "likely", category: null, org: "central", q: "" });
    expect(centralOnly.tiers).toEqual({ eligible: 1, likely: 0, check: 0, ineligible: 1 });
    expect(applyFilters(scored, { tier: "eligible", category: null, org: "local", q: "" })).toHaveLength(0);
  });
  it("검색어는 띄어쓰기를 무시한다", () => {
    expect(matchesQuery(programs[3], "돌 봄")).toBe(true);
    expect(matchesQuery(programs[0], "기초 연금")).toBe(true);
    expect(matchesQuery(programs[0], "월세")).toBe(false);
  });
});

describe("지역 변형 묶음·숨김 필터·추천", () => {
  const items: Program[] = [
    prog("경기도 어르신 식사배달", { orgType: "metro", scope: "sido", rule: rule("a", "auto", SENIOR) }),
    prog("수원시 어르신 식사배달", { orgType: "local", scope: "sigungu", rule: rule("b", "auto", SENIOR) }),
    prog("(장안구) 어르신 식사배달 지원", { orgType: "local", scope: "sigungu", rule: rule("c", "auto", SENIOR) }),
    prog("벼 육묘용 상토 지원", { sector: "agri", rule: rule("d", "auto", SENIOR) }),
    prog("소상공인 경영개선 지원", { sector: "business", rule: rule("e", "auto", SENIOR) }),
    prog("노인 돌봄", { category: "보호·돌봄", rule: rule("f", "curated", SENIOR) }),
  ];
  const sc = scoreAll(items, P);
  it("지역명 접두어·지역 괄호를 떼고 같은 이름이면 한 묶음", () => {
    expect(variantKey("경기도 어르신 식사배달")).toBe(variantKey("수원시 어르신 식사배달"));
    expect(variantKey("(장안구) 어르신 식사배달 지원")).toBe(variantKey("수원시 어르신 식사배달"));
    expect(variantKey("의료급여(요양비)")).not.toBe(variantKey("의료급여"));
  });
  it("탭 개수 = 화면 카드(묶음) 수, 농림·사업자 대상은 기본 숨김", () => {
    const f = { tier: "likely" as const, category: null, org: null, q: "" };
    const groups = groupVariants(applyFilters(sc, f));
    expect(facetCounts(sc, f).tiers.likely).toBe(groups.length);
    expect(groups).toHaveLength(1);
    expect(groups[0].variants).toHaveLength(2);
    expect(industryCount(sc, f)).toBe(2);
    const withInd = { ...f, includeIndustry: true };
    expect(facetCounts(sc, withInd).tiers.likely).toBe(groupVariants(applyFilters(sc, withInd)).length);
    expect(facetCounts(sc, withInd).tiers.likely).toBe(3);
  });
  it("분야 필터를 걸어도 개수와 목록이 일치", () => {
    const f = { tier: "eligible" as const, category: "보호·돌봄" as const, org: null, q: "" };
    expect(facetCounts(sc, f).tiers.eligible).toBe(groupVariants(applyFilters(sc, f)).length);
  });
  it("맞춤 추천은 조건 충족 우선, 숨김 대상 제외, 묶음 단위", () => {
    const top = topPicks(sc, {}, 5);
    expect(top[0].lead.program.id).toBe("노인 돌봄");
    expect(top.map((g) => g.lead.program.sector).filter(Boolean)).toHaveLength(0);
    expect(top).toHaveLength(2);
  });
});

describe("신청 유형: 자동 제공·기관 선정은 본문·추천에서 빼고 아래 접힌 영역으로", () => {
  const items: Program[] = [
    prog("기초연금", { applyType: "self", rule: rule("s1", "curated", SENIOR) }),
    prog("노인 돌봄", { category: "보호·돌봄", rule: rule("s2", "curated", SENIOR) }), // unknown → 본문에 그대로
    prog("저소득 건강보험료 지원", { applyType: "auto", rule: rule("a1", "curated", SENIOR) }),
    prog("수원시 명절 위문금", { applyType: "auto", orgType: "local", scope: "sigungu", rule: rule("a2", "auto", SENIOR) }),
    prog("경기도 명절 위문금", { applyType: "auto", orgType: "metro", scope: "sido", rule: rule("a3", "auto", SENIOR) }),
    prog("경로당 운영 지원", { applyType: "institution", category: "보호·돌봄", rule: rule("i1", "auto", SENIOR) }),
    prog("청년 자동지급", { applyType: "auto", rule: rule("a4", "curated", { field: "age", min: 19, max: 34, label: "19~34세" }) }),
    prog("농가 자동지원", { applyType: "auto", sector: "agri", rule: rule("a5", "auto", SENIOR) }),
  ];
  const sc = scoreAll(items, P);
  const base = { tier: "eligible" as const, category: null, org: null, q: "" };
  it("탭 개수와 목록에는 직접 신청·확인 필요만", () => {
    for (const tier of ["eligible", "likely", "check"] as const) {
      const f = { ...base, tier };
      const groups = groupVariants(applyFilters(sc, f));
      expect(facetCounts(sc, f).tiers[tier]).toBe(groups.length);
      expect(groups.every((g) => g.variants.every((v) => !v.program.applyType || v.program.applyType === "self" || v.program.applyType === "unknown"))).toBe(true);
    }
    expect(applyFilters(sc, base).map((s) => s.program.id).sort()).toEqual(["기초연금", "노인 돌봄"].sort());
  });
  it("맞춤 추천에서도 제외", () => {
    expect(topPicks(sc, {}, 5).map((g) => g.lead.program.id).sort()).toEqual(["기초연금", "노인 돌봄"].sort());
  });
  it("자동 영역: 해당 없음·기본 숨김(농림)·무관한 사업 제외, 지역 변형은 한 묶음, 분야 필터 반영", () => {
    const autos = autoGroups(sc, base);
    const ids = autos.map((g) => g.lead.program.id);
    expect(ids).not.toContain("청년 자동지급");
    expect(ids).not.toContain("농가 자동지원");
    expect(autos).toHaveLength(3);
    expect(autos.find((g) => g.variants.length === 1)).toBeTruthy();
    expect(autoGroups(sc, { ...base, category: "보호·돌봄" }).map((g) => g.lead.program.id)).toEqual(["경로당 운영 지원"]);
    // 관련도 0 이하(내 상황과 무관한 사업)는 자동 영역에도 넣지 않는다
    expect(autos.every((g) => g.lead.score > 0)).toBe(true);
    const unrelated = scoreAll([prog("교원 직무연수", { applyType: "institution", category: "보육" })], P);
    expect(autoGroups(unrelated, base)).toHaveLength(unrelated[0].score > 0 ? 1 : 0);
  });
});

describe("내 상황 칩", () => {
  it("입력한 항목만, 중복 없이", () => {
    const chips = profileChips({ ...P, householdSize: 1, traits: ["single"], income: "unknown", children: [] }, "경기도 수원시");
    expect(chips).toEqual(["경기도 수원시", "75~79세", "가구원 1명", "1인 가구", "자녀 없음"]);
  });
});
