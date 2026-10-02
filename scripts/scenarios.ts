/** 예시 상황 4개의 판정 결과 점검: 탭별 개수(화면과 같은 묶음 기준, 기본 숨김 적용)·맞춤 추천 상위 5개·신청 유형별 개수·자동으로 받는 혜택 */
import fs from "node:fs";
import path from "node:path";
import { PRESETS } from "../src/lib/client/presets";
import { autoGroups, facetCounts, groupVariants, hiddenByDefault, scoreAll, topPicks, applyFilters, type Filters } from "../src/lib/client/results";
import type { Bundle, Program } from "../src/lib/data/types";

const B = path.resolve(__dirname, "../public/bundles/v1");
const read = (f: string): Bundle | null => (fs.existsSync(path.join(B, f)) ? JSON.parse(fs.readFileSync(path.join(B, f), "utf8")) : null);
const out: Record<string, unknown> = {};
const n = Number(process.argv[2] ?? 5);
const md: string[] = ["# 예시 상황별 상위 30개 신청 유형 점검 (자동 제외 전 추천 순서)", ""];
for (const ps of PRESETS) {
  const p = ps.profile;
  const programs: Program[] = [...(read(`sigungu/${p.sigungu}.json`)?.programs ?? []), ...(read(`sido/${p.sido}.json`)?.programs ?? []), ...(read("national.json")?.programs ?? [])];
  const scored = scoreAll(programs, p);
  const f: Filters = { tier: "eligible", category: null, org: null, q: "" };
  const c = facetCounts(scored, f).tiers;
  const raw = { eligible: 0, likely: 0, check: 0, ineligible: 0 } as Record<string, number>;
  scored.forEach((s) => raw[s.ev.tier]++);
  // 신청 유형별 개수: 조건 불일치·기본 숨김(교육청·복지 외 분야)을 뺀 사업 수
  const applyTypes: Record<string, number> = { self: 0, unknown: 0, auto: 0, institution: 0 };
  scored.filter((s) => s.ev.tier !== "ineligible" && !hiddenByDefault(s.program, f)).forEach((s) => applyTypes[s.program.applyType ?? "unknown"]++);
  const autos = autoGroups(scored, f);
  const top = topPicks(scored, {}, n).map((g) => `${g.lead.program.name} [${g.lead.ev.tier}·${g.lead.program.region?.label ?? "전국"}·${g.lead.program.applyType ?? "unknown"}·${g.lead.score.toFixed(1)}]`);
  const firstElig = groupVariants(applyFilters(scored, f)).slice(0, 5).map((g) => g.lead.program.name);
  // 자동 제외 전 추천 순서 상위 30 (점검용)
  const before = scored
    .filter((s) => (s.ev.tier === "eligible" || s.ev.tier === "likely") && !hiddenByDefault(s.program, f))
    .sort((a, b) => b.score + (b.ev.tier === "eligible" ? 2 : 0) - (a.score + (a.ev.tier === "eligible" ? 2 : 0)) || a.program.name.localeCompare(b.program.name, "ko"));
  const top30 = groupVariants(before).slice(0, 30);
  md.push(`## ${ps.title} (${ps.id})`, "", "| # | 사업 | 지역 | 판정 | 신청 유형 |", "|---|---|---|---|---|");
  top30.forEach((g, i) => md.push(`| ${i + 1} | ${g.lead.program.name} | ${g.lead.program.region?.label ?? "전국"} | ${g.lead.ev.tier} | ${g.lead.program.applyType ?? "unknown"} |`));
  md.push("");
  out[ps.id] = { groups: c, rawPrograms: raw, applyTypes, autoSection: autos.length, autoSamples: autos.slice(0, 10).map((g) => `${g.lead.program.name} [${g.lead.program.applyType}·${g.lead.ev.tier}]`), top, eligibleTab: firstElig };
  console.log(`\n## ${ps.title}`);
  console.log("묶음(화면) 기준:", c, " / 원 사업 수:", raw, " / 신청 유형:", applyTypes, " / 자동으로 받는 혜택 묶음:", autos.length);
  top.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
  console.log("  조건 충족 탭 상위:", firstElig.join(" | "));
  console.log("  자동으로 받는 혜택 상위:", autos.slice(0, 8).map((g) => g.lead.program.name).join(" | "));
}
fs.writeFileSync(path.resolve(__dirname, "../pipeline/out/scenarios.json"), JSON.stringify(out, null, 2));
fs.writeFileSync(path.resolve(__dirname, "../pipeline/out/scenarios-top30-applytype.md"), md.join("\n") + "\n");
