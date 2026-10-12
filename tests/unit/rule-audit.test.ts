/**
 * QA 2차 C3: 규칙 전수 감사 — 번들 전체(전국·시도·시군구)와 상세 샤드를 읽어
 *  (A) 원문(대상 + 선정기준 전문)이 수급·차상위 자격인데 소득 코드(0~50%)만으로 판정하는 규칙이 없어야 하고
 *  (B) 규칙의 소득 상한이 원문 '중위소득 N%'보다 5%p 넘게 넓은 규칙이 없어야 한다.
 *  (C) (QA 3차 R4) 0부터 이어진 정부24 소득 코드가 원문 '중위소득 N%'보다 5%p 넘게 좁은 규칙도 없어야 한다 (받을 수 있는 사람을 빼는 쪽).
 * 실패하면 pipeline/refine 이 새 원문 유형을 놓친 것 — src/lib/data/refine.ts 를 고친 뒤 `npm run pipeline`.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { textGate } from "@/lib/client/v2";
import { REC_TEXT, refineProgram, sourceMedianCap, sourceMedianCapForWiden } from "@/lib/data/refine";
import type { Program } from "@/lib/data/types";
import type { Cond, Leaf } from "@/lib/engine/types";

const ROOT = "public/bundles/v1";
const files = ["national.json", ...["sido", "sigungu"].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).map((f) => `${d}/${f}`))];
const details: Record<string, Program> = {};
for (const f of fs.readdirSync(path.join(ROOT, "details"))) Object.assign(details, JSON.parse(fs.readFileSync(path.join(ROOT, "details", f), "utf8")));
const leaves = (c: Cond | null, o: Leaf[] = []): Leaf[] => (!c ? o : "all" in c ? (c.all.forEach((x) => leaves(x, o)), o) : "any" in c ? (c.any.forEach((x) => leaves(x, o)), o) : (o.push(c), o));
const leafMax = (l: Leaf) => (l.field === "income" ? l.lte : l.field === "incomeBands" ? Math.max(...l.bands.map((b) => b[1] ?? Infinity)) : Infinity);
const MED = /중위\s*(?:소득\s*)?(?:의\s*)?\d{2,3}\s*%/;

type Row = { id: string; name: string; why: string };
const recBandOnly: Row[] = [];
const wider: Row[] = [];
const narrower: Row[] = [];
let checkedC = 0;
let checkedA = 0;
let checkedB = 0;
for (const f of files) {
  for (const slim0 of JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")).programs as Program[]) {
    const d = details[slim0.id];
    if (!d || slim0.rule?.origin !== "gov24_conditions") continue;
    const src = `${d.target ?? ""}\n${d.criteria ?? ""}`.replace(/&#13;/g, "\n");
    for (const p of [refineProgram(slim0), refineProgram(d)]) {
      const ls = leaves(p.rule.logic);
      const inc = ls.filter((l) => !l.soft && (l.field === "income" || l.field === "incomeBands"));
      const max = inc.length ? Math.min(...inc.map(leafMax)) : Infinity;
      const g = textGate(p);
      // (QA 9차) '생계 및 의료급여 대상자가 아닌 자'처럼 수급자를 빼는 원문은 수급자 대상이 아님 (한부모가정 의료보험)
      const negRec = /(?:수급|급여|차상위)[^\n]*(?:아닌\s*(?:자|사람|분|가구)|아니어야)/.test(src);
      if (inc.length && max <= 50 && REC_TEXT.test(src) && !MED.test(src) && !negRec && !ls.some((l) => !l.soft && l.field === "benefit")) {
        checkedA++;
        if (!(p.rule.meansTest || g.gate?.kind === "recipient" || g.partialRec)) recBandOnly.push({ id: p.id, name: p.name, why: `소득 ${max}%만으로 판정` });
      }
      const cap = sourceMedianCap(d);
      if (cap !== null && inc.length) {
        checkedB++;
        const eff = Math.min(max, g.gate?.kind === "median" ? g.gate.pct : Infinity);
        if (eff > cap + 5) wider.push({ id: p.id, name: p.name, why: `원문 ${cap}% / 규칙 ${eff}%` });
      }
      // (C) 좁은 쪽: 원문 비율(우선·가점 문구 제외)보다 규칙 상한이 5%p 넘게 낮음
      const wcap = sourceMedianCapForWiden(d);
      if (wcap !== null && inc.length) {
        checkedC++;
        if (max < wcap - 5) narrower.push({ id: p.id, name: p.name, why: `원문 ${wcap}% / 규칙 ${max}%` });
      }
    }
  }
}

if (process.env.AUDIT_LOG) console.log({ checkedA, checkedB, recBandOnly: recBandOnly.length, wider: wider.length, checkedC, narrower: narrower.length, ex: narrower.slice(0, 30) });
describe("규칙 전수 감사 (QA 2차 C3)", () => {
  it("검사 대상이 실제로 있음 (번들을 읽었는지)", () => {
    expect(checkedA).toBeGreaterThan(300);
    expect(checkedB).toBeGreaterThan(300);
  });
  it("원문이 수급·차상위인데 소득 구간만으로 '받으실 수 있어요'가 되는 규칙 0건", () => {
    expect(recBandOnly.slice(0, 20)).toEqual([]);
  });
  it("원문 '중위소득 N%'보다 넓은 규칙 0건", () => {
    expect(wider.slice(0, 20)).toEqual([]);
  });
  it("원문 '중위소득 N%'보다 좁은 규칙 0건 (QA 3차 R4)", () => {
    expect(checkedC).toBeGreaterThan(100);
    expect(narrower.slice(0, 20)).toEqual([]);
  });
});
