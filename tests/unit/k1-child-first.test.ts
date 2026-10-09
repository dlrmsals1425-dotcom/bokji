/** 결정 2b (2026-10-09): 자녀 나이를 말하지 않은 부모 문장('아이 키우는 엄마 안산')은 자녀 나이부터 묻는다 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, buildView, childAgeFirst, scoreV2, type Situation } from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);
function sitOf(text: string): Situation {
  const r = parseSituation(text, regions, { year: 2026, month: 10, day: 9 });
  const p: Profile = { ...EMPTY_PROFILE };
  for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
  const ex = parsedExtras(r);
  return { profile: p, x: { ...EMPTY_EXTRAS, benefits: {}, traits: {}, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? "self" };
}
const firstQ = (text: string) => {
  const sit = sitOf(text);
  const progs = [...load(`public/bundles/v1/sigungu/${sit.profile.sigungu}.json`), ...load(`public/bundles/v1/sido/${sit.profile.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
  return buildView(scoreV2(progs, sit), sit, 3).questions[0]?.dim.id;
};

describe("자녀 나이부터 묻기", () => {
  it.each(["아이 키우는 엄마 안산", "애 둘 키우는 아빠예요 수원"])("%s → 첫 질문은 자녀 나이", (t) => {
    expect(childAgeFirst(sitOf(t))).toBe(true);
    expect(firstQ(t)).toBe("children");
  });
  it("자녀 나이를 말했거나, 본인 나이를 말했거나, 자녀가 없는 문장은 그대로", () => {
    expect(childAgeFirst(sitOf("초등학생 아들 키우는 아빠 수원"))).toBe(false);
    expect(childAgeFirst(sitOf("서른다섯 아이 키우는 엄마 안산"))).toBe(false);
    expect(childAgeFirst(sitOf("고양 일산 사는 신혼부부"))).toBe(false);
    expect(firstQ("고양 일산 사는 신혼부부")).toBe("age");
  });
});
