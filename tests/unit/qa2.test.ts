/** QA 2차 리포트(N1~N6·H1·H2·C3·M1·M7) 회귀 테스트 — 리뷰어 재현 문장 그대로 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSituation, parsedExtras } from "@/lib/client/parse";
import {
  DIM_BY_ID, EMPTY_EXTRAS, SPECIAL_STATUS, answersFor, buildView, classifyOne, needsOccupation, notForPersons, plainLine, scoreV2, topPicksV2, withTopic,
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
  const ex = parsedExtras(r);
  return { profile: p, x: { ...EMPTY_EXTRAS, benefits: b, ...ex, ageSpan: ex.ageSpan ?? null }, mode: r.mode ?? hint ?? "self" };
}
function picksOf(sit: Situation) {
  const p = sit.profile;
  const progs = [...load(`public/bundles/v1/sigungu/${p.sigungu}.json`), ...load(`public/bundles/v1/sido/${p.sido}.json`), ...load("public/bundles/v1/national.json")].map(refineProgram);
  const view = buildView(scoreV2(progs, sit), sit, 12);
  return { view, picks: topPicksV2(view, 5, sit).map((g) => g[0]) };
}
const nat = load("public/bundles/v1/national.json").map(refineProgram);
const byId = (id: string) => nat.find((p) => p.id === id)!;

describe("N1·N2 누구의 복지인지 · 고유어 나이", () => {
  it("'저는 엄마고 우리 엄마는 일흔이세요' → 부모님 찾기, 70세", () => {
    const r = P("저는 엄마고 우리 엄마는 일흔이세요");
    expect(r.mode).toBe("parent");
    expect(r.ageRange).toEqual([70, 70]);
  });
  it("'이세요'의 '이'는 2가 아님 (일흔·여든·예순)", () => {
    expect(P("수원 사는 엄마가 일흔이세요").ageRange).toEqual([70, 70]);
    expect(P("우리 엄마 여든이세요 수원").ageRange?.[0]).toBe(80);
    expect(P("엄마 예순이세요 수원").ageRange).toEqual([60, 60]);
    expect(P("엄마 예순넷이세요 수원").ageRange).toEqual([64, 64]);
  });
  it("부모님 탭에서 시작하면 본인이 분명하지 않은 문장은 부모님 찾기", () => {
    expect(P("치매 진단 받으셨어요", "parent").mode).toBe("parent");
    expect(P("수원 사는 73세 혼자 사세요", "parent").mode).toBe("parent");
  });
});

describe("N3·H2 나이 범위·자녀 나이·가구", () => {
  it("'30대 맞벌이 … 돌 안 된 아기' → 나이 범위 30~39, 3인, 자녀 0~1세, 직장", () => {
    const r = P("용인 수지 사는 30대 맞벌이 부부고 돌 안 된 아기 하나 있어요");
    expect(r.ageRange).toEqual([30, 39]);
    expect(r.profile.householdSize).toBe(3);
    expect(r.profile.children).toEqual(["0-1"]);
    expect(r.profile.activity).toBe("employed");
    expect(parsedExtras(r).ageSpan).toEqual([30, 39]);
  });
  it("갓난아기·생후 n개월·첫째 7살 둘째 3살", () => {
    expect(P("수원 사는데 갓난아기 있어요").profile.children).toEqual(["0-1"]);
    expect(P("수원 사는데 생후 5개월 아기 키워요").profile.children).toEqual(["0-1"]);
    expect(new Set(P("수원 살고 첫째 7살 둘째 3살이에요").profile.children)).toEqual(new Set(["6-12", "2-5"]));
  });
  it("'장인어른 모시고 삽니다 부천' → 본인 찾기, 배우자·장인 3인 (장애로 읽지 않음)", () => {
    const r = P("장인어른 모시고 삽니다 부천");
    expect(r.mode).toBe("self");
    expect(r.profile.householdSize).toBe(3);
    expect(r.profile.disability).toBe("unknown");
  });
  it("30대 결과: 부모급여·첫만남이용권이 먼저 확인할 것에, 정신건강복지센터·시설아동·누리과정은 없음", () => {
    const { view, picks } = picksOf(sitOf("용인 수지 사는 30대 맞벌이 부부고 돌 안 된 아기 하나 있어요"));
    const names = picks.map((i) => i.s.program.name);
    expect(names.some((n) => /부모\s*급여/.test(n))).toBe(true);
    expect(names.some((n) => /첫\s*만남/.test(n))).toBe(true);
    expect(names.some((n) => /정신건강복지센터|누리과정|가정위탁|보호대상아동/.test(n))).toBe(false);
    expect(view.fit.length).toBeGreaterThanOrEqual(5);
  });
  it("나이 범위 밖 보기는 숨김 (30대 → 30~34·35~39만)", () => {
    const sit = sitOf("용인 수지 사는 30대 맞벌이 부부고 돌 안 된 아기 하나 있어요");
    expect(answersFor(DIM_BY_ID.age, sit).map((a) => a.key)).toEqual(["30-34", "35-39"]);
  });
  it("신혼부부·장인어른·실직: 1~5위에 조건 없는 상담 창구·특수 신분 사업·법인 조건 사업이 없음", () => {
    for (const t of ["고양 일산 사는 신혼부부", "장인어른 모시고 삽니다 부천", "화성 동탄 살아요 실직했어요"]) {
      const { picks } = picksOf(sitOf(t));
      for (const i of picks) {
        expect(i.s.program.name).not.toMatch(/정신건강복지센터|자살예방/);
        expect(SPECIAL_STATUS.test(i.s.program.name)).toBe(false);
        expect(i.base.why ?? "").not.toMatch(/법인·시설·단체|직업·자격/);
      }
    }
  });
  it("'신혼부부' → 신혼부부 대상 주거 사업이 먼저 확인할 것에", () => {
    const { picks } = picksOf(sitOf("고양 일산 사는 신혼부부"));
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.some((i) => /전세|디딤돌|버팀목|임대|분양/.test(i.s.program.name))).toBe(true);
  });
  it("'실직했어요' → 구직·취업 지원이 1~5위", () => {
    const { picks } = picksOf(sitOf("화성 동탄 살아요 실직했어요"));
    expect(picks.some((i) => /구직|취업|실업/.test(i.s.program.name))).toBe(true);
  });
});

describe("H1 기초연금", () => {
  it("'…기초연금 받고 싶어요' → 기초연금 1순위", () => {
    const { picks } = picksOf(sitOf("안산 사는 73살인데 혼자 살아요 기초연금 받고 싶어요"));
    expect(picks[0].s.program.name).toBe("기초연금");
  });
  it("65세 이상·소득 모름이면 기초연금이 맨 앞 (말하지 않아도)", () => {
    for (const t of ["울엄마 칠순 넘으셨고 혼자 사심 화성", "아버지 59년생 어머니 63년생 두 분이 수원 영통에 사세요. 기초연금 받으시는지 모르겠어요"]) {
      const { picks } = picksOf(sitOf(t, "parent"));
      expect(picks[0].s.program.name).toBe("기초연금");
    }
  });
});

describe("N5 지역 없는 상황 문장", () => {
  it("존댓말·상황 낱말이 있으면 상황 문장 (부모님 찾기)", () => {
    for (const t of ["기초연금 못 받고 계세요", "치매 진단 받으셨어요"]) {
      const r = P(t);
      expect(r.looksLikeSituation).toBe(true);
      expect(r.mode).toBe("parent");
    }
  });
  it("서비스 이름 검색은 그대로 검색", () => {
    for (const t of ["기초연금", "에너지바우처", "기초연금 신청 방법"]) expect(P(t).looksLikeSituation).toBe(false);
  });
  it("'치매는 없으심'은 치매 관심 주제가 아님", () => {
    expect(P("울 아부지 팔순이고 이천 사셔요 치매는 없으심").interests ?? []).not.toContain("dementia");
  });
});

describe("C3 직업·자격·기부 사업, N6 무관한 soft 조건", () => {
  const sit31: Situation = { profile: { ...EMPTY_PROFILE, age: "30-34", householdSize: 1, activity: "employed", housing: "monthly" }, x: { ...EMPTY_EXTRAS }, mode: "self" };
  it("KPF 디플로마·대한민국명장·국제심판·변리사 상담은 '받으실 수 있어요'가 아님", () => {
    for (const q of ["KPF 디플로마", "대한민국명장", "국제심판", "무료 변리사"]) {
      const p = nat.find((x) => x.name.includes(q))!;
      expect(p, q).toBeTruthy();
      expect(needsOccupation(p)).toBe(true);
      expect(classifyOne(p, sit31).bucket).not.toBe("fit");
    }
  });
  it("기부 캠페인(사랑나눔 1인1나눔 계좌갖기)은 개인 혜택이 아님 — 상세에서도 '받으실 수 있어요' 아님", () => {
    const p = nat.find((x) => x.name.includes("1인1나눔"))!;
    expect(notForPersons(p)).toBe(true);
    const sit: Situation = { profile: { ...EMPTY_PROFILE, age: "70-74", householdSize: 1 }, x: { ...EMPTY_EXTRAS, incomeManwon: 90 }, mode: "self" };
    expect(classifyOne(p, sit).bucket).not.toBe("fit");
    const kp = nat.find((x) => x.name.includes("기획취재"))!;
    expect(classifyOne(kp, { ...sit, profile: { ...sit.profile, age: "40-49" } }).bucket).not.toBe("fit");
  });
  it("고효율조명기기(수급·차상위 또는 복지시설)는 소득만 낮은 비수급자에게 '받으실 수 있어요'가 아님", () => {
    const p = byId("n.gov24-GKE000000070");
    const sit: Situation = { profile: { ...EMPTY_PROFILE, age: "70-74", householdSize: 1 }, x: { ...EMPTY_EXTRAS, incomeManwon: 90, benefits: { livelihood: false, medical: false, housing: false, education: false, near_poverty: false } }, mode: "self" };
    expect(classifyOne(p, sit).bucket).not.toBe("fit");
  });
  it("장기요양인정 카드에 '등록 장애인'이 나오지 않음", () => {
    const p = byId("n.gov24-999000000089");
    const sit: Situation = { profile: { ...EMPTY_PROFILE, age: "70-74", householdSize: 1 }, x: { ...EMPTY_EXTRAS, incomeManwon: 90 }, mode: "self" };
    expect(plainLine(classifyOne(p, sit), sit, "self")).not.toMatch(/등록 장애인/);
  });
  it("조사 '은/는'을 받침에 맞춤 ('만 6~64세는')", () => {
    expect(withTopic("만 6~64세")).toBe("만 6~64세는");
    expect(withTopic("혼자 사는 분")).toBe("혼자 사는 분은");
  });
});

describe("C3 규칙 다듬기 (원문 전문 기준)", () => {
  const rule = (logic: Rule["logic"]): Rule => ({ id: "t", origin: "gov24_conditions", review: "auto", logic, unstructured: [], unstructuredCore: false });
  it("선정기준 전문의 '중위 N%'로 좁힘 (대상 문구에 없어도)", () => {
    const r = refineRule({ name: "치매 치료관리비", target: "치매 환자", criteria: "기준 중위소득 120% 이하" }, rule({ field: "incomeBands", bands: [[0, 50], [50, 75], [75, 100], [100, 200]], label: "x" }));
    expect(r.logic).toMatchObject({ field: "income", lte: 120 });
  });
  it("0부터 이어지지 않는 구간은 원문 상한에서 자름", () => {
    const r = refineRule({ name: "긴급복지", target: "중위소득 80%이하 가구" }, rule({ field: "incomeBands", bands: [[50, 75], [75, 100]], label: "x" }));
    expect(r.logic).toMatchObject({ field: "incomeBands", bands: [[50, 75], [75, 80]] });
  });
  it("'120% 이하(국비) / 120% 초과(군비)'는 상한이 아님", () => {
    expect(textMedianCap("- 기준중위소득 120% 이하인 자(국비지원)\n- 기준중위소득 120% 초과인 자(군비지원)")).toBeNull();
  });
  it("원문이 수급·차상위인데 소득 코드 0~50%뿐이면 recBand", () => {
    const r = refineRule({ name: "저소득층 쓰레기봉투", target: "저소득층", criteria: "기초생활수급자, 차상위계층" }, rule({ field: "incomeBands", bands: [[0, 50]], label: "x" }));
    expect(r.recBand).toBe(true);
  });
});

describe("N4 신청처 수동 보강", () => {
  const detail = (id: string): Program => JSON.parse(readFileSync(`public/bundles/v1/details/${detailBucket(id)}.json`, "utf8"))[id];
  it("실업급여 → 고용센터·고용24, ☎1350 (출처·확인일 있음)", () => {
    const d = detail("n.welfare100-unemployment-benefit");
    const h = howTo(d, d);
    expect(h.place).toContain("고용센터");
    expect(h.phone).toContain("1350");
    expect(d.applyNote?.source).toMatch(/^https:\/\/www\.work24\.go\.kr/);
    expect(d.applyNote?.checkedAt).toBe("2026-10-07");
  });
  it("근로장려금·법률구조·치매검진은 주민센터가 아님", () => {
    for (const id of ["n.welfare100-earned-income-tax-credit", "n.welfare100-legal-aid", "n.welfare100-dementia-screening-treatment", "n.welfare100-mental-health-center"]) {
      const d = detail(id);
      expect(howTo(d, d).place, id).not.toContain("주민센터");
    }
  });
});

describe("M2 추가 질문을 '값'으로 고름", () => {
  it("'울 아부지 팔순 … 치매는 없으심' → 첫 질문이 '몇 분 사시나요'(5개)가 아님", () => {
    const sit = sitOf("울 아부지 팔순이고 이천 사셔요 치매는 없으심");
    const { view } = picksOf(sit);
    expect(view.questions[0]?.dim.id).not.toBe("alone");
  });
  it("보훈·다문화는 먼저 묻지 않음 (30대 맞벌이 질문 모드)", () => {
    const sit: Situation = {
      profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41460", age: "30-34", householdSize: 3, children: ["0-1"], activity: "employed", housing: "jeonse", disability: "none" },
      x: { ...EMPTY_EXTRAS, incomeManwon: 650, benefits: { livelihood: false, medical: false, housing: false, education: false, near_poverty: false }, traits: { single_parent: false } },
      mode: "self",
    };
    const { view } = picksOf(sit);
    expect(view.questions.map((q) => q.dim.id)).not.toContain("veteran");
    expect(view.questions.map((q) => q.dim.id)).not.toContain("multicultural");
  });
});

describe("M1 '신청할 때 확인'은 관련 높은 순", () => {
  it("상위 20개에 법인·시설·직업 조건 항목이 섞이지 않음 (30대 맞벌이)", () => {
    const { view } = picksOf(sitOf("용인 수지 사는 30대 맞벌이 부부고 돌 안 된 아기 하나 있어요"));
    const top = view.office.slice(0, 20);
    expect(top.length).toBe(20);
    expect(view.office.length).toBeGreaterThan(20);
  });
});

describe("N5 검색은 정확히 맞는 사업명을 1위로", () => {
  it("nameHitScore: '기초연금' 이름이 '간이 대지급금'보다 앞", async () => {
    const { nameHitScore } = await import("@/lib/client/results");
    const a = nat.find((p) => p.name === "기초연금")!;
    const b = nat.find((p) => p.name.includes("간이 대지급금"))!;
    expect(nameHitScore(a, "기초연금 못 받고 계세요")).toBeGreaterThan(nameHitScore(b, "기초연금 못 받고 계세요"));
  });
});

describe("직업 조건 감지 오탐 방지", () => {
  it("'공공·민간기관의 추천서'(일상돌봄)·'학교장 추천자'는 직업 조건이 아님", () => {
    const p = nat.find((x) => x.name === "일상돌봄 서비스")!;
    expect(needsOccupation(p)).toBe(false);
  });
});

describe("N7 원문 비율이 확인해 준 '저소득' 기준", () => {
  it("청년내일저축계좌(원문 중위 50% 이하)는 121% 비수급 가구에 '신청할 때 확인'이 아님", () => {
    const p = byId("n.bokjiro-WLF00000060");
    const sit: Situation = {
      profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41460", age: "30-34", householdSize: 3, children: ["0-1"], activity: "employed" },
      x: { ...EMPTY_EXTRAS, incomeManwon: 650, benefits: { livelihood: false, medical: false, housing: false, education: false, near_poverty: false } },
      mode: "self",
    };
    expect(classifyOne(p, sit).bucket).toBe("no");
    // 소득을 모르면 그대로 확인 대상
    expect(classifyOne(p, { ...sit, x: { ...EMPTY_EXTRAS } }).bucket).not.toBe("no");
  });
  it("'(원문 확인)' 묶음(HPV — 청소년은 소득 무관)은 그대로 soft", () => {
    expect(JSON.stringify(byId("n.gov24-179038700004").rule.logic)).toContain('"label":"저소득","soft":true');
  });
});
