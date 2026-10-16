/** QA 7차 (6차 프로덕션 검증 claude-code-fixes.md) P4 부모 화면 상위 5개, N6 선발형 장학금 순위 — 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import { EMPTY_EXTRAS, buildView, scoreV2, type Extras, type Situation } from "@/lib/client/v2";
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
import { plainLine, protectionWhy } from "@/lib/client/v2";

/**
 * (2026-10-16 소유자: '아동용품구입비 지원 — 위기아동 가정보호 및 전문가정위탁…' 이 무슨 사업인지, 내가 해당되는지 한눈에 안 보임)
 * 입양·가정위탁·학대피해아동 보호 가정, 보호가 끝난 자립준비청년 대상 사업은 일반 부모에게 그 조건을 분명히 적는다.
 */
const PARENT = "고양시 사는 35살 엄마, 4살 아이 하나";
const itemOf = (text: string, name: string) => {
  const sit = sitOf(text);
  const view = buildView(scoreV2(progsFor(sit.profile), sit), sit, 12);
  const all = [...view.fit, ...view.office, ...view.ask, ...view.no].map((g) => g[0]);
  const it = all.find((x) => x.s.program.name === name);
  if (!it) throw new Error(`${name} 없음`);
  return { it, sit };
};
describe("입양·가정위탁·학대피해아동 보호 가정 대상 사업", () => {
  for (const name of ["아동용품구입비 지원", "가정위탁 아동양육보조금 지원", "입양축하금"]) {
    it(`${name}: 일반 부모에게 '받을 수 있어요'가 아니고, 이유에 입양·가정위탁 조건이 보인다`, () => {
      const { it: i, sit } = itemOf(PARENT, name);
      expect(i.bucket).not.toBe("fit");
      expect(plainLine(i, sit, "self")).toMatch(/입양·가정위탁/);
    });
  }
  it("자립준비청년(보호종료아동) 대상은 그 조건이 보인다", () => {
    const { it: i, sit } = itemOf(PARENT, "자립준비청년(보호종료아동) 자립정착금 지원");
    expect(plainLine(i, sit, "self")).toMatch(/자립준비청년|보호가 끝난/);
  });
  it("출산·입양 가구처럼 일반 출산 가정도 받는 사업은 바뀌지 않는다 (첫만남이용권)", () => {
    const { it: i, sit } = itemOf("용인 사는 8개월 아기 엄마예요", "첫만남이용권 지원");
    expect(plainLine(i, sit, "self")).not.toMatch(/입양·가정위탁/);
  });
});

describe("아이 보호 가정이 아닌 사업은 그대로", () => {
  const P = (name: string, target: string) => ({ name, target } as unknown as Parameters<typeof protectionWhy>[0]);
  it("유기동물 입양·학대피해 노인·가정폭력·다자녀(입양아 포함)·위탁가정 '포함'·여러 대상 중 하나", () => {
    expect(protectionWhy(P("관악구 유기동물 입양비 지원", "유기동물을 입양한 구민"))).toBeNull();
    expect(protectionWhy(P("노인보호전문기관 및 학대피해노인 전용쉼터 운영 지원", "학대피해노인"))).toBeNull();
    expect(protectionWhy(P("경기도 가정폭력피해자 의료비 지원", "○ 유관기관 의뢰대상자(학대피해로 인한 초기진단)"))).toBeNull();
    expect(protectionWhy(P("다자녀가정 지원사업", "○ 다자녀 가정(입양아의 경우 1년이상)"))).toBeNull();
    expect(protectionWhy(P("아이모아카드", "막내가 만18세 이하 2자녀 이상 가정(태아, 위탁가정 포함)"))).toBeNull();
    expect(protectionWhy(P("도담도담 장난감월드", "○ 취학 전 자녀 또는 위탁가정 영유아가 있는 가정"))).toBeNull();
    expect(protectionWhy(P("서민금융진흥원 금융교육", "정책서민금융이용자, 취약계층(자활참여자, 북한이탈주민, 다문화가정, 장애인, 자립준비청년 등), 청년"))).toBeNull();
  });
  it("이름이나 대상 첫 줄이 그 처지뿐이면 이유를 적는다", () => {
    expect(protectionWhy(P("아동 생활안정 지원", "○ 생활시설 및 가정위탁 아동"))).toMatch(/입양·가정위탁/);
    expect(protectionWhy(P("자립준비청년 자립수당", "보호종료 5년 이내"))).toMatch(/자립준비청년/);
  });
});
