/**
 * 규칙 다듬기(src/lib/data/refine.ts)·원문 관문(v2 textGate) 적용 건수 집계 — QA 1차 C3 확인용.
 *   npx tsx scripts/refine-stats.ts
 */
import fs from "node:fs";
import path from "node:path";
import { refineProgram } from "../src/lib/data/refine";
import { textGate } from "../src/lib/client/v2";
import type { Program } from "../src/lib/data/types";
import type { Cond, Leaf } from "../src/lib/engine/types";

const ROOT = "public/bundles/v1";
const files = ["national.json", ...["sido", "sigungu"].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).map((f) => `${d}/${f}`))];
const leaves = (c: Cond | null, o: Leaf[] = []): Leaf[] => (!c ? o : "all" in c ? (c.all.forEach((x) => leaves(x, o)), o) : "any" in c ? (c.any.forEach((x) => leaves(x, o)), o) : (o.push(c), o));
const st = { programs: 0, structuredIncome: 0, meansTest: 0, tightenedByText: 0, ltcAdded: 0, recipientGate: 0, recipientGateOverBand: 0, medianGate: 0, partialRec: 0, owner: 0 };
for (const f of files) {
  for (const p0 of JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")).programs as Program[]) {
    st.programs++;
    const p = refineProgram(p0);
    const before = leaves(p0.rule.logic), after = leaves(p.rule.logic);
    const bandBefore = before.some((l) => l.field === "incomeBands" && !l.soft);
    if (p0.rule.origin === "gov24_conditions" && bandBefore) st.structuredIncome++;
    if (p.rule.meansTest) st.meansTest++;
    else if (bandBefore && after.some((l) => l.field === "income" && /원문/.test(l.label))) st.tightenedByText++;
    if (after.length > before.length && after.some((l) => l.field === "unasked" && /장기요양등급/.test(l.label))) st.ltcAdded++;
    if (p.owner !== p0.owner) st.owner++;
    const g = textGate(p);
    if (g.gate?.kind === "recipient") { st.recipientGate++; if (bandBefore) st.recipientGateOverBand++; }
    if (g.gate?.kind === "median") st.medianGate++;
    if (g.partialRec) st.partialRec++;
  }
}
console.log(JSON.stringify(st, null, 2));
