import { describe, expect, it } from "vitest";
import { rulesFromSupportConditions, supplementFromText } from "../src/rules/fromGov24";
import { lifecycleCond } from "../src/rules/fromTags";
import { regionDisplayName, regionlessKey } from "../src/dedup";
import { formatContacts, mapGov24OrgType } from "../src/sources/gov24";
import { RegionIndex } from "../src/normalize/regions";
import { evaluateCond, evaluateRule } from "../../src/lib/engine/evaluate";
import { EMPTY_PROFILE, type Profile } from "../../src/lib/engine/profile";
import type { Rule } from "../../src/lib/engine/types";

const P = (o: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", ...o });
const rule = (logic: Rule["logic"], review: Rule["review"] = "structured"): Rule => ({ id: "t", origin: "gov24_conditions", review, logic, unstructured: [], unstructuredCore: false });
const regions = RegionIndex.load();

describe("공공서비스 지원조건 → 규칙", () => {
  it("상한 18세 이하 연령은 본인 또는 자녀 나이로 판단 (만 5세 이하)", () => {
    const d = rulesFromSupportConditions({ JA0110: 0, JA0111: 5, JA0201: "Y", JA0202: "Y", JA0203: "Y", JA0204: "Y", JA0205: "Y", JA0322: "Y", JA0410: "Y" });
    expect(evaluateRule(rule(d.logic), P({ age: "35-39", children: ["2-5"] })).tier).toBe("eligible");
    expect(evaluateRule(rule(d.logic), P({ age: "75-79", children: [] })).tier).toBe("ineligible");
    expect(evaluateRule(rule(d.logic), P({ age: "35-39" })).tier).toBe("likely"); // 자녀 모름
    const d2 = rulesFromSupportConditions({ JA0110: 3, JA0111: 5 });
    expect(evaluateRule(rule(d2.logic), P({ age: "35-39", children: ["2-5"] })).tier).toBe("likely"); // 2~5세 구간은 3~5세와 일부만 겹침
  });
  it("성인 연령 + 중위소득 구간 일부", () => {
    const d = rulesFromSupportConditions({ JA0110: 65, JA0111: 0, JA0201: "Y", JA0202: "Y" });
    expect(evaluateRule(rule(d.logic), P({ age: "75-79", income: "50" })).tier).toBe("eligible");
    expect(evaluateRule(rule(d.logic), P({ age: "75-79" })).tier).toBe("likely");
    expect(evaluateRule(rule(d.logic), P({ age: "60-64", income: "50" })).tier).toBe("ineligible");
  });
  it("API 지원조건이라도 검수 전 지역(auto)은 최대 '가능성 있음'", () => {
    const d = rulesFromSupportConditions({ JA0110: 65 });
    expect(evaluateRule(rule(d.logic, "auto"), P({ age: "75-79" })).tier).toBe("likely");
  });
  it("원문에 수급·저소득 요건이 있으면 soft 조건을 덧붙여 과대 판정을 막는다", () => {
    const d = rulesFromSupportConditions({ JA0110: 65 });
    const s = supplementFromText(d.logic, "만 65세 이상 기초생활수급자 및 차상위계층");
    expect(s.added[0]).toContain("소득");
    expect(evaluateRule(rule(s.logic), P({ age: "75-79", benefits: ["livelihood"] })).tier).toBe("eligible");
    expect(evaluateRule(rule(s.logic), P({ age: "75-79", benefits: [] })).tier).toBe("likely"); // soft: 숨기지 않음
    expect(evaluateCond(s.logic!, P({ age: "75-79", benefits: [] })).tri).toBe("U");
  });
  it("소득 코드가 이미 있으면 원문 보완을 하지 않는다", () => {
    const d = rulesFromSupportConditions({ JA0110: 65, JA0201: "Y" });
    expect(supplementFromText(d.logic, "저소득 노인").added).toEqual([]);
  });
  it("'필요하다고 인정되는 자'는 상담 판단(core)", () => {
    expect(supplementFromText(rulesFromSupportConditions({ JA0110: 65 }).logic, "그 밖에 시장이 필요하다고 인정하는 자").core).toBe(true);
  });
});

describe("복지로 태그", () => {
  it("'노년'은 만 65세 이상", () => {
    const c = lifecycleCond(["노년"])!;
    expect(evaluateCond(c, P({ age: "60-64" })).tri).toBe("F");
    expect(evaluateCond(c, P({ age: "65-69" })).tri).toBe("T");
  });
});

describe("지역 사업 이름 비교·표시", () => {
  const t = ["경기도", "경기", "수원시", "수원"];
  it("지역 접두어·괄호를 떼고 같은 사업으로 본다", () => {
    expect(regionlessKey("(수원시) 가사홈서비스", t)).toBe(regionlessKey("가사홈서비스", t));
    expect(regionlessKey("수원시 효도수당", t)).toBe(regionlessKey("효도수당", t));
    expect(regionlessKey("(수원시 권선구) 유축기 대여 지원 서비스", t)).toBe(regionlessKey("(수원시 장안구) 유축기 대여 지원 서비스", t));
    expect(regionlessKey("장애인가정 출산 지원", t)).toBe(regionlessKey("장애인가정 출산지원금 지급", t));
    expect(regionlessKey("청년 월세 지원", t)).not.toBe(regionlessKey("청년 주거 패키지", t));
  });
  it("표시 이름에서 지역 괄호 제거", () => {
    expect(regionDisplayName("(수원시) 가사홈서비스", t)).toBe("가사홈서비스");
    expect(regionDisplayName("수원시 난임부부 원외처방 약제비 지원(장안구)", t)).toBe("수원시 난임부부 원외처방 약제비 지원");
    expect(regionDisplayName("청년ㆍ신혼 희망터치(Touch) 보증금", t)).toBe("청년ㆍ신혼 희망터치(Touch) 보증금");
  });
});

describe("기관 유형·연락처", () => {
  it("지방 출자·출연기관·공기업은 기관명에서 지역을 찾아 공공기관(지역)으로", () => {
    expect(mapGov24OrgType("지방출자_출연기관", "고양산업진흥원", regions)).toMatchObject({ orgType: "public_inst", sigunguCodes: ["41280"] });
    expect(mapGov24OrgType("지방공기업", "인천광역시부평구시설관리공단", regions)).toMatchObject({ orgType: "public_inst", sigunguCodes: ["28237"] });
    expect(mapGov24OrgType("지방출자_출연기관", "재단법인경기도시장상권진흥원", regions)).toMatchObject({ orgType: "public_inst", sidoCode: "41000" });
    expect(mapGov24OrgType("공공기관", "한국장학재단", regions)).toEqual({ orgType: "public_inst" });
    expect(mapGov24OrgType("교육청", "경기도교육청", regions)).toMatchObject({ orgType: "edu_office", sidoCode: "41000" });
    expect(mapGov24OrgType("시군구", "경기도 수원시", regions)).toMatchObject({ orgType: "local", sigunguCodes: ["41110"] });
  });
  it("문의처 정리", () => {
    expect(formatContacts("교육부/02-6222-6060||0079에듀콜/1544-0079")).toBe("교육부 ☎ 02-6222-6060\n0079에듀콜 ☎ 1544-0079");
  });
});
