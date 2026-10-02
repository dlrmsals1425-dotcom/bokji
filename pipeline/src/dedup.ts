import type { SourceRecord } from "./sources/record";
import type { LocalOperation } from "../../src/lib/data/types";
import { nameQualifier } from "./normalize/names";

/**
 * 중복 제거·교차 원천 병합 (설계서 5.5·5.6).
 *  D1 완전 중복 / D2 실질 중복 (통합돌봄 내부)
 *  M2 강한 후보 자동 병합: 명칭 키(+괄호 부가설명) 일치 + 기관 수준 일치 + 지역 일치
 *  차단: 기관 수준(중앙 vs 지자체)이 다르거나 지역이 다르면 병합 금지
 *  통합돌봄 '전국' 행이 전국 사업과 같은 명칭이면 별도 카드 대신 '우리 지역 운영 정보'로 붙인다
 */

export interface DedupStats {
  d1Exact: number;
  d2Substantive: number;
  crossMerged: { pair: string; count: number }[];
  absorbedAsLocalOps: number;
  blockedByLevel: number;
}

export const mergeKey = (r: SourceRecord) => `${r.key}|${nameQualifier(r.name) ?? ""}`;

const regionKey = (r: SourceRecord) => (r.sigunguCodes?.length ? `g:${[...r.sigunguCodes].sort().join(",")}` : r.sidoCode ? `s:${r.sidoCode}` : "n");

const LEVEL: Record<string, string> = { central: "N", public_inst: "N", metro: "R", local: "R", edu_office: "R", other: "O" };

export function mergeInto(primary: SourceRecord, other: SourceRecord): void {
  primary.merged = [...(primary.merged ?? []), other, ...(other.merged ?? [])];
  other.merged = undefined;
  const fill = <K extends keyof SourceRecord>(k: K) => {
    if (primary[k] === undefined || primary[k] === "" || (Array.isArray(primary[k]) && (primary[k] as unknown[]).length === 0)) {
      (primary as unknown as Record<string, unknown>)[k] = other[k];
    }
  };
  (["summary", "target", "criteria", "benefit", "applyMethod", "documents", "contact", "deadline", "owner", "provider", "url", "applyUrl", "laws", "provision"] as const).forEach(fill);
  primary.tags = [...new Set([...primary.tags, ...other.tags])];
  primary.badges = [...new Set([...primary.badges, ...other.badges])];
  if (other.name !== primary.name) primary.aliases = [...new Set([...(primary.aliases ?? []), other.name])];
}

/** D1·D2: 통합돌봄 내부 중복 */
export function dedupWithinIcare(records: SourceRecord[], stats: DedupStats): SourceRecord[] {
  const out: SourceRecord[] = [];
  const exact = new Map<string, SourceRecord>();
  const subst = new Map<string, SourceRecord>();
  for (const r of records) {
    if (r.source !== "icare") { out.push(r); continue; }
    const e = JSON.stringify([regionKey(r), r.name, r.summary, r.target, r.provider, r.category, r.tags, r.icareType, r.url]);
    const ex = exact.get(e);
    if (ex) { mergeInto(ex, r); stats.d1Exact++; continue; }
    exact.set(e, r);
    const s = JSON.stringify([regionKey(r), r.key, r.target ?? "", r.summary]);
    const sb = subst.get(s);
    if (sb) { mergeInto(sb, r); stats.d2Substantive++; continue; }
    subst.set(s, r);
    out.push(r);
  }
  return out;
}

/**
 * 교차 원천 병합. 우선순위: gov24 > bokjiro > welfare100 > icare (대표 필드는 상위 원천).
 * 반환: 남은 레코드 + 전국 사업 키 → 시군구별 운영 정보
 */
export function mergeAcrossSources(records: SourceRecord[], stats: DedupStats): {
  records: SourceRecord[];
  localOps: Map<SourceRecord, Map<string, LocalOperation[]>>;
} {
  const rank: Record<string, number> = { gov24: 0, bokjiro: 1, welfare100: 2, icare: 3 };
  const sorted = [...records].sort((a, b) => rank[a.source] - rank[b.source]);
  const byKey = new Map<string, SourceRecord[]>();
  const result: SourceRecord[] = [];
  const pairCount = new Map<string, number>();
  const localOps = new Map<SourceRecord, Map<string, LocalOperation[]>>();
  const nationalByKey = new Map<string, SourceRecord>();

  for (const r of sorted) {
    // 통합돌봄 '전국' 행 → 같은 이름의 전국 사업에 지역 운영 정보로 흡수
    if (r.source === "icare" && r.icareType === "전국") {
      const nat = nationalByKey.get(r.key) ?? nationalByKey.get(mergeKey(r));
      if (nat && r.sigunguCodes?.length) {
        let m = localOps.get(nat);
        if (!m) { m = new Map(); localOps.set(nat, m); }
        for (const code of r.sigunguCodes) {
          const list = m.get(code) ?? [];
          list.push({ name: r.name, provider: r.provider, description: r.summary || undefined, target: r.target, url: r.url, updatedAt: r.updatedAt });
          m.set(code, list);
        }
        stats.absorbedAsLocalOps += 1 + (r.merged?.length ?? 0);
        continue;
      }
    }
    const mk = mergeKey(r);
    const candidates = byKey.get(mk) ?? [];
    let merged = false;
    for (const c of candidates) {
      if (c.source === r.source && r.source !== "welfare100" && c.source !== "welfare100") continue; // 같은 원천끼리는 D1·D2 에서 처리
      if (LEVEL[c.orgType] !== LEVEL[r.orgType]) { stats.blockedByLevel++; continue; }
      if (regionKey(c) !== regionKey(r)) continue;
      if (LEVEL[c.orgType] === "N" && c.owner && r.owner && !ownersCompatible(c.owner, r.owner)) continue;
      mergeInto(c, r);
      const pair = `${c.source}+${r.source}`;
      pairCount.set(pair, (pairCount.get(pair) ?? 0) + 1);
      merged = true;
      break;
    }
    if (merged) continue;
    candidates.push(r);
    byKey.set(mk, candidates);
    result.push(r);
    if (r.scope === "national") {
      if (!nationalByKey.has(r.key)) nationalByKey.set(r.key, r);
      nationalByKey.set(mk, r);
    }
  }
  stats.crossMerged = [...pairCount.entries()].map(([pair, count]) => ({ pair, count }));
  return { records: result, localOps };
}

function ownersCompatible(a: string, b: string): boolean {
  const n = (s: string) => s.replace(/\s+/g, "").replace(/(장관|청장)$/, "");
  const x = n(a), y = n(b);
  return x === y || x.includes(y) || y.includes(x);
}
