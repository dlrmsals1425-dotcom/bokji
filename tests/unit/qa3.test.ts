/** QA 3차 리포트(R1~R7·C3·M2·N6 등) 회귀 테스트 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import {
  DIM_BY_ID, EMPTY_EXTRAS, needsStatus, SPECIAL_STATUS, answersFor, buildView, classifyOne, needsOccupation, notForPersons, plainLine, scoreV2, topPicksV2, withTopic,
  type Extras, type Situation,
} from "@/lib/client/v2";
import { howTo } from "@/lib/client/howto";
import { refineProgram, refineRule, textMedianCap } from "@/lib/data/refine";
import { detailBucket } from "@/lib/data/bucket";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";
import type { Rule } from "@/lib/engine/types";

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

describe("R1 나이 표현", () => {
  it("'이십대 후반' · '삼십대 초반' → 범위", () => {
    expect(P("이십대 후반이고 안양에서 혼자 자취해요").ageRange).toEqual([26, 29]);
    expect(P("삼십대 초반 신혼부부 고양").ageRange).toEqual([30, 33]);
  });
  it("'아빠는 예순다섯 평택' — 조사 없는 고유어 나이", () => {
    const r = P("저는 딸이고 아빠는 예순다섯 평택 사세요");
    expect(r.mode).toBe("parent");
    expect(r.ageRange).toEqual([65, 65]);
    expect(P("서른 명 정도 수원").ageRange).toBeUndefined();
    expect(P("집에서 쉰 지 3년 수원 사는 30살").ageRange).toEqual([30, 30]);
  });
  it("'할아버지 혼자 사세요' → 만 65세 이상으로 보고 확인 화면에 표시", () => {
    const r = P("하남에 할아버지 혼자 사세요 거동이 불편하세요");
    expect(r.mode).toBe("parent");
    expect(r.ageRange).toEqual([65, 120]);
    expect(r.ageChoices).toContain("80+");
    expect(r.understood.map((u) => u.label).join(" ")).toContain("65세 이상으로 봤어요");
  });
  it("'마흔 넘은 싱글맘' → 본인·한부모·자녀 1명·40세 이상", () => {
    const r = P("마흔 넘은 싱글맘 시흥");
    expect(r.mode).toBe("self");
    expect(r.profile.traits).toContain("single_parent");
    expect(r.profile.householdSize).toBe(2);
    expect(r.ageRange?.[0]).toBe(40);
  });
  it("문장이 그럴듯하면 '먼저 확인할 5가지'가 비지 않음", () => {
    for (const s of ["이십대 후반이고 안양에서 혼자 자취해요", "저는 딸이고 아빠는 예순다섯 평택 사세요", "삼십대 초반 신혼부부 고양", "하남에 할아버지 혼자 사세요 거동이 불편하세요", "마흔 넘은 싱글맘 시흥"]) {
      expect(picksOf(sitOf(s)).picks.length, s).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("C3 잔여·R2 말하지 않은 신분·활동 조건", () => {
  const P7A = "서울 관악구 사는 31살 직장인 혼자 월세 살아요";
  const STATUS_IDS = ["n.gov24-999000000007", "n.gov24-134200005001", "n.gov24-149200000070", "n.gov24-B55117700003", "n.gov24-B55353000218", "n.gov24-B55252900215"];
  it("육아기 단축·고졸 후학습자·기술자격 면제·항공 취업·전문인력·현장실습 → 신분 조건", () => {
    for (const id of STATUS_IDS) expect(needsStatus(byId(id)), id).not.toBeNull();
  });
  it("P7a '받으실 수 있어요'에 신분 조건 사업이 없음", () => {
    const { view } = picksOf(sitOf(P7A));
    const fitIds = view.fit.map((g) => g[0].s.program.id);
    for (const id of STATUS_IDS) expect(fitIds, id).not.toContain(id);
    for (const g of view.office.filter((g) => STATUS_IDS.includes(g[0].s.program.id))) expect(g[0].base.why).toMatch(/따로 조건/);
  });
  it("'다른 분 기준(60~64세)' 상위 5개에 기술자격·전문인력·현장실습 없음", () => {
    const sit = sitOf("아버지 59년생 어머니 63년생 두 분이 수원 영통에 사세요. 기초연금 받으시는지 모르겠어요", "parent");
    sit.profile = { ...sit.profile, age: "60-64" };
    sit.x = { ...sit.x, ageSpan: [62, 63] };
    const names = picksOf(sit).picks.map((g) => g.s.program.name).join(" / ");
    expect(names).not.toMatch(/기술자격|전문인력|현장실습|청년사업단/);
  });
  it("일반 사업은 그대로 (청년월세·기초연금은 신분 조건 아님)", () => {
    for (const p of nat.filter((p) => /^(청년월세|기초연금)$/.test(p.name))) expect(needsStatus(p), p.name).toBeNull();
  });
});

describe("R3 수급 자격 사업을 소득만으로 판정하지 않음", () => {
  const T = "시흥 사는 37살 직장인이고 초등학생 아이 둘 혼자 키우는 엄마예요 월 180 벌어요 월세";
  it("수급 여부 모름 + 소득 34% → 디딤씨앗·드림스타트는 '받으실 수 있어요' 아님", () => {
    const { view } = picksOf(sitOf(T));
    const fit = view.fit.map((g) => g[0].s.program.name);
    expect(fit).not.toContain("디딤씨앗통장");
    expect(fit).not.toContain("드림스타트");
    const d = [...view.office, ...view.ask].find((g) => g[0].s.program.name === "디딤씨앗통장");
    if (d && d[0].bucket === "office") expect(d[0].base.why).toMatch(/수급·차상위/);
  });
  it("수급 중이라고 하면 디딤씨앗은 받으실 수 있어요 쪽", () => {
    const sit = sitOf(T);
    sit.x = { ...sit.x, benefits: { ...sit.x.benefits, livelihood: true } };
    const r = classifyOne(byId("n.welfare100-didim-seed-account"), sit);
    expect(r.bucket).not.toBe("no");
    expect(r.base.why ?? "").not.toMatch(/소득만으로 정하지 않고/);
  });
});

describe("M2 이미 말한 수급 여부는 다시 묻지 않음", () => {
  it("'동탄사는 할머니 80넘으심 기초수급자에요' → 수급 질문 없음", () => {
    const { view } = picksOf(sitOf("동탄사는 할머니 80넘으심 기초수급자에요"));
    expect(view.questions.map((q) => q.dim.id)).not.toContain("support");
  });
  it("'차상위예요' · '수급자 아니에요'도 다시 묻지 않음, 말하지 않았으면 물음", () => {
    expect(picksOf(sitOf("차상위예요 수원 사는 45살")).view.questions.map((q) => q.dim.id)).not.toContain("support");
    expect(picksOf(sitOf("수급자 아니에요 수원 사는 45살")).view.questions.map((q) => q.dim.id)).not.toContain("support");
    expect(picksOf(sitOf("수원 사는 45살 혼자 살아요")).view.questions.map((q) => q.dim.id)).toContain("support");
  });
});

describe("R4 원문보다 좁은 소득 규칙을 원문 비율로", () => {
  it("한부모무료법률구조 · 무료 소송대리(미혼모·부) → 중위 125%, (농업인·어업인) → 150%", () => {
    const cap = (id: string) => JSON.stringify(byId(id).rule.logic).match(/"income","lte":(\d+)/)?.[1];
    expect(cap("n.gov24-138300000040")).toBe("125");
    expect(cap("n.gov24-B27000100043")).toBe("125");
    expect(cap("n.gov24-B27000100042")).toBe("150");
  });
  it("'우선' 문구의 비율로는 넓히지 않고, '120% 이하, 우선순위: …'는 120%", async () => {
    const { sourceMedianCapForWiden } = await import("@/lib/data/refine");
    expect(sourceMedianCapForWiden({ target: "중위소득 120% 미만 사회적 배려계층 우선지원" })).toBeNull();
    expect(sourceMedianCapForWiden({ target: "건강보험 가입자 중 중위소득 120% 이하, 우선순위: 기초생활수급자" })).toBe(120);
    expect(sourceMedianCapForWiden({ target: "중위소득 120% 이하(국비) / 120% 초과(군비)" })).toBeNull();
  });
});

describe("N6 잔여 · R6", () => {
  it("국민임대 '우선 공급 - 장애인 등'은 자격 조건이 아님 → '등록 장애인' 문구 없음", () => {
    const sit = sitOf("남양주 사는데 월세가 너무 부담돼요");
    const r = classifyOne(byId("n.gov24-SD0000005037"), sit);
    expect(plainLine(r, sit, "self")).not.toMatch(/장애/);
    expect(plainLine(r, sit, "self")).not.toMatch(/보훈/);
  });
  it("장애인 대상 사업의 장애 조건은 그대로 (이름에 장애)", async () => {
    const { onlyInPriority } = await import("@/lib/client/v2");
    expect(onlyInPriority("○ 우선 공급\n- 장애인 등\n○ 일반공급\n- 무주택", /장애/)).toBe(true);
    expect(onlyInPriority("○ 등록 장애인\n○ 우선 공급\n- 장애인 등", /장애/)).toBe(false);
  });
  it("경기 사용자에게 장기전세 문의처는 서울주택도시공사가 아니라 LH", () => {
    const id = "n.gov24-999000000024";
    const d = JSON.parse(readFileSync(`public/bundles/v1/details/${detailBucket(id)}.json`, "utf8"))[id] as Program;
    const g = howTo(d, d, "41000");
    expect(g.place).toMatch(/LH/);
    expect(`${g.place} ${g.phone}`).not.toMatch(/서울주택도시공사/);
    expect(howTo(d, d, "11000").phone).toMatch(/서울주택도시공사/);
  });
});
