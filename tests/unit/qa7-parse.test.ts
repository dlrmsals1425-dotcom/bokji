/** QA 7차 (6차 프로덕션 검증 claude-code-fixes.md) 문장 해석: P1 '부모님이 안 계셔요', P2 '열여덟살 고삼 딸 엄마', 학년 → 나이 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation } from "@/lib/client/parse";
import type { RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 9 };
const P = (s: string, hint?: "self" | "parent") => parseSituation(s, regions, today, { hint });
const labels = (s: string) => P(s).understood.map((u) => u.label).join(" | ");

describe("P1 '부모님이 안 계셔요'는 부모님 대신 찾기가 아님 (보호자 없는 본인)", () => {
  it.each(["중학생인데 부모님이 안 계셔요 수원", "부모님이 안 계신 고등학생이에요 수원", "부모님 두 분 다 돌아가셨어요 중3이에요 안산", "저는 부모님이 없어요 열다섯살 수원"])("%s", (s) => {
    const r = P(s);
    expect(r.mode).toBe("self");
    expect(labels(s)).not.toMatch(/대신 찾기/);
    expect(r.profile.age).toBe("0-18");
    expect(r.profile.children ?? []).toEqual([]);
  });
  it("중학생 본인 나이는 만 12~15세, 고등학생은 만 15~18세", () => {
    expect(labels("중학생인데 부모님이 안 계셔요 수원")).toMatch(/만 12~15세/);
    expect(labels("부모님이 안 계신 고등학생이에요 수원")).toMatch(/만 15~18세/);
  });
  it("부모님 대신 찾기 문장은 그대로", () => {
    expect(P("수원 사는 59년생 부모님 두 분").mode).toBe("parent");
    expect(P("아버지는 돌아가셨고 어머니 혼자 계세요 수원").mode).toBe("parent");
    expect(P("우리 엄마 일흔이세요 수원").mode).toBe("parent");
    expect(P("일흔둘 혼자 사시는 아버지 부천").mode).toBe("parent");
  });
});

describe("P2 '열여덟살 고삼 딸 엄마예요' — 나이는 자녀(고3) 나이", () => {
  it("본인 나이 없음, 자녀 13~18세, 10대 본인 아님", () => {
    const r = P("열여덟살 고삼 딸 엄마예요 수원");
    expect(r.mode).toBe("self");
    expect(r.profile.age).toBe("unknown");
    expect(r.profile.children).toEqual(["13-18"]);
  });
  it("'고3 아들 둔 아빠'·'중2 딸 엄마'도 자녀 13~18세", () => {
    expect(P("고3 아들 둔 아빠예요 수원").profile.children).toEqual(["13-18"]);
    expect(P("중2 딸 엄마예요 안산").profile.children).toEqual(["13-18"]);
  });
});

describe("학년 → 나이 (본인)", () => {
  it("'고3인데 대학 등록금이 걱정돼요' → 본인 만 17~18세", () => {
    const r = P("고3인데 대학 등록금이 걱정돼요 수원");
    expect(r.mode).toBe("self");
    expect(r.profile.age).toBe("0-18");
    expect(labels("고3인데 대학 등록금이 걱정돼요 수원")).toMatch(/만 17~18세/);
    expect(r.profile.children ?? []).toEqual([]);
  });
  it("'열일곱살 알바하는 학생' → 하는 일 학생", () => {
    const r = P("열일곱살 알바하는 학생 수원");
    expect(r.profile.age).toBe("0-18");
    expect(r.profile.activity).toBe("student");
  });
  it("성인 문장의 '중'은 학년이 아님 ('구직 중이에요')", () => {
    expect(P("안양 스물여덟 구직 중이에요").profile.age).toBe("25-29");
  });
});
