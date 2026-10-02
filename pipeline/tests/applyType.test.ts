import { describe, expect, it } from "vitest";
import { classifyApplyType } from "../src/normalize/applyType";

const t = (x: Parameters<typeof classifyApplyType>[0]) => classifyApplyType(x).type;

describe("신청 유형 분류 (직접 신청 / 자동 / 기관 선정 / 미확정)", () => {
  it("핵심 급여는 자동·직권 문구가 섞여 있어도 본인 신청(self)", () => {
    expect(t({ name: "국민기초생활보장 생계급여", scope: "national", applyMethod: "읍면동 주민센터 방문 신청 (사회복지 전담공무원 직권신청 가능)" })).toBe("self");
    expect(t({ name: "기초연금", scope: "national", applyMethod: "주민센터, 국민연금공단 방문 또는 복지로 온라인 신청" })).toBe("self");
    expect(t({ name: "아동수당", scope: "national" })).toBe("self");
    expect(t({ name: "한부모가족 아동양육비 지원", scope: "national", applyMethod: "주민센터에 방문하거나 온라인으로 신청" })).toBe("self");
  });

  it("'신청 불필요·자동 지급·명단 통보·직권'이면 auto", () => {
    expect(t({ name: "저소득 주민 국민건강보험료 지원", applyMethod: "○ 개인 신청절차 없음 - 건강보험공단에서 명단통보", applyChannel: "신청불필요" })).toBe("auto");
    expect(t({ name: "기초 생계·의료급여 수급가구 명절위문금 지원", applyMethod: "해당 서비스는 신청없이 자격대상자에게 자동적으로 제공됩니다." })).toBe("auto");
    expect(t({ name: "도비 장애수당", applyMethod: "○ 신청 불필요\n - 각 시군에서 대상자 보장자격 확인 후 담당공무원이 직권으로 신청하여 서비스 제공" })).toBe("auto");
    expect(t({ name: "저소득층 아동보험(한부모가정 의료보험) 지원", applyMethod: "○ 개인 신청불필요\n - 별도의 가입 절차 없이 대상자 자동가입" })).toBe("auto");
    expect(t({ name: "기초생활보장수급자 쓰레기봉투비 지원", applyMethod: "○ 개인 신청절차 없음 - 분기마다 대상자 파악해서 자동 지급" })).toBe("auto");
  });

  it("학교·어린이집이 알아서 처리하면 auto", () => {
    expect(t({ name: "중·고교 신입생 무상교복 지원", applyMethod: "○ 개인 신청불필요 - 학교에서 학교주관구매제도를 이용하여 계약 후 학생, 학부모에게 가정통신문 안내" })).toBe("auto");
    expect(t({ name: "어린이집 입학준비금 지원", applyMethod: "○ 아동 재원중인 어린이집을 통해 일괄 신청(개별신청 없음)" })).toBe("auto");
  });

  it("기관 추천·의뢰·시설 대상은 institution", () => {
    expect(t({ name: "저소득 한부모가족 생활안정지원금 지원", applyMethod: "○ 개인 신청절차 없음 - 동 행정복지센터에서 추천하여 구에서 선별 확정" })).toBe("institution");
    expect(t({ name: "경기도 장애인 입원비 감면", applyMethod: "○ 진료 전 의뢰공문 발송" })).toBe("institution");
    expect(t({ name: "경로당 운영 지원" })).toBe("institution");
    expect(t({ name: "아동복지시설 생활자 지원", applyMethod: "○ 개인 신청절차 없음 - 시설장의 청구에 의한 보조금 교부" })).toBe("institution");
  });

  it("수급자 대상 감면도 신청 문구가 있으면 self, 자동 문구가 있으면 auto", () => {
    expect(t({ name: "이동통신요금감면", applyMethod: "거주지 읍/면/동 주민센터, 통신사업자, 정부24 또는 복지로 웹사이트에서 신청" })).toBe("self");
    expect(t({ name: "신서천발전본부 주택용 전기요금 지원", applyMethod: "○ 개인 신청불필요 - 한국전력공사 전기요금 일괄 처리" })).toBe("auto");
    expect(t({ name: "기초생활보장수급자 공동전기요금 지원", applyMethod: "○ 방문 신청 - 주민센터 : 주소지 관할 읍면동 행정복지센터에 방문 신청" })).toBe("self");
  });

  it("보수적으로: 신호가 엇갈리거나 직접 이용해야 하면 unknown, 정보가 없으면 unknown", () => {
    expect(t({ name: "미혼모.미혼부 냉난방비 지원", applyMethod: "해당 서비스는 신청없이 자격대상자에게 자동적으로 제공되나, 관할 동주민센터에 신청하시면 지원이 가능합니다." })).toBe("unknown");
    expect(t({ name: "어르신 국가예방접종 지원사업", applyMethod: "해당 서비스는 신청없이 자격대상자에게 자동적으로 제공됩니다.", applyChannel: "신청불필요" })).toBe("unknown");
    expect(t({ name: "구립 미술관 관람료 감면", applyMethod: "미술관 관람 시 증빙서류 제출", applyChannel: "신청불필요" })).toBe("unknown");
    expect(t({ name: "의료·요양 통합돌봄", summary: "돌봄이 필요한 어르신에게 의료·요양·돌봄 서비스를 연계" })).toBe("unknown");
    // 복지로 기본 표기 '직접 지원(별도 신청사항 없음)' 만으로는 자동으로 보지 않는다
    expect(t({ name: "면접정장 대여사업", applyMethod: "직접 지원(별도 신청사항 없음)" })).toBe("unknown");
    expect(t({ name: "화성시 기초생활수급자 명절위로금 지원", applyMethod: "직접 지원(별도 신청사항 없음)" })).toBe("auto");
  });

  it("정부24 '신청불필요' 구분이어도 본문에 신청 절차가 있으면 self", () => {
    expect(t({ name: "가족돌봄휴가 제도", applyChannel: "신청불필요", applyMethod: "○ 가족돌봄휴가를 사용하려는 날, 신청 연월일, 신청인 등에 대한 사항을 적은 문서를 사업주에게 제출" })).toBe("self");
    expect(t({ name: "노인 무릎인공관절 수술 지원", applyMethod: "○ (지원자) 수술받기 전, 보건소에 서류 접수\n○ (보건소) 노인의료나눔재단에 대상자 추천" })).toBe("self");
  });

  it("시민안전보험: 가입은 자동이지만 보험금은 직접 청구 → self", () => {
    expect(t({ name: "수원시 시민안전보험", applyMethod: "해당 서비스는 신청없이 자격대상자에게 자동적으로 제공됩니다." })).toBe("self");
  });

  it("판단 근거(reason)에 원문 구절을 남긴다", () => {
    const r = classifyApplyType({ name: "저소득층 국민건강보험료 지원", applyMethod: "○ 개인 신청절차 없음 - 국민건강보험공단에서 명단 추출" });
    expect(r.reason).toContain("개인 신청절차 없음");
  });
  it("운영 법인·시설을 지원하는 사업은 신청방법 정보가 없을 때 institution, 신청 문구가 있으면 self", () => {
    expect(t({ name: "중앙노인돌봄지원기관 운영지원", summary: "중앙노인돌봄지원기관 수탁운영 법인을 지원하여 노인맞춤돌봄서비스 등의 원활한 추진을 도모합니다." })).toBe("institution");
    expect(t({ name: "청소년복지시설 운영 지원", summary: "시설을 지원하여 청소년 보호", applyMethod: "○ 청소년복지시설 직접 방문 또는 상담 후 연계" })).toBe("self");
    expect(t({ name: "치매안심센터 운영", summary: "치매 조기검진과 상담" })).toBe("unknown");
  });

  it("전국 핵심 서비스(장기요양·보육료·디딤씨앗통장)는 신청방법 정보가 없어도 self", () => {
    expect(classifyApplyType({ name: "노인장기요양보험", scope: "national" }).type).toBe("self");
    expect(classifyApplyType({ name: "디딤씨앗통장", scope: "national" }).type).toBe("self");
  });
  it("학교장 추천 장학금은 institution, 신청 경로가 함께 적힌 '신청 불필요'는 unknown, 군민안전공제보험은 self", () => {
    expect(t({ name: "계룡시애향장학회 장학금", applyMethod: "○ 개인 신청불필요 - 관내 학교장 추천" })).toBe("institution");
    expect(t({ name: "입양아동 양육수당", applyMethod: "○ 과천시청 가족아동과 방문 신청 ※ 기존 입양아동 양육수당 지급 대상일 경우, 연령도래 시 별도신청없이 시에서 지급" })).toBe("unknown");
    expect(t({ name: "저소득층 국민건강보험료 지원", applyMethod: "○ 개인 신청절차 없음 - 공단에서 대상자 선정하여 별도의 온라인, 방문신청 필요 없음" })).toBe("auto");
    expect(t({ name: "화순군 군민안전공제보험 서비스 안내", applyMethod: "전입 시 자동 가입, 청구사유 발생 시 보험사에 직접 청구" })).toBe("self");
    expect(t({ name: "노인복지사업 추진", applyMethod: "국민건강보험공단 연제지사에서 대상자 추천->결정 후 지원" })).toBe("institution");
  });
  it("단체보험 자동가입이어도 보험금·혜택을 직접 청구해야 하면 self, 청구 언급이 없으면 auto", () => {
    expect(t({ name: "저소득층 아동보험(한부모가정 의료보험) 지원", applyMethod: "○ 개인 신청불필요 - 별도의 가입 절차 없이 대상자 자동가입 - 한부모가정 의료보험 접수센터를 통한 상담 및 혜택신청" })).toBe("self");
    expect(t({ name: "저소득층 상해보험 가입", applyMethod: "○ 개인 신청불필요 - 대상자 일괄 가입" })).toBe("auto");
  });
});
