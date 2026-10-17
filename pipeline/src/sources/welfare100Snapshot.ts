/**
 * 복지제도100(선행 대시보드 운영자가 정리한 핵심 제도 100선) 고정본 (2026-10-17).
 * 원 수집본(ICDASH_DIR/data/w100_index-*.json)을 더 쓸 수 없어, 지금 번들(public/bundles/v1)에 들어 있는
 * welfare100 출처 사업을 원천 레코드 꼴로 저장해 두고 파이프라인이 그것을 읽는다. 원문이 따로 없는 정리본이라 다시 받지 않는다.
 * 복지로 색인(나머지 약 5,000개)은 복지로 OpenAPI(applyBokjiroApi)가 목록·상세·생애주기·가구상황 태그로 대신 만든다.
 *
 * 만들기(한 번): npx tsx pipeline/src/sources/welfare100Snapshot.ts → pipeline/curated/welfare100-snapshot.json
 */
import fs from "node:fs";
import path from "node:path";
import type { Program } from "../../../src/lib/data/types";
import { detailBucket } from "../../../src/lib/data/bucket";
import { nameKey } from "../normalize/names";
import type { SourceRecord } from "./record";

const ROOT = path.resolve(__dirname, "../../..");
export const WELFARE100_SNAPSHOT = path.join(ROOT, "pipeline/curated/welfare100-snapshot.json");

export function loadWelfare100Snapshot(file = WELFARE100_SNAPSHOT): SourceRecord[] {
  const j = JSON.parse(fs.readFileSync(file, "utf8")) as { asOf: string; records: SourceRecord[] };
  return j.records;
}

function readBundles(): Program[] {
  const dir = path.join(ROOT, "public/bundles/v1");
  const files = [path.join(dir, "national.json"), ...fs.readdirSync(path.join(dir, "sido")).map((f) => path.join(dir, "sido", f)), ...fs.readdirSync(path.join(dir, "sigungu")).map((f) => path.join(dir, "sigungu", f))];
  const seen = new Set<string>();
  const out: Program[] = [];
  for (const f of files) {
    for (const p of JSON.parse(fs.readFileSync(f, "utf8")).programs as Program[]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

function main() {
  const shards = new Map<string, Record<string, Partial<Program>>>();
  const detail = (id: string) => {
    const b = detailBucket(id);
    if (!shards.has(b)) shards.set(b, JSON.parse(fs.readFileSync(path.join(ROOT, `public/bundles/v1/details/${b}.json`), "utf8")));
    return shards.get(b)![id] ?? {};
  };
  const records: SourceRecord[] = [];
  for (const p of readBundles()) {
    const src = p.sources?.find((s) => s.source === "welfare100");
    if (!src) continue;
    const d = { ...p, ...detail(p.id) } as Program & Record<string, unknown>;
    const fromTags = p.rule?.origin === "bokjiro_tags" || p.rule?.origin === "text_extract";
    records.push({
      source: "welfare100",
      sourceId: src.id,
      name: p.name,
      key: nameKey(p.name),
      summary: p.summary ?? "",
      target: (d.target as string | undefined) ?? undefined,
      orgType: p.orgType,
      scope: p.scope,
      sidoCode: p.region?.sido,
      sigunguCodes: p.region?.sigungu ? [p.region.sigungu] : undefined,
      regionLabel: p.region?.label,
      owner: p.owner,
      category: p.category,
      tags: p.tags ?? [],
      laws: p.laws,
      updatedAt: "2026-09-24",
      fetchedAt: "2026-09-24",
      trust: "B",
      badges: [],
      // 사람이 정리한 규칙(curated)은 pipeline/rules/curated 가 다시 붙인다
      draft: { origin: fromTags ? p.rule.origin as "bokjiro_tags" | "text_extract" : "none", logic: fromTags ? p.rule.logic : null, unstructured: fromTags ? p.rule.unstructured ?? [] : [], core: false },
    });
  }
  records.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  fs.writeFileSync(WELFARE100_SNAPSHOT, JSON.stringify({ asOf: "2026-09-24", note: "복지제도100 고정본 — 지금 번들에서 뽑음 (원 수집본 없음)", records }, null, 1) + "\n");
  console.log(`[welfare100] 고정본 ${records.length}건 → ${path.relative(process.cwd(), WELFARE100_SNAPSHOT)}`);
}

if (require.main === module) main();
