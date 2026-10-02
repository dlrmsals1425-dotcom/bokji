import { describe, expect, it } from "vitest";
import {
  compareIncomeBands, compareIncomeLte, compareRange, evaluateCond, evaluateRule, triAll, triAny,
} from "@/lib/engine/evaluate";
import { EMPTY_PROFILE, incomeRange, type Profile } from "@/lib/engine/profile";
import type { Cond, Rule } from "@/lib/engine/types";

const P = (over: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", ...over });
const rule = (logic: Cond | null, over: Partial<Rule> = {}): Rule => ({
  id: "R-test", origin: "curated", review: "curated", logic, unstructured: [], unstructuredCore: false, ...over,
});

describe("3값 논리", () => {
  it("AND: F가 하나라도 있으면 F, 모두 T면 T, 나머지 U", () => {
    expect(triAll(["T", "T"])).toBe("T");
    expect(triAll(["T", "U"])).toBe("U");
    expect(triAll(["U", "F"])).toBe("F");
    expect(triAll([])).toBe("T");
  });
  it("OR: T가 하나라도 있으면 T, 모두 F면 F, 나머지 U", () => {
    expect(triAny(["F", "T"])).toBe("T");
    expect(triAny(["F", "U"])).toBe("U");
    expect(triAny(["F", "F"])).toBe("F");
    expect(triAny([])).toBe("U");
  });
});

describe("구간 비교 (설계서 6.2 예시)", () => {
  it("만 65세 이상: 60~64 → F, 65~69 → T", () => {
    expect(compareRange([60, 64], 65)).toBe("F");
    expect(compareRange([65, 69], 65)).toBe("T");
  });
  it("만 18~39세: 35~39 → T, 40~49 → F, 0~18 → T(경계 포함)", () => {
    expect(compareRange([35, 39], 18, 39)).toBe("T");
    expect(compareRange([40, 49], 18, 39)).toBe("F");
  });
  it("구간이 걸치면 U", () => {
    expect(compareRange([60, 64], 62)).toBe("U");
    expect(compareRange([0, 18], 6, 18)).toBe("U");
  });
  it("소득 '중위 X% 이하'", () => {
    expect(compareIncomeLte(incomeRange("32"), 32)).toBe("T");
    expect(compareIncomeLte(incomeRange("40"), 32)).toBe("F");
    expect(compareIncomeLte(incomeRange("100"), 80)).toBe("U");
    expect(compareIncomeLte(incomeRange("60"), 65)).toBe("T");
    expect(compareIncomeLte(incomeRange("200+"), 200)).toBe("F");
  });
  it("소득 구간 합집합 (S3 JA0201~0205)", () => {
    const b: [number, number][] = [[0, 50], [50, 75]];
    expect(compareIncomeBands(incomeRange("48"), b)).toBe("T");
    expect(compareIncomeBands(incomeRange("60"), b)).toBe("T");
    expect(compareIncomeBands(incomeRange("100"), b)).toBe("U");
    expect(compareIncomeBands(incomeRange("150"), b)).toBe("F");
  });
});

describe("잎 조건", () => {
  it("모름이면 U와 '입력하면 확인' 안내", () => {
    const r = evaluateCond({ field: "age", min: 65, label: "만 65세 이상" }, P({}));
    expect(r.tri).toBe("U");
    expect(r.reasons[0].text).toContain("나이대을(를) 입력하면");
  });
  it("자녀 나이: 6~12세 자녀는 '9세 미만'에 걸침 → U, 2~5세 → T, 자녀 없음 → F", () => {
    const c: Cond = { field: "childAge", min: 0, max: 8, label: "9세 미만 자녀" };
    expect(evaluateCond(c, P({ children: ["6-12"] })).tri).toBe("U");
    expect(evaluateCond(c, P({ children: ["2-5", "13-18"] })).tri).toBe("T");
    expect(evaluateCond(c, P({ children: [] })).tri).toBe("F");
    expect(evaluateCond(c, P({ children: ["pregnant"] })).tri).toBe("F");
  });
  it("1인 가구는 가구원 수 1명으로도 충족", () => {
    expect(evaluateCond({ field: "trait", anyOf: ["single"], label: "1인 가구" }, P({ householdSize: 1 })).tri).toBe("T");
  });
  it("장애 정도 조건", () => {
    const c: Cond = { field: "disability", anyOf: ["self"], severity: "severe", label: "본인 심한 장애" };
    expect(evaluateCond(c, P({ disability: "self", disabilitySeverity: "severe" })).tri).toBe("T");
    expect(evaluateCond(c, P({ disability: "self", disabilitySeverity: "unknown" })).tri).toBe("U");
    expect(evaluateCond(c, P({ disability: "self", disabilitySeverity: "mild" })).tri).toBe("F");
    expect(evaluateCond(c, P({ disability: "member" })).tri).toBe("F");
    expect(evaluateCond(c, P({ disability: "none" })).tri).toBe("F");
  });
  it("soft 조건은 F를 U로 낮춘다", () => {
    const r = evaluateCond({ field: "benefit", anyOf: ["livelihood"], label: "저소득", soft: true }, P({ benefits: [] }));
    expect(r.tri).toBe("U");
  });
  it("capU 조건은 T를 U로 낮춘다", () => {
    expect(evaluateCond({ field: "children", anyOf: ["pregnant"], label: "임신 중", capU: true }, P({ children: ["pregnant"] })).tri).toBe("U");
  });
  it("unasked 는 항상 U", () => {
    expect(evaluateCond({ field: "unasked", label: "소득하위 70%" }, P({ income: "32" })).tri).toBe("U");
  });
});

describe("최종 판정 단계", () => {
  const senior: Cond = { all: [{ field: "age", min: 65, label: "만 65세 이상" }, { field: "benefit", anyOf: ["basic_pension"], label: "기초연금 수급" }] };

  it("검수 규칙 + 모두 T → 조건 충족, 근거 표시", () => {
    const e = evaluateRule(rule(senior), P({ age: "75-79", benefits: ["basic_pension"] }));
    expect(e.tier).toBe("eligible");
    expect(e.headline).toContain("✓ 만 65세 이상");
    expect(e.reasons.filter((r) => r.kind === "met")).toHaveLength(2);
  });
  it("검수 규칙 + 일부 모름 → 가능성 있음", () => {
    expect(evaluateRule(rule(senior), P({ age: "75-79" })).tier).toBe("likely");
  });
  it("하나라도 F → 조건 불일치(기본 숨김)", () => {
    const e = evaluateRule(rule(senior), P({ age: "30-34", benefits: ["basic_pension"] }));
    expect(e.tier).toBe("ineligible");
    expect(e.headline).toContain("만 65세 이상 (입력: 30~34세)");
  });
  it("자동 변환 규칙은 모두 T여도 '가능성 있음'까지만", () => {
    expect(evaluateRule(rule(senior, { review: "auto" }), P({ age: "75-79", benefits: ["basic_pension"] })).tier).toBe("likely");
  });
  it("자동 변환 규칙 + 충족 근거 없음 → 확인 필요", () => {
    expect(evaluateRule(rule(senior, { review: "auto" }), P({})).tier).toBe("check");
  });
  it("비정형 핵심 조건이 있으면 확인 필요 (설계서 6.3 강릉 예시)", () => {
    const e = evaluateRule(
      rule({ field: "age", min: 65, label: "만 65세 이상" }, { unstructured: ["돌봄필요 재가노인"], unstructuredCore: true }),
      P({ age: "70-74" }),
    );
    expect(e.tier).toBe("check");
    expect(e.headline).toContain("상담으로 판단");
  });
  it("비정형 핵심 조건이 있어도 명확히 F면 불일치", () => {
    expect(evaluateRule(rule({ field: "age", min: 65, label: "만 65세 이상" }, { unstructuredCore: true, unstructured: ["x"] }), P({ age: "25-29" })).tier).toBe("ineligible");
  });
  it("조건 없음(누구나)인 검수 규칙 → 조건 충족", () => {
    expect(evaluateRule(rule({ all: [] }), P({})).tier).toBe("eligible");
  });
  it("구조화 조건이 없는 규칙 → 확인 필요", () => {
    expect(evaluateRule(rule(null, { review: "auto", origin: "none" }), P({})).tier).toBe("check");
  });
  it("OR 묶음 라벨: 모두 F면 묶음 문구 하나로 설명", () => {
    const c: Cond = { any: [{ field: "age", min: 65, label: "65세 이상" }, { field: "disability", anyOf: ["self"], label: "장애인" }], label: "노인·장애인" };
    const e = evaluateRule(rule(c), P({ age: "30-34", disability: "none" }));
    expect(e.tier).toBe("ineligible");
    expect(e.reasons[0].text).toBe("노인·장애인 중 해당하는 항목이 없어요");
  });
});

describe("페르소나 골든 테스트", () => {
  const livelihood = rule({ field: "income", lte: 32, label: "가구 소득인정액 기준 중위소득 32% 이하" }, { unstructured: ["소득인정액은 재산 환산액을 포함해요"] });
  const youthRent = rule({ all: [
    { field: "age", min: 19, max: 34, label: "만 19~34세 청년" },
    { field: "housing", anyOf: ["monthly"], label: "월세 거주" },
    { field: "unasked", label: "부모와 따로 사는 저소득 무주택 청년" },
  ] });
  it("① 전남 군 지역 70대 1인 수급 어르신: 생계급여 조건 충족", () => {
    const p = P({ age: "75-79", householdSize: 1, income: "32", benefits: ["livelihood"] });
    expect(evaluateRule(livelihood, p).tier).toBe("eligible");
  });
  it("② 경기 수원 20대 월세 청년: 청년월세 가능성 있음, 생계급여는 소득 모름 → 가능성 있음", () => {
    const p = P({ age: "25-29", housing: "monthly" });
    expect(evaluateRule(youthRent, p).tier).toBe("likely");
    expect(evaluateRule(livelihood, p).tier).toBe("likely");
  });
  it("③ 40대 자가 중위 100% 가구: 생계급여·청년월세 불일치", () => {
    const p = P({ age: "40-49", housing: "own", income: "100" });
    expect(evaluateRule(livelihood, p).tier).toBe("ineligible");
    expect(evaluateRule(youthRent, p).tier).toBe("ineligible");
  });
});
