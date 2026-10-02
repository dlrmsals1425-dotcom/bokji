import { describe, expect, it } from "vitest";
import { LIFE, matchesFacet, matchesSelection, parseSelection, selectionQuery, supportTypes } from "../../src/lib/client/facets";
import type { Program } from "../../src/lib/data/types";

const prog = (p: Partial<Program>) => ({ id: "x", name: "테스트", summary: "", category: "생활지원", orgType: "central", scope: "national", sources: [], trust: "A", rule: { all: [] }, ...p }) as unknown as Program;
const senior = LIFE.find((f) => f.id === "senior")!;

describe("검색 필터·지원형태", () => {
  it("원천 태그가 있으면 태그로, 없으면 문구로 생애주기를 판단한다", () => {
    expect(matchesFacet(prog({ tags: ["보호·돌봄", "노년"] }), senior)).toBe(true);
    expect(matchesFacet(prog({ name: "저소득 재가노인 식사배달" }), senior)).toBe(true);
    expect(matchesFacet(prog({ name: "청년 월세 지원", tags: ["청년"] }), senior)).toBe(false);
  });
  it("묶음 안은 또는, 묶음끼리는 그리고", () => {
    const p = prog({ tags: ["노년", "저소득"], category: "보호·돌봄" });
    expect(matchesSelection(p, { life: ["senior", "youth"], house: [], topic: [] })).toBe(true);
    expect(matchesSelection(p, { life: ["senior"], house: ["disabled"], topic: [] })).toBe(false);
    expect(matchesSelection(p, { life: ["senior"], house: ["lowincome"], topic: ["보호·돌봄"] })).toBe(true);
  });
  it("URL 주고받기: 모르는 값은 버린다", () => {
    const s = parseSelection(new URLSearchParams("life=senior,zzz&topic=주거"));
    expect(s).toEqual({ life: ["senior"], house: [], topic: ["주거"] });
    expect(selectionQuery("기초연금", s)).toBe("?q=%EA%B8%B0%EC%B4%88%EC%97%B0%EA%B8%88&life=senior&topic=%EC%A3%BC%EA%B1%B0");
  });
  it("지원형태: 원천 유형 태그를 짧게 (최대 2개)", () => {
    expect(supportTypes(prog({ tags: ["행정·안전", "현금", "노년"] }))).toEqual(["현금"]);
    expect(supportTypes(prog({ tags: ["서비스(돌봄)||현금(감면)", "이용권"] }))).toEqual(["서비스", "감면"]);
    expect(supportTypes(prog({ tags: ["노년"] }))).toEqual([]);
  });
});
