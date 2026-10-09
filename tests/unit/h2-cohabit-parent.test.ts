/** 결정 1b (2026-10-09): '장인어른 모시고 삽니다 부천' — 함께 사는 부모님께 맞는 혜택을 같은 화면에서 (그분 나이대를 고르면) */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, cohabitParentPicks, type Situation } from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);
const r = parseSituation("장인어른 모시고 삽니다 부천", regions, { year: 2026, month: 10, day: 9 });
const p: Profile = { ...EMPTY_PROFILE };
for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
const ex = parsedExtras(r);
const sit: Situation = { profile: p, x: { ...EMPTY_EXTRAS, benefits: {}, traits: {}, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? "self" };
const progs = [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);

describe("함께 사는 부모님 혜택", () => {
  it("70~74세를 고르면 그분 기준 먼저 확인할 것 (기초연금 등 어르신 혜택)", () => {
    const picks = cohabitParentPicks(progs, sit, "70-74").map((g) => g[0].s.program.name);
    expect(picks.length).toBeGreaterThanOrEqual(3);
    expect(picks.join(" | ")).toMatch(/기초연금|노인|어르신/);
  });
  it("그분 결과는 부모님 찾기 기준(같은 지역, 다른 답은 모름) — 본인 상황(나이·소득)은 쓰지 않음", () => {
    const withIncome: Situation = { ...sit, x: { ...sit.x, incomeManwon: 900 } };
    expect(cohabitParentPicks(progs, withIncome, "75-79").map((g) => g[0].s.program.id)).toEqual(cohabitParentPicks(progs, sit, "75-79").map((g) => g[0].s.program.id));
  });
});
