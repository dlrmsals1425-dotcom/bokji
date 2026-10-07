/** QA 1차 M4: 검색 비슷한 말·알아볼 수 없는 검색어·위기 문장 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { crisisOf, isGibberish } from "@/lib/client/query";
import { matchesQuery } from "@/lib/client/results";
import type { Program } from "@/lib/data/types";

describe("검색 (QA 1차 M4)", () => {
  it("'출산지원금'은 전국 공통 사업에서도 0건이 아님 (첫만남이용권·출산장려금 등)", () => {
    const nat = JSON.parse(fs.readFileSync("public/bundles/v1/national.json", "utf8")).programs as Program[];
    expect(nat.filter((p) => matchesQuery(p, "출산지원금")).length).toBeGreaterThan(0);
    const gg = JSON.parse(fs.readFileSync("public/bundles/v1/sigungu/41460.json", "utf8")).programs as Program[];
    expect(gg.filter((p) => matchesQuery(p, "출산지원금")).length).toBeGreaterThan(0);
  });
  it("자모만·기호만 입력은 알아볼 수 없는 검색어", () => {
    expect(isGibberish("ㅁㄴㅇㄹ")).toBe(true);
    expect(isGibberish("???")).toBe(true);
    expect(isGibberish("기초연금")).toBe(false);
    expect(isGibberish("LH")).toBe(false);
  });
  it("위기 문장: 자살 생각 → 109, 생계 위기 → 129", () => {
    expect(crisisOf("요즘 죽고 싶다는 생각이 들어요")).toBe("suicide");
    expect(crisisOf("돈이 너무 없어서 힘들어요 도와주세요")).toBe("distress");
    expect(crisisOf("기초연금 신청")).toBeNull();
  });
});
