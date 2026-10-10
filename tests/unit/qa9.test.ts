/** QA 9차 (2026-10-11): 답과 맞지 않는 'soft 조건'·수급자 대상·결식, 남은 과대판정 34건 원문 확인 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_EXTRAS, buildView, classifyOne, plainLine, scoreV2, type Situation } from "@/lib/client/v2";
import { situationOf } from "@/lib/client/start";
import { PRESETS } from "@/lib/client/presets";
import { refineProgram } from "@/lib/data/refine";
import { EMPTY_PROFILE } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";

const B = "public/bundles/v1/";
const load = (f: string): Program[] => (existsSync(B + f) ? JSON.parse(readFileSync(B + f, "utf8")).programs : []);
const NO = { livelihood: false, medical: false, housing: false, education: false, near_poverty: false };
/** 소유자 화면 확인: 용인 · 40~49세 · 4인 · 월 650만원(중위 약 100%) · 수급·차상위 아님 · 장애 없음 · 자녀 2명 */
const owner: Situation = {
  profile: { ...EMPTY_PROFILE, sido: "41000", sigungu: "41460", age: "40-49", householdSize: 4, children: ["2-5", "6-12"], disability: "none" },
  x: { ...EMPTY_EXTRAS, benefits: NO, incomeManwon: 650, childCount: 2 },
  mode: "self",
};
const progs = [...load("sigungu/41460.json"), ...load("sido/41000.json"), ...load("national.json")].map(refineProgram);
const view = buildView(scoreV2(progs, owner), owner, 12);
const bucketOf = (name: string) => (["fit", "office", "ask", "no"] as const).find((b) => view[b].some((g) => g.some((i) => i.s.program.name === name)));

describe("답과 맞지 않는 조건은 '신청할 때 확인'에 남기지 않음", () => {
  it("장애 없음이라고 답했으면 '확인할 것: 등록 장애인'이 없음", () => {
    const lines = view.office.map((g) => plainLine(g[0], owner, "self"));
    expect(lines.filter((l) => /등록 장애인|장애가 있는/.test(l))).toEqual([]);
  });
  it("통합문화이용권(수급·차상위·저소득 한부모 등) → '받으실 수 있어요'가 아님", () => {
    expect(bucketOf("통합문화이용권")).not.toBe("fit");
  });
  it("결식아동급식지원: 교사 추천 경로가 있어 빼지는 않고, 왜 확인이 필요한지 적음", () => {
    const g = view.office.find((x) => x[0].s.program.name === "결식아동급식지원")!;
    expect(g[0].base.why).toMatch(/추천이 있어야/);
  });
  it("수급·차상위와 장애인·유공자 등이 함께 적힌 사업은 맞지 않음으로 보내지 않음 (Sonnet 검토)", () => {
    const disabled: Situation = { ...owner, profile: { ...owner.profile, disability: "self" }, x: { ...owner.x, incomeManwon: 250 } };
    const p = progs.find((x) => x.name === "이동통신요금감면")!;
    expect(classifyOne(p, disabled).bucket).not.toBe("no");
  });
  it("복지로 '저소득 가구' 태그 하나뿐인 사업(긴급복지 등)은 수급자가 아니라고 해도 맞지 않음으로 보내지 않음 (Sonnet 검토)", () => {
    for (const id of ["n.welfare100-emergency-welfare", "n.bokjiro-WLF00001148"]) {
      const p = progs.find((x) => x.id === id);
      if (p) expect([id, classifyOne(p, owner).base.why ?? ""]).not.toEqual([id, expect.stringMatching(/대상 특성/)]);
    }
  });
  it("아이돌봄 서비스는 빼지 않음 (장애 조건만 확인할 것에서 뺌)", () => {
    expect(bucketOf("아이돌봄 서비스")).not.toBe("no");
    const g = view.office.find((x) => x[0].s.program.name === "아이돌봄 서비스");
    if (g) expect(plainLine(g[0], owner, "self")).not.toMatch(/장애/);
  });
  it("원문에 별도 조건이 있는 사업은 '받으실 수 있어요'가 아님 (실종아동, 발달 심화평가, 서비스별 상이)", () => {
    for (const n of ["실종아동 보호 및 지원", "영유아 발달 정밀검사비 지원", "지역사회서비스"]) expect([n, bucketOf(n)]).not.toEqual([n, "fit"]);
  });
  it("문화유산 관람료 감면: 원문 '만 24세 이하 및 만 65세 이상' — 40대는 '받으실 수 있어요'가 아님, 20세는 나이가 맞음", () => {
    const p = progs.find((x) => x.id === "n.gov24-155000000017")!;
    expect(classifyOne(p, owner).bucket).not.toBe("fit");
    const young: Situation = { ...owner, profile: { ...owner.profile, age: "19-24" } };
    const yi = classifyOne(p, young);
    expect(yi.bucket).not.toBe("no");
    expect(yi.base.ev.reasons.map((r) => r.text)).toContain("만 24세 이하 (원문)");
  });
});

describe("남은 과대판정 34건 원문 확인 (2026-10-11)", () => {
  const all = [B + "national.json", ...readdirSync(B + "sido").map((f) => B + "sido/" + f), ...readdirSync(B + "sigungu").map((f) => B + "sigungu/" + f)].flatMap(
    (f) => JSON.parse(readFileSync(f, "utf8")).programs as Program[],
  );
  const at = (id: string, sido: string, sgg: string) => {
    const pre = PRESETS.find((p) => p.id === id)!;
    return situationOf({ ...pre.profile, sido, sigungu: sgg }, pre.x, pre.mode ?? "self");
  };
  it.each([
    ["s12000.gov24-646000000148", "bucheon-disability", "12000", "12800", /취업/], // 중소기업에 취직한 중장년
    ["s26000.gov24-626000000630", "goyang-youth", "26000", "26380", /졸업/], // 졸업 후 3년 이내 미취업자
    ["s27000.gov24-627000000136", "seongnam-single-parent", "27000", "27710", /2025년 모집/], // 2025년 모집
    ["g28275.gov24-356000000110", "suwon-senior", "28000", "28275", /건강보험료/], // 최저보험료 이하
    ["s28000.gov24-628000000135", "suwon-senior", "28000", "28237", /돌봄 서비스/], // 노인맞춤돌봄서비스 내
    ["g36110.gov24-569000000364", "suwon-senior", "36000", "36110", /부양의무자/],
    ["g44130.gov24-449000000524", "suwon-senior", "44000", "44130", /처방/],
    ["g52110.gov24-464000000127", "bucheon-disability", "52000", "52110", /장애·돌봄 판정/], // 이동기기 수리
    ["g44825.gov24-462000000338", "seongnam-single-parent", "44000", "44825", /돌봄 서비스/], // 아이돌봄 본인부담금
  ])("%s", (id, preset, sido, sgg, why) => {
    const p = refineProgram(all.find((x) => x.id === id)!);
    const it0 = classifyOne(p, at(preset, sido, sgg));
    expect(it0.bucket).toBe("office");
    expect(it0.base.why ?? "").toMatch(why);
  });
  it("의료급여 수급자·차상위 대상(천안 노인 치과의료비)인데 아니라고 답함 → 맞지 않아요", () => {
    const p = refineProgram(all.find((x) => x.id === "g44130.gov24-449000000519")!);
    expect(classifyOne(p, at("suwon-senior", "44000", "44130")).bucket).toBe("no");
  });
  it("소득 80% 이하처럼 원문에 숫자가 있으면 '저소득층' 낱말로 따로 막지 않음 (K-water 행복가득수)", () => {
    const p = refineProgram(all.find((x) => x.id === "n.gov24-B50000100001")!);
    const s: Situation = { ...owner, x: { ...owner.x, incomeManwon: 400 } };
    expect(classifyOne(p, s).bucket).toBe("fit");
  });
});

describe("Sonnet 검토: 수급자와 다른 대상이 함께 적힌 사업", () => {
  const nat = load("national.json").map(refineProgram);
  const disabled: Situation = { ...owner, profile: { ...owner.profile, disability: "self", householdSize: 3 }, x: { ...owner.x, incomeManwon: 250 } };
  it.each(["n.bokjiro-WLF00004637", "n.gov24-SD0000003995", "n.bokjiro-WLF00003257"])("장애인이면 %s 는 맞지 않음으로 보내지 않음 (원래 main에서도 빠지던 것 포함)", (id) => {
    expect(classifyOne(nat.find((p) => p.id === id)!, disabled).bucket).not.toBe("no");
  });
  it("'생계 및 의료급여 대상자가 아닌 자' — 한부모가정 의료보험은 수급자 대상이 아님 (성남 한부모 예시 상위 5개에 들어옴)", () => {
    const pre = PRESETS.find((p) => p.id === "seongnam-single-parent")!;
    const sit = situationOf(pre.profile, pre.x, "self");
    const it0 = classifyOne(nat.find((p) => p.id === "n.gov24-B55370100008")!, sit);
    expect(it0.bucket).not.toBe("no");
    expect(plainLine(it0, sit, "self")).not.toMatch(/원문 대상이 수급/);
  });
});
