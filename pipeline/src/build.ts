/**
 * 복지나침반 데이터 파이프라인: 수집 캐시 → 정규화 → 중복 제거·교차 병합 → 규칙 → 번들.
 *
 * 입력
 *  - 공공서비스(혜택) API 캐시: pipeline/raw/gov24/ (npm run ingest:gov24 로 채움, 키가 없거나 거부되면 건너뜀)
 *  - 복지로 색인·통합돌봄 메뉴판: ICDASH_DIR (기본 /workspace/icdash)
 * 출력
 *  - public/bundles/v1/national.json, sido/{code}.json, sigungu/{code}.json, regions.json, meta.json
 *  - pipeline/out/report.json · report.md · review-queue-gyeonggi.csv · review-curated.csv
 */
import fs from "node:fs";
import path from "node:path";
import { RegionIndex, PILOT_SIDO } from "./normalize/regions";
import { loadWelfare100 } from "./sources/welfare100";
import { loadIcare } from "./sources/icare";
import { loadGov24 } from "./sources/gov24";
import type { SourceRecord } from "./sources/record";
import { dedupWithinIcare, mergeAcrossSources, type DedupStats } from "./dedup";
import { readCached, readCachedStatus } from "./gov24/ingest";
import { CURATED } from "../rules/curated";
import type { Bundle, BuildMeta, LocalOperation, Program, RegionIndex as RegionIndexJson, SourceRef } from "../../src/lib/data/types";
import type { Cond, Rule } from "../../src/lib/engine/types";

const ROOT = path.resolve(__dirname, "../..");
const ICDASH = process.env.ICDASH_DIR ?? "/workspace/icdash";
const OUT = path.join(ROOT, "public/bundles/v1");
const REPORT = path.join(ROOT, "pipeline/out");
const GENERATED_AT = new Date().toISOString();

const logs: string[] = [];
const log = (m: string) => { logs.push(m); };

function readLedger(): Map<string, { status: string; reviewer: string; reviewedAt: string; note: string }> {
  const f = path.join(ROOT, "pipeline/rules/review-ledger.csv");
  const m = new Map();
  if (!fs.existsSync(f)) return m;
  const lines = fs.readFileSync(f, "utf8").split("\n").slice(1).filter((l) => l.trim());
  for (const l of lines) {
    const [rule_id, status, reviewer, reviewed_at, ...note] = l.split(",");
    m.set(rule_id.trim(), { status: status.trim(), reviewer: reviewer?.trim(), reviewedAt: reviewed_at?.trim(), note: note.join(",").trim() });
  }
  return m;
}

export function condToText(c: Cond | null): string {
  if (!c) return "(구조화 조건 없음)";
  if ("all" in c) return c.all.length ? c.all.map((x) => wrap(x, condToText(x))).join(" 그리고 ") : "(조건 없음: 누구나)";
  if ("any" in c) return c.any.map((x) => wrap(x, condToText(x))).join(" 또는 ");
  const flags = [c.soft ? "참고" : "", c.capU ? "가능성" : ""].filter(Boolean).join(",");
  return flags ? `${c.label}[${flags}]` : c.label;
}
const wrap = (c: Cond, s: string) => ("all" in c || "any" in c) && (("all" in c ? c.all : c.any).length > 1) ? `(${s})` : s;

const csvCell = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;

function main() {
  const regions = RegionIndex.load();
  const gov24Status = readCachedStatus();

  // 1. 수집 캐시 읽기
  const w100 = loadWelfare100(path.join(ICDASH, "data"), regions, log);
  const icareFetched = (() => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(ICDASH, "data/api_summary.json"), "utf8"));
      return new Date(j.fetchedAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    } catch { return "2026-10-01"; }
  })();
  const icare = loadIcare(path.join(ICDASH, "policies.csv"), icareFetched, regions, log);
  const g24list = readCached("serviceList");
  const gov24 = g24list.rows.length
    ? loadGov24(g24list.rows, readCached("supportConditions").rows, readCached("serviceDetail").rows,
      (g24list.fetchedAt ?? GENERATED_AT).slice(0, 10), regions, log)
    : [];

  const raw = { gov24: gov24.length, bokjiro: w100.filter((r) => r.source === "bokjiro").length, welfare100: w100.filter((r) => r.source === "welfare100").length, icare: icare.length };

  // 2. 노출 제외 (읍면동 단독·개인 대상 아님 등)
  const all = [...gov24, ...w100, ...icare];
  const excluded: Record<string, number> = {};
  const excludedSamples: string[] = [];
  const kept = all.filter((r) => {
    if (!r.excluded) return true;
    excluded[r.excluded] = (excluded[r.excluded] ?? 0) + 1;
    if (r.excluded === "eupmyeondong_level" && excludedSamples.length < 15) excludedSamples.push(`${r.regionLabel} · ${r.name}`);
    return false;
  });

  // 3. 중복 제거 · 교차 병합
  const stats: DedupStats = { d1Exact: 0, d2Substantive: 0, crossMerged: [], absorbedAsLocalOps: 0, blockedByLevel: 0 };
  const deduped = dedupWithinIcare(kept, stats);
  const { records, localOps } = mergeAcrossSources(deduped, stats);

  // 4. 규칙 + 프로그램 생성
  const ledger = readLedger();
  const programs: { p: Program; rec: SourceRecord; sigungu?: string }[] = [];
  const reviewCounts: Record<string, number> = {};
  const originCounts: Record<string, number> = {};

  for (const rec of records) {
    const members = [rec, ...(rec.merged ?? [])];
    const curatedKey = members.map((m) => m.sourceId).find((id) => CURATED[id]);
    const curatedMember = curatedKey ? members.find((m) => m.sourceId === curatedKey)! : undefined;
    const gov24Member = members.find((m) => m.source === "gov24" && m.draft.logic);
    const draftMember = gov24Member ?? members.find((m) => m.draft.logic) ?? rec;

    const sources: SourceRef[] = members.map((m) => ({ source: m.source, id: m.sourceId, url: m.url, updatedAt: m.updatedAt, fetchedAt: m.fetchedAt }));
    const uniqSources = sources.filter((s, i) => sources.findIndex((x) => x.source === s.source && x.id === s.id) === i);

    const placements: (string | undefined)[] = rec.scope === "sigungu" ? rec.sigunguCodes! : [undefined];
    for (const sgg of placements) {
      const prefix = rec.scope === "national" ? "n" : rec.scope === "sido" ? `s${rec.sidoCode}` : `g${sgg}`;
      const id = `${prefix}.${rec.source}-${rec.sourceId.replace(/[^0-9A-Za-z-]/g, "-")}`;
      const ruleId = `R-${id}`;
      let rule: Rule;
      if (curatedKey) {
        const c = CURATED[curatedKey];
        rule = {
          id: ruleId, origin: "curated", review: "curated", logic: c.logic,
          unstructured: c.unstructured ?? [], unstructuredCore: !!c.core,
          evidence: [curatedMember!.target, curatedMember!.summary].filter(Boolean).join(" / ") + (c.source ? ` · 근거: ${c.source}` : ""),
          reviewer: "1차: 원문 대조 작성(AI) · 최종 사람 검수 대기", reviewedAt: GENERATED_AT.slice(0, 10),
        };
      } else {
        rule = {
          id: ruleId, origin: draftMember.draft.origin, review: "auto", logic: draftMember.draft.logic,
          unstructured: draftMember.draft.unstructured, unstructuredCore: draftMember.draft.core,
          evidence: draftMember.target ?? undefined,
        };
      }
      const l = ledger.get(ruleId) ?? (curatedKey ? ledger.get(`curated:${curatedKey}`) : undefined);
      if (l) {
        if (l.status === "verified") { rule.review = "verified"; rule.reviewer = l.reviewer; rule.reviewedAt = l.reviewedAt; }
        if (l.status === "rejected") { rule.logic = null; rule.review = "auto"; rule.origin = "none"; }
      }
      reviewCounts[rule.review] = (reviewCounts[rule.review] ?? 0) + 1;
      originCounts[rule.origin] = (originCounts[rule.origin] ?? 0) + 1;

      const sggInfo = sgg ? regions.sigunguByCode(sgg) : undefined;
      const sidoInfo = rec.sidoCode ? regions.sidoByCode(rec.sidoCode) : undefined;
      const p: Program = {
        id,
        name: rec.name,
        summary: rec.summary,
        category: rec.category,
        tags: rec.tags.length ? rec.tags.slice(0, 6) : undefined,
        orgType: rec.orgType,
        scope: rec.scope,
        region: rec.scope === "national" ? undefined : {
          sido: rec.sidoCode!, sigungu: sgg, label: sggInfo ? `${sidoInfo?.short ?? ""} ${sggInfo.name}`.trim() : sidoInfo?.name ?? rec.regionLabel ?? "",
        },
        owner: rec.owner,
        provider: rec.provider,
        target: rec.target,
        criteria: rec.criteria,
        benefit: rec.benefit,
        applyMethod: rec.applyMethod,
        documents: rec.documents,
        contact: rec.contact,
        deadline: rec.deadline,
        url: rec.url,
        applyUrl: rec.applyUrl,
        provision: rec.provision?.length ? rec.provision : undefined,
        laws: rec.laws?.length ? rec.laws.slice(0, 4) : undefined,
        sources: uniqSources,
        trust: members.some((m) => m.trust === "A") ? "A" : rec.trust,
        badges: rec.badges.length ? rec.badges : undefined,
        rule,
        mergedCount: members.length > 1 ? members.length : undefined,
        aliases: rec.aliases?.length ? rec.aliases.slice(0, 8) : undefined,
      };
      programs.push({ p, rec, sigungu: sgg });
    }
  }

  // 5. 번들 쓰기
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "sido"), { recursive: true });
  fs.mkdirSync(path.join(OUT, "sigungu"), { recursive: true });
  const order = (a: Program, b: Program) =>
    Number(b.rule.review !== "auto") - Number(a.rule.review !== "auto") || a.name.localeCompare(b.name, "ko");

  const nationalIdByRec = new Map<SourceRecord, string>();
  for (const { p, rec } of programs) if (p.scope === "national") nationalIdByRec.set(rec, p.id);

  const write = (rel: string, data: unknown) => fs.writeFileSync(path.join(OUT, rel), JSON.stringify(data));
  const national: Bundle = { schema: 1, kind: "national", code: "00000", label: "전국", generatedAt: GENERATED_AT, programs: programs.filter((x) => x.p.scope === "national").map((x) => x.p).sort(order) };
  write("national.json", national);

  const sizes: Record<string, number> = { national: national.programs.length };
  const regionJson: RegionIndexJson = { schema: 1, generatedAt: GENERATED_AT, sidos: [] };
  for (const sido of regions.sidos) {
    const sidoPrograms = programs.filter((x) => x.p.scope === "sido" && x.p.region?.sido === sido.code).map((x) => x.p).sort(order);
    write(`sido/${sido.code}.json`, { schema: 1, kind: "sido", code: sido.code, label: sido.name, generatedAt: GENERATED_AT, programs: sidoPrograms } satisfies Bundle);
    const sggs = regions.sigungusOf(sido.code).map((s) => {
      const list = programs.filter((x) => x.sigungu === s.code).map((x) => x.p).sort(order);
      const ops: Record<string, LocalOperation[]> = {};
      for (const [rec, m] of localOps) {
        const nid = nationalIdByRec.get(rec);
        const v = m.get(s.code);
        if (nid && v) ops[nid] = v;
      }
      write(`sigungu/${s.code}.json`, { schema: 1, kind: "sigungu", code: s.code, label: `${sido.name} ${s.name}`, generatedAt: GENERATED_AT, programs: list, localOps: ops } satisfies Bundle);
      return { code: s.code, name: s.name, count: list.length };
    });
    regionJson.sidos.push({ code: sido.code, name: sido.name, short: sido.short, pilot: sido.code === PILOT_SIDO, sigungus: sggs, count: sidoPrograms.length });
    sizes[`sido:${sido.code}`] = sidoPrograms.length;
  }
  write("regions.json", regionJson);

  // 6. 통계
  const uniquePrograms = programs.filter((x, i) => programs.findIndex((y) => y.rec === x.rec) === i);
  const byOrg: Record<string, number> = {};
  const byScope: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const bySourceOrg: Record<string, Record<string, number>> = {};
  for (const { p, rec } of uniquePrograms) {
    byOrg[p.orgType] = (byOrg[p.orgType] ?? 0) + 1;
    byScope[p.scope] = (byScope[p.scope] ?? 0) + 1;
    for (const s of new Set(p.sources.map((x) => x.source))) bySource[s] = (bySource[s] ?? 0) + 1;
    const ps = rec.source;
    bySourceOrg[ps] = bySourceOrg[ps] ?? {};
    bySourceOrg[ps][p.orgType] = (bySourceOrg[ps][p.orgType] ?? 0) + 1;
  }
  const localOpsCount = [...localOps.values()].reduce((n, m) => n + [...m.values()].reduce((k, v) => k + v.length, 0), 0);
  const gyeonggi = uniquePrograms.filter((x) => x.p.region?.sido === PILOT_SIDO);
  const pilot = {
    programs: gyeonggi.length,
    curatedOrVerified: gyeonggi.filter((x) => x.p.rule.review !== "auto").length,
    autoRules: gyeonggi.filter((x) => x.p.rule.review === "auto" && x.p.rule.logic).length,
    noRule: gyeonggi.filter((x) => !x.p.rule.logic).length,
  };
  const nationalCurated = national.programs.filter((p) => p.rule.review !== "auto").length;

  const meta: BuildMeta = {
    schema: 1,
    generatedAt: GENERATED_AT,
    dataAsOf: {
      bokjiro: "2026-09-24 (복지로 색인 기준일)",
      icare: "2026-04 등 (메뉴판 문서별 원문 기준월), 수집 " + icareFetched,
      gov24: gov24.length ? `수집 ${g24list.fetchedAt?.slice(0, 10)}` : "미수집",
    },
    counts: { raw, excluded, uniquePrograms: uniquePrograms.length, placements: programs.length, byOrg, byScope, bySource, bySourceOrg, dedup: stats, localOps: localOpsCount, rulesByReview: reviewCounts, rulesByOrigin: originCounts, pilot, nationalCurated },
    gov24: gov24Status
      ? { status: gov24Status.status, detail: gov24Status.detail, services: gov24.length || undefined }
      : { status: "unavailable", detail: "수집 기록 없음 (npm run ingest:gov24 미실행)" },
  };
  write("meta.json", meta);

  // 7. 리포트·검수 대기열
  fs.mkdirSync(REPORT, { recursive: true });
  fs.writeFileSync(path.join(REPORT, "report.json"), JSON.stringify({ ...meta, logs: logs.slice(0, 200), excludedSamples }, null, 2));
  const queue = ["rule_id,program,region,origin,conditions,evidence,url,decision(verified|rejected),note"];
  for (const { p } of programs.filter((x) => x.p.region?.sido === PILOT_SIDO && x.p.rule.review === "auto" && x.p.rule.logic)) {
    queue.push([p.rule.id, p.name, p.region?.label, p.rule.origin, condToText(p.rule.logic), p.rule.evidence ?? p.summary, p.url, "", ""].map(csvCell).join(","));
  }
  fs.writeFileSync(path.join(REPORT, "review-queue-gyeonggi.csv"), "\uFEFF" + queue.join("\n"));
  const cur = ["curated_key,rule_id(대표),program,conditions,unstructured,evidence,decision(verified|rejected),reviewer,reviewed_at"];
  const seen = new Set<string>();
  for (const { p, rec } of programs) {
    const key = [rec, ...(rec.merged ?? [])].map((m) => m.sourceId).find((id) => CURATED[id]);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cur.push([key, p.rule.id, p.name, condToText(p.rule.logic), p.rule.unstructured.join(" / "), p.rule.evidence, "", "", ""].map(csvCell).join(","));
  }
  fs.writeFileSync(path.join(REPORT, "review-curated.csv"), "\uFEFF" + cur.join("\n"));
  const missingCurated = Object.keys(CURATED).filter((k) => !seen.has(k));

  const md = [
    `# 파이프라인 리포트 (${GENERATED_AT})`,
    "",
    `- 공공서비스(혜택) API: **${meta.gov24.status}** — ${meta.gov24.detail}`,
    `- 원천 레코드: ${Object.entries(raw).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `- 노출 제외: ${Object.entries(excluded).map(([k, v]) => `${k} ${v}`).join(" / ") || "없음"}`,
    `- 통합돌봄 D1 완전 중복 ${stats.d1Exact} · D2 실질 중복 ${stats.d2Substantive}`,
    `- 교차 원천 병합: ${stats.crossMerged.map((x) => `${x.pair} ${x.count}`).join(" / ") || "없음"} · 기관 수준이 달라 병합 차단 ${stats.blockedByLevel}`,
    `- 통합돌봄 '전국' 행 → 전국 사업의 지역 운영 정보로 흡수: ${stats.absorbedAsLocalOps}행 (운영 정보 ${localOpsCount}건)`,
    `- 최종 사업(중복 제거 후): **${uniquePrograms.length}** (시군구 배치 기준 ${programs.length})`,
    `- 기관 유형별: ${Object.entries(byOrg).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `- 범위별: ${Object.entries(byScope).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `- 원천 기여(사업 수): ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `- 규칙 검수 상태(배치 기준): ${Object.entries(reviewCounts).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `- 규칙 출처(배치 기준): ${Object.entries(originCounts).map(([k, v]) => `${k} ${v}`).join(" / ")}`,
    `- 경기도 파일럿: 사업 ${pilot.programs} · 큐레이션/검수 규칙 ${pilot.curatedOrVerified} · 자동 규칙(검수 대기열) ${pilot.autoRules} · 규칙 없음 ${pilot.noRule}`,
    `- 전국 공통 사업 중 큐레이션 규칙: ${nationalCurated}`,
    missingCurated.length ? `- ⚠ 원천에서 찾지 못한 큐레이션 키: ${missingCurated.join(", ")}` : "",
    "",
    "## 읍면동 단독 사업으로 제외한 예",
    ...excludedSamples.map((s) => `- ${s}`),
    "",
    "## 로그",
    ...logs.slice(0, 50).map((l) => `- ${l}`),
  ].join("\n");
  fs.writeFileSync(path.join(REPORT, "report.md"), md);
  console.log(md.split("\n## ")[0]);
}

main();
