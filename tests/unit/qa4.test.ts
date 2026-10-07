/** QA 4차 리포트(S1~S7·R1 잔여·C3 잔여·N3) 회귀 테스트 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import {
  EMPTY_EXTRAS, needsStatus, buildView, classifyOne, plainLine, scoreV2, situationChips, topPicksV2,
  type Extras, type Situation,
} from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 7 };
const P = (s: string, hint?: "self" | "parent") => parseSituation(s, regions, today, { hint });
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);

/** 확인 화면의 병합과 같게: 문장 → 상황 */
function sitOf(text: string, hint?: "self" | "parent"): Situation {
  const r = P(text, hint);
  const p: Profile = { ...EMPTY_PROFILE };
  for (const [k, v] of Object.entries(r.profile)) if (v !== null && v !== "unknown" && !(Array.isArray(v) && !v.length)) (p as unknown as Record<string, unknown>)[k] = v;
  const b: Extras["benefits"] = {};
  r.profile.benefits?.forEach((k) => (b[k] = true));
  r.benefitsNo?.forEach((k) => (b[k] = false));
  const tr: Extras["traits"] = {};
  r.profile.traits?.forEach((k) => (tr[k] = true));
  const ex = parsedExtras(r);
  return { profile: p, x: { ...EMPTY_EXTRAS, benefits: b, traits: tr, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? hint ?? "self" };
}
function picksOf(sit: Situation) {
  const p = sit.profile;
  const progs = [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
  const view = buildView(scoreV2(progs, sit), sit, 12);
  return { view, picks: topPicksV2(view, 5, sit).map((g) => g[0]) };
}
const nat = load("public/bundles/v1/national.json").map(refineProgram);
const byId = (id: string) => nat.find((p) => p.id === id)!;

const names = (sit: Situation) => picksOf(sit).picks.map((i) => i.s.program.name);
const labels = (s: string, hint?: "self" | "parent") => P(s, hint).understood.map((u) => u.label).join(" · ");

describe("S1 임신 표현", () => {
  it.each(["임산부인데 평택 살아요", "출산 예정인데 평택이에요", "평택 사는 임산부 서른둘", "배 속 아기가 있어요 평택", "만삭이에요 평택 살아요", "임신 20주차예요 평택"])("'%s' → 임신 중", (t) => {
    const r = P(t);
    expect(r.profile.children).toContain("pregnant");
    expect(r.interests).toContain("pregnancy");
    expect(r.mode).toBe("self");
  });
  it("'임신 준비 중' · '임신 사전건강관리'는 임신 중이 아님", () => {
    expect(P("임신 준비 중이에요 평택").profile.children ?? []).not.toContain("pregnant");
  });
  it("'평택 사는 임산부 서른둘' → 32세 + 임신", () => {
    const r = P("평택 사는 임산부 서른둘");
    expect(r.profile.age).toBe("30-34");
    expect(labels("평택 사는 임산부 서른둘")).toContain("임신 중");
  });
  it.each(["임산부인데 평택 살아요", "출산 예정인데 평택이에요", "평택 사는 임산부 서른둘"])("'%s' → 먼저 확인할 5가지에 임신·출산 사업 (국민행복카드·산모신생아)", (t) => {
    const n = names(sitOf(t));
    expect(n.length).toBe(5);
    expect(n.join(" ")).toMatch(/국민행복카드|임신출산 진료비/);
    expect(n.join(" ")).toMatch(/산모·신생아|모자보건|엽산|산후조리/);
    expect(n.slice(0, 2).join(" ")).not.toMatch(/위기임신|보호출산|부모급여|아동수당/);
    expect(n.join(" ")).not.toMatch(/사전건강관리/);
  });
});

describe("S2 임신 개월 수는 자녀·가구원이 아님", () => {
  it("'임신 7개월이에요 평택 살고 32살이에요' → 임신 중만, 자녀 0~1세·3인 가구 아님", () => {
    const r = P("임신 7개월이에요 평택 살고 32살이에요");
    expect(r.profile.children).toEqual(["pregnant"]);
    expect(r.childCount).toBeUndefined();
    expect(r.profile.householdSize).toBe("unknown");
    expect(labels("임신 7개월이에요 평택 살고 32살이에요")).not.toMatch(/0~1세|3명/);
  });
  it("'뱃속 아기' 말고 실제 아이가 있으면 그대로", () => {
    const r = P("임신 중이고 첫째 3살 키워요 평택");
    expect(r.profile.children).toEqual(["pregnant", "2-5"]);
    expect(r.childCount).toBe(1);
  });
});

describe("R1 잔여 · S6", () => {
  it.each(["수원 사는 삼십대 중반 프리랜서예요", "수원 이십대 중반 대학생"])("'%s' (두 나이대에 걸침) → 범위 전체가 맞는 사업으로 5개", (t) => {
    const sit = sitOf(t);
    expect(sit.x.ageSpan).toBeTruthy();
    const n = names(sit);
    expect(n.length).toBe(5);
  });
  it("'30대 중반는' → '30대 중반은'", () => {
    const notes = P("수원 사는 삼십대 중반 프리랜서예요").notes.join(" ");
    expect(notes).toContain("30대 중반은 나이대가");
    expect(notes).not.toContain("중반는");
    expect(P("수원 사는 30대 직장인").notes.join(" ")).toContain("30대는 나이대가");
  });
  it("할아버지(나이 모름) 칩: '만 65~120세'가 아니라 '만 65세 이상'", () => {
    const chips = situationChips(sitOf("하남에 할아버지 혼자 사세요 거동이 불편하세요")).join(" ");
    expect(chips).toContain("만 65세 이상");
    expect(chips).not.toContain("120");
  });
});

describe("C3 잔여 · S3 대상 사람", () => {
  const P6B = (): Situation => ({
    profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41390", age: "35-39", householdSize: 3, children: ["6-12", "13-18"], traits: ["single_parent"], disability: "none", activity: "employed", housing: "monthly" },
    x: { ...EMPTY_EXTRAS, incomeManwon: 180, childCount: 2, traits: { single_parent: true } },
    mode: "self",
  });
  it("P6b: 출생 미등록 아동 발굴·소년소녀가장 소송대리는 '받으실 수 있어요'가 아님", () => {
    const { view } = picksOf(P6B());
    const fit = view.fit.map((g) => g[0].s.program.name).join(" | ");
    expect(fit).not.toMatch(/출생 미등록/);
    expect(fit).not.toMatch(/소년·소녀가장/);
  });
  it("특수 신분·사건 당사자 조건 → 따로 조건", () => {
    expect(needsStatus(byId("n.gov24-B27000100026"))).toMatch(/소년·소녀가장/);
    expect(needsStatus(byId("n.gov24-PTR000052159"))).toMatch(/당사자/);
  });
  it("P5a(52세 엄마·지적장애 딸): 장애인 본인 대상 사업은 엄마 나이로 '해당돼요'가 아님 — 그 가족 나이로 확인", () => {
    const sit = sitOf("고양시 사는 52살 엄마예요 지적장애 있는 딸이랑 셋이 살아요");
    expect(sit.profile.disability).toBe("member");
    const job = nat.find((p) => p.name === "장애인 온라인 직업심리검사")!;
    const r = classifyOne(job, sit);
    expect(r.bucket).not.toBe("fit");
    expect(plainLine(r, sit, "self")).toContain("그 가족이 만 18~64세인지 확인");
    const remote = classifyOne(byId("n.gov24-PTR000052159"), sit);
    expect(remote.bucket).not.toBe("fit");
    // 가족 대상 사업(이름에 가족·부모)은 그대로 내 기준
    const fit = picksOf(sit).view.fit.map((g) => g[0].s.program.name).join(" | ");
    expect(fit).not.toMatch(/직업심리검사|구술심리/);
  });
  it("본인이 장애인이면 본인 나이로 그대로 판정", () => {
    const sit = sitOf("고양 사는 30살인데 지적장애가 있어요");
    expect(sit.profile.disability).toBe("self");
    const job = nat.find((p) => p.name === "장애인 온라인 직업심리검사")!;
    expect(classifyOne(job, sit).bucket).toBe("fit");
  });
});

describe("N3 · S4 · S5 · S7", () => {
  it("'장인어른 모시고' → 부모님 모시기 주제 (결과 화면에서 부모님 기준 찾기 안내)", () => {
    const sit = sitOf("장인어른 모시고 삽니다 부천");
    expect(sit.x.interests).toContain("eldercare");
    expect(names(sit).join(" ")).toMatch(/가족돌봄/);
  });
  it("'스물일곱 군 제대한 청년이에요 김포' → 제대 신호 · 구직 사업, 임신 준비 사업 없음", () => {
    const r = P("스물일곱 군 제대한 청년이에요 김포");
    expect(r.interests).toContain("discharged");
    expect(labels("스물일곱 군 제대한 청년이에요 김포")).toContain("군 제대");
    const n = names(sitOf("스물일곱 군 제대한 청년이에요 김포"));
    expect(n.join(" ")).toMatch(/국민취업지원제도/);
    expect(n.join(" ")).not.toMatch(/임신|난임|여성/);
  });
  it("성별·임신 신호가 없으면 임신·여성 대상 사업을 먼저 확인할 것에 두지 않음", () => {
    for (const t of ["사십대 후반 가장이에요 화성", "수원 사는 삼십대 중반 프리랜서예요", "화성 동탄 살아요 실직했어요"]) {
      expect(names(sitOf(t)).join(" ")).not.toMatch(/임신|난임|불임|여성/);
    }
    // 아기·신혼 신호가 있으면 그대로
    expect(names(sitOf("용인 수지 사는 30대 맞벌이 부부고 돌 안 된 아기 하나 있어요")).join(" ")).toMatch(/국민행복카드|산후조리/);
  });
  it("'외할머니 아흔둘이세요' → 부부 2인 아님 ('아흔둘이'의 '둘이')", () => {
    const r = P("외할머니 아흔둘이세요 의왕");
    expect(r.profile.householdSize).not.toBe(2);
    expect(r.profile.age).toBe("80+");
    expect(P("우리 둘이 살아요 수원 서른").profile.householdSize).toBe(2);
  });
  it("'가장이에요' → 1인 가구로 보지 않고 2명 이상에서 고르게", () => {
    const r = P("사십대 후반 가장이에요 화성");
    expect(r.profile.householdSize).toBe("unknown");
    expect(r.minHousehold).toBe(2);
    expect(r.profile.traits ?? []).not.toContain("single");
    expect(P("가장 많이 받는 혜택 수원 70세").minHousehold).toBeUndefined();
  });
  it("S7: 나이·가구 모르는 월세 문장에 한부모 임대주택 없음 (한부모라고 하면 그대로)", () => {
    expect(names(sitOf("남양주 사는데 월세가 너무 부담돼요")).join(" ")).not.toMatch(/한부모/);
    expect(names(sitOf("시흥에서 아이 둘 혼자 키우는 엄마예요 월 180 벌어요")).join(" ")).toMatch(/한부모/);
    expect(names(sitOf("화성 동탄 살아요 실직했어요")).join(" ")).not.toMatch(/북한이탈|출소/);
  });
});

describe("R4 잔여 (원문이 분명한 것만)", () => {
  it("경북 산모·신생아: '150% 이하 … (150% 초과 가정은 예외지원)' → 150%로 넓힘, 넘는 가구도 빼지 않음", async () => {
    const { sourceMedianCapForWiden } = await import("@/lib/data/refine");
    const t = "○ 산모 및 배우자 등 해당가구의 건강보험료 본인부담금 합산액이 기준중위소득 150%이하 금액에 해당하는 출산가정(150%초과 가정은 예외지원)";
    expect(sourceMedianCapForWiden({ target: t })).toBe(150);
    const g = load("public/bundles/v1/sigungu/47750.json").map(refineProgram).find((p) => p.id === "g47750.gov24-516000000144")!;
    const inc = JSON.stringify(g.rule.logic);
    expect(inc).toContain('"lte":150');
    expect(inc).toContain('"soft":true');
  });
  it("안양 반려동물 '120% 미만 … 우선지원'은 모호해 그대로 (넓히지 않음)", async () => {
    const { sourceMedianCapForWiden } = await import("@/lib/data/refine");
    expect(sourceMedianCapForWiden({ target: "- (공통사항) 중위소득 120% 미만 사회적 배려계층 우선지원" })).toBeNull();
  });
});
