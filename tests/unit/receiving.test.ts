/** QA 7차 (6차 프로덕션 검증 claude-code-fixes.md) P4 부모 화면 상위 5개, N6 선발형 장학금 순위 — 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, buildView, needsStatus, scoreV2, topPicksV2, type Extras, type Situation } from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 9 };
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);

function sitOf(text: string): Situation {
  const r = parseSituation(text, regions, today);
  const p: Profile = { ...EMPTY_PROFILE };
  for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
  const b: Extras["benefits"] = {};
  r.profile.benefits?.forEach((k) => (b[k] = true));
  r.benefitsNo?.forEach((k) => (b[k] = false));
  const tr: Extras["traits"] = {};
  r.profile.traits?.forEach((k) => (tr[k] = true));
  const ex = parsedExtras(r);
  return { profile: p, x: { ...EMPTY_EXTRAS, benefits: b, traits: tr, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? "self" };
}
const progsCache = new Map<string, Program[]>();
function progsFor(p: Profile) {
  const k = `${p.sido}/${p.sigungu}`;
  if (!progsCache.has(k)) progsCache.set(k, [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram));
  return progsCache.get(k)!;
}
import { splitReceiving } from "@/lib/client/receiving";

/** (2026-10-16 소유자) '이미 받고 있어요'로 표시한 혜택은 먼저 확인할 5가지·목록에서 빼고 따로 모은다 */
describe("이미 받고 있는 혜택 빼기", () => {
  const sit = sitOf("용인 사는 8개월 아기 엄마예요");
  const view = buildView(scoreV2(progsFor(sit.profile), sit), sit, 12);
  const picks = topPicksV2(view, 5, sit);
  const first = picks[0][0].s.group;

  it("표시한 혜택은 먼저 확인할 5가지에서 빠지고 다음 혜택이 채워진다", () => {
    const { view: v2, receiving } = splitReceiving(view, [first]);
    const picks2 = topPicksV2(v2, 5, sit);
    expect(picks2.map((g) => g[0].s.group)).not.toContain(first);
    expect(picks2.length).toBe(picks.length);
    expect(receiving.map((g) => g[0].s.group)).toEqual([first]);
  });
  it("어느 목록에서도 보이지 않는다 (받을 수 있어요·확인·답하면·맞지 않음·기간 지남)", () => {
    const { view: v2 } = splitReceiving(view, [first]);
    for (const b of ["fit", "office", "ask", "no"] as const) expect(v2[b].some((g) => g[0].s.group === first)).toBe(false);
    expect((v2.closed ?? []).some((g) => g[0].s.group === first)).toBe(false);
  });
  it("표시가 없으면 그대로", () => {
    const { view: v2, receiving } = splitReceiving(view, []);
    expect(v2).toBe(view);
    expect(receiving).toEqual([]);
  });
});
