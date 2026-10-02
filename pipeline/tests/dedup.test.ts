import { describe, expect, it } from "vitest";
import { dedupWithinIcare, mergeAcrossSources, type DedupStats } from "../src/dedup";
import type { SourceRecord } from "../src/sources/record";
import { nameKey } from "../src/normalize/names";

// 병합 로직 검증용 최소 레코드 (실제 사업 데이터 아님)
const rec = (o: Partial<SourceRecord>): SourceRecord => ({
  source: "bokjiro", sourceId: Math.random().toString(36).slice(2), name: "x", key: nameKey(o.name ?? "x"), summary: "", orgType: "central", scope: "national",
  category: "생활지원", tags: [], fetchedAt: "2026-10-02", trust: "A", badges: [], draft: { origin: "none", logic: null, unstructured: [], core: false }, ...o,
});
const fresh = (): DedupStats => ({ d1Exact: 0, d2Substantive: 0, crossMerged: [], absorbedAsLocalOps: 0, blockedByLevel: 0 });

describe("교차 원천 병합 (설계서 5.6)", () => {
  it("근로장려금: 정부24(국세청) + 복지로(국세청) → 1개 사업, 정부24가 대표", () => {
    const s = fresh();
    const g = rec({ source: "gov24", sourceId: "G1", name: "근로장려금", owner: "국세청", applyMethod: "홈택스 신청" });
    const b = rec({ source: "bokjiro", sourceId: "WLF1", name: "근로장려금", owner: "국세청", url: "https://www.bokjiro.go.kr/x" });
    const { records } = mergeAcrossSources([b, g], s);
    expect(records).toHaveLength(1);
    expect(records[0].source).toBe("gov24");
    expect(records[0].url).toBe("https://www.bokjiro.go.kr/x");
    expect(records[0].merged?.map((m) => m.sourceId)).toEqual(["WLF1"]);
    expect(s.crossMerged).toEqual([{ pair: "gov24+bokjiro", count: 1 }]);
  });
  it("차단: 같은 이름이라도 국가 사업 vs 시군구 자체 사업은 병합 금지", () => {
    const s = fresh();
    const n = rec({ source: "welfare100", name: "청년월세 지원" });
    const l = rec({ source: "bokjiro", name: "청년월세 지원", orgType: "local", scope: "sigungu", sidoCode: "41000", sigunguCodes: ["41110"] });
    expect(mergeAcrossSources([n, l], s).records).toHaveLength(2);
    expect(s.blockedByLevel).toBe(1);
  });
  it("차단: 다른 시군구끼리는 병합 금지", () => {
    const a = rec({ source: "bokjiro", name: "식사배달", orgType: "local", scope: "sigungu", sidoCode: "41000", sigunguCodes: ["41110"] });
    const b = rec({ source: "icare", name: "식사배달", orgType: "local", scope: "sigungu", sidoCode: "41000", sigunguCodes: ["41130"] });
    expect(mergeAcrossSources([a, b], fresh()).records).toHaveLength(2);
  });
  it("괄호 부가설명이 다르면 병합하지 않음 (의료급여 vs 의료급여(요양비))", () => {
    const a = rec({ source: "welfare100", name: "의료급여" });
    const b = rec({ source: "bokjiro", name: "의료급여(요양비)" });
    expect(mergeAcrossSources([a, b], fresh()).records).toHaveLength(2);
  });
  it("통합돌봄 '전국' 행은 같은 이름의 전국 사업에 지역 운영 정보로 흡수", () => {
    const s = fresh();
    const nat = rec({ source: "welfare100", name: "노인맞춤돌봄서비스" });
    const row = rec({ source: "icare", name: "노인맞춤돌봄 서비스", icareType: "전국", orgType: "local", scope: "sigungu", sidoCode: "51000", sigunguCodes: ["51150"], provider: "노인복지관" });
    const { records, localOps } = mergeAcrossSources([nat, row], s);
    expect(records).toHaveLength(1);
    expect(localOps.get(nat)?.get("51150")?.[0].provider).toBe("노인복지관");
    expect(s.absorbedAsLocalOps).toBe(1);
  });
});

describe("통합돌봄 내부 중복 (D1·D2)", () => {
  it("완전 중복·실질 중복 제거", () => {
    const s = fresh();
    const base = { source: "icare" as const, name: "방문목욕", orgType: "local" as const, scope: "sigungu" as const, sidoCode: "41000", sigunguCodes: ["41110"], summary: "목욕", target: "노인" };
    const out = dedupWithinIcare([rec(base), rec(base), rec({ ...base, provider: "다른기관" })], s);
    expect(out).toHaveLength(1);
    expect(s.d1Exact).toBe(1);
    expect(s.d2Substantive).toBe(1);
  });
});

import { regionalCopyCheck, textSimilarity } from "../src/dedup";

describe("지역 집행분 vs 지역 추가사업 (전국 사업 흡수 규칙)", () => {
  const LAW = ["장애인활동 지원에 관한 법률"];
  const nat = rec({ source: "gov24", name: "장애인 활동지원", laws: LAW, summary: "혼자서 일상생활과 사회생활을 하기 어려운 장애인에게 활동지원급여를 제공합니다.", target: "만 6세 이상 65세 미만 등록 장애인" });
  const local = (o: Partial<SourceRecord>) => rec({ source: "gov24", orgType: "local", scope: "sigungu", sidoCode: "41000", sigunguCodes: ["41110"], laws: LAW, ...o });

  it("'(추가)' 표지가 붙은 지자체 추가사업은 흡수하지 않는다 (수원 장애인 활동지원(추가))", () => {
    const r = local({ name: "장애인 활동지원(추가)", summary: "활동지원 수급자에게 시비로 추가 시간을 지원합니다." });
    expect(regionalCopyCheck(nat, r, ["수원시", "수원"]).ok).toBe(false);
    const s = fresh();
    const { records, localOps } = mergeAcrossSources([nat, r], s, () => ["수원시", "수원"]);
    expect(records).toHaveLength(2);
    expect(localOps.size).toBe(0);
    expect(s.keptRegionalAddons).toBe(1);
  });
  it("설명에 '자체 사업'·'추가 지원'이 있으면 흡수하지 않는다", () => {
    const r = local({ name: "수원시 장애인 활동지원", summary: "국비 활동지원과 별도로 시 자체 예산으로 추가 지원합니다." });
    expect(regionalCopyCheck(nat, r, ["수원시", "수원"]).reason).toMatch(/설명 표지/);
  });
  it("이름·법령·설명이 같은 지역 등록분은 지역 운영 정보로 흡수한다", () => {
    const r = local({ name: "수원시 장애인 활동지원", summary: "일상생활과 사회생활을 하기 어려운 장애인에게 활동지원급여(활동보조·방문목욕·방문간호)를 제공합니다.", contact: "수원시 장애인복지과 ☎ 031-000-0000" });
    const s = fresh();
    const { records, localOps } = mergeAcrossSources([nat, r], s, () => ["수원시", "수원"]);
    expect(records).toHaveLength(1);
    expect(localOps.get(nat)?.get("41110")?.[0].contact).toContain("031");
    expect(s.absorbedRegionalCopies).toBe(1);
  });
  it("근거 법령이 겹치지 않으면 흡수하지 않는다", () => {
    const r = local({ name: "장애인 활동지원", laws: ["수원시 장애인 복지 조례"], summary: nat.summary });
    expect(regionalCopyCheck(nat, r).ok).toBe(false);
  });
  it("설명이 전혀 다르면(유사도 낮음) 흡수하지 않는다", () => {
    const r = local({ name: "장애인 활동지원", summary: "관내 복지단체 연말 행사비와 차량 임차료를 보조합니다." });
    const c = regionalCopyCheck(nat, r);
    expect(c.ok).toBe(false);
    expect(c.reason).toBe("설명 유사도 낮음");
  });
  it("'OO형'·'확대'·'소득무관' 같은 지역 확장 표지도 별도 사업으로 둔다", () => {
    const n2 = rec({ source: "gov24", name: "산모·신생아 건강관리 지원", laws: ["모자보건법"], summary: "산모와 신생아 가정에 건강관리사를 파견합니다." });
    for (const name of ["산모·신생아 건강관리 지원(확대)", "산모·신생아 건강관리 지원(소득무관)", "화성형 산모·신생아 건강관리 지원"]) {
      expect(regionalCopyCheck(n2, local({ name, laws: ["모자보건법"], summary: n2.summary })).ok).toBe(false);
    }
  });
  it("텍스트 유사도: 같은 문장 1, 무관한 문장은 낮음", () => {
    expect(textSimilarity("산모 신생아 건강관리", "산모·신생아 건강관리")).toBe(1);
    expect(textSimilarity("산모 신생아 건강관리", "농기계 수리비 보조")).toBeLessThan(0.1);
  });
});
