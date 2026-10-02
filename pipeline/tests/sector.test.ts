import { describe, expect, it } from "vitest";
import { classifySector } from "../src/normalize/sector";
import { normalizeUrl } from "../src/normalize/names";

describe("복지 외 분야 분류 (기본 숨김)", () => {
  it("농림축산어업: 생산·시설 지원은 agri", () => {
    expect(classifySector({ name: "벼 육묘용 상토 지원", gov24Field: "농림축산어업" })).toBe("agri");
    expect(classifySector({ name: "한우 농가 사료배합기 지원" })).toBe("agri");
    expect(classifySector({ name: "가축재해보험료 지원", gov24Field: "농림축산어업" })).toBe("agri");
  });
  it("농어업인 개인 복지(안전보험·건강검진·복지바우처·농지연금)는 숨기지 않는다", () => {
    for (const name of ["농업인 안전보험료 지원", "여성농업인 특수건강검진", "여성농업인 복지바우처 지원", "농지연금"]) {
      expect(classifySector({ name, gov24Field: "농림축산어업" })).toBeUndefined();
    }
  });
  it("사업자·창업 대상은 business, 개인 생활 지원은 제외", () => {
    expect(classifySector({ name: "소상공인 경영개선(점포환경) 지원" })).toBe("business");
    expect(classifySector({ name: "청년창업자 임차료 지원" })).toBe("business");
    expect(classifySector({ name: "기업 지원", target: "관내 중소기업" })).toBe("business");
    expect(classifySector({ name: "중소기업취업청년 전월세보증금대출" })).toBeUndefined();
    expect(classifySector({ name: "서민층 가스시설 개선" })).toBeUndefined();
    expect(classifySector({ name: "고등·대학생 장학금(소상공인)" })).toBeUndefined();
    expect(classifySector({ name: "청소년 진로직업체험센터 서비스" })).toBeUndefined();
  });
  it("일반 복지 서비스는 분류하지 않는다", () => {
    expect(classifySector({ name: "기초연금", gov24Field: "생활안정" })).toBeUndefined();
    expect(classifySector({ name: "지역사회 청년쉐어하우스 운영" })).toBeUndefined();
  });
});

describe("링크 정규화", () => {
  it("스킴이 빠진 도메인은 https 로 보정, URL 이 아니면 버림", () => {
    expect(normalizeUrl("www.nhis.or.kr")).toBe("https://www.nhis.or.kr/");
    expect(normalizeUrl("fbo.or.kr/index.do")).toBe("https://fbo.or.kr/index.do");
    expect(normalizeUrl("https://www.gov.kr/x?a=1")).toBe("https://www.gov.kr/x?a=1");
    expect(normalizeUrl("주민센터 방문")).toBeUndefined();
  });
});
