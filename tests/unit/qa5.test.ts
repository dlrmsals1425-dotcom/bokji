/** QA 5차 (2026-10-08, 47bc438 검토) 회귀 테스트 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import {
  EMPTY_EXTRAS, needsStatus, buildView, classifyOne, plainLine, scoreV2, topPicksV2,
  type Extras, type Situation, type V2Item,
} from "@/lib/client/v2";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions = JSON.parse(readFileSync("public/bundles/v1/regions.json", "utf8")) as RegionIndex;
const today = { year: 2026, month: 10, day: 8 };
const P = (s: string, hint?: "self" | "parent") => parseSituation(s, regions, today, { hint });
const load = (f: string): Program[] => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).programs : []);

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
const progsCache = new Map<string, Program[]>();
function progsFor(p: Profile) {
  const k = `${p.sido}/${p.sigungu}`;
  if (!progsCache.has(k)) progsCache.set(k, [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram));
  return progsCache.get(k)!;
}
function picksOf(sit: Situation) {
  const progs = progsFor(sit.profile);
  const view = buildView(scoreV2(progs, sit), sit, 12);
  return { view, progs, picks: topPicksV2(view, 5, sit).map((g) => g[0]) };
}
const names = (items: V2Item[]) => items.map((i) => i.s.program.name);
const C3B = /(학교\s*밖|가정\s*밖|학업\s*중단|미취학|청소년\s*동반자|청소년\s*상담)/;
const prog = (name: string, target: string): Program => ({ id: `t.${name}`, name, target, rule: { id: "t", origin: "gov24_conditions", review: "structured", logic: { field: "age", min: 9, max: 24, label: "만 9~24세" } } }) as unknown as Program;

const P6B = (): Situation => ({
  profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41390", age: "35-39", householdSize: 3, children: ["6-12", "13-18"], traits: ["single_parent"], disability: "none", activity: "employed", housing: "monthly" },
  x: { ...EMPTY_EXTRAS, incomeManwon: 180, childCount: 2, traits: { single_parent: true } },
  mode: "self",
});
const P2B = (): Situation => ({
  profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41460", age: "30-34", householdSize: 3, children: ["0-1"], disability: "none", activity: "employed", housing: "jeonse", traits: [] },
  x: { ...EMPTY_EXTRAS, incomeManwon: 650, childCount: 1, traits: { single_parent: false }, benefits: { livelihood: false, medical: false, housing: false, education: false, near_poverty: false } },
  mode: "self",
});

describe("C3b 특수 신분 청소년 사업 (학교 밖·가정 밖·학업중단)", () => {
  it("'스물두살 대학생이에요 수원 살아요' → 먼저 확인할 5가지·받으실 수 있어요에 학교 밖·가정 밖·학업중단 사업 없음", () => {
    const { view, picks } = picksOf(sitOf("스물두살 대학생이에요 수원 살아요"));
    expect(names(picks).join(" | ")).not.toMatch(C3B);
    expect(names(view.fit.map((g) => g[0])).join(" | ")).not.toMatch(/(학교\s*밖|가정\s*밖|학업\s*중단)/);
  });
  it("이름·대상이 특수 신분이면 따로 조건 (나이만으로 '해당돼요' 아님)", () => {
    expect(needsStatus(prog("의무교육단계 미취학·학업중단학생 학습지원(꿈이음)", "○ 초등학교 또는 중학교에 입학하지 않았거나, 학업을 중단하여 학적이 정원 외로 관리되는 사람"))).toMatch(/학업/);
    expect(needsStatus(prog("경기도 가정 밖 청소년 자립두배통장", "- (연 령) 15세 이상 24세 이하의 가정 밖 청소년"))).toMatch(/가정 밖/);
    expect(needsStatus(prog("학교 밖 청소년 지원센터 운영", "○ 9세 이상~ 24세 이하 청소년"))).toMatch(/학교 밖/);
    expect(needsStatus(prog("꿈의 오케스트라 평택 지원", "○ 학교 밖 청소년"))).toMatch(/학교 밖/);
    expect(needsStatus(prog("고립·은둔 청년 지원사업", "○ 19~39세 청년"))).toMatch(/고립|은둔/);
  });
  it("'및·포함·또는'으로 함께 적힌 경우(일반 학생도 대상)는 조건이 아님", () => {
    expect(needsStatus(prog("저소득 한부모가족 학습장려수당 지원", "○ 저소득 한부모가족(복지급여 대상)의 중고생 및 학교 밖 청소년"))).toBeNull();
    expect(needsStatus(prog("안산시 초등학교 입학준비금 지원", "※ 타 시·군 및 국외에서 전입하는 1학년 학생 및 학교 밖 청소년 포함"))).toBeNull();
    expect(needsStatus(prog("청소년 상담 서비스 제공", "○ 9세~24세 (위기)청소년"))).toBeNull();
    expect(needsStatus(prog("미취학 아동 독감 예방접종", "○ 미취학 아동"))).toBeNull();
  });
  it("질문 모드 한부모(시흥 35~39, 자녀 2): '학교 밖 청소년 건강검진 지원'은 '받으실 수 있어요'가 아니고 이유에 학교 밖 청소년", () => {
    const { view, progs } = picksOf(P6B());
    expect(names(view.fit.map((g) => g[0])).join(" | ")).not.toMatch(/(학교\s*밖|가정\s*밖)/);
    const hc = classifyOne(progs.find((p) => p.name === "학교 밖 청소년 건강검진 지원")!, P6B());
    expect(hc.bucket).not.toBe("fit");
    expect(plainLine(hc, P6B(), "self")).toContain("학교 밖 청소년");
  });
  it("누구나 이용하는 청소년 상담(1388)은 '받으실 수 있어요'로 두되, 22세 대학생의 먼저 확인할 5가지에는 넣지 않음", () => {
    const { view, picks } = picksOf(sitOf("스물두살 대학생이에요 수원 살아요"));
    expect(names(view.fit.map((g) => g[0]))).toContain("청소년 상담 서비스 제공");
    expect(names(picks)).not.toContain("청소년 상담 서비스 제공");
  });
});

describe("U1 대학생 → 학생", () => {
  it.each(["이십대 중반 대학생이고 용인 살아요", "스물두살 대학생이에요 수원 살아요", "대학원생이에요 수원 스물여섯", "휴학생이에요 안양 살아요 스물셋", "지금 휴학 중이고 수원 살아요", "복학했어요 수원 스물넷", "대학교 3학년이에요 수원"])("'%s' → 하는 일 '학생'", (t) => {
    const r = P(t);
    expect(r.profile.activity).toBe("student");
    expect(r.understood.map((u) => u.label).join(" · ")).toContain("대학생");
    expect(r.interests).toContain("student");
  });
  it.each(["대학생 아들이 있어요 수원", "딸이 대학생이에요 수원 살아요"])("'%s' → 본인은 학생 아님 (자녀가 대학생)", (t) => {
    expect(P(t).profile.activity).not.toBe("student");
  });
  it("부모님 대신 찾기 문장에서는 학생으로 두지 않음", () => {
    expect(P("엄마가 일흔이세요 수원 저는 대학생이에요", "parent").profile.activity ?? "unknown").not.toBe("student");
  });
  it("'스물두살 대학생이에요 수원 살아요' → 먼저 확인할 5가지가 대학생 사업(국가장학금 등)으로 채워짐", () => {
    const { picks } = picksOf(sitOf("스물두살 대학생이에요 수원 살아요"));
    expect(picks.length).toBe(5);
    expect(names(picks).join(" | ")).toMatch(/국가\s*장학금/);
  });
  it("'이십대 중반 대학생이고 용인 살아요' → 국가장학금, 다문화·북한이탈 조건 사업 없음", () => {
    const { picks } = picksOf(sitOf("이십대 중반 대학생이고 용인 살아요"));
    expect(picks.length).toBe(5);
    expect(names(picks).join(" | ")).toMatch(/국가\s*장학금/);
    expect(names(picks).join(" | ")).not.toMatch(/청년도전지원/);
  });
  it("학생이면 '학교 밖 청소년'·'학업 중단' 사업은 맞지 않음", () => {
    const sit = sitOf("스물두살 대학생이에요 수원 살아요");
    const { progs } = picksOf(sit);
    const r = classifyOne(progs.find((p) => p.name === "학교 밖 청소년 지원센터 운영")!, sit);
    expect(r.bucket).toBe("no");
    expect(plainLine(r, sit, "self")).toContain("학교");
  });
});

describe("Q1 상위 5개의 관련 낮은 직업·집단 한정 사업", () => {
  it("'화성 동탄 살아요 실직했어요' → 산림보호지원단 없음", () => {
    expect(names(picksOf(sitOf("화성 동탄 살아요 실직했어요")).picks).join(" | ")).not.toMatch(/산림보호/);
  });
  it("'사십대 후반 가장이에요 화성' → 광업 종사 근로자 건강진단 없음", () => {
    expect(names(picksOf(sitOf("사십대 후반 가장이에요 화성")).picks).join(" | ")).not.toMatch(/광업/);
  });
});

describe("L1 배지와 같은 말로 시작하지 않음", () => {
  it("'신청할 때 확인' 카드 문장에 '신청할 때 확인:'이 없음 (P5a·P6b·월세)", () => {
    for (const sit of [sitOf("고양시 사는 52살 엄마예요 지적장애 있는 딸이랑 셋이 살아요"), P6B(), sitOf("남양주 사는데 월세가 너무 부담돼요")]) {
      const { view, picks } = picksOf(sit);
      for (const i of [...picks, ...view.office.slice(0, 30).map((g) => g[0])]) {
        if (i.bucket !== "office") continue;
        const line = plainLine(i, sit, "self");
        expect(line).not.toContain("신청할 때 확인:");
      }
    }
    const p5a = sitOf("고양시 사는 52살 엄마예요 지적장애 있는 딸이랑 셋이 살아요");
    const lines = picksOf(p5a).picks.map((i) => plainLine(i, p5a, "self")).join(" | ");
    expect(lines).toContain("확인할 것: 등록 장애인");
  });
});

describe("P2b 임신·영아 질문 모드", () => {
  it("고위험 신호가 없으면 '고위험 임산부 의료비 지원'은 먼저 확인할 5가지에 없음, 부모급여·국민행복카드는 그대로", () => {
    const n = names(picksOf(P2B()).picks);
    expect(n.join(" | ")).not.toMatch(/고위험/);
    expect(n).toContain("부모급여 지원");
    expect(n.join(" | ")).toMatch(/국민행복카드/);
  });
});
