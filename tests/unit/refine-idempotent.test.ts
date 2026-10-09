/**
 * 규칙 다듬기(refine.ts)의 멱등성 — REFINE_VERSION 을 올려도 이미 다듬은 번들 규칙이 바뀌지 않아야 한다.
 *  (1) 같은 원문으로 두 번 다듬어도 한 번 다듬은 것과 같다 (전국 + 경기 시도·시군구 번들, 요약·상세 원문 모두)
 *  (2) 요약 번들(선정기준 전문 없음, 대상 400자)로 다시 다듬어도 파이프라인이 전문으로 다듬은 규칙 그대로다
 *      — 예: 안성 취약계층 응급지원은 대상 '90%'·선정기준 '100%'라 전문 기준 0~100% 구간이 맞는데,
 *        요약만 보고 다시 다듬으면 90%로 좁아졌다 (원문보다 좁은 규칙)
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REFINE_VERSION, refineProgram, refineRule } from "@/lib/data/refine";
import type { Program } from "@/lib/data/types";

const ROOT = "public/bundles/v1";
const load = (f: string): Program[] => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")).programs;
const hasBundles = fs.existsSync(path.join(ROOT, "national.json"));
const all = hasBundles ? ["national.json", ...["sido", "sigungu"].flatMap((d) => fs.readdirSync(path.join(ROOT, d)).map((f) => `${d}/${f}`))] : [];
const gyeonggi = all.filter((f) => f === "national.json" || /^(sido|sigungu)\/41/.test(f));
const details: Record<string, Program> = {};
if (hasBundles) for (const f of fs.readdirSync(path.join(ROOT, "details"))) Object.assign(details, JSON.parse(fs.readFileSync(path.join(ROOT, "details", f), "utf8")));

describe("옛 표시 refined: true", () => {
  it("원문 대조 단계가 생기기 전 표시라 원문 대조를 다시 적용한다", () => {
    const rule = { id: "r", origin: "gov24_conditions" as const, review: "structured" as const, logic: { field: "incomeBands" as const, bands: [[0, 50], [50, 75], [75, 100]] as [number, number][], label: "x" }, unstructured: [], unstructuredCore: false };
    expect(refineRule({ name: "x", target: "기준 중위소득 90% 이하" }, { ...rule, refined: true }).logic).toMatchObject({ field: "income", lte: 90 });
    expect(refineRule({ name: "x", target: "기준 중위소득 90% 이하" }, { ...rule, refined: 5 }).logic).toEqual(rule.logic);
  });
});

describe.skipIf(!hasBundles)("규칙 다듬기 멱등성", () => {
  it("같은 원문으로 두 번 다듬어도 한 번 다듬은 것과 같다 (전국 + 경기, 요약·상세)", () => {
    const diff: string[] = [];
    let n = 0;
    for (const f of gyeonggi) {
      for (const slim of load(f)) {
        for (const p of [slim, details[slim.id]]) {
          if (!p?.rule) continue;
          n++;
          const once = refineRule(p, { ...p.rule, refined: undefined });
          const twice = refineRule(p, { ...once, refined: undefined });
          if (JSON.stringify(twice) !== JSON.stringify(once)) diff.push(p.id);
          else expect(twice).toEqual(once);
        }
      }
    }
    expect(n).toBeGreaterThan(5000);
    expect(diff.slice(0, 20)).toEqual([]);
  });

  it("이전 버전으로 다듬은 요약 번들 규칙을 다시 다듬어도 그대로 (REFINE_VERSION 을 올려도 안전)", () => {
    const diff: string[] = [];
    let n = 0;
    for (const f of all) {
      for (const p of load(f)) {
        if (typeof p.rule?.refined !== "number") continue;
        n++;
        const again = refineProgram({ ...p, rule: { ...p.rule, refined: REFINE_VERSION - 1 } });
        if (JSON.stringify(again.rule.logic) !== JSON.stringify(p.rule.logic) || !!again.rule.meansTest !== !!p.rule.meansTest || !!again.rule.recBand !== !!p.rule.recBand) diff.push(`${p.id} ${p.name}`);
      }
    }
    expect(n).toBeGreaterThan(20000);
    expect(diff.slice(0, 20)).toEqual([]);
  });

  it("안성 취약계층 응급지원: 요약 번들(대상 90%)로 다시 다듬어도 선정기준 100%까지의 구간 유지", () => {
    const p = load("sigungu/41550.json").find((x) => x.id === "g41550.gov24-408000000534")!;
    const again = refineProgram({ ...p, rule: { ...p.rule, refined: REFINE_VERSION - 1 } });
    expect(again.rule.logic).toEqual(p.rule.logic);
    expect(again.rule.logic).toMatchObject({ field: "incomeBands" });
    // 상세(선정기준 전문 있음)로 다듬어도 같은 규칙
    expect(refineProgram({ ...details[p.id], rule: { ...p.rule, refined: REFINE_VERSION - 1 } }).rule.logic).toEqual(p.rule.logic);
  });
});
