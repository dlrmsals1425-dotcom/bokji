import fs from "node:fs";
import { loadWelfare100Snapshot } from "./welfare100Snapshot";
import path from "node:path";
import type { SourceRecord } from "./record";
import { financialBadge, isEupmyeondongLevel } from "./record";
import { nameKey, cleanName, cleanOrg, cleanText } from "../normalize/names";
import { asCategory } from "../normalize/categories";
import type { RegionIndex } from "../normalize/regions";
import { householdCond, lifecycleCond } from "../rules/fromTags";
import { extractFromText } from "../rules/fromText";
import { all } from "../rules/helpers";
import type { Cond } from "../../../src/lib/engine/types";

/**
 * 복지로 색인 (선행 대시보드 수집본 w100_index-lite/extra.json, 기준일 2026-09-24).
 * - s: slug 또는 복지로 서비스 ID(WLF…), g: 0 중앙 / 1 지자체, a: 1 = 핵심 100선 요약
 * - sd/sg: 시도/시군구, c: 대표 분야, t: 관심주제, l: 생애주기, h: 가구상황, pv: 제공유형
 * - extra.d: 소관 부서, y: 급여 유형, cy: 지급 주기, laws: 근거 법령
 */
export function loadWelfare100(dataDir: string, regions: RegionIndex, log: (m: string) => void): SourceRecord[] {
  const litePath = path.join(dataDir, "w100_index-lite.json");
  // (2026-10-17) 원 수집본이 없으면 복지제도100 고정본만 — 복지로 색인은 복지로 OpenAPI(applyBokjiroApi)가 대신 만든다
  if (!fs.existsSync(litePath)) {
    const recs = loadWelfare100Snapshot();
    log(`[w100] 원 수집본 없음 → 복지제도100 고정본 ${recs.length}건 (복지로 사업은 복지로 OpenAPI로)`);
    return recs;
  }
  const lite = JSON.parse(fs.readFileSync(litePath, "utf8"));
  const extra = JSON.parse(fs.readFileSync(path.join(dataDir, "w100_index-extra.json"), "utf8"));
  const fetchedAt = fs.statSync(litePath).mtime.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const E = new Map<string, Record<string, unknown>>();
  for (const row of extra.items) {
    const o: Record<string, unknown> = {};
    extra.fields.forEach((f: string, i: number) => (o[f] = row[i]));
    E.set(o.s as string, o);
  }
  const out: SourceRecord[] = [];
  let unmapped = 0;
  for (const row of lite.items) {
    const it: Record<string, unknown> = {};
    lite.fields.forEach((f: string, i: number) => (it[f] = row[i]));
    const id = it.s as string;
    const ex = E.get(id) ?? {};
    const isWlf = /^WLF\d+$/.test(id);
    const central = it.g === 0;
    const name = cleanName(it.n as string);
    const sd = (it.sd as string) || "";
    const sg = (it.sg as string) || "";

    let scope: SourceRecord["scope"] = "national";
    let orgType: SourceRecord["orgType"] = "central";
    let sidoCode: string | undefined;
    let sigunguCodes: string[] | undefined;
    let regionLabel: string | undefined;
    if (!central) {
      const sido = regions.sido(sd);
      if (!sido) { unmapped++; continue; }
      sidoCode = sido.code;
      if (sg) {
        const sggs = regions.resolveSigungu(sido.name, sg);
        if (sggs.length === 0) { unmapped++; log(`[w100] 시군구 매핑 실패: ${sd} ${sg} (${id})`); continue; }
        scope = "sigungu";
        orgType = "local";
        sigunguCodes = sggs.map((s) => s.code);
        regionLabel = `${sido.short} ${sggs.map((s) => s.name).join("·")}`;
      } else if (sido.code === "36000") {
        scope = "sigungu";
        orgType = "metro";
        sigunguCodes = ["36110"];
        regionLabel = "세종";
      } else {
        scope = "sido";
        orgType = "metro";
        regionLabel = sido.name;
      }
    }

    const dept = cleanOrg(ex.d as string | undefined);
    const provision = ((it.pv as string[]) ?? []).filter(Boolean);
    const lifecycle = lifecycleCond((it.l as string[]) ?? []);
    const household = householdCond((it.h as string[]) ?? []);
    const summary = cleanText(it.o as string) ?? "";
    let logic: Cond | null = null;
    let origin: SourceRecord["draft"]["origin"] = "none";
    let unstructured: string[] = [];
    let core = false;
    // 이름에 드러난 대상 집단(예: '(북한이탈주민)', '장애인', '한부모')은 강한 신호로 함께 쓴다
    const fromName = extractFromText(name);
    const nameLogic = fromName.matched.length ? fromName.logic : null;
    const parts = [lifecycle, household, nameLogic].filter(Boolean) as Cond[];
    if (parts.length) {
      logic = parts.length === 1 ? parts[0] : all(...parts);
      origin = "bokjiro_tags";
    } else {
      const tx = extractFromText(summary);
      if (tx.logic) { logic = tx.logic; origin = "text_extract"; unstructured = tx.unstructured; core = tx.core; }
    }

    const rec: SourceRecord = {
      source: isWlf ? "bokjiro" : "welfare100",
      sourceId: id,
      name,
      key: nameKey(name),
      summary,
      orgType,
      scope,
      sidoCode,
      sigunguCodes,
      regionLabel,
      owner: central ? dept : dept ?? regionLabel,
      category: asCategory(it.c as string),
      tags: [...new Set([...(it.t as string[] ?? []), ...(it.l as string[] ?? []), ...(it.h as string[] ?? [])])],
      url: isWlf
        ? `https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=${id}&wlfareInfoReldBztpCd=${central ? "01" : "02"}`
        : undefined,
      provision,
      laws: ((ex.laws as string[]) ?? []).filter(Boolean),
      updatedAt: lite.asOf,
      fetchedAt,
      trust: isWlf ? "A" : "B",
      badges: financialBadge(name, provision) ? ["financial"] : [],
      draft: { origin, logic, unstructured, core },
    };
    if (!central && isEupmyeondongLevel(name, sg)) rec.excluded = "eupmyeondong_level";
    out.push(rec);
  }
  if (unmapped) log(`[w100] 지역 매핑 실패로 제외: ${unmapped}건`);
  return out;
}
