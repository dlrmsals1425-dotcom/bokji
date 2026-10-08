import { describe, expect, it } from "vitest";
import { dueRows, dueView, formatWon, moneyLabel, moneyRows } from "@/lib/client/money";
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
