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
  it("생산·사업 지원은 숨기고(농기계·방제·한우·판로·박람회·고용장려금), 사람에게 가는 복지는 보인다", () => {
    expect(classifySector({ name: "중소형농업기계공급지원" })).toBe("agri");
    expect(classifySector({ name: "벼 묘판처리 약제 공급" })).toBe("agri");
    expect(classifySector({ name: "한우 개체 관리장비 지원", target: "○ 관내 한우 사육농가" })).toBe("agri");
    expect(classifySector({ name: "낙농 육성 지원", target: "○ 관내 착유농가" })).toBe("agri");
    expect(classifySector({ name: "가축진료비 지원" })).toBe("agri");
    expect(classifySector({ name: "소형어선 노후기관 교체지원(융자)" })).toBe("agri");
    expect(classifySector({ name: "귀어 창업 및 주택구입 지원(융자)" })).toBe("agri");
    expect(classifySector({ name: "보성군 중소기업 박람회(전시회) 참가경비 지원" })).toBe("business");
    expect(classifySector({ name: "2026년 소상공인 온라인 판로 확대 지원" })).toBe("business");
    expect(classifySector({ name: "장애인고용장려금" })).toBe("business");
    expect(classifySector({ name: "청년창업자 임차료 지원" })).toBe("business");
    // 개인에게 가는 혜택
    for (const name of ["대전형 1인 자영업자 유급병가 지원", "1인 소상공인 고용보험료 지원", "경남 소상공인 산재보험료 지원사업", "소상공인 노란우산공제 정액장려금 지원",
      "소상공인 아이돌봄지원사업", "서울시 1인 자영업자 등 임산부 출산급여 지원", "충청남도 농어민수당 지원", "여성농업인 바우처 지원", "농업인 종합건강 검진비 지원",
      "농업인안전재해보험 가입 지원", "귀농인 주택수리비 지원", "잠수어업인 진료비 지원", "순창군 청년근로자 종자통장 지원사업", "강화군 군민안전보험(농기계보험, 자전거보험)",
      "장애인특별운송사업", "방역, 소독, 해충방제", "조선업 퇴직자 희망채용 장려금 지원"]) {
      expect(classifySector({ name }), name).toBeUndefined();
    }
    expect(classifySector({ name: "농촌 왕진버스", target: "농촌에 거주하는 만 60세 이상 농촌 주민(고령자, 독거노인), 농업인 등" })).toBeUndefined();
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
