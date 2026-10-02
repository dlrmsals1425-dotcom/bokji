import { describe, expect, it } from "vitest";
import { firstLine, howTo, parseDocs } from "../../src/lib/client/howto";
import type { Program } from "../../src/lib/data/types";

const base = { id: "x", name: "테스트", summary: "", category: "기타", orgType: "central", scope: "national", sources: [], trust: "A", rule: { all: [] } } as unknown as Program;

describe("howTo: 신청 방법 요약", () => {
  it("주민센터 방문·온라인 신청을 알아본다", () => {
    const h = howTo({ ...base, applyMethod: "주소지 읍면동 행정복지센터 방문 또는 복지로 온라인 신청", contact: "보건복지상담센터 ☎ 129\n기타" }, base);
    expect(h.place).toBe("주소지 행정복지센터(주민센터)");
    expect(h.channels).toEqual(["visit", "online", "phone"]);
    expect(h.phone).toBe("보건복지상담센터 129");
    expect(h.fallback).toBe(false);
  });
  it("신청 정보가 없으면 주민센터·129 안내로 대신한다", () => {
    const h = howTo(undefined, base);
    expect(h.fallback).toBe(true);
    expect(h.place).toContain("주민센터");
    expect(h.phone).toContain("129");
  });
  it("구비 서류는 짧은 항목 4개까지", () => {
    expect(parseDocs("○ 신청서\n○ 신분증\n○ 통장 사본\n○ 가족관계증명서\n○ 임대차계약서")).toEqual(["신청서", "신분증", "통장 사본", "가족관계증명서"]);
    expect(parseDocs("해당없음")).toEqual([]);
  });
  it("첫 문장만 자른다", () => {
    expect(firstLine("어르신께 식사를 드립니다. 그리고 다른 것도 합니다.")).toBe("어르신께 식사를 드립니다.");
  });
});
