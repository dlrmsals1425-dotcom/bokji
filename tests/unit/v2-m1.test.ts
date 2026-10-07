/** QA 1차 M1/C3: 개인 대상이 아닌 사업은 기본 목록에서 빼고, 피해자 대상 사업은 앞에 두지 않음 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { VICTIM_RE, inMain, notForPersons, rankAdj, EMPTY_EXTRAS, buildView, scoreV2, topPicksV2, type Situation } from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";

const nat = JSON.parse(fs.readFileSync("public/bundles/v1/national.json", "utf8")).programs as Program[];
const byName = (s: string) => nat.find((p) => p.name.includes(s));

describe("개인 대상이 아닌 사업 (QA 1차 M1)", () => {
  it("언론사 대상 '기획취재 지원'과 렛츠런파크 체험은 기본 목록 밖", () => {
    const a = byName("기획취재");
    const b = byName("렛츠런파크");
    expect(a && notForPersons(a)).toBe(true);
    expect(b && inMain(b)).toBe(false);
  });
  it("기초연금·생계급여는 그대로 기본 목록에 남음", () => {
    for (const n of ["기초연금", "생계급여"]) {
      const p = byName(n)!;
      expect(notForPersons(p)).toBe(false);
    }
  });
  it("피해자 대상 사업은 순위를 크게 낮춤", () => {
    const sit = { profile: { ...EMPTY_PROFILE }, x: { ...EMPTY_EXTRAS, facts: {} } } as unknown as Situation;
    const p = { ...nat[0], name: "아동학대 피해아동 지원" } as Program;
    expect(VICTIM_RE.test(p.name)).toBe(true);
    const item = { s: { program: p }, base: { why: "" } } as unknown as Parameters<typeof rankAdj>[0];
    expect(rankAdj(item, sit)).toBeLessThan(0);
  });
});

const ok = fs.existsSync("public/bundles/v1/sigungu/41110.json");
describe.skipIf(!ok)("기초연금 먼저 (QA 1차 H1, 문장 입력처럼 기초연금 수급 여부 모름)", () => {
  it("73세 1인 월 90만원 수원: 첫 번째로 확인할 것 = 기초연금", () => {
    const load = (f: string) => (JSON.parse(fs.readFileSync("public/bundles/v1/" + f, "utf8")).programs as Program[]).map(refineProgram);
    const programs = [...load("sigungu/41110.json"), ...load("sido/41000.json"), ...load("national.json")];
    const s = {
      profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", age: "70-74", householdSize: 1 },
      x: { ...EMPTY_EXTRAS, incomeManwon: 90, facts: {} },
      mode: "self",
    } as unknown as Situation;
    const v = buildView(scoreV2(programs, s), s);
    const picks = topPicksV2(v, 5, s);
    expect(picks[0][0].s.program.name).toBe("기초연금");
  });
});
