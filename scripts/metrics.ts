/** 번들 지표: 신청방법·연락처 채움률, 수원 예시 판정 개수. npx tsx scripts/metrics.ts */
import fs from "node:fs";
import path from "node:path";
import { evaluateRule } from "../src/lib/engine/evaluate";
import { EMPTY_PROFILE, type Profile } from "../src/lib/engine/profile";
import type { Bundle, Program } from "../src/lib/data/types";

const B = path.resolve(__dirname, "../public/bundles/v1");
const read = (rel: string): Bundle | null => (fs.existsSync(path.join(B, rel)) ? JSON.parse(fs.readFileSync(path.join(B, rel), "utf8")) : null);
const all: Program[] = [];
const seen = new Set<string>();
const add = (b: Bundle | null) => b?.programs.forEach((p) => { const k = p.id.replace(/^g\d{5}\./, "g."); if (!seen.has(k)) { seen.add(k); all.push(p); } });
add(read("national.json"));
for (const f of fs.readdirSync(path.join(B, "sido"))) add(read(`sido/${f}`));
for (const f of fs.readdirSync(path.join(B, "sigungu"))) add(read(`sigungu/${f}`));
const pct = (n: number, d: number) => `${n}/${d} (${((100 * n) / d).toFixed(1)}%)`;
// 목록 번들은 가벼운 필드만 있으므로 채움률은 상세 샤드에서 센다
const details: Record<string, Program> = Object.assign({}, ...fs.readdirSync(path.join(B, "details")).map((f) => JSON.parse(fs.readFileSync(path.join(B, "details", f), "utf8"))));
const has = (p: Program, k: "applyMethod" | "contact") => { const d = details[p.id] ?? p; return !!(d[k] && String(d[k]).trim()); };
const fill = (list: Program[]) => ({
  programs: list.length,
  applyMethod: pct(list.filter((p) => has(p, "applyMethod")).length, list.length),
  contact: pct(list.filter((p) => has(p, "contact")).length, list.length),
  either: pct(list.filter((p) => has(p, "applyMethod") || has(p, "contact")).length, list.length),
});
const suwon = [...(read("national.json")?.programs ?? []), ...(read("sido/41000.json")?.programs ?? []), ...(read("sigungu/41110.json")?.programs ?? [])];
const tiers = (p: Profile) => {
  const t: Record<string, number> = { eligible: 0, likely: 0, check: 0, ineligible: 0 };
  for (const x of suwon) t[evaluateRule(x.rule, p).tier]++;
  return t;
};
const minimal: Profile = { ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", age: "75-79", householdSize: 1, traits: ["single"], benefits: ["basic_pension"], care: ["daily"] };
const demo: Profile = { ...minimal, children: [], housing: "own", car: "0", activity: "none" };
console.log(JSON.stringify({
  all: fill(all),
  gyeonggi: fill(all.filter((p) => p.region?.sido === "41000")),
  national: fill(all.filter((p) => p.scope === "national")),
  suwonPrograms: suwon.length,
  suwonMinimal: tiers(minimal),
  suwonDemo: tiers(demo),
}, null, 2));
