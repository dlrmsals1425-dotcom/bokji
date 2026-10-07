/**
 * 예시 상황 5개 + 운영자 문장: v1(기존 판정) 추천 5개 vs v2(상황 먼저) 먼저 확인할 5개 비교 → docs/v2-scenarios.md
 *   npx tsx scripts/compare-v1-v2.ts
 */
import fs from "node:fs";
import path from "node:path";
import { PRESETS } from "../src/lib/client/presets";
import { parseSituation } from "../src/lib/client/parse";
import { facetCounts, scoreAll, topPicks } from "../src/lib/client/results";
import { autoV2, buildView, extrasFromProfile, plainLine, scoreV2, topPicksV2, DIM_BY_ID, type Situation } from "../src/lib/client/v2";
import type { FindMode } from "../src/lib/client/mode";
import type { Bundle, Program } from "../src/lib/data/types";

const B = path.resolve(__dirname, "../public/bundles/v1");
const read = (f: string): Bundle | null => (fs.existsSync(path.join(B, f)) ? JSON.parse(fs.readFileSync(path.join(B, f), "utf8")) : null);
const OWNER = "수원시 소재에 계시고 59년생 부모님 두분이 계신다";
const owner = parseSituation(OWNER, JSON.parse(fs.readFileSync(path.join(B, "regions.json"), "utf8")), { year: 2026, month: 10, day: 7 });

interface Sc { id: string; title: string; v1: Situation["profile"]; sit: Situation; after?: { label: string; sit: Situation } }
const scs: Sc[] = PRESETS.map((p) => ({ id: p.id, title: p.title, v1: p.profile, sit: { profile: p.profile, x: p.x, mode: (p.mode ?? "self") as FindMode } }));
const ownerSit: Situation = { profile: owner.profile, x: extrasFromProfile(owner.profile), mode: "parent" };
scs.push({
  id: "owner-suwon-59", title: `운영자 문장 '${OWNER}'`, v1: owner.profile, sit: ownerSit,
  after: { label: "수급 아님 + 소득 월 300만원", sit: DIM_BY_ID.support.answers[0].apply({ ...ownerSit, x: { ...ownerSit.x, incomeManwon: 300 } }) },
});

const md: string[] = ["# 예시 상황별 v1 ↔ v2 비교 (먼저 확인할 5개·분류별 개수)", "", `생성: scripts/compare-v1-v2.ts · 개수는 화면과 같은 묶음(지역 변형 하나로) 기준`, ""];
const out: Record<string, unknown> = {};
for (const sc of scs) {
  const p = sc.v1;
  const programs: Program[] = [...(read(`sigungu/${p.sigungu}.json`)?.programs ?? []), ...(read(`sido/${p.sido}.json`)?.programs ?? []), ...(read("national.json")?.programs ?? [])];
  const s1 = scoreAll(programs, p);
  const t1 = facetCounts(s1, { tier: "eligible", category: null, org: null, q: "" }).tiers;
  const top1 = topPicks(s1, {}, 5).map((g) => `${g.lead.program.name} (${g.lead.ev.tier})`);
  const run = (sit: Situation) => {
    const v = buildView(scoreV2(programs, sit), sit, 12);
    const top = topPicksV2(v, 5);
    const qs = v.questions.slice(0, 3);
    return { v, top, qs, autos: autoV2(programs, sit).length };
  };
  const a = run(sc.sit);
  const line = (r: ReturnType<typeof run>) => `받으실 수 있어요 ${r.v.fit.length} · 신청할 때 확인 ${r.v.office.length} · 답하면 정해져요 ${r.v.ask.length} · 뺐어요 ${r.v.no.length} (자동으로 받는 혜택 ${r.autos})`;
  md.push(`## ${sc.title} (${sc.id})`, "");
  md.push(`- v1: 조건 충족 ${t1.eligible} · 가능성 있음 ${t1.likely} · 확인 필요 ${t1.check} · 불일치 ${t1.ineligible}`);
  md.push(`- v2: ${line(a)}`);
  md.push(`- v2 추가 질문: ${a.qs.map((q) => `${q.dim.q(sc.sit.mode ?? "self")} (${q.groups}개)`).join(" / ") || "없음"}`);
  md.push("", "| # | v1 추천 5개 | v2 먼저 확인할 5개 | v2 카드 문구 |", "|---|---|---|---|");
  for (let i = 0; i < 5; i++) {
    const g = a.top[i];
    md.push(`| ${i + 1} | ${top1[i] ?? ""} | ${g ? `${g[0].s.program.name} (${g[0].bucket === "fit" ? "받으실 수 있어요" : "신청할 때 확인"})` : ""} | ${g ? plainLine(g[0], sc.sit, sc.sit.mode ?? "self").replace(/\|/g, "/") : ""} |`);
  }
  md.push("");
  const rec: Record<string, unknown> = { v1: { tiers: t1, top5: top1 }, v2: { counts: { fit: a.v.fit.length, office: a.v.office.length, ask: a.v.ask.length, no: a.v.no.length, autos: a.autos }, top5: a.top.map((g) => `${g[0].s.program.name} [${g[0].bucket}]`), questions: a.qs.map((q) => `${q.dim.id}:${q.groups}`), fitNames: a.v.fit.map((g) => g[0].s.program.name) } };
  console.log(`\n## ${sc.title}\n v1 ${JSON.stringify(t1)}\n v1 top5: ${top1.join(" | ")}\n v2 ${line(a)}\n v2 top5: ${a.top.map((g) => `${g[0].s.program.name}[${g[0].bucket}]`).join(" | ")}\n Q: ${a.qs.map((q) => `${q.dim.id}:${q.groups}`).join(", ")}\n fit: ${a.v.fit.slice(0, 15).map((g) => g[0].s.program.name).join(" / ")}\n office top10: ${a.v.office.slice(0, 10).map((g) => g[0].s.program.name).join(" / ")}`);
  if (sc.after) {
    const b = run(sc.after.sit);
    md.push(`- 답한 뒤 (${sc.after.label}): ${line(b)}`, `- 답한 뒤 먼저 확인할 5개: ${b.top.map((g) => g[0].s.program.name).join(" · ")}`, `- 다음 질문: ${b.qs.map((q) => `${q.dim.id} (${q.groups}개)`).join(", ") || "없음"}`, "");
    rec.after = { fit: b.v.fit.length, office: b.v.office.length, ask: b.v.ask.length, no: b.v.no.length, top5: b.top.map((g) => g[0].s.program.name) };
    console.log(` AFTER ${sc.after.label}: ${line(b)}\n  top5: ${b.top.map((g) => `${g[0].s.program.name}[${g[0].bucket}]`).join(" | ")}\n  Q: ${b.qs.map((q) => `${q.dim.id}:${q.groups}`).join(", ")}`);
  }
  out[sc.id] = rec;
}
fs.writeFileSync(path.resolve(__dirname, "../docs/v2-scenarios.md"), md.join("\n") + "\n");
if (process.argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
