/** 예시 상황 4개의 판정 결과 점검: 탭별 개수(화면과 같은 묶음 기준, 기본 숨김 적용)와 맞춤 추천 상위 5개 */
import fs from "node:fs";
import path from "node:path";
import { PRESETS } from "../src/lib/client/presets";
import { facetCounts, scoreAll, topPicks, groupVariants, applyFilters, type Filters } from "../src/lib/client/results";
import type { Bundle, Program } from "../src/lib/data/types";

const B = path.resolve(__dirname, "../public/bundles/v1");
const read = (f: string): Bundle | null => (fs.existsSync(path.join(B, f)) ? JSON.parse(fs.readFileSync(path.join(B, f), "utf8")) : null);
const out: Record<string, unknown> = {};
const n = Number(process.argv[2] ?? 5);
for (const ps of PRESETS) {
  const p = ps.profile;
  const programs: Program[] = [...(read(`sigungu/${p.sigungu}.json`)?.programs ?? []), ...(read(`sido/${p.sido}.json`)?.programs ?? []), ...(read("national.json")?.programs ?? [])];
  const scored = scoreAll(programs, p);
  const f: Filters = { tier: "eligible", category: null, org: null, q: "" };
  const c = facetCounts(scored, f).tiers;
  const raw = { eligible: 0, likely: 0, check: 0, ineligible: 0 } as Record<string, number>;
  scored.forEach((s) => raw[s.ev.tier]++);
  const top = topPicks(scored, {}, n).map((g) => `${g.lead.program.name} [${g.lead.ev.tier}·${g.lead.program.region?.label ?? "전국"}·${g.lead.score.toFixed(1)}]`);
  const firstElig = groupVariants(applyFilters(scored, f)).slice(0, 5).map((g) => g.lead.program.name);
  out[ps.id] = { groups: c, rawPrograms: raw, top, eligibleTab: firstElig };
  console.log(`\n## ${ps.title}`);
  console.log("묶음(화면) 기준:", c, " / 원 사업 수:", raw);
  top.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log("  조건 충족 탭 상위:", firstElig.join(" | "));
}
fs.writeFileSync(path.resolve(__dirname, "../pipeline/out/scenarios.json"), JSON.stringify(out, null, 2));
