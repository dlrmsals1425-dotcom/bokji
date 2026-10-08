import { describe, expect, it } from "vitest";
import { extractMoney } from "../src/normalize/money";
import { extractDue } from "../src/normalize/due";

const m = (name: string, benefit: string, sector?: string) => extractMoney({ name, benefit, sector });

describe("지원 금액 추출 (원문 지원내용, 규칙)", () => {
  it("월 금액: 같은 주기 중 최대 (원문 기준 최대)", () => {
    expect(m("부모급여 지원", "0세 아동을 가정 양육하는 경우, 월 100만원을 현금으로 지급합니다.\n1세 아동을 가정 양육하는 경우, 월 50만원을 현금으로 지급합니다.")).toMatchObject({ per: "month", won: 1_000_000 });
    expect(m("아동수당 지급", "아동수당은 아동 1인당 월 10~13만원이 지급됩니다.")).toMatchObject({ per: "month", won: 130_000 });
    expect(m("보훈예우수당", "보훈예우수당 월 10만원(월별 지급)보훈대상자 사망 시 위로금 30만원 지급")).toMatchObject({ per: "month", won: 100_000 });
    expect(m("자동차사고 피해자 지원사업", "중증후유장애인 재활보조금 지원(22만원/월)")).toMatchObject({ per: "month", won: 220_000 });
    expect(m("장애아동 입양 양육보조금", "- 중증장애아동: 72.1만원(월/인), 경증장애아동: 63.4만원(월/인)")).toMatchObject({ per: "month", won: 721_000 });
  });
  it("원 단위 숫자·만·천 섞인 표기", () => {
    expect(m("기초연금", "○ 단독가구 최고 349,700원(2026년)\n○ 부부가구 최고 559,520원(2026년)")).toMatchObject({ per: "month", won: 559_520 });
    expect(m("국가근로장학금", "- (교외근로) 시간 당 12,790원")).toBeUndefined();
    expect(m("생활안정지원", "- 월 지원금 : 월 197만6천원 ('26년 예산상 단가)")).toMatchObject({ per: "month", won: 1_976_000 });
    expect(m("가정위탁 양육보조금 지원", "- 만 13세 이상: 530천원")).toMatchObject({ won: 530_000 });
  });
  it("연·1회 주기", () => {
    expect(m("여성 보건위생물품 지원", "○ 여성 보건위생물품 탄탄페이 지원(연 156,000원/1인)")).toMatchObject({ per: "year", won: 156_000 });
    expect(m("초등학교 입학지원금", "○ 지원금액 : 1회 300,000원 (전학 및 재입학 제외)")).toMatchObject({ per: "once", won: 300_000 });
  });
  it("주기가 없으면 'max' (지어내지 않음)", () => {
    expect(m("첫만남이용권 지원", "'24년 1월 1일 이후 출생아는 첫째아 200만원, 둘째아 이상 300만원 지급")).toMatchObject({ per: "max", won: 3_000_000 });
  });
  it("나눠 주는 총액이면 월 금액으로 쓰지 않음", () => {
    expect(m("출산장려금 지원", "○ 다섯째 이후 자녀 1,500만원 (매월 50만원씩 30회 분할 지급)")).toMatchObject({ per: "max", won: 15_000_000 });
  });
  it("기준·부담금·단가·사업비는 혜택 금액이 아님", () => {
    expect(m("인공관절 수술비 지원", "건강보험료 기준(직장가입자 127,500원 이하, 지역가입자 60,000원 이하 납부자)")).toBeUndefined();
    expect(m("임산부 엽산제 지원", "택배수령 * 택배비 3,500원~4,000원 본인부담")).toBeUndefined();
    expect(m("학교 내 장애인 일자리", "월 급여: (예시) 10,320원*105시간= 1,083,600원")).toBeUndefined();
    expect(m("상생페이백", "- (사업규모) 1조 3,200억원(페이백 지급 기준)")).toBeUndefined();
    expect(m("축산농가 전문도우미", "○ 지원조건 : 도비 15% 시군비 35%, 자부담 50%")).toBeUndefined();
  });
  it("대출·보증·적금·할인 상품과 사업자·농어업 대상은 금액을 내지 않음", () => {
    expect(m("버팀목전세자금대출", "최대 1억 2천만원 대출")).toBeUndefined();
    expect(m("햇살론카드", "○ 보증한도 : 최초 월 최대 200만원")).toBeUndefined();
    expect(m("청년내일저축계좌", "월 10만원 저축 시 정부지원금 월 10만원")).toBeUndefined();
    expect(m("경관보전직불", "ha당 170만원", "agri")).toBeUndefined();
  });
});

describe("신청 기한 추출 (규칙)", () => {
  it("사건 뒤 n일·개월 이내", () => {
    expect(extractDue({ deadline: "상시신청", benefit: "출생일로부터 12개월 이내 신청" })).toMatchObject({ kind: "after", text: "출생 후 12개월 이내" });
    expect(extractDue({ benefit: "○ 결혼 가구 당 100만 원 지원\n※ 신청시기 : 혼인 신고일로부터 1년 이내" })).toMatchObject({ kind: "after", text: "혼인신고 후 1년 이내" });
    expect(extractDue({ applyMethod: "사망일로부터 6개월 이내 신청" })).toMatchObject({ kind: "after", text: "사망 후 6개월 이내" });
  });
  it("연도가 적힌 기간", () => {
    expect(extractDue({ deadline: "2026.01.19~2026.12.18" })).toMatchObject({ kind: "period", from: "2026-01-19", to: "2026-12-18" });
    expect(extractDue({ deadline: "2026. 3. 3. ~ 3. 20. / 2026. 5. 1. ~ 5. 22." })).toMatchObject({ kind: "period", from: "2026-03-03", to: "2026-03-20" });
    expect(extractDue({ deadline: "2026년 8월 3일 ~ 8월 31일" })).toMatchObject({ kind: "period", to: "2026-08-31" });
  });
  it("매년 몇 월", () => {
    expect(extractDue({ deadline: "매년 3~6월" })).toMatchObject({ kind: "annual", text: "매년 3~6월", months: [3, 4, 5, 6] });
    expect(extractDue({ deadline: "매년 4월 말까지" })).toMatchObject({ kind: "annual", text: "매년 4월 말", months: [4] });
    expect(extractDue({ deadline: "매년 6월, 12월" })).toMatchObject({ kind: "annual", text: "매년 6월·12월", months: [6, 12] });
    expect(extractDue({ deadline: "매년 1월~1월 말" })).toMatchObject({ text: "매년 1월" });
  });
  it("정할 수 없으면 내지 않음", () => {
    for (const deadline of ["상시신청", "접수기관 별 상이", "별도의 신청절차가 없음", "3.2.~3.31.", "매년 연초(12월 나라사랑신문 안내)", "매년 월~10월", "사업 공모기간에 신청(매년 2월중)"]) {
      expect(extractDue({ deadline }), deadline).toBeUndefined();
    }
    expect(extractDue({ deadline: "만 65세 생일이 속하는 달의 1개월 전부터 신청 가능" })).toBeUndefined();
  });
  it("소득의 N%(최대 …)는 지원금이 아니라 인정소득 상한 (실업크레딧)", () => {
    expect(extractMoney({ name: "실업크레딧 지원", benefit: "○ 인정소득은 실직 전 3개월간 평균소득의 50%(최대70만원)로, 지원기간은 구직급여 수급기간" })).toBeUndefined();
  });
  it("'66,080원/일' 같은 일당은 금액으로 쓰지 않음 (자활근로)", () => {
    expect(extractMoney({ name: "자활근로", benefit: "○ 시장진입형: 1일 8시간, 주 5일, 66,080원/일\n○ 사회서비스형: 1일 8시간, 주 5일, 57,840원/일" })).toBeUndefined();
  });
  it("'20~30천원/usRT'처럼 단위당 금액은 쓰지 않음, '/월'은 월 금액", () => {
    expect(extractMoney({ name: "가스냉방설비 설치지원", benefit: "- 냉방용량에 따라 차등지급(20~30천원/usRT)" })).toBeUndefined();
    expect(extractMoney({ name: "어떤 수당", benefit: "- 1인 100,000원/월 지급" })?.per).toBe("month");
  });
});
