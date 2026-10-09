/** 신청 기간이 끝난 사업 (운영자 피드백 2026-10-09: 경기도 어린이 건강과일 공급 2026.8.18~9.18이 10월에 '받으실 수 있어요') */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { closedSince, lastDateIn, periodEnded } from "@/lib/client/period";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, buildView, scoreV2, topPicksV2, type Extras, type Situation } from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const NOW = new Date("2026-10-09T12:00:00+09:00");
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);

describe("원문 신청기간에서 가장 늦은 날짜", () => {
  it.each([
    ["2026.8.18. ~ 2026.9.18.", "2026-09-18"],
    ["2026. 2. 2.~11. 30.(예산 집행상황에 따라 지원 마감일 변경될 수 있음)", "2026-11-30"],
    ["(2026년 2학기) (1차) 2026년 5월 22일~6월 22일 (2차) 2026년 8월 12일~ 9월 30일", "2026-09-30"],
    ["2026-09-15~2026-09-29(미확정,변동가능)", "2026-09-29"],
    ["2023.10.16~2023.11.23", "2023-11-23"],
    ["예산 소진 시까지", null],
  ])("%s → %s", (t, d) => expect(lastDateIn(t)).toBe(d));
});

describe("이번 접수가 끝났는지", () => {
  const P = (deadline: string, to = "2026-09-18") => ({ deadline, due: { kind: "period" as const, text: deadline, quote: deadline, to } });
  it("끝난 기간이면 마지막 날짜", () => {
    expect(closedSince(P("2026.8.18. ~ 2026.9.18."), NOW)).toBe("2026-09-18");
    expect(closedSince(P("2026.8.18. ~ 2026.9.18."), new Date("2026-09-18T20:00:00+09:00"))).toBeNull();
  });
  it("아직 기간 안, 되풀이(매년·상시), 날짜 없음은 끝나지 않음", () => {
    expect(closedSince(P("2026. 2. 2.~11. 30.", "2026-02-02"), NOW)).toBeNull();
    expect(closedSince(P("매년 2026.3.1~2026.5.31"), NOW)).toBeNull();
    expect(closedSince(P("상시 (2026.1.1~2026.3.31 우선 접수)"), NOW)).toBeNull();
    expect(closedSince({ deadline: "상시", due: undefined }, NOW)).toBeNull();
  });
});

describe("되풀이 접수(학기·해마다)는 목록에 두고 안내만", () => {
  it("국가장학금 '2026년 2학기 1차·2차' — 끝난 날짜는 알려 주되 목록에서 빼지 않음", () => {
    const t = "(2026년 2학기) (1차) 2026년 5월 22일~6월 22일 (2차) 2026년 8월 12일~ 9월 30일";
    const p = { deadline: t, due: { kind: "period" as const, text: t, quote: t, to: "2026-06-22" } };
    expect(periodEnded(p, NOW)).toBe("2026-09-30");
    expect(closedSince(p, NOW)).toBeNull();
  });
});

describe("결과 화면: 끝난 사업은 '받으실 수 있어요'·먼저 확인할 5가지에서 빼고 따로", () => {
  const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
  it("'수원 사는 5살 아이 엄마예요' → 경기도 어린이 건강과일 공급은 신청 기간이 지난 혜택으로", () => {
    const r = parseSituation("수원 사는 5살 아이 엄마예요", regions, { year: 2026, month: 10, day: 9 });
    const p: Profile = { ...EMPTY_PROFILE };
    for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
    const ex = parsedExtras(r);
    const sit: Situation = { profile: p, x: { ...EMPTY_EXTRAS, benefits: {} as Extras["benefits"], traits: {}, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? "self" };
    const progs = [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
    const view = buildView(scoreV2(progs, sit), sit, 12, NOW);
    const names = (gs: typeof view.fit) => gs.map((g) => g[0].s.program.name);
    const FRUIT = "경기도 어린이 건강과일 공급";
    expect([...names(view.fit), ...names(view.office), ...names(view.ask)]).not.toContain(FRUIT);
    expect(names(view.closed ?? [])).toContain(FRUIT);
    expect(topPicksV2(view, 5, sit).map((g) => g[0].s.program.name)).not.toContain(FRUIT);
  });
});
