/**
 * v2 시험판 (운영자 피드백 2026-10-07): '내 상황'을 먼저 받고, 답한 사실과 맞지 않는 혜택은 본문에서 빼고,
 * '모름'으로 남은 조건은 짧은 추가 질문(예/아니오/모름)으로 바로 다시 거른다.
 * 순수 함수 (브라우저·스크립트 공용). 프로필은 기기 밖으로 보내지 않는다.
 */
import { evaluateCond, evaluateRule } from "../engine/evaluate";
import {
  AGE_BANDS, AGE_LABEL, BASIC_PENSION_THRESHOLD_2026, BENEFITS, CHILD_LABEL, HOUSEHOLD_TRAITS, INCOME_BANDS, ageRange, incomeBandFor, incomeRange, medianWon,
  type Benefit, type HouseholdTrait, type IncomeBand, type Profile,
} from "../engine/profile";
import type { Cond, EvalOptions, Evaluation, Leaf, Reason } from "../engine/types";
import type { Program } from "../data/types";
import { autoLike, familyKey, groupVariants, hiddenByDefault, scoreAll, type Filters, type Group, type Scored } from "./results";
import type { FindMode } from "./mode";
import { programTopics, type TopicId } from "./topics";

/* ---------------- 입력 (12개 항목 + 항목별 '모름') ---------------- */

/** 간편 입력 밖의 사실 — 원문 '묻지 않는 조건'과 이름으로 이어 붙인다 */
export const FACT_PATTERNS = {
  ltcGrade: /장기\s*요양\s*(등급|인정|수급)|요양\s*등급|등급\s*판정/,
  pension70: /소득\s*하위\s*70|선정\s*기준액/,
  illness: /질병|질환|환자|투병|희귀|난치|중증\s*환자/,
} as const;
export type FactId = keyof typeof FACT_PATTERNS;

export interface Extras {
  /** 자녀 수 (0·1·2·3=3명 이상). 없음 = 모름 — 다자녀 판단·입력 화면 복원용 */
  childCount?: 0 | 1 | 2 | 3 | null;
  /** 수급·자격 항목별 답 (키 없음 = 모름) */
  benefits: Partial<Record<Benefit, boolean>>;
  /** 가구 특성 항목별 답 (키 없음 = 모름) */
  traits: Partial<Record<HouseholdTrait, boolean>>;
  /** 월 가구 소득(만원). null = 모름 → 프로필의 소득 구간을 그대로 쓴다 */
  incomeManwon: number | null;
  facts: Partial<Record<FactId, boolean>>;
  /** 정확한 나이를 모를 때 말한 나이 범위 (예: '30대' → [30, 39]) — 범위 전체에서 맞는 혜택만 '받으실 수 있어요' (QA 2차 H2) */
  ageSpan?: [number, number] | null;
  /** 문장에서 말한 관심 주제 (예: '기초연금 받고 싶어요' → basic_pension) — 순위만 올린다 (QA 2차 H1·N3) */
  interests?: TopicId[];
  /** 부모님 두 분의 나이대가 다를 때 다른 분 (결과 화면 '다른 분 기준으로 보기' — QA 2차 M7) */
  otherAge?: { band: Exclude<Profile["age"], "unknown">; label: string } | null;
}

export interface Situation {
  profile: Profile;
  x: Extras;
  /** 본인/부모님 — 추가 질문 고르기·말투 (없으면 부모님 기준 질문 모두) */
  mode?: FindMode;
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

/** 월 소득(만원)·가구원 수를 알면 기준 중위소득 대비 % (모르면 null) */
export function incomePctOf(s: Situation): number | null {
  const size = sizeOf(s.profile);
  return s.x.incomeManwon !== null && size !== null ? (s.x.incomeManwon * 1e6) / medianWon(100, size) : null;
}

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

/**
 * 나이를 정확히 모를 때 판정에 쓰는 나이 범위 (QA 2차 H2·N3)
 *  - 말한 범위 ('30대' → 30~39), 없으면 본인 찾기는 성인(19세 이상), 부모님 찾기는 40세 이상
 *  - 범위 전체에서 맞는 조건은 맞음, 범위에 걸치는 조건은 '답하면 정해져요', 범위 밖은 맞지 않음
 */
export function ageSpanOf(s: Situation): [number, number] | null {
  if (s.profile.age !== "unknown") return null;
  if (s.x.ageSpan) return s.x.ageSpan;
  return s.mode === "self" ? [19, 120] : s.mode === "parent" ? [40, 120] : null;
}

/** 나이(정확한 구간 또는 범위) → [하한, 상한] (모르면 null) */
export function ageBoundsOf(s: Situation): [number, number] | null {
  return s.profile.age !== "unknown" ? ageRange(s.profile.age) : ageSpanOf(s);
}

/** v2 입력 → 판정용 프로필 + 판정 선택 사항 */
export function toEval(s: Situation, strict = false): { profile: Profile; opts: EvalOptions } {
  const span = ageSpanOf(s);
  // 나이 범위는 'a-b' 구간으로 판정 (엔진의 ageRange 가 그대로 읽음)
  const p: Profile = span ? { ...s.profile, age: `${span[0]}-${span[1]}` as Profile["age"] } : s.profile;
  const x = inferExtras(s);
  const bKnown = BENEFITS.filter((b) => x.benefits[b] !== undefined);
  const size = sizeOf(p);
  const traitsMap = { ...x.traits };
  if (size !== null) traitsMap.single = size === 1;
  // 자녀 수 → 다자녀 (3명 이상은 다자녀, 0·1명은 아님, 2명은 사업마다 달라 모름으로 둔다)
  if (traitsMap.multi_child === undefined && x.childCount !== undefined && x.childCount !== null && x.childCount !== 2) traitsMap.multi_child = x.childCount === 3;
  const tKnown = HOUSEHOLD_TRAITS.filter((t) => traitsMap[t] !== undefined);
  const income = incomeOf(s);
  const facts: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(x.facts)) if (v !== undefined) facts[k] = v;
  // 기초연금을 받고 있으면 '소득 하위 70%' 조건은 이미 맞음 (안 받는다고 아니라고 볼 수는 없음)
  if (x.benefits.basic_pension === true) facts.pension70 = true;
  const pct = incomePctOf(s);
  return {
    profile: {
      ...p,
      income,
      benefits: bKnown.length ? BENEFITS.filter((b) => x.benefits[b] === true) : null,
      traits: tKnown.length ? HOUSEHOLD_TRAITS.filter((t) => traitsMap[t] === true) : null,
    },
    opts: {
      facts, factPatterns: FACT_PATTERNS, withLeaf: true, strictSoft: strict,
      ...(pct !== null ? { incomePct: pct } : {}),
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
const RECIPIENT_RE = /(기초\s*생활\s*(보장\s*)?수급|생계\s*급여|의료\s*급여|주거\s*급여|수급자|수급권자|차상위|(?:생계|의료|주거|교육)(?:\s*[·,ㆍ]\s*(?:생계|의료|주거|교육))*\s*수급\s*(?:가구|세대))/;
const LOW_RE = /(저소득|취약\s*계층|형편이?\s*어려운|생계가?\s*어려운|경제적(으로)?\s*어려운|소외\s*계층|빈곤)/;
const MEDIAN_RE = /중위\s*(?:소득\s*)?(?:의\s*)?(\d{2,3})\s*%\s*(이하|이내|미만)/;
const RECIPIENT_PAREN = new RegExp(`${RECIPIENT_RE.source}\\s*\\(\\s*(?:기준\\s*)?중위`);
const DEFINED_LOW = /(저소득\s*층?|소외\s*계층|취약\s*계층)[^()\n]{0,6}\(([^()]*)\)/g;
const BASIC_PENSION_RE = /기초\s*연금\s*(수급|대상|받)/;

/** 기초생활보장이 아닌 다른 제도의 '수급자' (기초연금은 따로 기초연금 관문으로) */
const OTHER_RECIPIENT = /((?:\d\s*[~∼-]\s*)?\d\s*등급(?:을\s*받은)?|등급을\s*받은|장기\s*요양(?:\s*보험)?(?:\s*급여)?|활동\s*지원(?:\s*급여)?|기초\s*연금|장애인\s*연금|국민\s*연금|공무원\s*연금|실업\s*급여|구직\s*급여|산재\s*보험|보훈\s*급여|연금)\s*(?:수급권자|수급자|수급)/g;
/** '소득 기준과 무관하게 신청 가능' — 소득·수급 관문 없음 */
const INCOME_FREE = /소득\s*(기준|수준)[과와]?\s*(무관|관계\s*없)/;
const ANY_GATE = new RegExp(`${RECIPIENT_RE.source}|${LOW_RE.source}|${MEDIAN_RE.source}|기초\\s*연금`);

function leavesOf(c: Cond | null, out: Leaf[] = []): Leaf[] {
  if (!c) return out;
  if ("all" in c) c.all.forEach((x) => leavesOf(x, out));
  else if ("any" in c) c.any.forEach((x) => leavesOf(x, out));
  else out.push(c);
  return out;
}

/**
 * '수급·차상위 또는 저소득(추정 비율)' 묶음 (QA 3차 R3: 디딤씨앗통장·드림스타트 수기 규칙) — 소득 잎이 soft(원문에 비율 없음)이면
 * 수급 여부를 모르는 채 소득만으로 '받으실 수 있어요'로 두지 않는다.
 */
const RECIPIENT_GROUP = /수급|차상위|보호대상|취약계층/;
export function recipientOrGuessedIncome(c: Cond | null): boolean {
  if (!c || !("all" in c || "any" in c)) return false;
  if ("any" in c) {
    const ls = c.any.filter((x): x is Leaf => !("all" in x || "any" in x));
    const rec = ls.some((l) => l.field === "benefit" && "anyOf" in l && (l.anyOf as string[]).some((k) => (RECIPIENT_KINDS as string[]).includes(k)));
    // 묶음 이름이 수급·차상위·보호대상·취약계층인 경우만 (그냥 '저소득 가구'는 소득 기준 사업도 많아 그대로)
    if (rec && ls.some((l) => l.field === "income" && l.soft && RECIPIENT_GROUP.test(l.label))) return true;
    return c.any.some(recipientOrGuessedIncome);
  }
  return c.all.some(recipientOrGuessedIncome);
}

type GateInfo = { gate: Gate | null; priority: boolean; partial: boolean; partialRec?: boolean };
const gateCache = new WeakMap<Program, GateInfo>();

/**
 * 규칙이 소득·수급을 다루지 않는데 원문에 소득·수급 대상이 적힌 경우의 관문.
 *  - 읽는 곳: 이름 + 지원 대상(앞 300자). 대상이 비어 있으면 요약의 앞부분(20자 안)만
 *  - '…우선' 은 관문이 아님 (priority 로 따로 알림)
 *  - 대상이 여러 유형(○ 줄)으로 나뉘고 소득·수급 조건이 없는 유형이 있으면 관문 없음 (partial)
 */
export function textGate(p: Program): GateInfo {
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
  let partialRec = false;
  // 규칙이 수급을 '확정 조건'으로 다루면 관문을 따로 두지 않는다 (soft = 원천 태그처럼 배타적이지 않은 신호는 제외).
  // 소득 조건(API 코드)이 있어도 원문 대상이 '수급자·차상위'뿐이면 그 문구가 더 좁으므로 관문으로 본다
  //   예) 문화누리카드: 코드는 '중위 75% 이하', 원문은 '기초생활수급자 및 차상위계층' → 수급·차상위 아님이면 뺀다
  const leaves = leavesOf(p.rule.logic);
  const benefitHandled = leaves.some((l) => !l.soft && l.field === "benefit");
  const incomeMax = leaves
    .filter((l) => !l.soft && (l.field === "income" || l.field === "incomeBands"))
    .reduce((m, l) => Math.max(m, l.field === "income" ? l.lte : l.field === "incomeBands" ? Math.max(...l.bands.map((x) => x[1] ?? Infinity)) : 0), -1);
  const hasIncome = incomeMax >= 0;
  // 규칙의 '묻지 않는 조건'에 저소득이 적힌 경우 (예: '부모와 따로 사는 저소득 청년')
  const unaskedLow = leaves.find((l) => l.field === "unasked" && !l.soft && LOW_RE.test(l.label));
  if (!benefitHandled && !EXCLUDED.test(text)) {
    // 대상 문구의 유형 줄(○·• 등)만 센다 — 이름 줄과 '*', '※' 로 시작하는 덧붙임 줄은 빼고
    const nameGate = ANY_GATE.test(p.name);
    const lead2 = text.slice(text.indexOf("\n") + 1).replace(/[※*]/g, "\n$&");
    const lines0 = lead2.split(/\n|○|•|·\s(?=\S)/).map((l) => l.trim()).filter((l) => l.length > 4 && !/^[※*]/.test(l));
    // 시설·기관 유형 줄(예: '사회복지시설')은 개인 판정에서 뺀다 — 개인은 나머지 유형으로 (QA 2차 C3: 고효율조명기기)
    const personLines = lines0.filter((l) => !FACILITY_LINE.test(l));
    const lines = personLines.length ? personLines : lines0;
    const gated = lines.filter((l) => ANY_GATE.test(l));
    // 관문 낱말은 이름과 유형 줄에서만 찾는다 (덧붙임 줄의 '활동지원 수급자였다가' 같은 말은 대상 조건이 아님)
    // '장기요양 수급자'·'활동지원 수급자'·'기초연금 수급자' 같은 말의 '수급자'는 기초생활수급이 아님
    const core = `${p.name}\n${lines.join("\n")}`.replace(OTHER_RECIPIENT, (_m, w: string) => (/기초\s*연금/.test(w) ? "기초연금 받는 분" : " ")).replace(/(건강\s*보험\s*적용자\s*\+?\s*)?의료\s*급여\s*적용자/g, " ");
    // 장기요양·활동지원 사업 안에서 홀로 쓰인 '수급자'는 그 제도의 수급자 (예: '시설급여 가능한 수급자')
    const coreX = /장기\s*요양|요양\s*등급|활동\s*지원/.test(core) ? core.replace(/(?<!기초\s*생활\s*)(?<!급여\s*)수급(?:권)?자/g, " ") : core;
    if (INCOME_FREE.test(text)) partial = false;
    else if (!nameGate && lines.length >= 2 && gated.length && gated.length < lines.length) {
      partial = true;
      // 유형 중 하나가 수급·차상위 (예: 장제급여 — 수급자 사망 / 의사자) → 수급·차상위가 아니면 다른 유형인지 확인해야 함
      partialRec = gated.some((l) => { const x = l.replace(/^(저소득\s*층?|취약\s*계층)\s*[:：]/, ""); return RECIPIENT_RE.test(x.replace(OTHER_RECIPIENT, " ")) && !LOW_RE.test(x) && !MEDIAN_RE.test(x); });
    }
    else {
      const m = MEDIAN_RE.exec(coreX);
      const rec = RECIPIENT_RE.exec(coreX);
      // 이름의 '취약계층'·'저소득' 같은 넓은 말은 대상 문구가 수급·차상위로 좁혀 두었으면 보지 않는다
      //   예) '경기도 취약계층 주택화재 안심보험' — 대상: 기초생활보장수급자와 차상위계층
      // '경제적 소외계층(기초생활수급자, 차상위계층)' 처럼 괄호로 풀어 쓴 넓은 말도 (괄호 안에 '등'이 없으면) 수급·차상위
      const linesX = coreX.slice(coreX.indexOf("\n") + 1).replace(DEFINED_LOW, (all, _w: string, inner: string) => (RECIPIENT_RE.test(inner) && !/등|포함|중위|소득/.test(inner) ? inner : all));
      const low = rec && !RECIPIENT_RE.test(p.name) ? LOW_RE.exec(linesX) : LOW_RE.exec(coreX);
      if (rec && RECIPIENT_PAREN.test(coreX)) {
        // '생계·의료수급가구(중위 40% 이하)' — 괄호의 비율은 수급 가구 설명일 뿐, 대상은 수급 가구
        gate = { kind: "recipient", text: rec[0] };
      } else if (m) {
        // 원문 비율이 소득 코드보다 좁을 때만 관문 (넓히지 않음 — QA 1차 C3: 원문 120%인데 코드는 200%까지)
        const pct = Number(m[1]);
        if (!hasIncome || pct < incomeMax) gate = { kind: "median", pct, text: m[0] };
      } else if (rec) {
        // 원문 대상이 '수급자·차상위'뿐이면 소득 코드(0~50%)가 있어도 수급·차상위 여부로 정한다
        //   (QA 1차 C3: 소득 구간만 맞는 비수급자에게 '의료급여 틀니'가 '받으실 수 있어요'로 나옴)
        // '저소득' 같은 넓은 말이 함께 있으면 소득 코드가 50% 이하일 때 코드로 충분
        if (low) {
          if (!hasIncome || incomeMax > 50) gate = { kind: "low", text: low[0] };
        } else gate = { kind: "recipient", text: rec[0] };
      } else if (low) {
        if (!hasIncome) gate = { kind: "low", text: low[0] };
      } else if (BASIC_PENSION_RE.test(coreX) && !hasIncome) gate = { kind: "basicPension", text: "기초연금 수급" };
    }
    if (!gate && !partial && !hasIncome && unaskedLow) gate = { kind: "low", text: LOW_RE.exec(unaskedLow.label)![0] };
  }
  // (QA 2차 C3) 원문(선정기준 전문 포함)이 수급·차상위인데 규칙은 소득 코드 0~50%뿐 (refine.ts recBand)
  //  → 소득 구간만 맞는 비수급자는 '신청할 때 확인' (수급·차상위면 그대로)
  if (p.rule.recBand && gate?.kind !== "recipient") partialRec = true;
  const out: GateInfo = { gate, priority, partial, ...(partialRec ? { partialRec } : {}) };
  gateCache.set(p, out);
  return out;
}

/** 이름에 숫자가 없는 '저소득'의 기준으로 보는 선 (차상위 50% + 여유) */
export const LOW_INCOME_PCT = 60;

type GateState = "met" | "no" | "unknown";

function incomeTri(prof: Profile, pct: number, exact: number | null = null): GateState {
  if (exact !== null) return exact <= pct ? "met" : "no";
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
      return incomeTri(prof, LOW_INCOME_PCT, incomePctOf(s));
    }
    case "median": {
      if (anyRec && g.pct >= 50) return "met";
      return incomeTri(prof, g.pct, incomePctOf(s));
    }
    case "basicPension":
      return b.basic_pension === true ? "met" : b.basic_pension === false ? "no" : "unknown";
  }
}

/* ---------------- 추가 질문 (차원) ---------------- */

export type DimId = "age" | "support" | "basicPension" | "income" | "disability" | "care" | "ltcGrade" | "alone" | "veteran" | "singleParent" | "multicultural" | "housing" | "activity" | "illness" | "children";

export interface Answer {
  key: string;
  label: string;
  apply: (s: Situation) => Situation;
}

export interface Dim {
  id: DimId;
  /** 질문 (부모님/본인 말투 · 이미 아는 답에 맞춰) */
  q: (mode: FindMode, s?: Situation) => string;
  help?: string;
  answers: Answer[];
  isUnknown: (s: Situation) => boolean;
  /** 이 상황(본인/부모님·나이)에서 물을 수 있는 질문인지 (없으면 언제나) */
  avail?: (s: Situation) => boolean;
  /** 이미 아는 답과 어긋나는 보기를 뺀다 (예: 자녀 수를 알면 '자녀 없음') */
  hide?: (a: Answer, s: Situation) => boolean;
}

/** 이 상황에서 보여줄 보기 */
export const answersFor = (d: Dim, s: Situation) => (d.hide ? d.answers.filter((a) => !d.hide!(a, s)) : d.answers);

/** 60세 이상인지: 'yes' | 'no' | 'unknown' (나이 범위를 말했으면 범위로 — '30대'는 'no') */
const seniorOf = (s: Situation) => {
  if (s.profile.age !== "unknown") return ageRange(s.profile.age)[1] >= 60 ? "yes" : "no";
  const sp = s.x.ageSpan;
  if (!sp) return "unknown";
  return sp[0] >= 60 ? "yes" : sp[1] < 60 ? "no" : "unknown";
};
/** 기초연금·장기요양 질문: 부모님 찾기는 나이를 모를 때도, 본인 찾기는 60세 이상이라고 답했을 때만 */
const seniorQuestion = (s: Situation) => (s.mode === "self" ? seniorOf(s) === "yes" : seniorOf(s) !== "no");
/** 자녀·임신 질문: 본인 찾기에서 60세 미만(또는 나이 모름)일 때만 */
const childQuestion = (s: Situation) => s.mode === "self" && seniorOf(s) !== "yes";

export const dimAvailable = (d: Dim, s: Situation) => !d.avail || d.avail(s);

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
    isUnknown: (s) => s.x.benefits.basic_pension === undefined && (ageBoundsOf(s)?.[1] ?? 120) >= 65,
    avail: seniorQuestion,
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
    avail: seniorQuestion,
    answers: [
      { key: "yes", label: "예", apply: (s) => withX(s, { facts: { ...s.x.facts, ltcGrade: true } }) },
      { key: "no", label: "아니요", apply: (s) => withX(s, { facts: { ...s.x.facts, ltcGrade: false } }) },
    ],
  },
  {
    // 가구원 수 (QA 1차 H2·M2: 소득 기준·1인 가구 혜택이 이 답으로 정해짐) — id 는 예전 '혼자 사세요?' 질문과 같게 둔다
    id: "alone",
    q: (m) => subj(m, "함께 사는 가족은 본인 포함 몇 명인가요?", "부모님 댁에는 부모님 포함 몇 분이 사시나요?"),
    help: "소득 기준(기준 중위소득)과 1인 가구 혜택이 이 답으로 정해져요.",
    isUnknown: (s) => s.profile.householdSize === "unknown",
    answers: [
      { key: "yes", label: "1명 (혼자)", apply: (s) => withP(s, { householdSize: 1 }) },
      ...([2, 3, 4, 5] as const).map((n) => ({ key: String(n), label: `${n}명`, apply: (s: Situation) => withP(s, { householdSize: n }) })),
      { key: "6", label: "6명 이상", apply: (s) => withP(s, { householdSize: 6 }) },
    ],
  },
  {
    // 나이 (QA 1차 H2: 나이를 모르면 나이로 정해지는 혜택이 많아 가장 먼저 묻는다)
    id: "age",
    q: (m) => subj(m, "나이(만)가 어떻게 되세요?", "부모님 나이(만)가 어떻게 되세요?"),
    isUnknown: (s) => s.profile.age === "unknown",
    hide: (a, s) => {
      if (s.mode === "parent" && ["0-18", "19-24", "25-29", "30-34", "35-39"].includes(a.key)) return true;
      // '30대'처럼 범위를 말했으면 그 범위 안의 보기만
      const sp = s.x.ageSpan;
      if (!sp) return false;
      const [lo, hi] = ageRange(a.key as Exclude<Profile["age"], "unknown">);
      return hi < sp[0] || lo > sp[1];
    },
    answers: AGE_BANDS.filter((b) => b !== "0-18").map((b) => ({ key: b, label: AGE_LABEL[b], apply: (s: Situation) => withP(s, { age: b }) })),
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
    q: (m) => subj(m, "혼자 자녀를 키우는 한부모 가구인가요? (조부모가 손주를 키우는 조손 가구 포함)", "부모님이 손주를 키우고 계신가요 (조손 가구)?"),
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
      { key: "employed", label: "예, 직장에 다녀요", apply: (s) => withP(s, { activity: "employed" }) },
      { key: "self_employed", label: "자영업", apply: (s) => withP(s, { activity: "self_employed" }) },
      { key: "job_seeking", label: "일자리를 찾고 있어요", apply: (s) => withP(s, { activity: "job_seeking" }) },
      { key: "student", label: "학생", apply: (s) => withP(s, { activity: "student" }) },
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
  {
    id: "children",
    q: (_m, s) =>
      s?.x.childCount ? `자녀${s.x.childCount === 3 ? "(3명 이상)" : ` ${s.x.childCount}명`}의 나이는요? (여럿이면 가장 어린 자녀)` : "함께 사는 자녀가 있나요? (임신 중이면 '임신 중')",
    help: "자녀가 여럿이면 가장 어린 자녀를 고르고, '상황 고치기'에서 모두 고를 수 있어요.",
    isUnknown: (s) => s.profile.children === null,
    avail: childQuestion,
    hide: (a, s) => a.key === "none" && !!s.x.childCount,
    answers: [
      { key: "none", label: "자녀 없음", apply: (s) => withX(withP(s, { children: [] }), { childCount: 0 }) },
      ...(["pregnant", "0-1", "2-5", "6-12", "13-18", "19+"] as const).map((c) => ({
        key: c,
        label: CHILD_LABEL[c],
        apply: (s: Situation) => withP(s, { children: [c] }),
      })),
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
      case "age": out.add("age"); break;
      case "income": case "incomeBands": out.add("income"); out.add("alone"); break;
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
      case "children": case "childAge": out.add("children"); break;
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
    out.add("alone");
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
  /** 간편 입력으로 묻지 않는 대상 집단이라 '신청할 때 확인'으로 둔 이유 (예: 장애 유형) */
  why?: string;
  /** 신청하면 그 과정에서 정해지는 조건 (예: 장기요양등급 판정) — 미리 갖출 필요 없음 */
  process?: string;
}

/** 장기요양 '인정 신청' 자체 (등급은 신청하면 공단이 판정) — 등급을 받은 뒤의 급여·용구 사업은 제외 */
const LTC_APPLY = /^노인\s*장기\s*요양\s*보험$|장기\s*요양\s*(인정|등급\s*(신청|판정))/;
const LTC_AFTER = /(급여|용구|재가|시설|가족|요양보호사|본인\s*부담|감경)/;
const LTC_PROCESS = "신청하면 국민건강보험공단이 방문 조사로 장기요양등급을 정해요 (미리 등급이 없어도 돼요).";

/** 간편 입력이 묻지 않는 대상 집단 (이름에 적힘) → 조건이 다 맞아도 '신청할 때 확인' */
const OFFICE_GROUPS: [RegExp, string][] = [
  [/(발달\s*장애|지적\s*장애|자폐|시각\s*장애|중도\s*시각|청각\s*장애|언어\s*장애|지체\s*장애|뇌병변|척수\s*장애|정신\s*장애|신장\s*장애|농아|점자|수어|보조견)/, "장애 유형은 묻지 않았어요 — 이 유형에 해당하는지 신청할 때 확인"],
  [/(간호사|간호조무사|요양보호사|건설\s*기능|건설\s*근로|건설\s*노동|농업인|어업인|임업인|농어업인|예술인|선원|해녀|장병|제대\s*군인|소방관|택시|화물)/, "직업·신분 조건이 있어요 — 해당하는지 신청할 때 확인"],
  [/(운영\s*지원|기관\s*지원|대관|설치\s*운영)/, "기관·시설을 지원하는 사업이에요 — 이용할 수 있는지 문의"],
];

/**
 * 직업·자격·추천이 있어야 하는 사업 (QA 2차 C3): 간편 입력은 직업·자격을 묻지 않으므로 '받으실 수 있어요'로 두지 않는다.
 * 이름이나 대상 문구 앞부분에서 찾는다 — 예) KPF 디플로마(언론인·추천), 대한민국명장(15년 이상 숙련기술자), 국제심판 양성
 */
// '기관·학교장 추천'은 선정 절차라 직업 조건이 아님 (일상돌봄·학비 지원 등 오탐) — 넣지 않는다.
// 공무원·교사·법인·종사자·재직은 '○○ 제외'·'시설 종사자'·'재직 중인 직장인'처럼 직업 조건이 아닌 쓰임이 많아 넣지 않는다 (직장 여부는 '하고 있는 일' 질문이 맡음).
export const OCCUPATION_RE = /(언론인|숙련\s*기술|명장|(?:국제|생활|전문)\s*심판|변리사|교원(?!\s*자녀)|체육인|운동\s*선수|선수\s*(?:출신|경력|등록)|(?:전문|생활)\s*체육\s*지도자|예술인|농업인|어업인|임업인|농어업인|어선원|소상공인|자영업자|개인\s*사업자|사업자\s*등록|창업(?:자|기업|\s*\d)|(?:중소|벤처|사회적)\s*기업\s*대표|기업\s*대표|자격증\s*(?:소지|보유|취득)|면허\s*(?:소지|보유)|\d+\s*년\s*이상\s*(?:종사|경력|숙련))/g;
const OCCUPATION_WHY = "직업·자격 조건이 있어요 (간편 입력으로는 묻지 않아요) — 해당하는지 신청할 때 확인";
/** 같은 줄에 이런 말이 있으면 직업 낱말은 조건이 아님: 제외 문구, 또는 일반 개인 유형과 나란히 적힌 경우 ('청년 근로자, 소상공인') */
const OCC_EXCLUDE = /(제외|아닌|불가|해당\s*없|해당하지|미해당)/;
const OCC_ORDINARY = /(근로자|노동자|피보험|고용보험|국민|주민|가구|주택|학생|아동|청소년|노인|어르신|장애인|누구나|구직자|취업\s*준비생|사회\s*초년생|임산부|부모|다자녀|한부모|수급자|차상위|유공자|보훈)/;
/** 소득·관문 판정 전에 보는 대상 문구 앞부분 (유형 줄 몇 개) */
const leadText = (p: Program) => `${p.name}\n${(p.target ?? "").replace(/&#13;/g, "\n").slice(0, 250)}`;
export function needsOccupation(p: Program): boolean {
  if (leavesOf(p.rule.logic).some((l) => !l.soft && l.field === "activity")) return false;
  const text = leadText(p);
  // 대상 문구에 일반 개인 유형(근로자·주민·학생 등)이 함께 있으면 직업은 여러 대상 중 하나이거나 제외 대상 → 이름에 있을 때만
  const ordinary = OCC_ORDINARY.test(text.slice(p.name.length));
  for (const m of text.matchAll(OCCUPATION_RE)) {
    const idx = m.index ?? 0;
    if (idx < p.name.length) return true; // 이름에 있으면 (예: 대한민국명장, 언론인 금고)
    if (ordinary) continue;
    const start = Math.max(text.lastIndexOf("\n", idx), text.slice(0, idx).search(/[○ㅇ•□][^○ㅇ•□]*$/)) + 1;
    const endN = text.indexOf("\n", idx);
    const line = text.slice(start, endN < 0 ? undefined : endN);
    if (OCC_EXCLUDE.test(line) || OCC_ORDINARY.test(line)) continue;
    return true;
  }
  return false;
}
/**
 * 말하지 않은 신분·활동이 있어야 하는 사업 (QA 3차 C3 잔여·R2): 육아휴직·근로시간 단축 사용, 재직 기간, 자격 취득·응시,
 * 종사자·전문인력, 특정 분야 구직자, 대학 재학. 나이 코드만 맞는다고 '받으실 수 있어요'로 두지 않는다.
 * strong: 대상 문구 어디에 있어도 조건 (일반 개인 낱말이 함께 있어도). weak: 이름에 있거나, 대상에 일반 개인 유형이 없을 때만.
 */
const STATUS_KINDS: { re: RegExp; label: string; strong: boolean; lead?: number; skip?: (s: Situation) => boolean; coveredBy?: string }[] = [
  { re: /(육아기\s*근로\s*시간\s*단축|육아\s*휴직)[^\n]{0,30}(실시|사용|중인|한\s*(?:근로자|사람|자))|근로\s*시간\s*단축\s*급여|육아\s*휴직\s*등?\s*급여/, label: "육아휴직·근로시간 단축 사용", strong: true, lead: 160 },
  { re: /(산업체|기업)\s*재직\s*(?:기간|경력|요건)|재직\s*(?:기간|경력)\s*(?:이\s*)?\d|\d+\s*년\s*이상\s*재직|재직\s*요건/, label: "재직 기간·소속", strong: true },
  { re: /자격(?:증)?(?:을|의)?\s*취득(?:자|한\s*(?:사람|자|분))|자격증?\s*소지자|검정을\s*받으려는|시험\s*응시(?:자|료)|응시\s*(?:료|수수료)/, label: "자격 취득·시험 응시", strong: true },
  { re: /(?<![가-힣])(?:종사자|전문\s*인력|현장\s*교사|실습생을\s*지도|교원|강사|담당자|실무자)(?!\s*(?:제외|자녀))/, label: "종사자·전문인력", strong: false },
  { re: /\S+\s*분야\s*(?:구직자|취업\s*준비생)/, label: "특정 분야 구직·종사", strong: true },
  { re: /대학(?:원)?\s*재학|대학(?:원)?생(?!\s*자녀)|사업\s*참여\s*대학/, label: "대학 재학", strong: false, skip: (s) => s.profile.activity === "student", coveredBy: "student" },
];
const STATUS_ORDINARY = new RegExp(`${OCC_ORDINARY.source}|시민|도민|청년|신혼|고령자|노인가족|취업\\s*준비|재직자|자녀`);
export function needsStatus(p: Program, s?: Situation): string | null {
  // 하는 일 질문(학생 등)이 이미 정하는 조건은 빼고 — 육아휴직 사용·재직 기간·특정 분야는 '직장인·구직자' 답만으로 알 수 없음
  const act = leavesOf(p.rule.logic).filter((l) => !l.soft && l.field === "activity").flatMap((l) => ("anyOf" in l && Array.isArray(l.anyOf) ? (l.anyOf as string[]) : []));
  const text = `${p.name}\n${(p.target ?? "").replace(/&#13;/g, "\n").slice(0, 400)}`;
  const ordinary = STATUS_ORDINARY.test(text.slice(p.name.length));
  for (const k of STATUS_KINDS) {
    if (s && k.skip?.(s)) continue;
    if (k.coveredBy && act.includes(k.coveredBy)) continue;
    const scope = k.lead ? text.slice(0, p.name.length + 1 + k.lead) : text;
    for (const m of scope.matchAll(new RegExp(k.re.source, "g"))) {
      const idx = m.index ?? 0;
      if (idx < p.name.length) return k.label;
      const start = text.lastIndexOf("\n", idx) + 1;
      const endN = text.indexOf("\n", idx);
      const line = text.slice(start, endN < 0 ? undefined : endN);
      if (OCC_EXCLUDE.test(line)) continue;
      if (!k.strong && (ordinary || STATUS_ORDINARY.test(line))) continue;
      return k.label;
    }
  }
  return null;
}
export const statusWhy = (label: string) => `따로 조건(${label})이 있어요 — 말씀하신 내용으로는 알 수 없어 신청할 때 확인`;
/** 세부 서비스·대상을 지자체가 정하는 묶음 사업 (지역사회서비스투자사업, 청년성장프로젝트 등) */
const BUNDLE_RE = /자율적으로\s*(?:설정|정|선정)|지역사회서비스\s*투자|지역사회서비스\s*청년\s*사업단/;
const BUNDLE_WHY = "서비스마다 대상(소득·필요 등)을 지자체가 따로 정해요 — 신청할 때 확인";

/** 원문 대상에 시설·기관 유형 줄이 함께 있음 (예: '수급·차상위 가구 / 사회복지시설') — 개인은 다른 줄로 판정 */
const FACILITY_LINE = /^(?:[-○ㅇ·•*□]\s*)?(?:\S+\s*)?(?:사회\s*)?복지\s*시설|^(?:[-○ㅇ·•*□]\s*)?(?:\S+\s*)?(?:시설|기관|단체|법인)(?:\s|$|[,·(])/;
export const NOT_FOR_PERSON_WHY = "개인이 신청해 받는 혜택이 아니에요 (기관·단체 대상, 행사·모금 사업) — 자세한 내용은 원문 확인";

/** 출처 태그에서 온 soft 조건이 이 사업 이름·대상 문구와 무관하면 화면 문구에서 뺀다 (QA 2차 N6: 장기요양인정에 '등록 장애인') */
const SOFT_TOPIC: Partial<Record<Leaf["field"], RegExp>> = {
  disability: /장애/,
  care: /(돌봄|요양|거동|간병|수발|보호가\s*필요|도움이\s*필요|일상\s*생활)/,
  householdSize: /(1인|독거|홀몸|혼자|단독)/,
  trait: /(보훈|유공|한부모|조손|다문화|결혼\s*이민|북한|다자녀|1인|독거|홀몸)/,
  benefit: /(수급|차상위|기초\s*연금|생계|의료\s*급여|주거\s*급여)/,
  // 원문에 소득 이야기가 없는데 정부24 코드에서 온 '저소득' soft 잎 (예: 장기요양인정 '가구 소득이 월 128만원 이하는 맞아요')
  income: /(소득|중위|수급|차상위|저소득|기초\s*생활|생계|의료\s*급여|취약|빈곤|형편)/,
};
export function softIrrelevant(r: Reason, p: Program): boolean {
  const l = r.leaf;
  if (!l?.soft) return false;
  const re = SOFT_TOPIC[l.field];
  if (!re) return false;
  return !re.test(`${p.name}\n${(p.target ?? "").replace(/&#13;/g, "\n")}`);
}

export function classifyBase(p: Program, s: Situation): BaseResult {
  // soft 조건(원천 태그 등)은 답과 달라도 빼지 않는다 — 배타적이지 않은 신호라서 (감사 2026-10-07: 장애인연금·장기요양 등이 잘못 빠짐)
  const t = toEval(s, false);
  const profile = t.profile;
  const proc = LTC_APPLY.test(p.name) && !LTC_AFTER.test(p.name);
  const opts = proc ? { ...t.opts, facts: { ...t.opts.facts, ltcGrade: true } } : t.opts;
  const process = proc ? LTC_PROCESS : undefined;
  const ev0 = evaluateRule(p.rule, profile, opts);
  // 사업과 무관한 soft 조건(출처 태그)은 화면 문구에서 뺀다 — 판정 등급은 그대로 (N6)
  const ev = ev0.reasons.some((x) => softIrrelevant(x, p)) ? { ...ev0, reasons: ev0.reasons.filter((x) => !softIrrelevant(x, p)) } : ev0;
  const { gate, priority, partialRec } = textGate(p);
  const gs = gate ? gateState(gate, s, profile) : undefined;
  const r = { ev, gate, gateState: gs, priority, process };
  const recMet = RECIPIENT_KINDS.some((k) => inferExtras(s).benefits[k] === true);
  if (ev.tier === "ineligible") return { base: "no", ...r };
  if (gs === "no") return { base: "no", ...r };
  if (notForPersons(p)) return { base: "open", ...r, why: NOT_FOR_PERSON_WHY };
  if (!p.rule.logic || p.rule.unstructuredCore) return { base: "open", ...r };
  // 생계·의료·주거·교육급여, 차상위 확인: 소득이 기준 안이어도 재산·부양 조사를 거쳐 정해짐 → 최대 '신청할 때 확인'
  if (p.rule.meansTest) return { base: "open", ...r, why: evaluateCond(p.rule.logic, profile, opts).tri === "T" && gs !== "unknown" ? MEANS_WHY : "재산·부양 조사를 거쳐 정해져요 — 신청할 때 확인" };
  // 긴급지원은 소득 기준이 맞아도 '갑작스러운 위기'가 있어야 함 → 신청할 때 확인
  if (CRISIS.test(p.name) || NAMED_GROUP.test(p.name)) return { base: "open", ...r };
  const og = OFFICE_GROUPS.find(([re]) => re.test(p.name));
  if (og) return { base: "open", ...r, why: og[1] };
  if (needsOccupation(p)) return { base: "open", ...r, why: OCCUPATION_WHY };
  const st = needsStatus(p, s);
  if (st) return { base: "open", ...r, why: statusWhy(st) };
  if (BUNDLE_RE.test(`${p.name}\n${(p.target ?? "").slice(0, 400)}`)) return { base: "open", ...r, why: BUNDLE_WHY };
  if (EQUIP_RE.test((p.target ?? "").slice(0, 600))) return { base: "open", ...r, why: EQUIP_WHY };
  if (isBasicPension(p) && pensionLikely(s)) return { base: "open", ...r, why: PENSION_WHY };
  if (!recMet && recipientOrGuessedIncome(p.rule.logic)) return { base: "open", ...r, why: RECBAND_WHY };
  if (partialRec && !recMet) return { base: "open", ...r, why: p.rule.recBand ? RECBAND_WHY : "대상 유형이 여럿이에요 — 수급·차상위가 아니면 다른 유형(원문)에 해당하는지 신청할 때 확인" };
  if (ev.reasons.some((x) => x.kind === "note" && /법인·시설·단체/.test(x.text))) return { base: "open", ...r, why: "법인·시설·단체 대상 조건이 있어요 — 개인이 받을 수 있는지 문의" };
  const tri = evaluateCond(p.rule.logic, profile, opts).tri;
  if (tri === "T" && gs !== "unknown") return { base: p.rule.review === "auto" ? "autoFit" : "fit", ...r };
  return { base: "open", ...r };
}

/** 집 설비 조건 (QA 2차 5-2: 서민층 가스시설 개선 — LPG 호스를 쓰는 가구만) — 간편 입력으로는 묻지 않음 */
const EQUIP_RE = /(LPG|엘피지|액화\s*석유\s*가스|고무\s*호스|가스\s*호스)/;
const EQUIP_WHY = "집 설비 조건(LPG 가스 호스 사용 등)이 있어요 — 해당하는지 신청할 때 확인";
const RECBAND_WHY = "원문 대상이 수급·차상위(또는 그에 준하는 저소득층)예요 — 소득만으로 정하지 않고 신청할 때 확인";
const MEANS_WHY = "재산·부양 조사를 거쳐 정해져요 — 소득만 보면 신청해 볼 만해요";
const CRISIS = /긴급\s*(복지|지원|생계)|위기\s*가구/;
/** 이름 괄호 안에 따로 정한 대상 집단 — 예) 무료 소송대리 서비스(가족관계미등록자), (미혼모·부), (장애인1~3급) */
const NAMED_GROUP = /\(([^()]*(?:자|인|가족|민|대상|모|부|급|사건[^()]*))\)\s*$/;

/** 화면 분류: fit 받을 수 있어요 / ask 질문 하나로 정해져요 / office 신청할 때 확인 / no 맞지 않아 뺐어요 */
export type Bucket = "fit" | "ask" | "office" | "no";
export const BUCKET_LABEL: Record<Bucket, string> = { fit: "받으실 수 있어요", office: "신청할 때 확인", ask: "답하면 정해져요", no: "맞지 않아요" };

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
    if (!dimAvailable(d, s) || !d.isUnknown(s)) continue;
    if (answersFor(d, s).some((a) => classifyBase(p, a.apply(s)).base !== cur)) out.push(id);
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

/* ---------------- 순위 보정 (QA 1차 H1) ---------------- */

/** 기초연금 사업 자체 */
export const isBasicPension = (p: Program) => /^기초\s*연금$/.test(p.name.trim());
/**
 * 기초연금을 받을 가능성이 높음: 만 65세 이상, 아직 안 받음(또는 모름), 월 소득을 알고 선정기준액의 70% 이하
 * (소득인정액에는 재산 환산액이 더해지므로 '확정'이 아니라 '가능성 높음')
 */
export function pensionLikely(s: Situation): boolean {
  if (s.profile.age === "unknown" || ageRange(s.profile.age)[0] < 65) return false;
  if (inferExtras(s).benefits.basic_pension === true) return false;
  if (s.x.incomeManwon === null) return false;
  const t = s.profile.householdSize === "unknown" || s.profile.householdSize === 1 ? BASIC_PENSION_THRESHOLD_2026.single : BASIC_PENSION_THRESHOLD_2026.couple;
  return s.x.incomeManwon * 10000 <= t * 0.7;
}
/**
 * 기초연금을 받으실 수도 있음 (QA 2차 H1): 만 65세 이상, 아직 안 받음(또는 모름), 소득을 모르거나 선정기준액 이하.
 * 이때 기초연금은 '답하면 정해져요'에 접어 두지 않고 먼저 확인할 것의 맨 앞에 둔다 (어르신에게 가장 큰 현금 급여).
 */
export function pensionPossible(s: Situation): boolean {
  const b = ageBoundsOf(s);
  if (!b || b[0] < 65) return false;
  if (inferExtras(s).benefits.basic_pension === true) return false;
  if (s.x.incomeManwon === null) return s.profile.income === "unknown" || incomeRange(s.profile.income)[0] < 100;
  const t = s.profile.householdSize === "unknown" || s.profile.householdSize === 1 ? BASIC_PENSION_THRESHOLD_2026.single : BASIC_PENSION_THRESHOLD_2026.couple;
  return s.x.incomeManwon * 10000 <= t;
}
/** 기초연금을 말함 ('기초연금 받고 싶어요') + 아직 안 받음 + 65세 미만이 아님 */
const pensionWanted = (s: Situation) => !!s.x.interests?.includes("basic_pension") && inferExtras(s).benefits.basic_pension !== true && (ageBoundsOf(s)?.[1] ?? 120) >= 65;
/** 간편 입력이 묻지 않는 특별한 신분·처지 대상 (시설 보호아동·가정위탁·자립준비청년 등) — 목록에는 두되 먼저 확인할 것에는 넣지 않음 */
export const SPECIAL_STATUS = /(보호\s*대상\s*아동|유기\s*(?:및|·)?\s*위기\s*아동|가정\s*위탁|위탁\s*(?:아동|가정|부모)|아동\s*복지\s*시설|시설\s*(?:보호|입소|퇴소|아동)|자립\s*준비|보호\s*종료|입양|요보호|소년\s*소녀\s*가정|그룹\s*홈|공동\s*생활\s*가정)/;
/** 추천에서 뺄 이유가 적힌 '신청할 때 확인' (법인·시설·단체·직업 조건) */
const PICK_BLOCK_WHY = /(법인·시설·단체|기관·시설|직업·신분|직업·자격|개인이 신청해 받는 혜택이 아니에요|따로 조건\(|지자체가 따로 정해요)/;
export const PENSION_WHY = "소득만 보면 받으실 가능성이 높아요 — 재산(소득인정액)에 따라 달라요";
/** 누구나 받거나 안내 위주인 보편 서비스 (예방접종·검진·할인·상담 창구) — 앞자리를 핵심 급여에 양보 */
const UNIVERSAL_LOW = /(예방\s*접종|건강\s*검진|검진비|철도|공공\s*할인|생활\s*체육|스포츠\s*강좌|말벗|정신\s*건강\s*복지\s*센터|방문\s*건강\s*관리|안부)/;
const ILLNESS_NAME = /(수술|질환|치료비|환자|투병|난치|희귀|암\s*검진|치매)/;
export function rankAdj(i: V2Item, sit: Situation): number {
  const p = i.s.program;
  if (VICTIM_RE.test(p.name)) return -6;
  if (isBasicPension(p) && (pensionLikely(sit) || pensionWanted(sit))) return 6;
  if (isBasicPension(p) && pensionPossible(sit)) return 4;
  // 문장에서 말한 주제(신혼·실직·아기·치매·월세 등)의 사업은 앞으로
  if (programTopics(p.name, sit.x.interests, p.target).length) return 3;
  if (SPECIAL_STATUS.test(p.name)) return -4;
  if (i.base.why === MEANS_WHY) return 2;
  if (UNIVERSAL_LOW.test(p.name)) return -2;
  // 병·수술이 있어야 하는 사업은 병을 말하지 않았으면 뒤로 (예: '노인 무릎인공관절 수술'이 1순위가 되던 문제)
  if (sit.x.facts.illness !== true && (ILLNESS_NAME.test(p.name) || leavesOf(p.rule.logic).some((l) => l.field === "unasked" && FACT_PATTERNS.illness.test(l.label)))) return -2;
  return 0;
}

const MAIN: Filters = { tier: "eligible", category: null, org: null, q: "" };
/** 본문 대상: 자동 제공·기관 선정·기본 숨김(교육청·복지 외 분야·기관 운영) 제외 */
export const inMain = (p: Program) => !autoLike(p) && !hiddenByDefault(p, MAIN) && !notForPersons(p);

/** 개인이 받는 혜택이 아닌 사업 (QA 1차 C3·M1): 언론사·사회적기업·단체 대상, 공공기관 시설 체험 행사 */
const ORG_TARGET = /^[\s○ㅇ\-·•*]*(?:지원\s*대상\s*[:：]?\s*)?(?:신문|인터넷\s*신문|인터넷\s*뉴스|잡지|방송사|언론사|정기\s*간행물|사회적\s*기업|예비\s*사회적\s*기업|지원\s*대상\s*단체)(?=[\s,·、(]|사|$)/;
const ORG_NAME = /(기획\s*취재|언론사|신문사|방송사|렛츠런\s*파크|경마)/;
/** 기부·후원·모금 캠페인 (받는 혜택이 아니라 내는 사업 — QA 2차 C3: 사랑나눔 1인1나눔 계좌갖기) */
export const DONATION_RE = /(나눔\s*계좌|1\s*인\s*1\s*나눔|계좌\s*갖기|정기\s*후원|후원\s*(?:신청|회원|계좌|자\s*모집)|기부\s*(?:캠페인|신청|참여|약정)|모금\s*(?:캠페인|운동)|성금\s*모금|나눔\s*캠페인)/;
export const notForPersons = (p: Program) => ORG_NAME.test(p.name) || DONATION_RE.test(p.name) || ORG_TARGET.test((p.target ?? "").replace(/&#13;/g, "\n"));
/** 피해자·특정 사건 대상 사업 — 숨기지는 않되(필요한 분이 있음) 먼저 확인할 것·목록 앞에는 두지 않는다 (QA 1차 M1) */
export const VICTIM_RE = /(피해\s*아동|피해자|피해\s*청소년|학대|성착취|성매매|가정\s*폭력|성폭력|보호\s*전문\s*기관|범죄|유가족|참사|사건)/;

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
/**
 * 질문 답으로 혜택이 '열릴' 가능성 (대략의 사전 확률). 보훈·다문화처럼 드문 신분은 대부분 '아니요'라
 * 답해도 찾는 혜택이 늘지 않으므로 뒤로 (QA 2차 M2). 부모님 찾기에서는 돌봄·장기요양을 높게.
 */
export const RARE_DIMS: ReadonlySet<DimId> = new Set<DimId>(["veteran", "multicultural"]);

export function questionPrior(id: DimId, sit: Situation): number {
  const parent = sit.mode === "parent";
  switch (id) {
    case "veteran":
    case "multicultural":
      return 0.1;
    case "singleParent":
      return 0.25;
    case "illness":
    case "disability":
      return parent ? 0.5 : 0.3;
    case "care":
    case "ltcGrade":
      return parent ? 1 : 0.3;
    default:
      return 1;
  }
}

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
  const key = (g: V2Item[]) => g[0].s.score + (g[0].s.specific ? 1 : 0) + rankAdj(g[0], sit);
  for (const b of ORDER) out[b].sort((a, c) => key(c) - key(a));
  // 질문 순서: 정해지는 혜택의 관련도 제곱 합 — 관련 높은 혜택(기초연금·돌봄 등)을 정하는 질문 먼저, 그다음 많이 정하는 질문
  const count = new Map<DimId, Set<string>>();
  const weight = new Map<DimId, number>();
  for (const g of out.ask) for (const id of g[0].dims) {
    if (!count.has(id)) count.set(id, new Set());
    count.get(id)!.add(g[0].s.group);
    const sc = Math.max(0, key(g));
    weight.set(id, (weight.get(id) ?? 0) + sc * sc + 0.01);
  }
  // QA 2차 M2: 질문의 '값' = 정해지는 혜택의 관련도 × 그 답으로 혜택이 열릴 가능성(드문 신분은 낮게).
  // 나이를 모르면 나이부터 (QA 1차 H2). 가구원 수는 소득을 말했을 때만 앞에 둔다.
  // 월 소득을 말했는데 가구원 수를 모르면 소득 판단에 가구원 수가 꼭 필요하므로 나이 다음으로 (QA 1차 M2)
  const incomeKnown = sit.x.incomeManwon != null;
  const first = (id: DimId) => (id === "age" ? 2 : id === "alone" && incomeKnown ? 1 : 0);
  const value = (id: DimId) => (weight.get(id) ?? 0) * questionPrior(id, sit);
  // 보훈·다문화처럼 드문 신분은 먼저 묻지 않는다 (입력 화면에서는 언제든 답할 수 있음)
  const ranked = [...count]
    .filter(([id]) => !RARE_DIMS.has(id))
    .sort((a, b) => first(b[0]) - first(a[0]) || value(b[0]) - value(a[0]))
    .slice(0, maxQuestions);
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
      const hi = Math.max(...leaf.bands.map((b) => b[1] ?? Infinity));
      return Number.isFinite(hi) && hi < 1000 ? incomeLine(hi, prof) : leaf.label;
    }
    case "benefit":
      return benefitPlain(leaf.anyOf);
    case "care":
      return leaf.anyOf.includes("daily") ? "일상생활에 도움이 필요한 분" : "최근 퇴원한 분";
    case "disability":
      return leaf.severity === "severe" ? "심한 장애로 등록된 분" : leaf.severity === "mild" ? "심하지 않은 장애로 등록된 분" : "등록 장애인";
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

const PROXY = /가구원 본인 이름으로 신청/;
const reasonPlain = (r: Reason, prof: Profile) => {
  // 장애가 있는 가족(가구원) 이름으로 신청하는 경우
  if (r.kind === "unknown" && r.field === "disability" && PROXY.test(r.text)) return `${r.leaf ? plainLeaf(r.leaf, prof) : "장애인 본인"} — 장애가 있는 가족 이름으로 신청 (그 가족 기준으로 확인)`;
  if (r.leaf) return r.kind === "unknown" && r.leaf.capU ? `${r.leaf.label} (세부 기준)` : plainLeaf(r.leaf, prof);
  return r.text.replace(/\s+—\s.*$/, "").replace(/^(추가로 확인할 조건|상담으로 판단하는 조건):\s*/, "");
};
/** 신청 과정에서 정해지는 잎 조건 (장기요양등급) — 카드의 '맞은 조건'에서 뺀다 */
const isProcessLeaf = (r: Reason) => r.leaf?.field === "unasked" && FACT_PATTERNS.ltcGrade.test(r.leaf.label);
/** 받침에 맞춘 '은/는' (예: '만 6~64세는', '혼자 사는 분은') */
export function withTopic(t: string): string {
  const m = /([가-힣])[^가-힣]*$/.exec(t);
  if (!m) return /[0-9]$/.test(t) ? `${t}은` : `${t}은`;
  const code = m[1].charCodeAt(0) - 0xac00;
  // 끝 글자 뒤에 괄호·숫자 등이 붙어 있으면 끝 한글 기준
  return `${t}${code % 28 === 0 ? "는" : "은"}`;
}
const short = (t: string, n = 70) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

/** 카드 한 줄: 사용자 말로 */
export function plainLine(i: V2Item, sit: Situation, mode: FindMode): string {
  const { profile } = toEval(sit);
  const ev = i.base.ev;
  const met = ev.reasons.filter((r) => r.kind === "met" && r.leaf?.field !== "resident" && !(i.base.process && isProcessLeaf(r))).map((r) => reasonPlain(r, profile));
  const who = mode === "parent" ? "부모님이" : "";
  switch (i.bucket) {
    case "fit": {
      // 원문 소득 관문(저소득·중위 N%)이 맞았으면 소득 코드 줄은 빼고 관문 한 줄만 (소득 문구 중복 — QA 2차 L1)
      const gateIncome = i.base.gate && i.base.gateState === "met" && (i.base.gate.kind === "low" || i.base.gate.kind === "median");
      const parts = gateIncome ? ev.reasons.filter((r) => r.kind === "met" && r.leaf?.field !== "resident" && r.leaf?.field !== "income" && r.leaf?.field !== "incomeBands" && !(i.base.process && isProcessLeaf(r))).map((r) => reasonPlain(r, profile)) : [...met];
      if (i.base.gate && i.base.gateState === "met") parts.push(gateLine(i.base.gate, profile));
      const head = parts.length ? `${[...new Set(parts)].slice(0, 3).join(" · ")} — ${who ? who + " " : ""}해당돼요.` : "입력하신 상황으로 조건이 맞아요.";
      if (i.base.process) return `${head} ${i.base.process}`;
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
      // 개인 대상이 아닌 사업은 '맞은 조건'을 앞에 쓰지 않는다
      const metLead = met.length && i.base.why !== NOT_FOR_PERSON_WHY ? `${withTopic([...new Set(met)].slice(0, 2).join(" · "))} 맞아요. ` : "";
      const named = NAMED_GROUP.exec(i.s.program.name);
      if (named) return `${metLead}신청할 때 확인: '${named[1]}'에 해당하는 분만 받을 수 있어요.`;
      if (CRISIS.test(i.s.program.name)) return `${metLead}갑작스러운 위기(실직·질병·사고 등)가 생겼을 때 받는 지원이에요.`;
      if (i.base.why) return `${metLead}신청할 때 확인: ${i.base.why.replace(/ — /, ". ")}`;
      if (i.base.base === "autoFit") return `${metLead}신청할 때 확인: 세부 자격 (조건을 원문에서 자동으로 정리했어요)`;
      const unk = ev.reasons.find((r) => r.kind === "unknown") ?? ev.reasons.find((r) => r.kind === "note");
      return `${metLead}신청할 때 확인: ${unk ? short(reasonPlain(unk, profile), 60) : "세부 자격(원문)"}`;
    }
    case "no": {
      if (i.base.gate && i.base.gateState === "no") return `${gateLine(i.base.gate, profile)} 대상이라 맞지 않아요.`;
      const un = ev.reasons.find((r) => r.kind === "unmet");
      if (un && !un.leaf && /중 해당하는 항목이 없어요$/.test(un.text)) return `${short(un.text.replace(/없어요$/, "없어"))} 맞지 않아요.`;
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
  return { ...s.profile, income: incomeOf(s), benefits: pick(BENEFITS, x.benefits), traits: pick(HOUSEHOLD_TRAITS, x.traits) ?? s.profile.traits };
}

/** 머리글 요약 (지역 제외) */
export function situationChips(s: Situation): string[] {
  const p = s.profile;
  const out: string[] = [];
  if (p.age !== "unknown") {
    const [a, b] = ageRange(p.age);
    out.push(b >= 120 ? `만 ${a}세 이상` : `만 ${a}~${b}세`);
  } else if (s.x.ageSpan) {
    // 말한 나이 범위 (예: '30대') — 정확한 나이는 아래 질문으로
    const [a, b] = s.x.ageSpan;
    out.push(a % 10 === 0 && b === a + 9 ? `${a}대 (정확한 나이 모름)` : `만 ${a}~${b}세 (정확한 나이 모름)`);
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
  // 기초연금은 60세 이상(또는 나이 모름)일 때만 보여 준다 (청년·중년 화면에 '기초연금 안 받음'이 뜨지 않게)
  const seniorish = p.age === "unknown" || ageRange(p.age)[1] >= 60;
  if (x.benefits.basic_pension === true) out.push("기초연금 받음");
  else if (x.benefits.basic_pension === false && seniorish) out.push("기초연금 안 받음");
  if (p.care?.length) out.push("일상생활 도움 필요");
  if (p.disability === "none") out.push("장애 없음");
  else if (p.disability === "member") out.push("가족 중 장애 있음");
  else if (p.disability !== "unknown") out.push("장애 있음");
  return out;
}

/* ---------------- 먼저 확인할 5가지 · 자동으로 받는 혜택 ---------------- */

/**
 * 먼저 확인할 n개: '받으실 수 있어요'(가산 +3)와 '신청할 때 확인' 중 관련도 순.
 * 내 상황을 콕 집은 사업(specific)을 먼저 채우고, 같은 계열(양육비 이행 원스톱/지원 등)은 하나만.
 * '답하면 정해져요'·'뺐어요'는 넣지 않는다 (애매한 것을 맨 위에 올리지 않음).
 */
export function topPicksV2(view: Pick<V2View, "fit" | "office"> & Partial<Pick<V2View, "ask">>, n = 5, sit?: Situation): V2Item[][] {
  // '받으실 수 있어요'에 +2 (v1 추천의 '조건 충족' 가산과 같게) — 관련도가 확실히 높은 '신청할 때 확인'(장애인 활동지원 등)은 앞설 수 있다
  // 순위 보정: 기초연금 가능성 높음 +4, 소득 기준 안의 공공부조 +2, 보편 서비스(예방접종 등) −2
  const key = (g: V2Item[]) => g[0].s.score + (g[0].bucket === "fit" ? 2 : 0) + (g[0].reviewed ? 0.5 : 0) + (sit ? rankAdj(g[0], sit) : 0);
  // 기초연금은 '이미 받고 계신지'·소득만 남아 '답하면 정해져요'여도 65세 이상이면 먼저 확인할 것에 넣는다 (QA 1차 H1, 2차 H1)
  const pensionFirst = !!sit && (pensionLikely(sit) || pensionPossible(sit) || pensionWanted(sit));
  const pension = pensionFirst ? (view.ask ?? []).filter((g) => isBasicPension(g[0].s.program)) : [];
  // 문장에서 말한 주제의 사업은 '답하면 정해져요'여도 후보로 (예: '실직했어요' → 실업급여, '돌 안 된 아기' → 부모급여)
  const topical = sit?.x.interests?.length ? (view.ask ?? []).filter((g) => programTopics(g[0].s.program.name, sit.x.interests, g[0].s.program.target).length && !isBasicPension(g[0].s.program)) : [];
  const pool = [...view.fit, ...view.office, ...pension, ...topical].sort((a, b) => key(b) - key(a) || a[0].s.program.name.localeCompare(b[0].s.program.name, "ko"));
  // 나이를 정확히 모르면 나이로 정해지는 혜택은 앞에 두지 않는다 (범위에 걸치는 것은 '답하면 정해져요')
  const ageUnknown = !!sit && sit.profile.age === "unknown";
  const out: V2Item[][] = [];
  const fams = new Set<string>();
  for (const pass of [true, false]) {
    for (const g of pool) {
      if (out.length >= n) break;
      if (out.includes(g)) continue;
      const p = g[0].s.program;
      const forced = pension.includes(g);
      const onTopic = forced || (!!sit && programTopics(p.name, sit.x.interests, p.target).length > 0);
      if (pass && g[0].s.specific === false && !onTopic) continue;
      // 내 상황과 이어지는 근거가 있는 것만 (QA 2차 N3: 조건 없이 누구나 맞는 상담 창구·나이만 걸친 자동 정리 사업이 1~5위를 채우던 문제)
      if (!onTopic && sit && !hasSubstance(g[0], sit)) continue;
      if (VICTIM_RE.test(p.name) || SPECIAL_STATUS.test(p.name)) continue;
      // '법인·시설·단체 대상', '직업·자격 조건'이 적힌 항목은 추천하지 않는다 (QA 2차 M1·N3)
      if (g[0].base.why && PICK_BLOCK_WHY.test(g[0].base.why)) continue;
      if (ageUnknown && !forced && (g[0].dims.includes("age") || g[0].base.ev.reasons.some((r) => r.kind === "unknown" && r.field === "age"))) continue;
      const fk = familyKey(p.name);
      if (fams.has(fk)) continue;
      fams.add(fk);
      out.push(g);
    }
  }
  const sorted = out.sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
  // 기초연금은 맨 앞 (65세 이상이고 아직 안 받는 분에게 가장 큰 현금 급여 — 말했으면 더욱)
  const pi = sorted.findIndex((g) => isBasicPension(g[0].s.program));
  if (pensionFirst && pi > 0) sorted.unshift(...sorted.splice(pi, 1));
  return sorted;
}

/**
 * 추천 근거: 맞은 조건 중 사는 곳 말고 내 상황(수급·소득·가구·자녀·장애·돌봄·주거·일 등)이 하나라도 있음.
 * 나이만 맞은 경우는 나이를 정확히 알 때만 (예: 73세 → 노인일자리), 나이 범위로 맞은 것은 근거로 보지 않음.
 */
function hasSubstance(i: V2Item, sit: Situation): boolean {
  const met = i.base.ev.reasons.filter((r) => r.kind === "met" && r.field !== "resident");
  if (met.some((r) => r.field !== "age")) return true;
  if (i.base.gate && i.base.gateState === "met") return true;
  return met.length > 0 && sit.profile.age !== "unknown";
}

/**
 * 신청하지 않아도 받는(자동 제공·기관 선정) 사업 중 답한 상황과 어긋나지 않고 관련 있는 것 (본문과 따로 접어 둔다).
 * 기본 숨김(교육청·복지 외 분야·기관 운영)은 뺀다.
 */
export function autoV2(programs: Program[], sit: Situation): Group[] {
  const { profile, opts } = toEval(sit, false);
  const pool = programs.filter((p) => autoLike(p) && !hiddenByDefault(p, MAIN));
  const scored = scoreAll(pool, profile, (p) => evaluateRule(p.rule, profile, opts)).filter((x) => x.score > 0 && classifyBase(x.program, sit).base !== "no");
  const key = (x: Scored) => x.score + (x.ev.tier === "eligible" ? 2 : 0);
  return groupVariants([...scored].sort((a, b) => key(b) - key(a) || a.program.name.localeCompare(b.program.name, "ko")));
}

/** 한 사업 판정 (상세 화면용) — 관련도 없이 */
export function classifyOne(p: Program, sit: Situation): V2Item {
  const { profile, opts } = toEval(sit, false);
  const ev = evaluateRule(p.rule, profile, opts);
  const s: Scored = { program: p, ev, met: 0, score: 0, group: p.name };
  return classify(s, sit);
}

/* ---------------- 상세: 내 답과 맞은 것·어긋난 것·남은 질문 ---------------- */

export interface ExplainLine {
  /** 조건 (쉬운 말) */
  cond: string;
  /** 내 답 (쉬운 말). 없으면 답하지 않음 */
  answer?: string;
}

export interface Explain {
  matched: ExplainLine[];
  failed: ExplainLine[];
  unknown: ExplainLine[];
  /** 신청할 때 확인할 원문 조건 (간편 입력으로 묻지 않는 것) */
  notes: string[];
}

const ACTIVITY_PLAIN: Record<string, string> = { employed: "직장에 다님", self_employed: "자영업", job_seeking: "일자리를 찾는 중", student: "학생", none: "일하지 않음" };
const HOUSING_PLAIN: Record<string, string> = { own: "자가", jeonse: "전세", monthly: "월세", public_rental: "공공임대", other: "기타" };

/** 이 조건에 대해 사용자가 한 답 (쉬운 말). 답하지 않았으면 undefined */
export function answerText(field: Leaf["field"] | "gate", sit: Situation, leaf?: Leaf): string | undefined {
  const p = sit.profile;
  const x = inferExtras(sit);
  const size = sizeOf(p);
  const income = () => {
    if (sit.x.incomeManwon !== null) return `월 ${sit.x.incomeManwon.toLocaleString("ko-KR")}만원${size ? ` (${size}인 가구 기준중위소득의 약 ${Math.round((sit.x.incomeManwon * 1e6) / medianWon(100, size))}%)` : ""}`;
    return p.income === "unknown" ? undefined : `기준중위소득 ${p.income}% 이하 구간`;
  };
  const support = () => {
    const rec = RECIPIENT_KINDS.filter((k) => x.benefits[k] === true);
    if (rec.length) return rec.map((k) => BENEFIT_PLAIN[k].replace(/\(.*$/, "")).join("·") + " 받음";
    if (RECIPIENT_KINDS.every((k) => x.benefits[k] === false)) return sit.x.benefits.livelihood === undefined ? "수급·차상위 아님 (소득으로 추정)" : "수급·차상위 아님";
    return undefined;
  };
  switch (field) {
    case "age":
      return p.age === "unknown" ? undefined : situationChips({ ...sit, profile: { ...EMPTY_AGE_ONLY, age: p.age } })[0];
    case "income": case "incomeBands":
      return income() ?? support();
    case "gate":
      return [support(), income()].filter(Boolean).join(" · ") || undefined;
    case "benefit": {
      if (leaf?.field === "benefit" && leaf.anyOf.length === 1 && leaf.anyOf[0] === "basic_pension") {
        return x.benefits.basic_pension === undefined ? undefined : x.benefits.basic_pension ? "기초연금 받음" : "기초연금 안 받음";
      }
      const parts = [support(), x.benefits.basic_pension === true ? "기초연금 받음" : undefined].filter(Boolean);
      return parts.length ? parts.join(" · ") : undefined;
    }
    case "care":
      return p.care === null ? undefined : p.care.includes("daily") ? "일상생활 도움 필요" : p.care.includes("discharged") ? "최근 퇴원" : "도움 필요 없음";
    case "disability":
      if (p.disability === "unknown") return undefined;
      if (p.disability === "none") return "장애 없음";
      return `${p.disability === "member" ? "가족 중 " : ""}${p.disabilitySeverity === "severe" ? "심한 장애" : p.disabilitySeverity === "mild" ? "심하지 않은 장애" : "장애 있음"}`;
    case "householdSize":
      return size === null ? undefined : size === 1 ? "혼자 삶" : `${size}명 가구`;
    case "trait": {
      const t = { ...x.traits, ...(size !== null ? { single: size === 1 } : {}) };
      const on = (Object.keys(t) as HouseholdTrait[]).filter((k) => t[k] === true);
      const known = (Object.keys(t) as HouseholdTrait[]).filter((k) => t[k] !== undefined);
      if (leaf?.field === "trait") {
        const hit = leaf.anyOf.filter((k) => t[k] === true);
        if (hit.length) return hit.map((k) => TRAIT_PLAIN[k]).join("·");
        if (leaf.anyOf.every((k) => t[k] === false)) return leaf.anyOf.map((k) => `${TRAIT_PLAIN[k]} 아님`).join(" · ");
        return undefined;
      }
      return known.length ? (on.length ? on.map((k) => TRAIT_PLAIN[k]).join("·") : "해당 없음") : undefined;
    }
    case "housing":
      return p.housing === "unknown" ? undefined : HOUSING_PLAIN[p.housing];
    case "activity":
      return p.activity === "unknown" ? undefined : ACTIVITY_PLAIN[p.activity];
    case "children": case "childAge":
      if (p.children === null) return undefined;
      return p.children.length ? p.children.map((c) => CHILD_LABEL[c]).join(", ") : "자녀 없음";
    case "unasked": {
      if (!leaf) return undefined;
      for (const [k, re] of Object.entries(FACT_PATTERNS)) {
        if (!re.test(leaf.label)) continue;
        if (k === "pension70" && x.benefits.basic_pension === true) return "기초연금 받음";
        const v = x.facts[k as FactId];
        if (v === undefined) return undefined;
        return { ltcGrade: v ? "장기요양등급 있음" : "장기요양등급 없음", pension70: v ? "해당" : "해당 없음", illness: v ? "치료 중인 병 있음" : "치료 중인 병 없음" }[k as FactId];
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

const EMPTY_AGE_ONLY: Profile = { sido: null, sigungu: null, age: "unknown", householdSize: "unknown", traits: null, children: null, income: "unknown", benefits: null, housing: "unknown", car: "unknown", activity: "unknown", care: null, disability: "unknown", disabilitySeverity: "unknown" };
const TRAIT_PLAIN: Record<HouseholdTrait, string> = { single: "1인 가구", single_parent: "한부모·조손 가구", multi_child: "다자녀 가구", multicultural: "다문화·북한이탈 가구", veteran: "보훈 대상" };

/** 상세 화면: 조건마다 내 답과 맞았는지 */
export function explainItem(i: V2Item, sit: Situation): Explain {
  const { profile } = toEval(sit);
  const out: Explain = { matched: [], failed: [], unknown: [], notes: [] };
  const seen = new Set<string>();
  const push = (list: ExplainLine[], line: ExplainLine) => {
    const k = line.cond;
    if (seen.has(k)) return;
    seen.add(k);
    list.push(line);
  };
  for (const r of i.base.ev.reasons) {
    if (r.leaf?.field === "resident") {
      push(out.matched, { cond: "이 지역에 사는 분", answer: "사는 곳" });
      continue;
    }
    if (r.kind === "note") {
      const t = reasonPlain(r, profile);
      if (!/재산·세부 요건은 원문|구조화된 자격 조건이 아직 없어요/.test(t)) out.notes.push(short(t, 140));
      continue;
    }
    const cond = r.leaf ? reasonPlain(r, profile) : short(reasonPlain(r, profile), 120);
    const answer = r.leaf ? answerText(r.leaf.field, sit, r.leaf) : undefined;
    if (r.kind === "met") push(out.matched, { cond, answer });
    else if (r.kind === "unmet") push(out.failed, { cond, answer: answer ?? r.text.match(/\(입력: (.*)\)$/)?.[1] });
    else if (r.softNo) push(out.unknown, { cond: `${cond} (원문 분류상 대상 — 신청처에서 확인)`, answer });
    else if (r.leaf?.field === "unasked" && !answer) out.notes.push(short(cond, 140));
    else push(out.unknown, { cond, answer });
  }
  const g = i.base.gate;
  if (g) {
    const line = { cond: gateLine(g, profile), answer: answerText("gate", sit) };
    if (i.base.gateState === "met") push(out.matched, line);
    else if (i.base.gateState === "no") push(out.failed, line);
    else push(out.unknown, line);
  }
  const named = NAMED_GROUP.exec(i.s.program.name);
  if (named) out.notes.unshift(`'${named[1]}'에 해당하는 분만 받을 수 있어요.`);
  if (CRISIS.test(i.s.program.name)) out.notes.unshift("갑작스러운 위기(실직·질병·사고 등)가 생겼을 때 받는 지원이에요.");
  if (i.base.priority) out.notes.push("저소득층을 먼저 뽑아요 (우선 선정).");
  return out;
}

export type { Group };
