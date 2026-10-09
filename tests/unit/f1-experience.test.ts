/** 결정 3b (2026-10-09): '발전소 시설 견학' 같은 체험·견학 사업은 먼저 확인할 5가지·목록에서 뒤로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, buildView, scoreV2, topPicksV2, type Situation } from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);
function screen(text: string) {
  const r = parseSituation(text, regions, { year: 2026, month: 10, day: 9 });
  const p: Profile = { ...EMPTY_PROFILE };
  for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
  const ex = parsedExtras(r);
  const sit: Situation = { profile: p, x: { ...EMPTY_EXTRAS, benefits: {}, traits: {}, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? "self" };
  const progs = [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
  const view = buildView(scoreV2(progs, sit), sit, 12);
  return { fit: view.fit.map((g) => g[0].s.program.name), picks: topPicksV2(view, 5, sit).map((g) => g[0].s.program.name) };
}

describe("체험·견학 사업은 뒤로", () => {
  it.each(["안양 스물여덟 구직 중이에요", "수원 사는 서른다섯 실직했어요", "의정부 사는 쉰다섯 일자리 찾아요"])("%s → 발전소 시설 견학은 받으실 수 있어요 맨 뒤, 먼저 확인할 5가지에 없음", (t) => {
    const { fit, picks } = screen(t);
    expect(fit[fit.length - 1]).toMatch(/발전소 시설 견학/);
    expect(picks.join(" ")).not.toMatch(/견학/);
  });
});
