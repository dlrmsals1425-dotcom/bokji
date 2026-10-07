/** QA 1차 리포트(C1·C2·H2·H4) 문장 해석 회귀 테스트 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation } from "@/lib/client/parse";
import type { RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 7 };
const P = (s: string) => parseSituation(s, regions, today);

describe("C1 대상 판단 (부모님 대신 / 본인)", () => {
  it("'…엄마예요'·'엄마 혼자 애 키워요'는 본인(한부모)", () => {
    const a = P("시흥에서 아이 둘 혼자 키우는 엄마예요 월 180 벌어요");
    expect(a.mode).toBe("self");
    expect(a.childCount).toBe(2);
    expect(a.profile.householdSize).toBe(3);
    expect(a.profile.traits).toContain("single_parent");
    const b = P("엄마 혼자 애 키워요 안양");
    expect(b.mode).toBe("self");
    expect(b.profile.traits).toContain("single_parent");
  });
  it("'직장인'의 '장인'은 부모 낱말이 아님", () => {
    const r = P("서울 관악구 사는 31살 직장인");
    expect(r.mode).toBe("self");
    expect(r.profile.age).toBe("30-34");
  });
  it("'52살 엄마예요 지적장애 있는 딸' → 본인, 장애는 가족(딸)", () => {
    const r = P("고양시 사는 52살 엄마예요 지적장애 있는 딸이랑 셋이 살아요");
    expect(r.mode).toBe("self");
    expect(r.profile.disability).toBe("member");
    expect(r.profile.householdSize).toBe(3);
    expect(P("고양시 52살 딸이 지적장애가 있어요").profile.disability).toBe("member");
  });
  it("사투리·한글 숫자 나이: 아부지·할매·육십오세", () => {
    expect(P("울 아부지 팔순 수원").mode).toBe("parent");
    expect(P("할매 혼자 사심 오산").mode).toBe("parent");
    const r = P("육십오세 엄마 부천");
    expect(r.mode).toBe("parent");
    expect(r.profile.age).toBe("65-69");
    expect(P("일흔둘 되신 어머니 수원").profile.age).toBe("70-74");
    expect(P("오십견 있는 어머니 수원").profile.age).toBe("unknown");
  });
  it("'우리 엄마예요'처럼 소유 표현이 붙으면 부모님", () => {
    expect(P("우리 엄마 78세 수원 혼자 사세요").mode).toBe("parent");
  });
});

describe("C2 부정·바람·모름", () => {
  it("'기초연금 받고 싶어요'·'받으시는지 모르겠어요'·'받을 수 있나요'는 받는 중이 아님", () => {
    expect(P("안산 사는 73살 기초연금 받고 싶어요").profile.benefits).toBeNull();
    expect(P("부모님이 기초연금 받으시는지 모르겠어요 수원").profile.benefits).toBeNull();
    expect(P("기초연금 받을 수 있나요 수원 70세").profile.benefits).toBeNull();
    expect(P("부산 해운대구 70세 어머니 기초연금 받고 계심").profile.benefits).toContain("basic_pension");
  });
  it("'기초연금 안 받아요'·'수급자는 아니에요'는 '아니요'로", () => {
    expect(P("수원 70세 기초연금 안 받아요").benefitsNo).toContain("basic_pension");
    expect(P("수원 70세 수급자는 아니에요").benefitsNo).toContain("livelihood");
    expect(P("수원 70세 수급자는 아니에요").profile.benefits).toBeNull();
  });
  it("'치매는 없으심'은 치매가 아님, '치매가 있으세요'는 치매", () => {
    const r = P("울 아부지 팔순이고 이천 사셔요 치매는 없으심");
    expect(r.profile.care ?? []).not.toContain("daily");
    expect(P("아버지 치매는 없으세요 수원 80세").profile.care ?? []).not.toContain("daily");
    expect(P("어머니가 치매가 있으세요 수원 80세").profile.care).toContain("daily");
  });
  it("'장애는 없고'는 장애 없음 + 자녀 없음으로 읽지 않음 ('장애'의 '애')", () => {
    const r = P("장애는 없고 혼자 살아요 수원 70세");
    expect(r.profile.disability).toBe("none");
    expect(r.childCount).toBeUndefined();
  });
});

describe("H2 나이·가구", () => {
  it("'30대' → 나이대를 고를 수 있게 (30~34 / 35~39)", () => {
    const r = P("용인 수지 사는 30대 맞벌이 부부고 돌 안 된 아기 하나 있어요");
    expect(r.ageChoices).toEqual(["30-34", "35-39"]);
    expect(r.profile.householdSize).toBe(3);
  });
  it("'80넘으심' → 80세 이상", () => {
    expect(P("동탄사는 할머니 80넘으심 기초수급자에요").profile.age).toBe("80+");
  });
  it("'혼자 월세 살고' → 1인 가구", () => {
    const r = P("성남 분당 사는 27살 혼자 월세 살고 일자리 찾는 중이에요");
    expect(r.profile.householdSize).toBe(1);
    expect(r.profile.housing).toBe("monthly");
  });
});

describe("H4 시군구 줄임말·광주", () => {
  it.each([
    ["화성 사는 70세", "41590"], ["이천 사는 70세", "41500"], ["구리 사는 70세", "41310"], ["고양 사는 70세", "41280"],
    ["울엄마 칠순 넘으셨고 혼자 사심 화성", "41590"], ["경기 광주 사는 70세", "41610"],
  ])("%s", (s, code) => expect(P(s).profile.sigungu).toBe(code));
  it("'광주'만 쓰면 광주광역시 / 경기 광주시 중 고르게", () => {
    const r = P("광주 사는 70세");
    expect(r.profile.sigungu).toBeNull();
    expect(r.regionChoices?.map((c) => c.sido)).toEqual(["12000", "41000"]);
  });
  it("흔한 낱말은 그대로 (고양이·고령자)", () => {
    expect(P("고양이 의료비").profile.sigungu).toBeNull();
    expect(P("고령자 건강검진").profile.sigungu).toBeNull();
  });
});
