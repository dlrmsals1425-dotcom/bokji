import { describe, expect, it } from "vitest";
import { extractFromText } from "../src/rules/fromText";
import { rulesFromSupportConditions } from "../src/rules/fromGov24";
import { lifecycleCond, householdCond } from "../src/rules/fromTags";
import { evaluateRule } from "@/lib/engine/evaluate";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Rule } from "@/lib/engine/types";

const P = (o: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", ...o });
const auto = (logic: Rule["logic"], core = false, unstructured: string[] = []): Rule => ({ id: "t", origin: "text_extract", review: "auto", logic, unstructured, unstructuredCore: core });

describe("대상 문구 → 조건 초안", () => {
  it("'노인, 장애인' → OR", () => {
    const t = extractFromText("노인, 장애인");
    expect(t.matched).toEqual(expect.arrayContaining(["노인", "장애인"]));
    expect(evaluateRule(auto(t.logic), P({ age: "70-74" })).tier).toBe("likely");
    expect(evaluateRule(auto(t.logic), P({ age: "30-34", disability: "none" })).tier).toBe("ineligible");
  });
  it("숫자 연령 우선: '65세 이상 노인'", () => {
    const t = extractFromText("허약·만성질환 관리가 필요한 65세 이상 노인");
    expect(t.matched[0]).toContain("65세 이상");
    expect(evaluateRule(auto(t.logic, t.core), P({ age: "60-64" })).tier).toBe("ineligible");
  });
  it("모호한 판단 문구는 핵심 비정형 조건 → 확인 필요", () => {
    const t = extractFromText("돌봄 사각지대에 있는 위기가구");
    expect(t.core).toBe(true);
  });
  it("돌봄 필요 문구는 민감 입력(돌봄 필요)과 연결", () => {
    const t = extractFromText("결식우려, 거동 불편 등으로 식사지원이 필요한 노인, 장애인");
    expect(t.matched).toContain("돌봄 필요");
    const e = evaluateRule(auto(t.logic, t.core, t.unstructured), P({ age: "75-79", care: ["daily"] }));
    expect(["likely", "check"]).toContain(e.tier);
  });
  it("'구민 누구나' → 지역 주민 누구나", () => {
    const t = extractFromText("구민 누구나");
    expect(evaluateRule(auto(t.logic), P({})).tier).toBe("likely");
  });
  it("수급자·차상위 / 장기요양 수급자 구분", () => {
    expect(extractFromText("기초생활수급자 및 차상위계층 노인").matched).toContain("수급·차상위");
    expect(extractFromText("장기요양 수급자").matched).not.toContain("수급");
    expect(extractFromText("장기요양 수급자").matched).toContain("장기요양 등급");
  });
  it("빈 문구 → 조건 없음", () => expect(extractFromText("").logic).toBeNull());
});

describe("복지로 태그 → 조건", () => {
  it("모든 연령 태그면 제한 없음", () => expect(lifecycleCond(["영유아", "아동", "청소년", "청년", "중장년", "노년"])).toBeNull());
  it("노년 태그: 30대는 불일치", () => {
    expect(evaluateRule(auto(lifecycleCond(["노년"])), P({ age: "30-34" })).tier).toBe("ineligible");
  });
  it("가구상황 태그는 soft: 해당 없음이어도 숨기지 않음", () => {
    expect(evaluateRule(auto(householdCond(["장애인"])), P({ disability: "none" })).tier).toBe("check");
    expect(evaluateRule(auto(householdCond(["장애인"])), P({ disability: "self" })).tier).toBe("likely");
  });
});

describe("공공서비스(혜택) supportConditions → 규칙 (설계서 6.6)", () => {
  // 형식 검증용 합성 입력 (Swagger supportConditions_model 필드 기준, 실제 사업 데이터 아님)
  const base = { 서비스ID: "TEST-0001" };
  it("연령 + 중위소득 구간", () => {
    const d = rulesFromSupportConditions({ ...base, JA0110: 19, JA0111: 34, JA0201: "Y", JA0202: "Y" });
    const r = auto(d.logic);
    expect(evaluateRule(r, P({ age: "25-29", income: "60" })).tier).toBe("likely");
    expect(evaluateRule(r, P({ age: "25-29", income: "150" })).tier).toBe("ineligible");
    expect(evaluateRule(r, P({ age: "40-49", income: "50" })).tier).toBe("ineligible");
  });
  it("전 구간 Y면 소득 조건 없음, 해당사항없음(JA0322·JA0410)은 무시", () => {
    const d = rulesFromSupportConditions({ ...base, JA0201: "Y", JA0202: "Y", JA0203: "Y", JA0204: "Y", JA0205: "Y", JA0322: "Y", JA0410: "Y", JA0328: "Y" });
    expect(d.logic).toBeNull();
  });
  it("개인 특성은 OR, 가구 유형은 OR, 두 묶음은 AND", () => {
    const d = rulesFromSupportConditions({ ...base, JA0328: "Y", JA0329: "Y", JA0403: "Y", JA0404: "Y" });
    const r = auto(d.logic);
    expect(evaluateRule(r, P({ disability: "self", traits: ["single_parent"] })).tier).toBe("likely");
    expect(evaluateRule(r, P({ disability: "none", traits: ["veteran", "single_parent"], householdSize: 3 })).tier).toBe("likely");
    expect(evaluateRule(r, P({ disability: "none", traits: [], householdSize: 3 })).tier).toBe("ineligible");
  });
  it("성별 조건은 묻지 않으므로 UNKNOWN", () => {
    const d = rulesFromSupportConditions({ ...base, JA0102: "Y", JA0101: "N" });
    expect(evaluateRule(auto(d.logic), P({})).tier).toBe("check");
  });
  it("소상공인 전용이면 businessOnly", () => {
    const d = rulesFromSupportConditions({ ...base, JA1102: "Y", JA1201: "Y" });
    expect(d.businessOnly).toBe(true);
    expect(d.badges).toContain("business");
  });
});
