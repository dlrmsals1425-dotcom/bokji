import { describe, expect, it } from "vitest";
import { classifyOperator, classifySector } from "../src/normalize/sector";
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

describe("기관·시설 운영 지원(operator)", () => {
  const op = (name: string, summary?: string, applyType?: string) => classifyOperator({ name, summary, applyType });
  it("운영 법인·경로당·어린이집 운영·직장어린이집 설치 지원은 숨김 대상", () => {
    expect(op("중앙노인돌봄지원기관 운영지원", "중앙노인돌봄지원기관 수탁운영 법인을 지원하여 노인맞춤돌봄서비스 등의 원활한 추진을 도모합니다.", "institution")).toBeTruthy();
    expect(op("여성기업종합지원센터운영", "여성기업 지원을 통해 여성의 창업을 활성화하고 여성기업의 경쟁력을 강화합니다.", "institution")).toBeTruthy();
    expect(op("직장어린이집 설치 지원", "근로자의 육아부담 완화", "institution")).toBeTruthy();
    expect(op("경로당 운영 지원", "경로당에 냉난방비와 양곡비를 지원", "institution")).toBeTruthy();
    expect(op("명절 경로당 위문")).toBeTruthy();
    expect(op("미등록경로당 지원 사업", undefined, "self")).toBeTruthy();
    expect(op("보육교직원 인건비 지원")).toBeTruthy();
  });
  it("사람이 직접 이용하는 센터·시설, 경로당 건강 프로그램, 종사자 개인 수당, 본인 신청 운영비는 그대로", () => {
    expect(op("치매안심센터 운영", "치매 조기검진과 상담")).toBeUndefined();
    expect(op("장애인주간이용시설 운영지원", "장애인 주간 재활 및 교육 프로그램 제공")).toBeUndefined();
    expect(op("노인생활시설 운영지원(재가)", "수급자 재가서비스 이용 급여 지원")).toBeUndefined();
    expect(op("장애인 단기보호센터 운영지원")).toBeUndefined();
    expect(op("경로당 주치의제")).toBeUndefined();
    expect(op("찾아가는 경로당 순회의료서비스")).toBeUndefined();
    expect(op("보육교직원 여름휴가비 지원", undefined, "self")).toBeUndefined();
    expect(op("장애학생 통학용 차량 운영비", undefined, "self")).toBeUndefined();
    expect(op("교통약자 특별교통수단 운영비 지원")).toBeUndefined();
    expect(op("노숙인 일시보호시설 운영", undefined, "institution")).toBeUndefined();
    // 운영비라도 주민이 직접 이용하는 급식소·쉼터·버스는 그대로
    expect(op("무료급식소 및 장애우 쉼터 운영비")).toBeUndefined();
    expect(op("고흥군 수요응답형 버스 운영비 지원")).toBeUndefined();
    expect(op("외국어체험센터 운영비 지원", undefined, "auto")).toBeTruthy();
  });
});
