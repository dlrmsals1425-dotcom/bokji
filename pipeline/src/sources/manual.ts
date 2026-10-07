import fs from "node:fs";
import path from "node:path";
import type { SourceRecord } from "./record";
import { nameKey } from "../normalize/names";
import type { RegionIndex } from "../normalize/regions";
import type { Category, OrgType } from "../../../src/lib/data/types";
import type { Cond } from "../../../src/lib/engine/types";

interface ManualEntry {
  id: string;
  name: string;
  scope: "national" | "sido" | "sigungu";
  sido?: string;
  sigungu?: string;
  orgType: OrgType;
  owner: string;
  /** 실제로 신청하러 가는 곳 (예: 치과 병·의원) */
  provider?: string;
  category: Category;
  tags?: string[];
  summary: string;
  target: string;
  benefit?: string;
  applyMethod?: string;
  documents?: string;
  contact?: string;
  url: string;
  fetchedAt: string;
  logic: Cond;
  unstructured?: string[];
}

/**
 * 수동 보강 (pipeline/curated/*.json): 원천 데이터에 없는 사업 중 기관 공식 누리집에서 직접 확인한 사실만.
 * 규칙은 원문 대조로 작성했으므로 '검수 규칙(1차)'로 다루고, 출처는 '수동 보강'으로 표시한다.
 */
export function loadManual(dir: string, regions: RegionIndex, log: (m: string) => void): SourceRecord[] {
  if (!fs.existsSync(dir)) return [];
  const out: SourceRecord[] = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { programs: ManualEntry[] };
    // programs 가 없는 파일(예: apply-places.json — 신청처 수동 보강)은 사업 목록이 아님
    for (const e of j.programs ?? []) {
      let sidoCode: string | undefined;
      let sigunguCodes: string[] | undefined;
      let regionLabel: string | undefined;
      if (e.scope === "sigungu") {
        const g = regions.sigunguByCode(e.sigungu!);
        if (!g) { log(`[manual] 시군구 코드 없음: ${e.sigungu} (${e.id})`); continue; }
        sidoCode = e.sigungu!.slice(0, 2) + "000";
        sigunguCodes = [e.sigungu!];
        regionLabel = `${regions.sidoByCode(sidoCode)?.short ?? ""} ${g.name}`.trim();
      } else if (e.scope === "sido") {
        sidoCode = e.sido;
        regionLabel = regions.sidoByCode(e.sido!)?.name;
      }
      out.push({
        source: "manual",
        sourceId: e.id,
        name: e.name,
        key: nameKey(e.name),
        summary: e.summary,
        target: e.target,
        criteria: e.target,
        benefit: e.benefit,
        applyMethod: e.applyMethod,
        documents: e.documents,
        contact: e.contact,
        orgType: e.orgType,
        scope: e.scope,
        sidoCode,
        sigunguCodes,
        regionLabel,
        owner: e.owner,
        provider: e.provider,
        category: e.category,
        tags: e.tags ?? [],
        url: e.url,
        updatedAt: e.fetchedAt,
        fetchedAt: e.fetchedAt,
        trust: "B",
        badges: [],
        draft: { origin: "curated", logic: e.logic, unstructured: e.unstructured ?? [], core: false },
      });
    }
  }
  log(`[manual] 수동 보강 ${out.length}건`);
  return out;
}
