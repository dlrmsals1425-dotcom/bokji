import { describe, expect, it } from "vitest";
import {
  DIM_BY_ID, EMPTY_EXTRAS, classify, classifyBase, dimAvailable, explainItem, incomePctOf, plainLine, textGate, toEval, topPicksV2,
  type Situation, type V2Item,
} from "@/lib/client/v2";
import { situationOf } from "@/lib/client/start";
import { PRESETS } from "@/lib/client/presets";
import { evaluateRule } from "@/lib/engine/evaluate";
import { EMPTY_PROFILE, type Profile } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";
import type { Cond, Rule } from "@/lib/engine/types";
import type { Scored } from "@/lib/client/results";

const rule = (review: Rule["review"], logic: Cond | null): Rule => ({ id: "r", origin: "curated", review, logic, unstructured: [], unstructuredCore: false });
const prog = (name: string, over: Partial<Program> = {}): Program => ({
  id: name, name, summary: "", category: "생활지원", orgType: "central", scope: "national",
  sources: [{ source: "bokjiro", id: name, fetchedAt: "2026-10-07" }], trust: "A", rule: rule("curated", null), applyType: "self", ...over,
});
const AGE65: Cond = { field: "age", min: 65, label: "만 65세 이상" };
const sc = (p: Program, s: Situation, score = 5, specific = true): Scored => {
  const { profile, opts } = toEval(s);
  return { program: p, ev: evaluateRule(p.rule, profile, opts), met: 1, score, group: p.name, specific } as Scored;
};

describe("본인 찾기 질문 (자녀·한부모 ↔ 기초연금·장기요양)", () => {
  const young: Situation = { profile: { ...EMPTY_PROFILE, age: "30-34" }, x: EMPTY_EXTRAS, mode: "self" };
  const senior: Situation = { profile: { ...EMPTY_PROFILE, age: "65-69" }, x: EMPTY_EXTRAS, mode: "self" };
  const unknownAge: Situation = { profile: EMPTY_PROFILE, x: EMPTY_EXTRAS, mode: "self" };
  const parent: Situation = { profile: EMPTY_PROFILE, x: EMPTY_EXTRAS, mode: "parent" };
  it("본인 60세 미만·나이 모름: 자녀 질문 O, 기초연금·장기요양 X", () => {
    for (const s of [young, unknownAge]) {
      expect(dimAvailable(DIM_BY_ID.children, s)).toBe(true);
      expect(dimAvailable(DIM_BY_ID.basicPension, s)).toBe(false);
      expect(dimAvailable(DIM_BY_ID.ltcGrade, s)).toBe(false);
    }
  });
  it("본인 60세 이상: 기초연금·장기요양 O, 자녀 X / 부모님: 나이 몰라도 기초연금 O, 자녀 X", () => {
    expect(dimAvailable(DIM_BY_ID.basicPension, senior)).toBe(true);
    expect(dimAvailable(DIM_BY_ID.children, senior)).toBe(false);
    expect(dimAvailable(DIM_BY_ID.basicPension, parent)).toBe(true);
    expect(dimAvailable(DIM_BY_ID.children, parent)).toBe(false);
  });
  it("자녀 수 → 다자녀 (3명 이상 예, 0·1명 아니오, 2명 모름)", () => {
    const t = (n: 0 | 1 | 2 | 3) => toEval({ ...young, x: { ...EMPTY_EXTRAS, childCount: n } });
    expect(t(3).profile.traits).toContain("multi_child");
    expect(t(1).profile.traits).not.toContain("multi_child");
    expect(t(1).opts.unknownTraits ?? []).not.toContain("multi_child");
    expect(t(2).profile.traits).toBeNull(); // 2명 → 다자녀 모름 (아는 특성 없음)
  });
});

describe("정확한 소득 %로 비교", () => {
  it("2인 300만원 ≈ 71% → 80% 이하 사업은 맞고 60% 이하는 아님", () => {
    const s: Situation = { profile: { ...EMPTY_PROFILE, householdSize: 2, age: "65-69" }, x: { ...EMPTY_EXTRAS, incomeManwon: 300 } };
    expect(incomePctOf(s)).toBeCloseTo(71.4, 1);
    const p80 = prog("물 요금 감면", { rule: rule("curated", { field: "income", lte: 80, label: "중위 80% 이하" }) });
    const p60 = prog("청년 지원", { rule: rule("curated", { field: "income", lte: 60, label: "중위 60% 이하" }) });
    expect(classifyBase(p80, s).base).toBe("fit");
    expect(classifyBase(p60, s).base).toBe("no");
  });
});

describe("다른 제도의 '수급자'는 기초생활수급 관문이 아님", () => {
  it("기초연금 수급자 → 기초연금 관문, 장기요양 수급자 → 관문 없음", () => {
    expect(textGate(prog("기초연금 수급자 확인서", { target: "기초연금 수급자", rule: rule("curated", AGE65) })).gate?.kind).toBe("basicPension");
    expect(textGate(prog("복지용구", { target: "장기 요양 1~2등급을 받은 수급자 및 3~5등급 수급자 중 시설급여 가능한 수급자", rule: rule("curated", AGE65) })).gate).toBeNull();
    expect(textGate(prog("가족요양비", { target: "65세 이상 국민(건강보험 적용자 + 의료급여 적용자)으로서 장기 요양등급을 받은 사람", rule: rule("curated", AGE65) })).gate).toBeNull();
    // 진짜 기초생활수급 관문은 그대로
    expect(textGate(prog("난방비", { target: "기초생활수급자", rule: rule("curated", AGE65) })).gate?.kind).toBe("recipient");
  });
});

describe("먼저 확인할 5가지 (v2)", () => {
  const s: Situation = { profile: { ...EMPTY_PROFILE, age: "70-74" }, x: EMPTY_EXTRAS };
  const item = (name: string, bucket: "fit" | "office", score: number, specific = true): V2Item[] => {
    const p = prog(name, { rule: rule("curated", AGE65) });
    const i = classify(sc(p, s, score, specific), s);
    return [{ ...i, bucket }];
  };
  it("'받으실 수 있어요' 가산, 같은 계열은 하나만, 내 상황을 콕 집은 사업 먼저", () => {
    const view = {
      fit: [item("가 지원", "fit", 5), item("양육비 이행 지원", "fit", 4), item("일반 지원", "fit", 9, false)],
      office: [item("나 지원", "office", 6.5), item("양육비 이행 원스톱", "office", 6.4), item("다 지원", "office", 1)],
    };
    const names = topPicksV2(view, 5).map((g) => g[0].s.program.name);
    expect(names).toHaveLength(5);
    // 콕 집은 사업 4개 + 일반 사업 1개 (관련도 순으로 정렬하면 일반 사업이 맨 앞)
    expect(names[0]).toBe("일반 지원");
    expect(names).toContain("가 지원");
    expect(names.filter((n) => n.startsWith("양육비 이행")).length).toBe(1);
  });
});

describe("상세: 내 답과 비교", () => {
  it("맞은 조건·어긋난 조건에 내 답을 붙인다", () => {
    const p = prog("어르신 지원", { rule: rule("curated", { all: [AGE65, { field: "householdSize", max: 1, label: "1인 가구" }] }) });
    const s: Situation = { profile: { ...EMPTY_PROFILE, age: "70-74", householdSize: 2 }, x: EMPTY_EXTRAS };
    const i = classify(sc(p, s), s);
    expect(i.bucket).toBe("no");
    const ex = explainItem(i, s);
    expect(ex.matched.find((l) => l.cond.includes("65세"))?.answer).toContain("70");
    expect(ex.failed.find((l) => l.cond.includes("혼자"))?.answer).toBe("2명 가구");
    expect(plainLine(i, s, "self")).toContain("맞지 않아요");
  });
});

describe("예시 상황 (현실적인 답 포함)", () => {
  it("모든 예시에 v2 답이 있고, 소득을 아는 예시는 월 소득이 있다", () => {
    for (const p of PRESETS) {
      expect(p.x, p.id).toBeTruthy();
      const s = situationOf(p.profile, p.x, p.mode ?? "self");
      expect(s.x).toBe(p.x);
    }
    expect(PRESETS.filter((p) => p.x.incomeManwon !== null).length).toBeGreaterThanOrEqual(4);
  });
  it("저장된 답이 없으면 프로필에서 만든다 (예전 입력 호환)", () => {
    const prof: Profile = { ...EMPTY_PROFILE, benefits: ["basic_pension"] };
    expect(situationOf(prof, null, "self").x.benefits.basic_pension).toBe(true);
  });
});
