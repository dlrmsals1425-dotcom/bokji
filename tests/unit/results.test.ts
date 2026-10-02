import { describe, expect, it } from "vitest";
import { applyFilters, facetCounts, matchesQuery, scoreAll } from "@/lib/client/results";
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
  it("판정 + 정렬: 검수 규칙이 먼저", () => {
    expect(scored.map((s) => [s.program.id, s.ev.tier])).toEqual([
      ["기초연금", "eligible"],
      ["청년월세", "ineligible"],
      ["노인일자리", "likely"],
      ["상담", "check"],
    ]);
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

describe("내 상황 칩", () => {
  it("입력한 항목만, 중복 없이", () => {
    const chips = profileChips({ ...P, householdSize: 1, traits: ["single"], income: "unknown", children: [] }, "경기도 수원시");
    expect(chips).toEqual(["경기도 수원시", "75~79세", "가구원 1명", "1인 가구", "자녀 없음"]);
  });
});
