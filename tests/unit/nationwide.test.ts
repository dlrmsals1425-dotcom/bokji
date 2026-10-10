/** 전국 확대 (2026-10-10): ① 판정 등급 전국화 ② 전국 점검 — 통합시 옛 지역, 원문 사건·이미 한 일·자격 조건 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifyOne, preconditionOf, type Situation } from "@/lib/client/v2";
import { situationOf } from "@/lib/client/start";
import { PRESETS } from "@/lib/client/presets";
import { refineProgram } from "@/lib/data/refine";
import { inLegacyArea, legacyAreas } from "@/lib/data/legacyArea";
import type { Program } from "@/lib/data/types";
import { parseSituation } from "@/lib/client/parse";

const B = "public/bundles/v1/";
const load = (f: string): Program[] => (existsSync(B + f) ? JSON.parse(readFileSync(B + f, "utf8")).programs : []);
const byId = (file: string, id: string) => refineProgram(load(file).find((p) => p.id === id)!);
/** 예시 상황을 다른 시·군·구로 옮김 */
const at = (presetId: string, sido: string, sigungu: string): Situation => {
  const pre = PRESETS.find((p) => p.id === presetId)!;
  return situationOf({ ...pre.profile, sido, sigungu }, pre.x, pre.mode ?? "self");
};

describe("① 정부24 지원조건 규칙은 모든 지역에서 'API 지원조건'", () => {
  it("서울 광진구 '어르신복지카드 발급'(만 65세 이상) → 어르신 예시에 받으실 수 있어요", () => {
    const p = byId("sigungu/11215.json", "g11215.gov24-304000000136");
    expect(p.rule.review).toBe("structured");
    expect(classifyOne(p, at("suwon-senior", "11000", "11215")).bucket).toBe("fit");
  });
  it("복지로 태그 규칙은 그대로 '자동 정리'", () => {
    const p = load("sigungu/11215.json").map(refineProgram).find((x) => x.rule.origin === "bokjiro_tags");
    if (p) expect(p.rule.review).toBe("auto");
  });
});

describe("② 전남광주통합특별시: 옛 광주시·옛 전남도 사업은 그 옛 지역에만", () => {
  const gj = load("sido/12000.json").find((p) => p.name === "광주청년구직활동수당 지원사업")!;
  it("정부24 기관 코드(6290000 광주, 6460000 전남)로 옛 지역을 정함", () => {
    expect([...(legacyAreas(gj) ?? [])]).toEqual(["gwangju"]);
    const jn = load("sido/12000.json").find((p) => p.sources.some((s) => String(s.id).startsWith("6460000")))!;
    expect([...(legacyAreas(jn) ?? [])]).toEqual(["jeonnam"]);
  });
  it("광주청년구직활동수당: 광산구 O, 영암군 X", () => {
    expect(inLegacyArea(gj, "12330")).toBe(true);
    expect(inLegacyArea(gj, "12800")).toBe(false);
  });
  it("옛 지역을 알 수 없는 통합시 사업(교육청 등)은 어디에나", () => {
    const edu = load("sido/12000.json").find((p) => /교육청/.test(p.owner ?? "") && !legacyAreas(p))!;
    expect(inLegacyArea(edu, "12800")).toBe(true);
    expect(inLegacyArea(edu, "12330")).toBe(true);
  });
});

describe("② 원문이 요구하는 사건·이미 한 일·자격은 '신청할 때 확인' (전국 표본 142건 대조)", () => {
  const notFit: [string, string, string, string, string, RegExp][] = [
    ["sigungu/11215.json", "g11215.gov24-304000000134", "suwon-senior", "11000", "11215", /위기·재해/], // 광진119주택: 화재·재해 긴급주거상실
    ["sigungu/27710.json", "g27710.gov24-348000000363", "goyang-youth", "27000", "27710", /결혼·입학/], // 혼인신고 한 가정
    ["sido/28000.json", "s28000.gov24-628000000160", "suwon-senior", "28000", "28177", /이미 한 일/], // 운전면허 자진반납
    ["sido/48000.json", "s48000.gov24-648000001140", "seongnam-single-parent", "48000", "48310", /조부모/], // 손주돌봄
    ["sido/31000.json", "s31000.gov24-631000000728", "seongnam-single-parent", "31000", "31110", /자녀 수/], // 3(손)자녀 이상
    ["sido/11000.json", "s11000.gov24-611000019644", "seongnam-single-parent", "11000", "11215", /개월/], // 24~36개월 영아
    ["sido/51000.json", "s51000.gov24-642000000712", "goyang-youth", "51000", "51110", /소득 하한/], // 중위 120% 초과
  ];
  it.each(notFit)("%s %s", (file, id, preset, sido, sgg, why) => {
    const it0 = classifyOne(byId(file, id), at(preset, sido, sgg));
    expect(it0.bucket).toBe("office");
    expect(it0.base.why ?? "").toMatch(why);
  });
  it("여러 대상 집단을 나열한 원문의 한 줄은 조건이 아님 (한부모 아동양육비의 '조손가족…', 가스요금할인의 '다자녀')", () => {
    const pre = PRESETS.find((p) => p.id === "seongnam-single-parent")!;
    const sit = situationOf(pre.profile, pre.x, "self");
    expect(classifyOne(refineProgram(load("national.json").find((p) => p.id === "n.gov24-SSI000000020")!), sit).bucket).toBe("fit");
  });
  it("'장애인복지카드 소지' = 등록 장애인 (묻는 조건) → 그대로", () => {
    const p = refineProgram(load("national.json").find((x) => x.name === "장애인 온라인 직업심리검사")!);
    const pre = PRESETS.find((x) => x.id === "bucheon-disability")!;
    const s = situationOf({ ...pre.profile, disability: "self", age: "30-34" }, pre.x, "self");
    expect(classifyOne(p, s).base.why ?? "").not.toMatch(/카드/);
  });
});

describe("② 전국 표본 대조로 찾은 과대 판정 — 다시 '받으실 수 있어요'가 되지 않음 (tests/fixtures/nationwide-overclaims.json)", () => {
  const rows = JSON.parse(readFileSync("tests/fixtures/nationwide-overclaims.json", "utf8")) as { id: string; name: string; preset: string; region: string; requirement: string }[];
  const regions = JSON.parse(readFileSync(B + "regions.json", "utf8")) as { sidos: { code: string; name: string; sigungus: { code: string; name: string }[] }[] };
  const fileOf = (id: string) => (id.startsWith("n.") ? "national.json" : `${id[0] === "s" ? "sido" : "sigungu"}/${id.slice(1, 6)}.json`);
  it("61건 (2026-10-10, 경기도 밖 표본 207건 → 다른 모델 검토 95건 중 공통 규칙으로 고친 것)", () => expect(rows.length).toBe(61));
  it.each(rows.map((r) => [r.name, r] as const))("%s", (_n, r) => {
    const [sidoName, sggName] = r.region.split(" ");
    const sd = regions.sidos.find((s) => s.name === sidoName)!;
    const sgg = sd.sigungus.find((g) => g.name === sggName)!;
    const p = load(fileOf(r.id)).find((x) => x.id === r.id)!;
    expect(classifyOne(refineProgram(p), at(r.preset, sd.code, sgg.code)).bucket).not.toBe("fit");
  });
});

describe("② 전국 지역 문장", () => {
  it.each([
    ["인천 영종도 살아요 65세", "28000", "28155"],
    ["인천 동구 살아요", "28000", "28125"],
    ["대구 군위 어르신", "27000", "27720"],
    ["세종시 20대", "36000", "36110"],
    ["전남 목포 사는 70세", "12000", "12110"],
  ])("%s", (t, sido, sgg) => {
    const r = parseSituation(t, JSON.parse(readFileSync(B + "regions.json", "utf8")), { year: 2026, month: 10, day: 11 });
    expect([r.profile.sido, r.profile.sigungu]).toEqual([sido, sgg]);
  });
  it("인천 중구 → 제물포구·영종구 중 고르기 (2026-07 개편 안내)", () => {
    const r = parseSituation("인천 중구 살아요", JSON.parse(readFileSync(B + "regions.json", "utf8")), { year: 2026, month: 10, day: 11 });
    expect(r.regionChoices?.map((c) => c.label)).toEqual(["인천 제물포구", "인천 영종구"]);
    expect(r.notes.join()).toMatch(/2026년 7월/);
  });
});

describe("코드 검토(Sonnet) 반영 — 원문 조건 점검이 넓게 걸리지 않음", () => {
  // 자녀·나이를 모르는 상황 (원문 문구 점검만 보려고)
  const s0 = at("parent-care", "41000", "41110");
  const sit: Situation = { ...s0, profile: { ...s0.profile, children: null, age: "unknown" } };
  const mk = (name: string, target: string) =>
    ({ id: "n.test", name, target, rule: { logic: { field: "age", min: 0, label: "x" }, unstructured: [] } }) as unknown as Program;
  it.each([
    ["응시수수료 면제", "국가공무원 채용시험 응시자 중 수급자"], // '수수료'의 '수료' 아님
    ["건강보험 임신·출산 진료비", "건강보험 가입자 또는 피부양자 중 임신·출산한 사람"], // 건강보험 가입자
    ["중증장애아동 가족지원", "기준 중위소득 120% 이하(무료), 120% 초과(40% 본인부담)"], // 소득 상한·본인부담 구간
    ["지역사회중심재활", "등록 장애인(정신장애 제외)"],
    ["양육 지원", "자녀 1명 이상을 양육하는 가구"],
    ["TV수신료 면제", "수급자 가구 (영업 목적 공간에 설치한 수상기는 제외)"],
    ["독립유공자 보상금", "독립유공자 본인, 자녀·손자녀"],
  ])("%s", (name, target) => expect(preconditionOf(mk(name, target), sit)).toBeNull());
  it.each([
    ["청년 취업준비 쿠폰", "가구소득이 기준중위소득 120%초과 ~ 180%이하인 청년", /소득 하한/],
    ["손주돌봄 지원", "손자녀를 돌보는 조부모", /조부모/],
    ["교육비 지원", "자녀가 3명 이상인 가구", /자녀 수/],
  ])("그대로 잡음: %s", (name, target, why) => expect(preconditionOf(mk(name, target), sit) ?? "").toMatch(why));
  it("'인천 서구 검단동' → 검단구", () => {
    const r = parseSituation("인천 서구 검단동 살아요", JSON.parse(readFileSync(B + "regions.json", "utf8")), { year: 2026, month: 10, day: 11 });
    expect(r.profile.sigungu).toBe("28290");
  });
});
