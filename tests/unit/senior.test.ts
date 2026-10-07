import { describe, expect, it } from "vitest";
import { adjustEvaluation, evaluateProgram, scoreAll, topPicks } from "@/lib/client/results";
import { coupleNote, householdLabel } from "@/lib/client/mode";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";
import type { Cond, Rule } from "@/lib/engine/types";

const rule = (review: Rule["review"], logic: Cond | null): Rule => ({ id: "r", origin: "curated", review, logic, unstructured: [], unstructuredCore: false });
const prog = (name: string, over: Partial<Program> = {}): Program => ({
  id: name, name, summary: "", category: "신체건강", orgType: "central", scope: "national",
  sources: [{ source: "bokjiro", id: name, fetchedAt: "2026-10-07" }], trust: "A", rule: rule("curated", null), ...over,
});
const AGE65: Cond = { field: "age", min: 65, label: "만 65세 이상" };
const AGE60: Cond = { field: "age", min: 60, label: "만 60세 이상" };
const OWNER: Profile = { ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", age: "65-69", householdSize: 2 };

describe("저소득 대상 사업은 나이만으로 '조건 충족' 아님", () => {
  const eye = prog("노인 안검진·개안수술", { summary: "저소득층 백내장 등 개안수술비 지원", rule: rule("curated", AGE60) });
  it("소득 모름 → 가능성 있음 + 소득 확인 사유", () => {
    const ev = evaluateProgram(eye, OWNER);
    expect(ev.tier).toBe("likely");
    expect(ev.reasons.some((r) => r.kind === "unknown" && r.text.startsWith("소득 확인"))).toBe(true);
    expect(ev.headline).toContain("소득 확인");
  });
  it("수급·저소득 입력 시에는 그대로 조건 충족", () => {
    expect(evaluateProgram(eye, { ...OWNER, benefits: ["livelihood"] }).tier).toBe("eligible");
    expect(evaluateProgram(eye, { ...OWNER, income: "50" }).tier).toBe("eligible");
  });
  it("저소득 문구가 없거나 '수급자 제외'면 보정하지 않음", () => {
    expect(evaluateProgram(prog("폐렴구균", { rule: rule("structured", AGE65) }), OWNER).tier).toBe("eligible");
    const ex = prog("어떤 지원", { target: "65세 이상 (기초생활수급자는 제외)", rule: rule("curated", AGE65) });
    expect(evaluateProgram(ex, OWNER).tier).toBe("eligible");
    const ev = { tier: "likely" as const, reasons: [], headline: "" };
    expect(adjustEvaluation(prog("저소득 X"), ev, OWNER)).toBe(ev);
  });
});

describe("65세 핵심 혜택 가산 · 장애 '모름' 처리", () => {
  const pool: Program[] = [
    // 실제 데이터처럼 핵심 복지 100선 원천을 함께 가진 사업
    prog("기초연금", { sources: [{ source: "welfare100", id: "basic-pension", fetchedAt: "2026-10-07" }], rule: rule("curated", { all: [AGE65, { field: "unasked", label: "소득하위 70%" }] }) }),
    prog("인플루엔자 국가예방접종 지원", { rule: rule("curated", AGE65) }),
    prog("65세 이상 폐렴구균 국가예방접종사업", { rule: rule("structured", AGE65) }),
    prog("장애수당", { rule: rule("curated", { all: [{ field: "age", min: 18, label: "만 18세 이상" }, { field: "disability", anyOf: ["self"], label: "등록장애인 본인" }] }) }),
    prog("장애인연금", { rule: rule("curated", { all: [{ field: "age", min: 18, label: "만 18세 이상" }, { field: "disability", anyOf: ["self"], severity: "severe", label: "중증 장애인 본인" }] }) }),
    prog("노인 무릎인공관절 수술 지원", { rule: rule("curated", AGE60) }),
    prog("경로당 프로그램", { rule: rule("auto", AGE60) }),
  ];
  it("65세 이상이면 기초연금·독감·폐렴구균이 맨 위, 장애 전용 사업은 뒤로 (목록에는 남음)", () => {
    const sc = scoreAll(pool, OWNER);
    const top3 = topPicks(sc, {}, 3).map((g) => g.lead.program.name);
    expect(top3).toEqual(expect.arrayContaining(["기초연금", "인플루엔자 국가예방접종 지원", "65세 이상 폐렴구균 국가예방접종사업"]));
    const names = sc.map((s) => s.program.name);
    expect(names.indexOf("장애수당")).toBeGreaterThan(names.indexOf("노인 무릎인공관절 수술 지원"));
    expect(sc.find((s) => s.program.name === "장애수당")!.ev.tier).toBe("likely");
  });
  it("64세 이하에는 가산하지 않음", () => {
    const young = scoreAll(pool, { ...OWNER, age: "60-64" });
    expect(young.find((s) => s.program.name === "기초연금")!.ev.tier).toBe("ineligible");
  });
  it("장애가 있는 가구원(member)이면 장애인 본인 사업을 대리 신청 후보로 올린다", () => {
    const fam = scoreAll(pool, { ...OWNER, disability: "member" });
    const unk = scoreAll(pool, OWNER);
    const s = (arr: typeof fam) => arr.find((x) => x.program.name === "장애수당")!.score;
    expect(s(fam)).toBeGreaterThan(s(unk));
  });
});

describe("부모님 두 분 안내", () => {
  it("가구원 수 이름", () => {
    expect(householdLabel("parent", 2)).toBe("2명 (부부 두 분 등)");
    expect(householdLabel("parent", 1)).toBe("1명 (혼자 사심)");
    expect(householdLabel("self", 2)).toBe("2명");
    expect(householdLabel("self", 6)).toBe("6명 이상");
  });
  it("기초연금 부부 감액 안내는 부모님 모드 · 2인 · 60세 이상에서만", () => {
    expect(coupleNote("parent", { householdSize: 2, age: "65-69" })).toMatch(/각각 20%가 감액/);
    expect(coupleNote("self", { householdSize: 2, age: "65-69" })).toBeNull();
    expect(coupleNote("parent", { householdSize: 1, age: "65-69" })).toBeNull();
    expect(coupleNote("parent", { householdSize: 2, age: "50-59" })).toBeNull();
  });
});
