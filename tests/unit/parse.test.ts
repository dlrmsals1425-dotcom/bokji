import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ageFromBirth, parseSituation, prefillPath, understoodLine } from "@/lib/client/parse";
import { matchesQuery } from "@/lib/client/results";
import { queryTokens } from "@/lib/client/query";
import type { Program, RegionIndex } from "@/lib/data/types";

const regions: RegionIndex = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../public/bundles/v1/regions.json"), "utf8"));
const T = { year: 2026, month: 10, day: 7 };
const P = (s: string) => parseSituation(s, regions, T);

describe("상황 문장 해석: 운영자 문장", () => {
  it("'수원시 소재에 계시고 59년생 부모님 두분이 계신다' → 수원시 · 65~69세 · 2인 · 부모님", () => {
    const r = P("수원시 소재에 계시고 59년생 부모님 두분이 계신다");
    expect(r.mode).toBe("parent");
    expect(r.profile).toMatchObject({ sido: "41000", sigungu: "41110", age: "65-69", householdSize: 2 });
    expect(r.looksLikeSituation).toBe(true);
    expect(understoodLine(r)).toBe("경기 수원시 · 1959년생 → 만 66~67세 (65~69세) · 부모님 두 분 (부부 2인 가구)");
    expect(r.regionTerms).toEqual(["수원시"]);
    expect(prefillPath(r)).toBe("/check?for=parent&prefill=1");
    // 해석에 없는 항목은 '모름'
    expect(r.profile.income).toBe("unknown");
    expect(r.profile.disability).toBe("unknown");
  });
});

/** [문장, 기대값] — 30개 */
const CASES: [string, Partial<{ mode: string | null; sido: string | null; sigungu: string | null; age: string; hh: number | string; situ: boolean }>][] = [
  ["수원 살고 59년생이신 부모님 두 분", { mode: "parent", sigungu: "41110", age: "65-69", hh: 2 }],
  ["1959년생 어머니가 수원시 영통구에 사세요", { mode: "parent", sigungu: "41110", age: "65-69" }],
  ["분당 사시는 부모님 1955년생 치매", { mode: "parent", sigungu: "41130", age: "70-74" }],
  ["성남시 수정구 아버지 혼자 사심 80대", { mode: "parent", sigungu: "41130", age: "80+", hh: 1 }],
  ["경기 광주시 70대 후반 아버지", { mode: "parent", sido: "41000", sigungu: "41610", age: "75-79" }],
  ["광주에 사시는 어머니 홀로 계세요", { mode: "parent", sido: "12000", sigungu: null, hh: 1 }],
  ["서울 중구 사는 저는 30대 초반 월세", { mode: "self", sido: "11000", sigungu: "11140", age: "30-34" }],
  ["중구에 사는 65세", { sido: null, sigungu: null, age: "65-69", situ: true }],
  ["부산 해운대구 70세 어머니 기초연금 받고 계심", { mode: "parent", sigungu: "26350", age: "70-74" }],
  ["60대 부모님 전세", { mode: "parent", age: "unknown", situ: true }],
  ["60대 초반 아버지", { mode: "parent", age: "60-64" }],
  ["60대 후반 어머니", { mode: "parent", age: "65-69" }],
  ["만 66세 시어머니 고양시 일산 거주", { mode: "parent", sigungu: "41280", age: "65-69" }],
  ["고양시 부모님 부부 두 분 다 70세", { mode: "parent", sigungu: "41280", age: "70-74", hh: 2 }],
  ["제가 부천에서 혼자 살아요 34살", { mode: "self", sigungu: "41190", age: "30-34", hh: 1 }],
  ["내가 59년생인데 수원 살아", { mode: "self", sigungu: "41110", age: "65-69" }],
  ["용인 수지 장인 장모님 칠순", { mode: "parent", sigungu: "41460", age: "70-74" }],
  ["창원 마산 어머니 1950년 3월생", { mode: "parent", sigungu: "48120", age: "75-79" }],
  ["할머니가 대구 수성구에 사세요 90세", { mode: "parent", sigungu: "27260", age: "80+" }],
  ["세종시 사는 4인 가구 40대", { sido: "36000", age: "40-49", hh: 4 }],
  ["제주 서귀포 우리 엄마 61년생", { mode: "parent", sigungu: "50130", age: "65-69" }],
  ["경기도 수원시 장안구 어르신 혼자 사시는 분", { sigungu: "41110", hh: 1 }],
  ["기초연금", { mode: null, sido: null, age: "unknown", situ: false }],
  ["노인 일자리", { situ: false }],
  ["에너지바우처 신청", { situ: false }],
  ["고령자 건강검진", { sido: null, situ: false }],
  ["65세 이상 예방접종", { age: "unknown", situ: false }],
  ["고양이 의료비", { sido: null }],
  ["장수 사진 촬영", { sido: null, situ: false }],
  ["청주 흥덕구 사는 엄마 아빠 두분 57년생", { mode: "parent", sigungu: "43110", age: "65-69", hh: 2 }],
];

describe("상황 문장 해석: 30개 문장", () => {
  for (const [s, exp] of CASES) {
    it(s, () => {
      const r = P(s);
      if ("mode" in exp) expect(r.mode).toBe(exp.mode);
      if ("sido" in exp) expect(r.profile.sido).toBe(exp.sido);
      if ("sigungu" in exp) expect(r.profile.sigungu).toBe(exp.sigungu);
      if ("age" in exp) expect(r.profile.age).toBe(exp.age);
      if ("hh" in exp) expect(r.profile.householdSize).toBe(exp.hh);
      if ("situ" in exp) expect(r.looksLikeSituation).toBe(exp.situ);
    });
  }
});

describe("상황 신호", () => {
  it("치매·장애·수급·월세·요양등급", () => {
    expect(P("치매 있으신 아버지").profile.care).toEqual(["daily"]);
    expect(P("어머니 장기요양 등급 받으심").profile.care).toEqual(["daily"]);
    const d = P("아버지가 중증 장애가 있고 기초생활수급자");
    expect(d.profile.disability).toBe("self");
    expect(d.profile.disabilitySeverity).toBe("severe");
    expect(d.profile.benefits).toEqual(["livelihood"]);
    expect(P("동생이 장애가 있어요").profile.disability).toBe("member");
    expect(P("부모님 장애는 없어요").profile.disability).toBe("none");
    expect(P("월세 사는 30대").profile.housing).toBe("monthly");
    expect(P("어머니 기초연금 받고 계심").profile.benefits).toEqual(["basic_pension"]);
    // '받을 수 있나'는 상태가 아니라 질문
    expect(P("어머니 기초연금 받을 수 있나요").profile.benefits).toBeNull();
    expect(P("수급자 될 수 있나요").profile.benefits).toBeNull();
  });
  it("출생연도 → 만 나이 (생일 전후)", () => {
    expect(ageFromBirth(1959, T)).toEqual([66, 67]);
    expect(ageFromBirth(1959, T, 3)).toEqual([67, 67]);
    expect(ageFromBirth(1959, T, 12)).toEqual([66, 66]);
    // 경계에 걸치면 위쪽 나이대 + 확인 문구
    const r = P("61년생 어머니");
    expect(r.profile.age).toBe("65-69");
    expect(r.notes.join(" ")).toMatch(/만 64세/);
  });
});

describe("너그러운 검색", () => {
  const prog = (name: string, summary = "", target = ""): Program => ({
    id: name, name, summary, target, category: "신체건강", orgType: "central", scope: "national",
    sources: [{ source: "bokjiro", id: name, fetchedAt: "2026-10-07" }], trust: "A",
    rule: { id: "r", origin: "none", review: "auto", logic: null, unstructured: [], unstructuredCore: false },
  });
  const denture = prog("65세 이상 건강보험 틀니", "완전틀니와 부분틀니", "만 65세 이상");
  const flu = prog("인플루엔자 국가예방접종 지원", "", "65세 이상 어르신");
  it("띄어쓰기·조사·불용어·비슷한 말", () => {
    expect(matchesQuery(denture, "틀니 지원")).toBe(true);
    expect(matchesQuery(denture, "부모님 틀니는")).toBe(true);
    expect(matchesQuery(flu, "독감 예방접종")).toBe(true);
    expect(matchesQuery(flu, "어르신 독감")).toBe(true);
    expect(matchesQuery(flu, "인플 루엔자")).toBe(true);
    expect(matchesQuery(flu, "틀니")).toBe(false);
  });
  it("지역 낱말은 빼고 찾는다", () => {
    expect(matchesQuery(denture, "수원 틀니", ["수원"])).toBe(true);
    expect(queryTokens("수원시 소재에 계시고 59년생 부모님 두분이 계신다", ["수원시"])).toEqual([[]]);
    expect(queryTokens("기초연금, 노인")).toEqual([["기초연금"], ["노인"]]);
    expect(queryTokens("복지")).toEqual([["복지"]]);
  });
});
