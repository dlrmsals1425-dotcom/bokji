import { describe, expect, it } from "vitest";
import { buildView, classify, classifyBase, extrasFromProfile, incomeExplain, plainLine, scoreV2, textGate, DIM_BY_ID, EMPTY_EXTRAS, type Situation } from "@/lib/client/v2";
import { evaluateRule } from "@/lib/engine/evaluate";
import { EMPTY_PROFILE, MEDIAN_INCOME_2026, incomeBandFor, medianWon, type Profile } from "@/lib/engine/profile";
import type { Program } from "@/lib/data/types";
import type { Cond, Rule } from "@/lib/engine/types";

const rule = (review: Rule["review"], logic: Cond | null): Rule => ({ id: "r", origin: "curated", review, logic, unstructured: [], unstructuredCore: false });
const prog = (name: string, over: Partial<Program> = {}): Program => ({
  id: name, name, summary: "", category: "생활지원", orgType: "central", scope: "national",
  sources: [{ source: "bokjiro", id: name, fetchedAt: "2026-10-07" }], trust: "A", rule: rule("curated", null), applyType: "self", ...over,
});
const AGE65: Cond = { field: "age", min: 65, label: "만 65세 이상" };
const OWNER: Profile = { ...EMPTY_PROFILE, sido: "41000", sigungu: "41110", age: "65-69", householdSize: 2 };
const sitOf = (p: Profile, x = EMPTY_EXTRAS): Situation => ({ profile: p, x });

describe("2026 기준 중위소득 (보건복지부)", () => {
  it("1~6인 표와 급여 기준선", () => {
    expect(MEDIAN_INCOME_2026[2]).toBe(4199292);
    expect(medianWon(32, 1)).toBe(820556);
    expect(medianWon(48, 4)).toBe(3117474);
  });
  it("월 소득 → 구간 (2인 300만원 ≈ 71% → 60% 초과~100% 이하)", () => {
    expect(incomeBandFor(3_000_000, 2)).toBe("100");
    expect(incomeBandFor(1_300_000, 2)).toBe("32");
    expect(incomeExplain(300, 2).pct).toBeCloseTo(71.4, 1);
  });
});

describe("원문 소득·수급 관문", () => {
  it("이름·대상의 '저소득' → low, '…우선'은 관문 아님, 여러 유형 중 일부만이면 관문 없음", () => {
    expect(textGate(prog("저소득 재가노인 식사배달", { rule: rule("curated", AGE65) })).gate?.kind).toBe("low");
    const pri = textGate(prog("어르신 문화누림", { target: "65세 이상 (저소득층 우선 선정)", rule: rule("curated", AGE65) }));
    expect(pri.gate).toBeNull();
    expect(pri.priority).toBe(true);
    const part = textGate(prog("노인일자리", { target: "○ 공익활동: 65세 이상 기초연금수급자\n○ 역량활용: 65세 이상\n○ 민간형: 60세 이상", rule: rule("curated", AGE65) }));
    expect(part.gate).toBeNull();
    expect(part.partial).toBe(true);
  });
  it("'일상생활이 어려운'은 저소득 아님", () => {
    expect(textGate(prog("노인장기요양보험", { summary: "혼자 일상생활이 어려운 어르신", rule: rule("curated", AGE65) })).gate).toBeNull();
  });
});

describe("상황 답으로 거르기", () => {
  const rec = prog("기초생활수급 노인 난방비", { target: "기초생활수급자", rule: rule("curated", AGE65) });
  const low = prog("저소득 어르신 식사배달", { rule: rule("curated", AGE65) });
  const flu = prog("독감 예방접종", { rule: rule("structured", AGE65) });
  it("모름이면 질문으로 정해짐 (ask), 답하면 빠지거나 맞음", () => {
    const s0 = sitOf(OWNER);
    const c = classify({ program: rec, ev: evaluateRule(rec.rule, OWNER), met: 1, score: 5, group: "g" }, s0);
    expect(c.bucket).toBe("ask");
    expect(c.dims).toContain("support");
    expect(classifyBase(rec, DIM_BY_ID.support.answers[0].apply(s0)).base).toBe("no");
    expect(classifyBase(rec, DIM_BY_ID.support.answers[1].apply(s0)).base).toBe("fit");
  });
  it("소득 월 300만원(2인) → 수급·차상위 아님으로 추정, 저소득 대상 빠짐, 나이 조건 사업은 그대로", () => {
    const s = sitOf(OWNER, { ...EMPTY_EXTRAS, incomeManwon: 300 });
    expect(classifyBase(rec, s).base).toBe("no");
    expect(classifyBase(low, s).base).toBe("no");
    expect(classifyBase(flu, s).base).toBe("fit");
    const v = buildView(scoreV2([rec, low, flu], s), s);
    expect(v.fit.map((g) => g[0].s.program.name)).toEqual(["독감 예방접종"]);
    expect(v.no).toHaveLength(2);
  });
  it("수급 아님 + 기초연금 모름 → 기초연금 조건은 '모름'으로 남음 (항목별 모름)", () => {
    const care = prog("노인맞춤돌봄", { rule: rule("curated", { all: [AGE65, { field: "benefit", anyOf: ["livelihood", "medical", "near_poverty", "basic_pension"], label: "수급·차상위·기초연금" }] }) });
    const s = DIM_BY_ID.support.answers[0].apply(sitOf(OWNER));
    expect(classifyBase(care, s).base).toBe("open");
    expect(classifyBase(care, DIM_BY_ID.basicPension.answers[0].apply(s)).base).toBe("fit");
    expect(classifyBase(care, DIM_BY_ID.basicPension.answers[1].apply(s)).base).toBe("no");
  });
  it("카드 문구는 사용자 말로 (소득 ○○만원 이하)", () => {
    const p = prog("소득 기준 사업", { rule: rule("structured", { all: [AGE65, { field: "income", lte: 100, label: "중위소득 100% 이하" }] }) });
    const s = sitOf(OWNER, { ...EMPTY_EXTRAS, incomeManwon: 300 });
    const it0 = classify({ program: p, ev: evaluateRule(p.rule, OWNER), met: 1, score: 5, group: "g" }, s);
    expect(it0.bucket).toBe("fit");
    expect(plainLine(it0, s, "parent")).toContain("가구 소득이 월 419만원 이하 (2인 가구 기준)");
  });
  it("기존 프로필(다중 항목 답함)은 항목별 예/아니오로 옮긴다", () => {
    const x = extrasFromProfile({ ...OWNER, benefits: ["basic_pension"] });
    expect(x.benefits.basic_pension).toBe(true);
    expect(x.benefits.livelihood).toBe(false);
  });
});
