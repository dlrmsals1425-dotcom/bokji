import { describe, expect, it } from "vitest";
import { nameKey, nameQualifier, cleanOrg } from "../src/normalize/names";
import { RegionIndex } from "../src/normalize/regions";
import { icareCategory, gov24Category } from "../src/normalize/categories";
import { isEupmyeondongLevel } from "../src/sources/record";

describe("명칭 정규화 키 (설계서 5.1)", () => {
  it("노인맞춤돌봄 표기 변형이 같은 키", () => {
    const k = nameKey("노인맞춤돌봄서비스");
    for (const v of ["노인맞춤돌봄 서비스", "노인맞춤 돌봄서비스", "노인맞춤돌봄서비스 사업", "노인맞춤돌봄 지원사업"]) expect(nameKey(v)).toBe(k);
    expect(k).toBe("노인맞춤돌봄");
  });
  it("한자 제거: 강릉愛밥상 → 강릉밥상", () => expect(nameKey("강릉愛밥상")).toBe("강릉밥상"));
  it("괄호 부가설명 분리", () => {
    expect(nameKey("의료급여(본인부담 보상금)")).toBe("의료급여");
    expect(nameQualifier("의료급여(본인부담 보상금)")).toBe("본인부담 보상금");
  });
  it("기관명: 보건복지부장관 → 보건복지부", () => expect(cleanOrg("보건복지부장관")).toBe("보건복지부"));
});

describe("행정구역 정규화", () => {
  const r = RegionIndex.load();
  it("15개 시도 + 세종(가상 36000) = 16 (전남·광주 통합 반영)", () => {
    expect(r.sidos.map((s) => s.code)).toContain("12000");
    expect(r.sidos.find((s) => s.code === "36000")?.name).toBe("세종특별자치시");
    expect(r.sidos).toHaveLength(16);
  });
  it("옛 시도 표기 → 전남광주통합특별시", () => {
    expect(r.sido("전라남도")?.code).toBe("12000");
    expect(r.sido("광주광역시")?.code).toBe("12000");
    expect(r.resolveSigungu("광주광역시", "광산구")[0].code).toBe("12330");
  });
  it("일반구는 상위 시로: 수원시 장안구 → 수원시", () => {
    expect(r.resolveSigungu("경기도", "수원시 장안구")[0].code).toBe("41110");
    expect(r.sigungusOf("41000").some((s) => s.name.includes("장안구"))).toBe(false);
  });
  it("인천 2026-07 개편: 옛 중구 → 제물포구·영종구", () => {
    expect(r.resolveSigungu("인천광역시", "중구").map((s) => s.code)).toEqual(["28125", "28155"]);
  });
  it("세종은 단층", () => expect(r.resolveSigungu("세종특별자치시", "세종특별자치시")[0].code).toBe("36110"));
  it("경기도 시군구 31개", () => expect(r.sigungusOf("41000")).toHaveLength(31));
});

describe("분야 매핑 (설계서 5.3)", () => {
  it("통합돌봄 7분류 → 15분야", () => {
    expect(icareCategory("주거복지")).toBe("주거");
    expect(icareCategory("기타", "mental")).toBe("정신건강");
    expect(icareCategory("일상생활돌봄")).toBe("보호·돌봄");
  });
  it("정부24 서비스분야", () => {
    expect(gov24Category("임신·출산")).toBe("임신·출산");
    expect(gov24Category("주거·자립")).toBe("주거");
    expect(gov24Category("고용·창업")).toBe("일자리");
  });
});

describe("읍면동 단독 사업 감지", () => {
  it("동 협의체·특화사업은 제외", () => {
    expect(isEupmyeondongLevel("온양4동 행복키움추진단 특화사업", "아산시")).toBe(true);
    expect(isEupmyeondongLevel("신평1동 식식가게", "사하구")).toBe(true);
  });
  it("시군구 사업은 유지", () => {
    expect(isEupmyeondongLevel("결식아동 급식지원", "속초시")).toBe(false);
    expect(isEupmyeondongLevel("읍면동 맞춤형 통합서비스 지원", "남구")).toBe(false);
    expect(isEupmyeondongLevel("안동 청년두배드림통장 사업", "안동시")).toBe(false);
    expect(isEupmyeondongLevel("관인면 AI사랑방 이용", "포천시")).toBe(false);
  });
});
