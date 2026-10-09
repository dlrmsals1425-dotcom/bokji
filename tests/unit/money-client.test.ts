import { describe, expect, it } from "vitest";
import { dueRows, dueView, formatWon, moneyLabel, moneyRows, moneyView } from "@/lib/client/money";
import type { Program } from "@/lib/data/types";

const NOW = new Date("2026-10-08T12:00:00+09:00");
const P = (o: Partial<Program> & { id: string; name: string }): Program => ({ regionCode: "00000", level: "national", source: "gov24", ...o }) as Program;

describe("금액 표기 (원문 기준 최대, 더하지 않음)", () => {
  it("formatWon", () => {
    expect(formatWon(1_000_000)).toBe("100만원");
    expect(formatWon(349_700)).toBe("34만 9,700원");
    expect(formatWon(9_000)).toBe("9,000원");
  });
  it("moneyLabel", () => {
    expect(moneyLabel({ per: "month", won: 1_000_000, quote: "" })).toBe("월 최대 100만원");
    expect(moneyLabel({ per: "max", won: 3_000_000, quote: "" })).toBe("최대 300만원");
    expect(moneyLabel({ per: "year", won: 6_000_000, quote: "" })).toMatch(/^연 최대 600만원/);
  });
  it("moneyRows: 금액이 있는 것만, 넘겨준 순서대로, 개수 제한", () => {
    const ps = [P({ id: "a", name: "A" }), P({ id: "b", name: "B", money: { per: "month", won: 100000, quote: "월 10만원" } }), P({ id: "c", name: "C", money: { per: "max", won: 50000, quote: "" } })];
    expect(moneyRows(ps, 1).map((r) => r.program.id)).toEqual(["b"]);
  });
});

describe("기한 (가까운 순, 지난 것·모르는 것은 안 보임)", () => {
  it("period: 남은 날·지난 것", () => {
    expect(dueView({ kind: "period", text: "2026.12.31까지", quote: "", to: "2026-12-31" }, NOW)?.note).toBe("84일 남음");
    expect(dueView({ kind: "period", text: "2026.5.22~6.22", quote: "", from: "2026-05-22", to: "2026-06-22" }, NOW)).toBeNull();
    expect(dueView({ kind: "period", text: "2026.11.1~11.30", quote: "", from: "2026-11-01", to: "2026-11-30" }, NOW)?.note).toBe("24일 뒤 접수 시작");
  });
  it("annual: 이번 달이면 '지금 접수', 아니면 다음 접수 달", () => {
    expect(dueView({ kind: "annual", text: "매년 10월", quote: "", months: [10] }, NOW)?.note).toBe("지금 접수하는 달이에요");
    expect(dueView({ kind: "annual", text: "매년 3~6월", quote: "", months: [3, 4, 5, 6] }, NOW)?.note).toBe("다음 접수 2027년 3월");
  });
  it("dueRows: 날짜 있는 것 먼저, 사건 기준은 뒤, 대출·'사망 후'(장제 아님)는 뺌", () => {
    const rows = dueRows(
      [
        P({ id: "after", name: "선천성 난청검사", due: { kind: "after", text: "출생 후 1년 이내", quote: "" } }),
        P({ id: "far", name: "에너지바우처", due: { kind: "period", text: "2026.12.31까지", quote: "", to: "2026-12-31" } }),
        P({ id: "near", name: "어떤 사업", due: { kind: "period", text: "2026.10.31까지", quote: "", to: "2026-10-31" } }),
        P({ id: "loan", name: "노후긴급자금 대부지원", due: { kind: "after", text: "사망 후 3개월 이내", quote: "" } }),
        P({ id: "past", name: "국가장학금", due: { kind: "period", text: "2026.5.22~6.22", quote: "", from: "2026-05-22", to: "2026-06-22" } }),
      ],
      NOW,
    );
    expect(rows.map((r) => r.program.id)).toEqual(["near", "far", "after"]);
  });
});

/** 6차 프로덕션 검증 M2·M3: 원문 금액이 혜택 금액이 아니거나, 가구원 수별 표의 가장 큰 칸인 경우 (인용은 번들 원문 그대로) */
describe("M2·M3 요약 금액 안전장치 (moneyView)", () => {
  const M = (won: number, quote: string, per: "month" | "year" | "once" | "max" = "max") => ({ per, won, quote });
  const HH = "가구원 수에 따라 달라요";
  it("M2: 가구원 수별 표에서 뽑은 금액은 그대로 쓰지 않음", () => {
    expect(moneyView(M(559520, "○ 부부가구 최고 559,520원(2026년)", "month"))?.label).toBe(HH);
    expect(moneyView(M(2418150, "· 5인 가구 : 2,418,150원", "month"))?.label).toBe(HH);
    expect(moneyView(M(2636700, "- 6인 가구: 2,636,700원"))?.label).toBe(HH);
    expect(moneyView(M(662500, "…지역별, 가구원수별 지원기준(대도시 4인가구의 경우, 662,500원)을 고려하여 유사한 수준의 임시거소를 확보하여 제공"))?.label).toBe(HH);
    expect(moneyView(M(701300, "…07,500원, (3인)532,700원, (4인 이상)701,300원"))?.label).toBe(HH);
    expect(moneyView(M(1300000, "…: 1인 70만원 / 2인 100만원 / 3인 이상 130만원 일시 지원"))?.label).toBe(HH);
  });
  it("M2: 가구원 수와 무관한 금액은 그대로", () => {
    expect(moneyView(M(1500000, "- 의료비 : 가구원 수 구분 없이 최대 150만원"))?.label).toBe("최대 150만원");
    expect(moneyView(M(1000000, "※단 다태아(2인 이상)는 최대 100만원까지 지급"))?.label).toBe("최대 100만원");
    expect(moneyView(M(50000, "○ 농어촌 아동수당 지급 : 1인, 월 5만원", "month"))?.label).toBe("월 최대 5만원");
    expect(moneyView(M(40000, "1) 지급금액 - 설 명절(1인) 4만원 (영등포구 거주자) - 보훈의 달(1인) 4만원(영등…"))?.label).toBe("최대 4만원");
    expect(moneyView(M(2000000, "…,000원고등학생 1인: 700,000원대학생 1인: 2,000,000원학교 밖 청소년 1인: 500,000원 지원"))?.label).toBe("최대 200만원");
    expect(moneyView(M(20000, "세대당 20,000원(세대당 중증장애인이 2인이상일 경우 1인만 지급)"))?.label).toBe("최대 2만원");
    expect(moneyView(M(60000, "- 국민기초생활 보장 생계 또는 의료급여수급자 : 60,000원/월", "month"))?.label).toBe("월 최대 6만원");
  });
  it("M3: 임금·보험 보장액은 혜택 금액이 아님", () => {
    expect(moneyView(M(2907000, "○ 임금 : 2,907,000원/월, 정액급식비 16만원/월, 명절휴가비 1,744만…", "month"))).toBeNull();
    expect(moneyView(M(20000000, "- 재해를 직접적인 원인으로 사망하였을 때 2,000만원 보장"), "상해보험 가입비 지원(만원의행복보험)")).toBeNull();
    expect(moneyView(M(10000000, "- 상해사망 : 보험기간 내 상해로 사망한 경우 1,000만원 보장"), "군복무 인천청년 상해보험 지원")).toBeNull();
    expect(moneyView(M(2160000, "○ (인턴근무) 청년 인건비 월 216만원 지급 ※ ’26년 최저임금 상회", "month"))).toBeNull();
  });
  it("M3: 보험 사업이라도 보험료 지원 금액은 그대로", () => {
    expect(moneyView(M(10000, "…종사자 상해보험 보험료 20,000원(1년/1인) 중 10,000원 지원"), "사회복지 종사자 상해보험 가입 지원")?.label).toBe("최대 1만원");
  });
  it("M3: 유족에게 주는 위로금·장제비, 중개보수 지원은 혜택이라 그대로", () => {
    expect(moneyView(M(300000, "○ 지원내용 : 참전유공자 사망시 사망위로금 30만원을 유족에게 지급"), "참전유공자 사망위로금 지급")?.label).toBe("최대 30만원");
    expect(moneyView(M(500000, "○ 국가보훈대상자 사망시 장례비 50만원 지원"), "국가보훈대상자 장례비 지원")?.label).toBe("최대 50만원");
    expect(moneyView(M(300000, "…세 임대차 계약체결 시 지급한 부동산 중개보수를 최대 30만원까지 지원"), "경기도 부동산 중개보수 지원")?.label).toBe("최대 30만원");
    expect(moneyView(M(200000, "1) 지급금액 - 보훈예우수당 : 월100,000원 - 사망위로금 : 200,000원(1회)2) 지 급…"))?.label).toBe("최대 20만원");
    expect(moneyView(M(100000, "- 지원내용 : 월10만원, 최대 12개월 임금보전 및 장기재직 유도로 청년의 지역정착 도모", "month"))?.label).toBe("월 최대 10만원");
  });
  it("M3: 시간당·1식·1박 같은 단가는 요약에 쓰지 않음", () => {
    expect(moneyView(M(3000, "…정양육수당 수급 영아* 대상 시간당 보육료 5천원 중 3천원 지원(최대 월 60시간까지 지원) / 그 외 대상자는…"))).toBeNull();
    expect(moneyView(M(9136, "…% 이하) : A형 시간당 10,354원 지원, B형 9,136원 지원"))).toBeNull();
    expect(moneyView(M(9000, "…지원단가 : 10,000원(1식), 단 지역아동센터는 9,000원(1식)"))).toBeNull();
    expect(moneyView(M(10000, "(숙박비) 1박 1만원(숙박시설 이용시 지급)"))).toBeNull();
  });
  it("M3: 단가 낱말이 있어도 기간 합계·임신 1회당은 그대로", () => {
    expect(moneyView(M(1400000, "- 임신 1회당 100만원(다태아 임신부의 경우 140만원 기본지급)"))?.label).toBe("최대 140만원");
    expect(moneyView(M(200000, "- 1일 4시간 이상 월 20만원", "month"))?.label).toBe("월 최대 20만원");
    expect(moneyView(M(800000, "□ 지원금액: 1인당 최대 80만원(1일당 8만원, 최대 10일 지원)"))?.label).toBe("최대 80만원");
    expect(moneyView(M(500000, "출산 1회 당 산후조리비용 50만원 지원(단, 경남 내 공공산후조리원 이용자는 제외)"))?.label).toBe("최대 50만원");
    expect(moneyView(M(20000, "…12월 31일 이전에 출생한 노인에게 매달 25일에 20,000원을 지급"))?.label).toBe("최대 2만원");
  });
  it("moneyRows: 혜택이 아닌 금액은 건너뛰고 다음 사업으로 채움, 가구원 수 표는 문구로", () => {
    const ps = [
      P({ id: "wage", name: "산불재난특수진화대", money: M(2907000, "○ 임금 : 2,907,000원/월", "month") }),
      P({ id: "hh", name: "생계급여", money: M(2418150, "· 5인 가구 : 2,418,150원", "month") }),
      P({ id: "ok", name: "경기도 어린이청소년 교통비 지원", money: M(240000, "연 최대 24만원", "year") }),
    ];
    expect(moneyRows(ps, 4).map((r) => [r.program.id, r.label])).toEqual([
      ["hh", HH],
      ["ok", "연 최대 24만원"],
    ]);
  });
});
