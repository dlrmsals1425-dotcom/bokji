/** QA 1차 H2·M2: 나이·가구원 수를 모르면 그것부터 묻는다 */
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_EXTRAS, buildView, scoreV2, topPicksV2, type Situation } from "@/lib/client/v2";
import { EMPTY_PROFILE } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";

const load = (f: string): Program[] => JSON.parse(fs.readFileSync(`public/bundles/v1/${f}`, "utf8")).programs;
const ok = fs.existsSync("public/bundles/v1/sigungu/41590.json");
describe.skipIf(!ok)("추가 질문 순서 (실제 번들, 화성시)", () => {
  const programs = [...load("sigungu/41590.json"), ...load("sido/41000.json"), ...load("national.json")].map(refineProgram);
  it("나이를 모르면 첫 질문은 나이, 먼저 확인할 5가지에 나이로 정해지는 사업이 없음", () => {
    const s: Situation = { profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41590", householdSize: 1 }, x: EMPTY_EXTRAS, mode: "parent" };
    const v = buildView(scoreV2(programs, s), s, 12);
    expect(v.questions[0]?.dim.id).toBe("age");
    // 성인이면 누구나 맞는 '만 19세 이상' 같은 조건 말고, 특정 나이대(예: 65세 이상·39세 이하)를 콕 집은 사업은 없어야 함
    const specific = (l: unknown): boolean => JSON.stringify(l ?? {}).match(/"field":"age"(?:,"min":(\d+))?(?:,"max":(\d+))?/g)?.some((m) => {
      const min = Number(/"min":(\d+)/.exec(m)?.[1] ?? 0), max = Number(/"max":(\d+)/.exec(m)?.[1] ?? 999);
      return min >= 40 || max <= 64;
    }) ?? false;
    for (const g of topPicksV2(v, 5, s)) expect(specific(g[0].s.program.rule.logic), g[0].s.program.name).toBe(false);
  });
  it("월 소득은 알고 가구원 수를 모르면 가구원 수를 (나이 다음으로) 먼저 묻는다", () => {
    const s: Situation = { profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41590", age: "30-34" }, x: { ...EMPTY_EXTRAS, incomeManwon: 250 }, mode: "self" };
    const v = buildView(scoreV2(programs, s), s, 12);
    expect(v.questions[0]?.dim.id).toBe("alone");
    expect(v.questions[0]?.dim.answers.map((a) => a.label)).toContain("6명 이상");
  });
});
