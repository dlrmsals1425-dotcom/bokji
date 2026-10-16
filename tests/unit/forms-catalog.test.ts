import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { FormsCatalog, FormsCoverage, FormsRegionBundle } from "@/lib/data/forms";
import { validateFormLink, officialFormUrl } from "@/lib/data/formPublication";
import { detailBucket } from "@/lib/data/bucket";
import type { Program } from "@/lib/data/types";
const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(process.cwd(), file), "utf8"));
const coverage = read<FormsCoverage>("public/forms/v1/coverage.json");
const catalog = read<FormsCatalog>("public/forms/v1/catalog.json");
const regions = coverage.regions.map(region => read<FormsRegionBundle>(`public/forms/v1/programs/${region.key}.json`));
const programs = regions.flatMap(region => region.programs);

describe("generated national forms catalogue", () => {
  it("accounts for every unique existing welfare program exactly once", () => {
    const originals = ["national.json", ...["sido", "sigungu"].flatMap(scope => readdirSync(`public/bundles/v1/${scope}`).filter(name => name.endsWith(".json")).map(name => `${scope}/${name}`))];
    const sourceIds = new Set(originals.flatMap(file => read<{ programs: Program[] }>(`public/bundles/v1/${file}`).programs.map(program => program.id)));
    expect(coverage.totalPrograms).toBe(sourceIds.size);
    expect(programs).toHaveLength(sourceIds.size);
    expect(programs.every(program => sourceIds.has(program.id))).toBe(true);
    expect(new Set(programs.map(program => program.id)).size).toBe(programs.length);
    expect(Object.values(coverage.counts).reduce((a, b) => a + b, 0)).toBe(programs.length);
    for (const region of regions) {
      expect(region.programs).toHaveLength(region.region.total);
      for (const [status, count] of Object.entries(region.region.counts)) expect(region.programs.filter(program => program.status === status)).toHaveLength(count);
    }
  });
  it("publishes only dated, evidence-backed, same-jurisdiction applicant associations", () => {
    for (const row of programs.filter(program => program.links.length)) {
      expect(row.status).toBe("available");
      const original = read<Record<string, Program>>(`public/bundles/v1/details/${detailBucket(row.id)}.json`)[row.id];
      for (const link of row.links) expect(() => validateFormLink(original, catalog.forms[link.formId], link)).not.toThrow();
    }
    expect(programs.filter(program => program.status === "available")).toHaveLength(coverage.counts.available);
  });
  it("all downloadable originals retain their exact source bytes and have checked PDF previews", () => {
    const published = Object.values(catalog.forms).filter(form => form.file);
    const linkedIds = new Set(programs.flatMap(program => program.links.map(link => link.formId)));
    expect(linkedIds.size).toBe(coverage.publishedForms);
    for (const id of linkedIds) {
      const form = catalog.forms[id];
      expect(form).toBeTruthy();
      if (!form.file) {
        expect(officialFormUrl(form.sourceUrl)).toBeTruthy();
        expect(new URL(form.sourceUrl).pathname).toMatch(/\/flDownload\.do$/);
        if (form.officialPdfUrl) expect(officialFormUrl(form.officialPdfUrl)).toBeTruthy();
      }
    }
    for (const form of published) {
      const bytes = readFileSync(path.join(process.cwd(), "public", form.file!.hwp));
      const source = readFileSync(path.join(process.cwd(), "pipeline/forms/originals", form.id + ".hwp"));
      expect(bytes.equals(source)).toBe(true);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(form.file!.sha256);
      expect(form.file!.pdf).toBeTruthy();
      expect(existsSync(path.join(process.cwd(), "public", form.file!.pdf!))).toBe(true);
      expect(readFileSync(path.join(process.cwd(), "public", form.file!.pdf!)).subarray(0, 5).toString()).toBe("%PDF-");
    }
    expect(readdirSync("public/forms/files")).toHaveLength(published.length * 2);
  });
  it("deleted/administrative records do not publish files and unrelated Goyang forms do not leak to other areas", () => {
    for (const form of Object.values(catalog.forms)) {
      if (["administrative", "deleted", "reference"].includes(form.role)) expect(form.file).toBeUndefined();
    }
    expect(programs.filter(program => program.areaKey !== "g41280").every(program => program.links.every(link => catalog.forms[link.formId].regionCode !== "41280"))).toBe(true);
    const sickLeave = programs.find(program => program.id === "g41280.bokjiro-WLF00004751")!;
    expect(sickLeave.links).toEqual([]);
    expect(sickLeave.status).not.toBe("available");
  });
  it("a completed portal scan covers every program and each shard preserves its form records", () => {
    expect(coverage.portalScan?.status).toBe("complete");
    expect(coverage.portalScan?.checkedPrograms).toBe(programs.length);
    expect(programs.every(program => program.portalSearch && program.portalSearch.outcome !== "incomplete")).toBe(true);
    const sharded = new Map<string, string>();
    for (const file of readdirSync("public/forms/v1/catalog").filter(name => name.endsWith(".json"))) {
      for (const form of Object.values(read<FormsCatalog>(`public/forms/v1/catalog/${file}`).forms)) {
        expect(detailBucket(form.id) + ".json").toBe(file);
        expect(sharded.has(form.id)).toBe(false);
        sharded.set(form.id, JSON.stringify(form));
      }
    }
    expect(sharded.size).toBe(Object.keys(catalog.forms).length);
    for (const form of Object.values(catalog.forms)) expect(sharded.get(form.id)).toBe(JSON.stringify(form));
    expect(programs.every(program => program.candidateFormIds.every(id => !!catalog.forms[id]))).toBe(true);
  });
});
