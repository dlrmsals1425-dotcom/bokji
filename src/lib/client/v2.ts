/**
 * v2 시험판 (운영자 피드백 2026-10-07): '내 상황'을 먼저 받고, 답한 사실과 맞지 않는 혜택은 본문에서 빼고,
 * '모름'으로 남은 조건은 짧은 추가 질문(예/아니오/모름)으로 바로 다시 거른다.
 * 순수 함수 (브라우저·스크립트 공용). 프로필은 기기 밖으로 보내지 않는다.
 */
import { evaluateCond, evaluateRule } from "../engine/evaluate";
import {
  BASIC_PENSION_THRESHOLD_2026, BENEFITS, HOUSEHOLD_TRAITS, INCOME_BANDS, ageRange, incomeBandFor, incomeRange, medianWon,
  type Benefit, type HouseholdTrait, type IncomeBand, type Profile,
} from "../engine/profile";
import type { Cond, EvalOptions, Evaluation, Leaf, Reason } from "../engine/types";
import type { Program } from "../data/types";
import { autoLike, groupVariants, hiddenByDefault, scoreAll, type Filters, type Group, type Scored } from "./results";
import type { FindMode } from "./mode";

/* ---------------- 입력 (12개 항목 + 항목별 '모름') ---------------- */

/** 간편 입력 밖의 사실 — 원문 '묻지 않는 조건'과 이름으로 이어 붙인다 */
export const FACT_PATTERNS = {
  ltcGrade: /장기\s*요양\s*(등급|인정|수급)|요양\s*등급|등급\s*판정/,
  pension70: /소득\s*하위\s*70|선정\s*기준액/,
  illness: /질병|질환|환자|투병|희귀|난치|중증\s*환자/,
} as const;
export type FactId = keyof typeof FACT_PATTERNS;

export interface Extras {
  /** 수급·자격 항목별 답 (키 없음 = 모름) */
  benefits: Partial<Record<Benefit, boolean>>;
  /** 가구 특성 항목별 답 (키 없음 = 모름) */
  traits: Partial<Record<HouseholdTrait, boolean>>;
  /** 월 가구 소득(만원). null = 모름 → 프로필의 소득 구간을 그대로 쓴다 */
  incomeManwon: number | null;
  facts: Partial<Record<FactId, boolean>>;
}

export interface Situation {
  profile: Profile;
  x: Extras;
}

export const EMPTY_EXTRAS: Extras = { benefits: {}, traits: {}, incomeManwon: null, facts: {} };

/** 기존 프로필(12개 항목)에서 v2 입력을 만든다 — 다중 선택 항목은 '답함'이면 모든 하위 항목을 예/아니오로 */
export function extrasFromProfile(p: Profile): Extras {
  const benefits: Extras["benefits"] = {};
  if (p.benefits) for (const b of BENEFITS) benefits[b] = p.benefits.includes(b);
  const traits: Extras["traits"] = {};
  if (p.traits) for (const t of HOUSEHOLD_TRAITS) traits[t] = p.traits.includes(t);
  return { benefits, traits, incomeManwon: null, facts: {} };
}

const sizeOf = (p: Profile) => (p.householdSize === "unknown" ? null : p.householdSize);

/** 소득 구간 (월 소득 입력이 있으면 그것으로) */
export function incomeOf(s: Situation): Profile["income"] {
  const size = sizeOf(s.profile);
  return s.x.incomeManwon !== null && size !== null ? incomeBandFor(s.x.incomeManwon * 10000, size) : s.profile.income;
}

/**
 * 답에서 미루어 아는 것: 소득이 기준 중위소득 60%를 넘으면 기초생활보장(생계·의료·주거·교육급여, 50% 이하)·차상위(50% 이하)는 아님.
 * (소득인정액에는 재산 환산액이 더해지므로 소득만 보면 실제보다 낮게 잡힐 수는 있어도 높게 잡히지는 않는다는 가정 — 근로소득 공제가 큰 경우는 예외 → 60%로 여유)
 */
export function inferExtras(s: Situation): Extras {
  const inc = incomeOf(s);
  if (inc === "unknown" || incomeRange(inc)[0] < LOW_INCOME_PCT) return s.x;
  const b = { ...s.x.benefits };
  let changed = false;
  for (const k of RECIPIENT_KINDS) {
    if (b[k] !== undefined) continue;
    b[k] = false;
    changed = true;
  }
  return changed ? { ...s.x, benefits: b } : s.x;
}

/** 미루어 본 답이 있는지 (화면 안내용) */
export const inferredNoRecipient = (s: Situation) => RECIPIENT_KINDS.some((k) => s.x.benefits[k] === undefined) && inferExtras(s) !== s.x;

/** v2 입력 → 판정용 프로필 + 판정 선택 사항 */
export function toEval(s: Situation, strict = false): { profile: Profile; opts: EvalOptions } {
  const p = s.profile;
  const x = inferExtras(s);
  const bKnown = BENEFITS.filter((b) => x.benefits[b] !== undefined);
  const size = sizeOf(p);
  const traitsMap = { ...x.traits };
  if (size !== null) traitsMap.single = size === 1;
  const tKnown = HOUSEHOLD_TRAITS.filter((t) => traitsMap[t] !== undefined);
  const income = incomeOf(s);
  const facts: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(x.facts)) if (v !== undefined) facts[k] = v;
  // 기초연금을 받고 있으면 '소득 하위 70%' 조건은 이미 맞음 (안 받는다고 아니라고 볼 수는 없음)
  if (x.benefits.basic_pension === true) facts.pension70 = true;
  return {
    profile: {
      ...p,
      income,
      benefits: bKnown.length ? BENEFITS.filter((b) => x.benefits[b] === true) : null,
      traits: tKnown.length ? HOUSEHOLD_TRAITS.filter((t) => traitsMap[t] === true) : null,
    },
    opts: {
      facts, factPatterns: FACT_PATTERNS, withLeaf: true, strictSoft: strict,
      unknownBenefits: bKnown.length ? BENEFITS.filter((b) => x.benefits[b] === undefined) : undefined,
      unknownTraits: tKnown.length ? HOUSEHOLD_TRAITS.filter((t) => traitsMap[t] === undefined) : undefined,
    },
  };
}

/* ---------------- 원문 문구의 소득·수급 관문 ---------------- */

export type Gate =
  | { kind: "recipient"; text: string }
  | { kind: "low"; text: string }
  | { kind: "median"; pct: number; text: string }
  | { kind: "basicPension"; text: string };

const RECIPIENT_KINDS: Benefit[] = ["livelihood", "medical", "housing", "education", "near_poverty"];
const PRIORITY = /(저소득|기초\s*생활\s*수급자?|수급자|차상위\s*(계층)?|취약\s*계층|의료\s*급여\s*수급자|기초\s*연금\s*수급자)[^.。\n]{0,15}우선/g;
const EXCLUDED = /(수급자|차상위|의료\s*급여)[^.。\n]{0,8}(은|는)?\s*제외/;
const RECIPIENT_RE = /(기초\s*생활\s*(보장\s*)?수급|생계\s*급여|의료\s*급여|주거\s*급여|수급자|수급권자|차상위)/;
const LOW_RE = /(저소득|취약\s*계층|형편이?\s*어려운|생계가?\s*어려운|경제적(으로)?\s*어려운|소외\s*계층|빈곤)/;
const MEDIAN_RE = /중위\s*소득\s*(\d{2,3})\s*%\s*(이하|이내|미만)/;
const BASIC_PENSION_RE = /기초\s*연금\s*(수급|대상|받)/;
const ANY_GATE = new RegExp(`${RECIPIENT_RE.source}|${LOW_RE.source}|${MEDIAN_RE.source}|기초\\s*연금`);

function leavesOf(c: Cond | null, out: Leaf[] = []): Leaf[] {
  if (!c) return out;
  if ("all" in c) c.all.forEach((x) => leavesOf(x, out));
  else if ("any" in c) c.any.forEach((x) => leavesOf(x, out));
  else out.push(c);
  return out;
}

const gateCache = new WeakMap<Program, { gate: Gate | null; priority: boolean; partial: boolean }>();

/**
 * 규칙이 소득·수급을 다루지 않는데 원문에 소득·수급 대상이 적힌 경우의 관문.
 *  - 읽는 곳: 이름 + 지원 대상(앞 300자). 대상이 비어 있으면 요약의 앞부분(20자 안)만
 *  - '…우선' 은 관문이 아님 (priority 로 따로 알림)
 *  - 대상이 여러 유형(○ 줄)으로 나뉘고 소득·수급 조건이 없는 유형이 있으면 관문 없음 (partial)
 */
export function textGate(p: Program): { gate: Gate | null; priority: boolean; partial: boolean } {
  const hit = gateCache.get(p);
  if (hit) return hit;
  const target = (p.target ?? "").replace(/&#13;/g, "\n").slice(0, 300);
  const summary = p.summary ?? "";
  const lead = target.trim() ? target : summary.slice(0, 20);
  const raw = `${p.name}\n${lead}`;
  const text = raw.replace(PRIORITY, " ");
  const priority = text !== raw || PRIORITY.test(summary);
  PRIORITY.lastIndex = 0;
  let gate: Gate | null = null;
  let partial = false;
  // 규칙이 소득·수급을 '확정 조건'으로 다루면 관문을 따로 두지 않는다 (soft = 원천 태그처럼 배타적이지 않은 신호는 제외)
  const handled = leavesOf(p.rule.logic).some((l) => !l.soft && (l.field === "benefit" || l.field === "income" || l.field === "incomeBands"));
  if (!handled && !EXCLUDED.test(text)) {
    const lines = text.split(/\n|○|•|·\s(?=\S)|※/).map((l) => l.trim()).filter((l) => l.length > 4);
    const gated = lines.filter((l) => ANY_GATE.test(l));
    if (lines.length >= 3 && gated.length && gated.length < lines.length - 1) partial = true;
    else {
      const m = MEDIAN_RE.exec(text);
      const rec = RECIPIENT_RE.exec(text);
      const low = LOW_RE.exec(text);
      if (m) gate = { kind: "median", pct: Number(m[1]), text: m[0] };
      else if (rec && !low) gate = { kind: "recipient", text: rec[0] };
      else if (low) gate = { kind: "low", text: low[0] };
      else if (BASIC_PENSION_RE.test(text)) gate = { kind: "basicPension", text: "기초연금 수급" };
    }
  }
  const out = { gate, priority, partial };
  gateCache.set(p, out);
  return out;
}

/** 이름에 숫자가 없는 '저소득'의 기준으로 보는 선 (차상위 50% + 여유) */
export const LOW_INCOME_PCT = 60;

type GateState = "met" | "no" | "unknown";

function incomeTri(prof: Profile, pct: number): GateState {
  if (prof.income === "unknown") return "unknown";
  const [lo, hi] = incomeRange(prof.income);
  if (hi <= pct) return "met";
  if (lo >= pct) return "no";
  return "unknown";
}

export function gateState(g: Gate, s: Situation, prof: Profile): GateState {
  const b = inferExtras(s).benefits;
  const anyRec = RECIPIENT_KINDS.some((k) => b[k] === true);
  const noRec = RECIPIENT_KINDS.every((k) => b[k] === false);
  switch (g.kind) {
    case "recipient":
      return anyRec ? "met" : noRec ? "no" : "unknown";
    case "low": {
      if (anyRec) return "met";
      const t = incomeTri(prof, LOW_INCOME_PCT);
      return t;
    }
    case "median": {
      if (anyRec && g.pct >= 50) return "met";
      return incomeTri(prof, g.pct);
    }
    case "basicPension":
      return b.basic_pension === true ? "met" : b.basic_pension === false ? "no" : "unknown";
  }
}

/* ---------------- 추가 질문 (차원) ---------------- */

export type DimId = "support" | "basicPension" | "income" | "disability" | "care" | "ltcGrade" | "alone" | "veteran" | "singleParent" | "multicultural" | "housing" | "activity" | "illness";

export interface Answer {
  key: string;
  label: string;
  apply: (s: Situation) => Situation;
}

export interface Dim {
  id: DimId;
  /** 질문 (부모님/본인 말투) */
  q: (mode: FindMode) => string;
  help?: string;
  answers: Answer[];
  isUnknown: (s: Situation) => boolean;
}

const withX = (s: Situation, patch: Partial<Extras>): Situation => ({ ...s, x: { ...s.x, ...patch } });
const withP = (s: Situation, patch: Partial<Profile>): Situation => ({ ...s, profile: { ...s.profile, ...patch } });
const setBenefits = (s: Situation, on: Benefit[], off: Benefit[]): Situation => {
  const b = { ...s.x.benefits };
  on.forEach((k) => (b[k] = true));
  off.forEach((k) => (b[k] = false));
  return withX(s, { benefits: b });
};
const subj = (mode: FindMode, self: string, parent: string) => (mode === "parent" ? parent : self);

/** 기초생활보장 급여는 소득 기준이 겹친다 (생계 32% ⊂ 의료 40% ⊂ 주거 48% ⊂ 교육 50%) → '가장 높은 단계 하나'만 고르면 된다 */
export const SUPPORT_LEVELS: { key: string; label: string; plain: string; on: Benefit[] }[] = [
  { key: "livelihood", label: "생계급여", plain: "매달 생활비", on: ["livelihood", "medical", "housing"] },
  { key: "medical", label: "의료급여", plain: "병원비를 의료급여증으로", on: ["medical", "housing"] },
  { key: "housing", label: "주거급여만", plain: "월세·집수리 지원만", on: ["housing"] },
  { key: "near_poverty", label: "차상위계층", plain: "차상위 확인서 있음", on: ["near_poverty"] },
];

export const DIMS: Dim[] = [
  {
    id: "support",
    q: (m) => subj(m, "주민센터에서 기초생활보장(생계·의료·주거급여)이나 차상위 지원을 받고 계신가요?", "부모님이 주민센터에서 기초생활보장(생계·의료·주거급여)이나 차상위 지원을 받고 계신가요?"),
    help: "‘수급자’, ‘차상위’라고 적힌 혜택은 이 답 하나로 정해져요.",
    isUnknown: (s) => RECIPIENT_KINDS.some((k) => inferExtras(s).benefits[k] === undefined),
    answers: [
      { key: "none", label: "아니요, 받지 않아요", apply: (s) => setBenefits(s, [], RECIPIENT_KINDS) },
      ...SUPPORT_LEVELS.map((l) => ({
        key: l.key, label: `예 — ${l.label}`,
        apply: (s: Situation) => setBenefits(s, l.on, RECIPIENT_KINDS.filter((k) => !l.on.includes(k))),
      })),
    ],
  },
  {
    id: "basicPension",
    q: (m) => subj(m, "기초연금을 받고 계신가요?", "부모님이 기초연금을 받고 계신가요?"),
    help: "만 65세 이상 중 소득·재산이 적은 70%가 받는 연금이에요 (국민연금과 달라요).",
    isUnknown: (s) => s.x.benefits.basic_pension === undefined && (s.profile.age === "unknown" || ageRange(s.profile.age)[1] >= 65),
    answers: [
      { key: "yes", label: "예", apply: (s) => setBenefits(s, ["basic_pension"], []) },
      { key: "no", label: "아니요", apply: (s) => setBenefits(s, [], ["basic_pension"]) },
    ],
  },
  {
    id: "income",
    q: (m) => subj(m, "가구 전체의 한 달 소득은 얼마쯤인가요?", "부모님 가구의 한 달 소득은 얼마쯤인가요?"),
    help: "일해서 버는 돈·연금·임대료 등을 모두 더한 금액이에요. 대략이면 충분해요.",
    isUnknown: (s) => s.x.incomeManwon === null && s.profile.income === "unknown",
    answers: INCOME_BANDS.map((b) => ({ key: b, label: b, apply: (s: Situation) => withP(withX(s, { incomeManwon: null }), { income: b }) })),
  },
  {
    id: "disability",
    q: (m) => subj(m, "장애인으로 등록되어 있나요?", "부모님 중 장애인으로 등록된 분이 있나요?"),
    isUnknown: (s) => s.profile.disability === "unknown",
    answers: [
      { key: "none", label: "아니요", apply: (s) => withP(s, { disability: "none", disabilitySeverity: "unknown" }) },
      { key: "severe", label: "예 — 심한 장애", apply: (s) => withP(s, { disability: "self", disabilitySeverity: "severe" }) },
      { key: "mild", label: "예 — 심하지 않은 장애", apply: (s) => withP(s, { disability: "self", disabilitySeverity: "mild" }) },
    ],
  },
  {
    id: "care",
    q: (m) => subj(m, "식사·거동·외출 같은 일상생활에 다른 사람의 도움이 필요한가요?", "부모님이 식사·거동·외출 같은 일상생활에 도움이 필요하신가요?"),
    isUnknown: (s) => s.profile.care === null,
    answers: [
      { key: "yes", label: "예", apply: (s) => withP(s, { care: ["daily"] }) },
      { key: "no", label: "아니요", apply: (s) => withP(s, { care: [] }) },
    ],
  },
  {
    id: "ltcGrade",
    q: (m) => subj(m, "건강보험공단에서 장기요양등급(1~5등급·인지지원등급)을 받으셨나요?", "부모님이 건강보험공단에서 장기요양등급(1~5등급·인지지원등급)을 받으셨나요?"),
    isUnknown: (s) => s.x.facts.ltcGrade === undefined,
    answers: [
      { key: "yes", label: "예", apply: (s) => withX(s, { facts: { ...s.x.facts, ltcGrade: true } }) },
      { key: "no", label: "아니요", apply: (s) => withX(s, { facts: { ...s.x.facts, ltcGrade: false } }) },
    ],
  },
  {
    id: "alone",
    q: (m) => subj(m, "혼자 사시나요?", "부모님이 혼자 사시나요?"),
    isUnknown: (s) => s.profile.householdSize === "unknown",
    answers: [
      { key: "yes", label: "예, 혼자", apply: (s) => withP(s, { householdSize: 1 }) },
      { key: "no", label: "아니요, 함께 살아요", apply: (s) => withP(s, { householdSize: 2 }) },
    ],
  },
  {
    id: "veteran",
    q: (m) => subj(m, "국가유공자·참전유공자 등 보훈 대상이신가요?", "부모님이 국가유공자·참전유공자 등 보훈 대상이신가요?"),
    isUnknown: (s) => s.x.traits.veteran === undefined,
    answers: [
      { key: "yes", label: "예", apply: (s) => withX(s, { traits: { ...s.x.traits, veteran: true } }) },
      { key: "no", label: "아니요", apply: (s) => withX(s, { traits: { ...s.x.traits, veteran: false } }) },
    ],
  },
  {
    id: "singleParent",
    q: (m) => subj(m, "한부모 가구이거나, 조부모가 손주를 키우는 조손 가구인가요?", "부모님이 손주를 키우고 계신가요 (조손 가구)?"),
    isUnknown: (s) => s.x.traits.single_parent === undefined,
    answers: [
      { key: "yes", label: "예", apply: (s) => withX(s, { traits: { ...s.x.traits, single_parent: true } }) },
      { key: "no", label: "아니요", apply: (s) => withX(s, { traits: { ...s.x.traits, single_parent: false } }) },
    ],
  },
  {
    id: "multicultural",
    q: (m) => subj(m, "다문화 가족(결혼이민)이거나 북한이탈주민인가요?", "부모님이 다문화 가족이거나 북한이탈주민이신가요?"),
    isUnknown: (s) => s.x.traits.multicultural === undefined,
    answers: [
      { key: "yes", label: "예", apply: (s) => withX(s, { traits: { ...s.x.traits, multicultural: true } }) },
      { key: "no", label: "아니요", apply: (s) => withX(s, { traits: { ...s.x.traits, multicultural: false } }) },
    ],
  },
  {
    id: "housing",
    q: (m) => subj(m, "사는 집은 어떤 형태인가요?", "부모님 댁은 어떤 형태인가요?"),
    isUnknown: (s) => s.profile.housing === "unknown",
    answers: (["own", "jeonse", "monthly", "public_rental"] as const).map((h) => ({
      key: h, label: { own: "자가", jeonse: "전세", monthly: "월세", public_rental: "공공임대" }[h], apply: (s: Situation) => withP(s, { housing: h }),
    })),
  },
  {
    id: "activity",
    q: (m) => subj(m, "지금 일을 하고 계신가요?", "부모님이 지금 일을 하고 계신가요?"),
    isUnknown: (s) => s.profile.activity === "unknown",
    answers: [
      { key: "employed", label: "예, 일해요", apply: (s) => withP(s, { activity: "employed" }) },
      { key: "job_seeking", label: "일자리를 찾고 있어요", apply: (s) => withP(s, { activity: "job_seeking" }) },
      { key: "none", label: "아니요", apply: (s) => withP(s, { activity: "none" }) },
    ],
  },
  {
    id: "illness",
    q: (m) => subj(m, "치매·암·희귀질환 등 진단받고 치료 중인 병이 있나요?", "부모님 중 치매·암·희귀질환 등 진단받고 치료 중인 병이 있으신가요?"),
    isUnknown: (s) => s.x.facts.illness === undefined,
    answers: [
      { key: "yes", label: "예", apply: (s) => withX(s, { facts: { ...s.x.facts, illness: true } }) },
      { key: "no", label: "아니요", apply: (s) => withX(s, { facts: { ...s.x.facts, illness: false } }) },
    ],
  },
];
export const DIM_BY_ID = Object.fromEntries(DIMS.map((d) => [d.id, d])) as Record<DimId, Dim>;

/** 이 사업의 판정에 영향을 줄 수 있는 질문 (규칙의 잎 조건 + 원문 관문) */
export function dimsFor(p: Program): DimId[] {
  const out = new Set<DimId>();
  for (const l of leavesOf(p.rule.logic)) {
    switch (l.field) {
      case "benefit":
        if (l.anyOf.some((b) => RECIPIENT_KINDS.includes(b))) out.add("support");
        if (l.anyOf.includes("basic_pension")) out.add("basicPension");
        break;
      case "income": case "incomeBands": out.add("income"); break;
      case "disability": out.add("disability"); break;
      case "care": out.add("care"); break;
      case "trait":
        if (l.anyOf.includes("veteran")) out.add("veteran");
        if (l.anyOf.includes("single")) out.add("alone");
        if (l.anyOf.includes("single_parent")) out.add("singleParent");
        if (l.anyOf.includes("multicultural")) out.add("multicultural");
        break;
      case "householdSize": out.add("alone"); break;
      case "housing": out.add("housing"); break;
      case "activity": out.add("activity"); break;
      case "unasked":
        for (const [k, re] of Object.entries(FACT_PATTERNS)) {
          if (!re.test(l.label)) continue;
          out.add(k === "pension70" ? "basicPension" : (k as DimId));
        }
        break;
    }
  }
  const { gate } = textGate(p);
  if (gate?.kind === "recipient") out.add("support");
  if (gate?.kind === "low" || gate?.kind === "median") {
    out.add("support");
    out.add("income");
  }
  if (gate?.kind === "basicPension") out.add("basicPension");
  return [...out];
}

/* ---------------- 분류 ---------------- */

/** fit: 답한 내용으로 조건이 모두 맞음 / open: 아직 정해지지 않음 / no: 답한 내용과 맞지 않음 */
export type Base = "fit" | "autoFit" | "open" | "no";

export interface BaseResult {
  base: Base;
  ev: Evaluation;
  gate: Gate | null;
  gateState?: GateState;
  priority: boolean;
}

export function classifyBase(p: Program, s: Situation): BaseResult {
  // soft 조건(원천 태그 등)은 답과 달라도 빼지 않는다 — 배타적이지 않은 신호라서 (감사 2026-10-07: 장애인연금·장기요양 등이 잘못 빠짐)
  const { profile, opts } = toEval(s, false);
  const ev = evaluateRule(p.rule, profile, opts);
  const { gate, priority } = textGate(p);
  const gs = gate ? gateState(gate, s, profile) : undefined;
  if (ev.tier === "ineligible") return { base: "no", ev, gate, gateState: gs, priority };
  if (gs === "no") return { base: "no", ev, gate, gateState: gs, priority };
  if (!p.rule.logic || p.rule.unstructuredCore) return { base: "open", ev, gate, gateState: gs, priority };
  // 긴급지원은 소득 기준이 맞아도 '갑작스러운 위기'가 있어야 함 → 신청할 때 확인
  if (CRISIS.test(p.name) || NAMED_GROUP.test(p.name)) return { base: "open", ev, gate, gateState: gs, priority };
  const tri = evaluateCond(p.rule.logic, profile, opts).tri;
  if (tri === "T" && gs !== "unknown") return { base: p.rule.review === "auto" ? "autoFit" : "fit", ev, gate, gateState: gs, priority };
  return { base: "open", ev, gate, gateState: gs, priority };
}

const CRISIS = /긴급\s*(복지|지원|생계)|위기\s*가구/;
/** 이름 괄호 안에 따로 정한 대상 집단 — 예) 무료 소송대리 서비스(가족관계미등록자) */
const NAMED_GROUP = /\(([^()]*(?:자|인|가족|민|대상|사건[^()]*))\)\s*$/;

/** 화면 분류: fit 받을 수 있어요 / ask 질문 하나로 정해져요 / office 신청할 때 확인 / no 맞지 않아 뺐어요 */
export type Bucket = "fit" | "ask" | "office" | "no";

export interface V2Item {
  s: Scored;
  /** 사람 검수(또는 공식 구조화) 규칙인지 — 아니면 '자동 정리 조건' 표시 */
  reviewed: boolean;
  bucket: Bucket;
  base: BaseResult;
  /** ask: 이 사업을 정할 수 있는 질문 */
  dims: DimId[];
}

/** 이 사업을 정할 수 있는 '모름' 질문 (답 하나만 바꿔 보는 반사실 검사) */
export function decidingDims(p: Program, s: Situation, cur: Base): DimId[] {
  const out: DimId[] = [];
  for (const id of dimsFor(p)) {
    const d = DIM_BY_ID[id];
    if (!d.isUnknown(s)) continue;
    if (d.answers.some((a) => classifyBase(p, a.apply(s)).base !== cur)) out.push(id);
  }
  return out;
}

export function classify(s: Scored, sit: Situation): V2Item {
  const base = classifyBase(s.program, sit);
  const reviewed = s.program.rule.review !== "auto";
  // 자동 정리 규칙은 조건이 다 맞아도 '신청할 때 확인' (원문 대조 전이라 '받을 수 있어요'라고 하지 않음)
  if (base.base === "autoFit") return { s, reviewed, bucket: "office", base, dims: [] };
  if (base.base !== "open") return { s, reviewed, bucket: base.base, base, dims: [] };
  const dims = decidingDims(s.program, sit, "open");
  return { s, reviewed, bucket: dims.length ? "ask" : "office", base, dims };
}

const MAIN: Filters = { tier: "eligible", category: null, org: null, q: "" };
/** 본문 대상: 자동 제공·기관 선정·기본 숨김(교육청·복지 외 분야·기관 운영) 제외 */
export const inMain = (p: Program) => !autoLike(p) && !hiddenByDefault(p, MAIN);

export function scoreV2(programs: Program[], sit: Situation): Scored[] {
  const { profile, opts } = toEval(sit, false);
  return scoreAll(programs.filter(inMain), profile, (p) => evaluateRule(p.rule, profile, opts));
}

export interface V2View {
  fit: V2Item[][];
  ask: V2Item[][];
  office: V2Item[][];
  no: V2Item[][];
  /** 추가 질문 (정할 수 있는 혜택 수 순) */
  questions: { dim: Dim; groups: number; keys: string[] }[];
  /** 위 질문 몇 개로 정해지는 혜택 수 (묶음) */
  unlock: number;
}

const ORDER: Bucket[] = ["fit", "ask", "office", "no"];

/** 판정·분류·묶음. 같은 사업의 지역 변형은 가장 좋은 분류 하나로 */
export function buildView(scored: Scored[], sit: Situation, maxQuestions = 3): V2View {
  const items = scored.map((x) => classify(x, sit));
  const seen = new Set<string>();
  const out: Record<Bucket, V2Item[][]> = { fit: [], ask: [], office: [], no: [] };
  for (const b of ORDER) {
    const list = items.filter((i) => i.bucket === b);
    const groups = groupVariants(list.map((i) => i.s));
    const byScored = new Map(list.map((i) => [i.s, i]));
    for (const g of groups) {
      if (seen.has(g.key)) continue;
      seen.add(g.key);
      out[b].push([g.lead, ...g.variants].map((x) => byScored.get(x)!));
    }
  }
  // 정렬: 관련도 + '나를 콕 집은' 사업 먼저
  const key = (g: V2Item[]) => g[0].s.score + (g[0].s.specific ? 1 : 0);
  for (const b of ORDER) out[b].sort((a, c) => key(c) - key(a));
  // 질문 순서: 정해지는 혜택의 관련도 제곱 합 — 관련 높은 혜택(기초연금·돌봄 등)을 정하는 질문 먼저, 그다음 많이 정하는 질문
  const count = new Map<DimId, Set<string>>();
  const weight = new Map<DimId, number>();
  for (const g of out.ask) for (const id of g[0].dims) {
    if (!count.has(id)) count.set(id, new Set());
    count.get(id)!.add(g[0].s.group);
    const sc = Math.max(0, g[0].s.score);
    weight.set(id, (weight.get(id) ?? 0) + sc * sc + 0.01);
  }
  const ranked = [...count].sort((a, b) => (weight.get(b[0]) ?? 0) - (weight.get(a[0]) ?? 0)).slice(0, maxQuestions);
  const union = new Set(ranked.flatMap(([, v]) => [...v]));
  return {
    ...out,
    questions: ranked.map(([id, v]) => ({ dim: DIM_BY_ID[id], groups: v.size, keys: [...v] })),
    unlock: union.size,
  };
}

/* ---------------- 쉬운 말 ---------------- */

const manwon = (won: number) => `${Math.floor(won / 10000).toLocaleString("ko-KR")}만원`;

const BENEFIT_PLAIN: Record<Benefit, string> = {
  livelihood: "생계급여(매달 생활비)를 받는 분",
  medical: "의료급여(병원비 지원)를 받는 분",
  housing: "주거급여(월세·집수리)를 받는 분",
  education: "교육급여를 받는 분",
  near_poverty: "차상위계층 확인을 받은 분",
  basic_pension: "기초연금을 받는 분",
};

/** 수급 조건 → 짧은 쉬운 말 (생계·의료·주거·교육급여 중 3개 이상이면 '기초생활수급자') */
export function benefitPlain(any: Benefit[]): string {
  if (any.length === 1) return BENEFIT_PLAIN[any[0]];
  const basic = any.filter((b) => b !== "near_poverty" && b !== "basic_pension");
  const parts: string[] = [];
  if (basic.length >= 3) parts.push("기초생활수급자");
  else basic.forEach((b) => parts.push(`${BENEFIT_PLAIN[b].replace(/\(.*\)를 받는 분$/, "")} 수급자`));
  if (any.includes("near_poverty")) parts.push("차상위계층");
  if (any.includes("basic_pension")) parts.push("기초연금 수급자");
  return `${parts.join("·")}인 분`;
}

/** 2026 기초연금 선정기준액 (소득인정액) */
export function pensionLine(prof: Profile): string {
  const t = BASIC_PENSION_THRESHOLD_2026;
  if (prof.householdSize === 1) return `소득인정액이 월 ${manwon(t.single)} 이하 (혼자 사는 어르신)`;
  if (prof.householdSize !== "unknown") return `부부 소득인정액이 월 395만 2천원 이하`;
  return `소득인정액이 월 ${manwon(t.single)}(혼자)·395만 2천원(부부) 이하`;
}

function incomeLine(pct: number, prof: Profile): string {
  const size = sizeOf(prof);
  if (size) return `가구 소득이 월 ${manwon(medianWon(pct, size))} 이하 (${size}인 가구 기준)`;
  return `가구 소득이 월 ${manwon(medianWon(pct, 1))}(1인)·${manwon(medianWon(pct, 2))}(2인) 이하`;
}

/** 잎 조건 → 쉬운 말 한 줄 */
export function plainLeaf(leaf: Leaf, prof: Profile): string {
  switch (leaf.field) {
    case "age":
      if (leaf.min !== undefined && leaf.max !== undefined) return `만 ${leaf.min}~${leaf.max}세`;
      if (leaf.min !== undefined) return `만 ${leaf.min}세 이상`;
      if (leaf.max !== undefined) return `만 ${leaf.max}세 이하`;
      return leaf.label;
    case "income":
      return incomeLine(leaf.lte, prof);
    case "incomeBands": {
      const hi = Math.max(...leaf.bands.map((b) => b[1]));
      return Number.isFinite(hi) && hi < 1000 ? incomeLine(hi, prof) : leaf.label;
    }
    case "benefit":
      return benefitPlain(leaf.anyOf);
    case "care":
      return leaf.anyOf.includes("daily") ? "일상생활에 도움이 필요한 분" : "최근 퇴원한 분";
    case "disability":
      return leaf.severity === "severe" ? "심한 장애로 등록된 분" : "등록 장애인";
    case "householdSize":
      return leaf.max === 1 ? "혼자 사는 분" : leaf.label;
    case "resident":
      return "이 지역에 사는 분";
    case "unasked":
      if (FACT_PATTERNS.pension70.test(leaf.label)) return pensionLine(prof);
      return leaf.label.replace(/\s*\(원문 확인\)/, "");
    default:
      return leaf.label.replace(/\s*\(원문 확인\)/, "");
  }
}

function gateLine(g: Gate, prof: Profile): string {
  switch (g.kind) {
    case "recipient": return "기초생활수급자·차상위계층인 분";
    case "low": return `${incomeLine(LOW_INCOME_PCT, prof)}인 저소득 가구 (기준이 숫자로 없어 중위소득 ${LOW_INCOME_PCT}%로 봤어요)`;
    case "median": return incomeLine(g.pct, prof);
    case "basicPension": return "기초연금을 받는 분";
  }
}

const reasonPlain = (r: Reason, prof: Profile) => (r.leaf ? (r.kind === "unknown" && r.leaf.capU ? `${r.leaf.label} (세부 기준)` : plainLeaf(r.leaf, prof)) : r.text.replace(/\s+—\s.*$/, "").replace(/^(추가로 확인할 조건|상담으로 판단하는 조건):\s*/, ""));
const short = (t: string, n = 70) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/** 카드 한 줄: 사용자 말로 */
export function plainLine(i: V2Item, sit: Situation, mode: FindMode): string {
  const { profile } = toEval(sit);
  const ev = i.base.ev;
  const met = ev.reasons.filter((r) => r.kind === "met" && r.leaf?.field !== "resident").map((r) => reasonPlain(r, profile));
  const who = mode === "parent" ? "부모님이" : "";
  switch (i.bucket) {
    case "fit": {
      const parts = [...met];
      if (i.base.gate && i.base.gateState === "met") parts.push(gateLine(i.base.gate, profile));
      const head = parts.length ? `${[...new Set(parts)].slice(0, 3).join(" · ")} — ${who ? who + " " : ""}해당돼요.` : "입력하신 상황으로 조건이 맞아요.";
      const note = ev.reasons.find((r) => r.kind === "note" && !/재산·세부 요건은 원문/.test(r.text));
      const tail = [i.base.priority ? "저소득층 우선 선정" : "", note ? `참고: ${short(reasonPlain(note, profile), 50)}` : ""].filter(Boolean).join(" · ");
      return tail ? `${head} (${tail})` : head;
    }
    case "ask": {
      const g = i.base.gate && i.base.gateState === "unknown" ? gateLine(i.base.gate, profile) : null;
      const unks = ev.reasons.filter((r) => r.kind === "unknown" && r.leaf);
      const unk = unks.find((r) => r.leaf?.field === "unasked" && FACT_PATTERNS.pension70.test(r.leaf.label)) ?? unks[0];
      const cond = g ?? (unk ? reasonPlain(unk, profile) : null);
      return cond ? `${short(cond)}이면 받을 수 있어요.` : "위 질문에 답하시면 바로 알려드려요.";
    }
    case "office": {
      const named = NAMED_GROUP.exec(i.s.program.name);
      if (named) return `${met.length ? `${[...new Set(met)].slice(0, 2).join(" · ")}은 맞아요. ` : ""}신청할 때 확인: '${named[1]}'에 해당하는 분만 받을 수 있어요.`;
      if (CRISIS.test(i.s.program.name)) return `${met.length ? `${[...new Set(met)].slice(0, 2).join(" · ")}은 맞아요. ` : ""}갑작스러운 위기(실직·질병·사고 등)가 생겼을 때 받는 지원이에요.`;
      if (i.base.base === "autoFit") return `${met.length ? `${[...new Set(met)].slice(0, 2).join(" · ")}은 맞아요. ` : ""}신청할 때 확인: 세부 자격 (조건을 원문에서 자동으로 정리했어요)`;
      const unk = ev.reasons.find((r) => r.kind === "unknown") ?? ev.reasons.find((r) => r.kind === "note");
      const lead = met.length ? `${[...new Set(met)].slice(0, 2).join(" · ")}은 맞아요. ` : "";
      return `${lead}신청할 때 확인: ${unk ? short(reasonPlain(unk, profile), 60) : "세부 자격(원문)"}`;
    }
    case "no": {
      if (i.base.gate && i.base.gateState === "no") return `${gateLine(i.base.gate, profile)} 대상이라 맞지 않아요.`;
      const un = ev.reasons.find((r) => r.kind === "unmet");
      return un ? `${short(reasonPlain(un, profile))} 대상이라 맞지 않아요.` : "입력하신 상황과 맞지 않아요.";
    }
  }
}

/** 소득 입력 → 쉬운 말 구간 설명 */
export function incomeExplain(manwonValue: number, size: 1 | 2 | 3 | 4 | 5 | 6): { band: IncomeBand; pct: number; line: string } {
  const won = manwonValue * 10000;
  const band = incomeBandFor(won, size);
  const pct = Math.round((won / medianWon(100, size)) * 1000) / 10;
  const marks: [number, string][] = [[32, "생계급여"], [40, "의료급여"], [48, "주거급여"], [50, "차상위·교육급여"]];
  const under = marks.filter(([m]) => pct <= m).map(([, l]) => l);
  const line = under.length
    ? `${size}인 가구 기준중위소득의 약 ${pct}% — ${under.join("·")} 소득 기준 안이에요.`
    : `${size}인 가구 기준중위소득의 약 ${pct}% — 기초생활보장·차상위 소득 기준(50%)보다 높아요.`;
  return { band, pct, line };
}

/** v1 화면과 함께 쓰는 저장용 프로필 (다중 항목은 하나라도 '모름'이면 v1에는 답한 '예'만 남긴다) */
export function profileForStorage(s: Situation): Profile {
  const x = inferExtras(s);
  const pick = <K extends string>(keys: readonly K[], m: Partial<Record<K, boolean>>): K[] | null =>
    keys.some((k) => m[k] !== undefined) ? keys.filter((k) => m[k] === true) : null;
  return { ...s.profile, income: incomeOf(s), benefits: pick(BENEFITS, x.benefits), traits: s.profile.traits ?? pick(HOUSEHOLD_TRAITS, x.traits) };
}

/** 머리글 요약 (지역 제외) */
export function situationChips(s: Situation): string[] {
  const p = s.profile;
  const out: string[] = [];
  if (p.age !== "unknown") {
    const [a, b] = ageRange(p.age);
    out.push(b >= 120 ? `만 ${a}세 이상` : `만 ${a}~${b}세`);
  }
  if (p.householdSize !== "unknown") out.push(p.householdSize === 1 ? "혼자 사심" : `${p.householdSize}명 가구`);
  const size = sizeOf(p);
  if (s.x.incomeManwon !== null) {
    out.push(size ? `소득 월 ${s.x.incomeManwon.toLocaleString("ko-KR")}만원 (중위소득의 약 ${Math.round((s.x.incomeManwon * 1e6) / medianWon(100, size))}%)` : `소득 월 ${s.x.incomeManwon}만원`);
  } else if (p.income !== "unknown") out.push(`소득 중위 ${p.income}% 이하`);
  const x = inferExtras(s);
  const rec = RECIPIENT_KINDS.filter((k) => x.benefits[k] === true);
  if (rec.length) out.push(rec.map((k) => BENEFIT_PLAIN[k].replace(/\(.*$/, "")).join("·") + " 수급");
  else if (RECIPIENT_KINDS.every((k) => x.benefits[k] === false)) out.push("수급·차상위 아님");
  if (x.benefits.basic_pension === true) out.push("기초연금 받음");
  else if (x.benefits.basic_pension === false) out.push("기초연금 안 받음");
  if (p.care?.length) out.push("일상생활 도움 필요");
  if (p.disability === "none") out.push("장애 없음");
  else if (p.disability !== "unknown") out.push("장애 있음");
  return out;
}

export type { Group };
