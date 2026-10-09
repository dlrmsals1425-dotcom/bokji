/** byHh: 가구원 수별 금액 — 원문 지원내용(상세)의 표에서 내 가구원 수 칸을 읽는다 (번들 재생성 없이 화면에서) */
import { describe, expect, it } from "vitest";
import { householdLabel, householdTable } from "@/lib/client/money";
import type { Money } from "@/lib/data/types";

const LIVELIHOOD = "○ 일반수급자 : 가구별 소득 인정액에 따라 급여액이 다름 ○ 2026년 생계급여 선정 및 급여기준 - 기준 중위소득 32% · 1인 가구 : 820,556원 · 2인 가구 : 1,343,773원 · 3인 가구 : 1,714,892원 · 4인 가구 : 2,078,316원 · 5인 가구 : 2,418,150원 * 단, 부양의무자의 연 소득 1.3억원(월 소득 1,084만원) 또는 일반재산 12억원을 초과하는 경우 생계급여 대상에서 제외";
const EMERGENCY = "○ 지원방법 및 기준 : 가구구성원수에 따라 금전 지급 - 1인 가구: 783,000원 - 2인 가구: 1,286,600원 - 3인 가구: 1,644,000원 - 4인 가구: 1,994,600원 - 5인 가구: 2,324,400원 - 6인 가구: 2,636,700원 *가구구성원이 7인 이상인 경우, 1인 증가 시마다 286,900원씩 추가";
const VOUCHER = "- (1인)295,200원, (2인)407,500원, (3인)532,700원, (4인 이상)701,300원 ㅇ(연탄전환 에너지바우처) 정액 지급된 바우처 금액(576,000원)";
const PENSION = "○ 단독가구 최고 349,700원(2026년) ○ 부부가구 최고 559,520원(2026년) ○ 국민연금 가입기간 및 급여액, 가구 유형, 소득 인정액 수준에 따라 감액될 수 있음";
const DEFECTOR = "- 1인 세대 기준 1,500만원, 2인 세대 2,400만원, 3인 세대 3,150만원, 4인 세대 3,900만원을 지원하며 세대 합가 시 차액 지급";
const HOUSING = "ㆍ3급지(광역시) 기준 4인 가구 최대 381,000원 지급";

const M = (won: number, per: Money["per"] = "month"): Money => ({ per, won, quote: "" });

describe("가구원 수별 표 읽기", () => {
  it("생계급여 1~5인", () => {
    expect(householdTable(LIVELIHOOD, M(2418150))?.rows).toEqual({ 1: 820556, 2: 1343773, 3: 1714892, 4: 2078316, 5: 2418150 });
  });
  it("긴급복지 1~6인, 에너지바우처 '(4인 이상)', 북한이탈 '세대'", () => {
    expect(householdTable(EMERGENCY, M(2636700, "max"))?.rows[6]).toBe(2636700);
    const v = householdTable(VOUCHER, M(701300, "max"))!;
    expect(v.rows).toEqual({ 1: 295200, 2: 407500, 3: 532700, 4: 701300 });
    expect(v.openTop).toBe(4);
    expect(householdTable(DEFECTOR, M(39000000, "max"))?.rows[1]).toBe(15000000);
  });
  it("기초연금 단독·부부", () => {
    expect(householdTable(PENSION, M(559520))).toMatchObject({ single: 349700, couple: 559520 });
  });
  it("한 칸뿐인 예시('4인 가구 최대 381,000원')나 뽑힌 금액이 표에 없으면 표가 아님", () => {
    expect(householdTable(HOUSING, M(381000, "max"))).toBeNull();
    expect(householdTable(LIVELIHOOD, M(999999))).toBeNull();
    // 가구 이야기가 아닌 '1인·2인' (모시는 어르신 수)
    expect(householdTable("○ 봉양수당 1인 5만원, 2인 7만원 지원", M(70000, "max"))).toBeNull();
    // 가구 낱말 없는 줄도 원문이 가구원 수 기준이면 표
    expect(householdTable("- 1인 80만원, 2인 100만원, 3인이상 120만원 - 전세사기피해자 결정 당시의 가구원 수 기준", M(1200000, "max"))?.rows[2]).toBe(1000000);
  });
});

describe("화면 문구", () => {
  it("가구원 수를 알면 그 칸", () => {
    expect(householdLabel(M(2418150), LIVELIHOOD, 1)).toBe("1인 가구 월 최대 82만 556원");
    expect(householdLabel(M(2636700, "max"), EMERGENCY, 3)).toBe("3인 가구 최대 164만 4,000원");
  });
  it("'4인 이상' 칸은 5·6인에도", () => {
    expect(householdLabel(M(701300, "max"), VOUCHER, 6)).toBe("6인 가구 최대 70만 1,300원");
  });
  it("표에 없는 가구원 수는 금액을 내지 않음 (생계급여 표는 5인까지)", () => {
    expect(householdLabel(M(2418150), LIVELIHOOD, 6)).toBeNull();
  });
  it("가구원 수를 모르면 범위", () => {
    expect(householdLabel(M(2418150), LIVELIHOOD, "unknown")).toBe("월 1인 82만 556원 ~ 5인 241만 8,150원");
  });
  it("기초연금: 1인이면 단독, 그 밖에는 단독·부부 둘 다 (2인이라도 부부인지 모름)", () => {
    expect(householdLabel(M(559520), PENSION, 1)).toBe("단독가구 월 최대 34만 9,700원");
    expect(householdLabel(M(559520), PENSION, 2)).toBe("월 최대 단독 34만 9,700원 · 부부 55만 9,520원");
    expect(householdLabel(M(559520), PENSION, "unknown")).toBe("월 최대 단독 34만 9,700원 · 부부 55만 9,520원");
  });
  it("표가 없으면 null (화면은 '가구원 수에 따라 달라요' 그대로)", () => {
    expect(householdLabel(M(381000, "max"), HOUSING, 4)).toBeNull();
    expect(householdLabel(M(381000, "max"), undefined, 4)).toBeNull();
  });
});
