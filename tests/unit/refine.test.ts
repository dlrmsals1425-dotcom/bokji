import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { LTC_LEAF_LABEL, meansTestOf, needsLtcGrade, refineProgram, refineRule, textMedianCap } from "@/lib/data/refine";
import { BUCKET_LABEL, EMPTY_EXTRAS, buildView, classifyOne, pensionLikely, scoreV2, textGate, topPicksV2, type Situation } from "@/lib/client/v2";
import { EMPTY_PROFILE } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";
import type { Rule } from "@/lib/engine/types";

const rule = (logic: Rule["logic"], origin: Rule["origin"] = "gov24_conditions"): Rule => ({ id: "r", origin, review: "structured", logic, unstructured: [], unstructuredCore: false });
const BAND50 = { field: "incomeBands" as const, bands: [[0, 50]] as [number, number][], label: "기준 중위소득 0~50%" };

describe("규칙 다듬기 (QA 1차 C3)", () => {
  it("공공부조 관문 제도 자체만 법정 기준으로 (의료급여 틀니는 제외)", () => {
    expect(meansTestOf("생계급여")?.pct).toBe(32);
    expect(meansTestOf("의료급여 (의료급여)")?.pct).toBe(40);
    expect(meansTestOf("주거급여 (맞춤형 급여)")?.pct).toBe(48);
    expect(meansTestOf("교육급여(맞춤형 급여)")?.pct).toBe(50);
    expect(meansTestOf("차상위계층 확인")?.pct).toBe(50);
    expect(meansTestOf("의료급여 틀니·치과임플란트 지원")).toBeUndefined();
    const r = refineRule({ name: "생계급여", target: "" }, rule({ all: [BAND50] }));
    expect(r.meansTest).toBe(true);
    expect(JSON.stringify(r.logic)).toContain('"lte":32');
    expect(JSON.stringify(r.logic)).not.toContain("incomeBands");
  });

  it("원문 '중위소득 N%'에 맞춤: 정부24 구간보다 좁으면 좁히고, 넓으면 넓힘 (QA 3차 R4)", () => {
    expect(textMedianCap("기준중위소득 120% 이하 청년")).toBe(120);
    expect(textMedianCap("저소득층(중위소득 80%이하)")).toBe(80);
    const bands = { field: "incomeBands" as const, bands: [[0, 50], [50, 75], [75, 100], [100, 200]] as [number, number][], label: "x" };
    const r = refineRule({ name: "경기도 청년 노동자 통장", target: "기준중위소득 120% 이하" }, rule(bands));
    expect(r.logic).toMatchObject({ field: "income", lte: 120 });
    // 원문이 더 넓으면 원문 비율로 넓힘 (QA 3차 R4: 정부24 코드가 125%·150%를 담지 못함)
    const r2 = refineRule({ name: "x", target: "중위소득 150% 이하" }, rule(BAND50));
    expect(r2.logic).toMatchObject({ field: "income", lte: 150 });
    // '우선' 문구의 비율로는 넓히지 않음
    const r3 = refineRule({ name: "x", target: "중위소득 150% 이하 가구 우선 지원" }, rule(BAND50));
    expect(r3.logic).toMatchObject({ field: "incomeBands" });
    // 여러 번 적용해도 같음
    expect(refineRule({ name: "x", target: "기준중위소득 120% 이하" }, r)).toBe(r);
  });

  it("장기요양 급여·재가 사업은 장기요양등급 조건을 붙이고, 인정 신청 자체와 '등급 외'는 붙이지 않음", () => {
    expect(needsLtcGrade({ name: "노인장기요양 재가급여 지원", target: "기초생활수급자 및 기타의료급여자" })).toBe(true);
    expect(needsLtcGrade({ name: "방문목욕", target: "장기요양 재가급여 대상자" })).toBe(true);
    expect(needsLtcGrade({ name: "노인장기요양보험", target: "" })).toBe(false);
    expect(needsLtcGrade({ name: "노인장기요양보험(장기요양인정)", target: "" })).toBe(false);
    expect(needsLtcGrade({ name: "노인맞춤돌봄서비스", target: "장기요양 등급 외 어르신" })).toBe(false);
    const r = refineRule({ name: "노인장기요양 재가급여 지원", target: "" }, rule({ all: [{ field: "age", min: 65, label: "만 65세 이상" }] }));
    expect(JSON.stringify(r.logic)).toContain(LTC_LEAF_LABEL);
  });

  it("노인장기요양보험 담당 부처 고침 (국가보훈부 → 보건복지부·국민건강보험공단)", () => {
    const p = refineProgram({ id: "n.welfare100-long-term-care-insurance", name: "노인장기요양보험", owner: "국가보훈부", rule: rule(null, "curated") } as unknown as Program);
    expect(p.owner).toMatch(/보건복지부/);
    expect(p.owner).toMatch(/국민건강보험공단/);
  });
});

/* 실제 번들로 리뷰어 P1b 재현: 안산 73세 혼자, 월 90만원, 수급·기초연금 안 받음, 일상 도움·장기요양등급 없음 */
const load = (f: string): Program[] => JSON.parse(fs.readFileSync(`public/bundles/v1/${f}`, "utf8")).programs;
const hasBundles = fs.existsSync("public/bundles/v1/sigungu/41270.json");
describe.skipIf(!hasBundles)("P1b 73세 1인 월 90만원 (실제 번들)", () => {
  const programs = [...load("sigungu/41270.json"), ...load("sido/41000.json"), ...load("national.json")].map(refineProgram);
  const NO = { livelihood: false, medical: false, housing: false, education: false, near_poverty: false };
  const s: Situation = {
    profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41270", age: "70-74", householdSize: 1, care: [], disability: "none" },
    x: { ...EMPTY_EXTRAS, benefits: { ...NO, basic_pension: false }, incomeManwon: 90, facts: { ltcGrade: false } },
    mode: "self",
  };
  const view = buildView(scoreV2(programs, s), s);
  const bucketOf = (id: string) => {
    for (const b of ["fit", "ask", "office", "no"] as const) if (view[b].some((g) => g.some((i) => i.s.program.id === id))) return b;
    return null;
  };
  it("수급자 전용·등급 필요 사업은 '받으실 수 있어요'가 아님", () => {
    expect(bucketOf("n.gov24-WII000001410")).toBe("no"); // 생계급여 (32% = 82만원 < 90만원)
    expect(bucketOf("s41000.gov24-641000000114")).toBe("no"); // 장기요양 재가급여 (수급자 + 등급)
    expect(bucketOf("n.gov24-135200000002")).toBe("no"); // 의료급여 틀니 (의료급여 수급자)
    expect(bucketOf("s41000.gov24-641000000852")).toBe("no"); // 주택화재 안심보험 (수급·차상위)
  });
  it("의료급여·차상위 확인은 소득이 기준 안이어도 최대 '신청할 때 확인' (재산·부양 조사)", () => {
    expect(bucketOf("n.welfare100-medical-aid")).toBe("office");
    expect(bucketOf("n.welfare100-near-poverty-certificate")).toBe("office");
    const p = programs.find((x) => x.id === "n.welfare100-medical-aid")!;
    expect(classifyOne(p, s).base.why).toMatch(/재산·부양/);
  });
  it("기초연금이 먼저 확인할 5가지의 1순위", () => {
    expect(pensionLikely(s)).toBe(true);
    const picks = topPicksV2(view, 5, s).map((g) => g[0].s.program.name);
    expect(picks[0]).toBe("기초연금");
    expect(picks.join("|")).not.toMatch(/무릎인공관절|예방접종/);
  });
  it("원문 대상이 수급·차상위뿐이면 소득 구간만으로 맞음 처리하지 않음 (textGate)", () => {
    const fire = programs.find((x) => x.id === "s41000.gov24-641000000852")!;
    expect(textGate(fire).gate?.kind).toBe("recipient");
    expect(BUCKET_LABEL.fit).toBe("받으실 수 있어요");
  });
});
