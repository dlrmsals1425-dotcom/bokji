/** Y1: 연도별 기준 중위소득 — 서울 날짜로 그해 표를 고른다 (값은 보건복지부 보도자료 원문) */
import { describe, expect, it } from "vitest";
import { MEDIAN_INCOME_BY_YEAR, incomeBandFor, medianIncomeFor, medianPercent, medianWon } from "@/lib/engine/profile";

const KST = (s: string) => new Date(`${s}+09:00`);

describe("Y1 2027 기준 중위소득", () => {
  it("2027년 값 (보건복지부 2026-07-28 보도자료, 제80차 중앙생활보장위원회)", () => {
    expect(MEDIAN_INCOME_BY_YEAR[2027]).toEqual({ 1: 2736042, 2: 4480645, 3: 5718091, 4: 6929885, 5: 8063019, 6: 9129201 });
    expect(MEDIAN_INCOME_BY_YEAR[2026]).toEqual({ 1: 2564238, 2: 4199292, 3: 5359036, 4: 6494738, 5: 7556719, 6: 8555952 });
  });
  it("서울 날짜 기준으로 해가 바뀜 (2026-12-31 23:59 → 2026, 2027-01-01 00:00 → 2027)", () => {
    expect(medianIncomeFor(KST("2026-12-31T23:59:59")).year).toBe(2026);
    expect(medianIncomeFor(KST("2027-01-01T00:00:00")).year).toBe(2027);
    // UTC로는 아직 12월 31일인 시각
    expect(medianIncomeFor(new Date("2026-12-31T15:30:00Z")).year).toBe(2027);
  });
  it("표가 없는 해는 가장 가까운 지난해 표 (2028 → 2027), 표보다 이른 해는 가장 이른 표", () => {
    expect(medianIncomeFor(KST("2028-03-01T12:00:00")).year).toBe(2027);
    expect(medianIncomeFor(KST("2025-06-01T12:00:00")).year).toBe(2026);
  });
  it("계산 함수가 그해 표를 씀", () => {
    const y26 = KST("2026-10-09T12:00:00");
    const y27 = KST("2027-01-02T12:00:00");
    expect(medianWon(32, 1, y26)).toBe(820556);
    expect(medianWon(32, 1, y27)).toBe(875533); // 생계급여 1인 선정기준 (보도자료 87만 5,533원)
    expect(medianWon(32, 4, y27)).toBe(2217563); // 4인 221만 7,563원
    expect(medianWon(48, 4, y27)).toBe(3326344); // 주거급여 4인 (보도자료 332만 6,345원 — 원 단위 반올림 차이 1원)
    expect(medianPercent(2_736_042, 1, y27)).toBeCloseTo(100, 5);
    expect(medianPercent(2_736_042, 1, y26)).toBeGreaterThan(106);
    // 2인 가구 월 440만원: 2026 기준 100% 초과 → 120% 구간, 2027 기준 100% 이하 → 100% 구간
    expect(incomeBandFor(4_400_000, 2, y26)).toBe("120");
    expect(incomeBandFor(4_400_000, 2, y27)).toBe("100");
  });
});
