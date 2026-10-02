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
