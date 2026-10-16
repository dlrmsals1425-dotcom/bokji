/**
 * 질문 따라 찾기 (2026-10-16): 사는 곳을 확인한 뒤 한 화면에 한 질문씩.
 * 다음 질문 = 지금 '답하면 정해져요'에 있는 혜택 가운데 그 답으로 정해지는 것이 가장 많은 질문 (답이 나올 가능성으로 가중).
 * 판정은 결과 화면과 같은 규칙(v2.ts)을 그대로 쓰고, 이미 '해당하지 않아요'로 정해진 사업은 다음 계산에서 뺀다(소거).
 * 31개 페르소나 시뮬레이션: 질문 5개로 '답하면 정해져요'가 약 82% 줄고 '받으실 수 있어요'는 5번째 이후 늘지 않음 → 5개 + 드문 사항 한 번에.
 * 답은 이 기기 안에서만 쓰고 주소에는 싣지 않는다.
 */
import type { Program } from "../data/types";
import { AGE_LABEL, EMPTY_PROFILE, INCOME_BANDS, medianWon } from "../engine/profile";
import type { FindMode } from "./mode";
import {
  DIMS, DIM_BY_ID, EMPTY_EXTRAS, answersFor, buildView, classifyBase, dimAvailable, scoreV2,
  type Answer, type Dim, type DimId, type Situation, type V2View,
} from "./v2";

/** 질문 수 (위치 확인 다음) */
export const FLOW_LIMIT = 5;
/** 하나씩 묻지 않고 마지막 '해당하는 것 모두 고르기'로만 묻는 드문 사항 */
export const RARE_DIMS_FLOW: ReadonlySet<DimId> = new Set<DimId>(["veteran", "multicultural"]);

export function blankSituation(sido: string, sigungu: string, mode: FindMode): Situation {
  return { profile: { ...EMPTY_PROFILE, sido, sigungu }, x: { ...EMPTY_EXTRAS, benefits: {}, traits: {}, facts: {} }, mode };
}

const withAge = (s: Situation, age: Situation["profile"]["age"]): Situation => ({ ...s, profile: { ...s.profile, age } });
const manwon = (won: number) => Math.floor(won / 10000).toLocaleString("ko-KR");

/**
 * 질문 따라 찾기에서 보여 줄 보기.
 * - 나이: 본인 찾기는 '18세 이하'도 (10대 본인이 나이에 답하지 못하던 문제 — 시뮬레이션에서 확인)
 * - 소득: 가구원 수에 맞춘 기준 중위소득 금액 구간 (구간 자체는 결과 화면 소득 질문과 같음)
 */
export function flowAnswers(d: Dim, s: Situation): Answer[] {
  const base = answersFor(d, s);
  if (d.id === "age" && s.mode !== "parent") {
    return [{ key: "0-18", label: AGE_LABEL["0-18"], apply: (x: Situation) => withAge(x, "0-18") }, ...base];
  }
  if (d.id === "income") {
    const size = s.profile.householdSize;
    if (size === "unknown") return base;
    return INCOME_BANDS.map((b, i) => {
      const a = base.find((x) => x.key === b)!;
      const hi = b === "200+" ? null : medianWon(Number(b), size);
      const lo = i === 0 ? null : medianWon(Number(INCOME_BANDS[i - 1]), size);
      const label = hi === null ? `월 ${manwon(lo!)}만원 넘음` : lo === null ? `월 ${manwon(hi)}만원 이하` : `월 ${manwon(lo)}~${manwon(hi)}만원`;
      return { ...a, label };
    });
  }
  return base;
}

/** '예'가 나올 대략의 가능성 — 드문 '예'보다 흔한 '아니요'로 정해지는 혜택을 더 크게 센다 */
function yesShare(id: DimId, s: Situation): number | null {
  const parent = s.mode === "parent";
  switch (id) {
    case "disability":
      return 0.1;
    case "illness":
      return parent ? 0.3 : 0.15;
    case "care":
      return parent ? 0.4 : 0.1;
    case "ltcGrade":
      return parent ? 0.2 : 0.05;
    case "singleParent":
      return 0.1;
    case "support":
      return 0.1;
    case "basicPension":
      return 0.6;
    default:
      return null;
  }
}
const NO_KEYS = new Set(["no", "none"]);
function weights(d: Dim, answers: Answer[], s: Situation): number[] {
  const y = yesShare(d.id, s);
  const noIdx = answers.findIndex((a) => NO_KEYS.has(a.key));
  if (y === null || noIdx < 0 || answers.length < 2) return answers.map(() => 1 / answers.length);
  const each = y / (answers.length - 1);
  return answers.map((_, i) => (i === noIdx ? 1 - y : each));
}

export interface FlowStep {
  view: V2View;
  /** 다음 계산에 쓸 사업 ('해당하지 않아요'로 정해진 묶음은 뺌) */
  pool: Program[];
  counts: { fit: number; ask: number; office: number; no: number };
}

/** 판정 + 소거. prev를 주면 지금까지 '해당하지 않아요'로 정해진 수를 이어서 센다 */
export function flowStep(pool: Program[], s: Situation, prev?: FlowStep): FlowStep {
  const view = buildView(scoreV2(pool, s), s, 0);
  const gone = new Set<Program>(view.no.flatMap((g) => g.map((i) => i.s.program)));
  return {
    view,
    pool: pool.filter((p) => !gone.has(p)),
    counts: { fit: view.fit.length, ask: view.ask.length, office: view.office.length, no: (prev?.counts.no ?? 0) + view.no.length },
  };
}

/** 다음 질문: 그 답으로 '답하면 정해져요'에서 빠지는 혜택 묶음 수의 기댓값이 가장 큰 질문 */
export function nextQuestion(st: FlowStep, s: Situation, asked: readonly DimId[]): { id: DimId; gain: number } | null {
  let best: { id: DimId; gain: number } | null = null;
  for (const d of DIMS) {
    if (asked.includes(d.id) || RARE_DIMS_FLOW.has(d.id) || !d.isUnknown(s) || !dimAvailable(d, s)) continue;
    const groups = st.view.ask.filter((g) => g.some((i) => i.dims.includes(d.id)));
    if (!groups.length) continue;
    const answers = flowAnswers(d, s);
    const w = weights(d, answers, s);
    let gain = 0;
    answers.forEach((a, k) => {
      const next = a.apply(s);
      const decided = groups.filter((g) => g.some((i) => classifyBase(i.s.program, next).base !== "open")).length;
      gain += w[k] * decided;
    });
    if (!best || gain > best.gain) best = { id: d.id, gain };
  }
  if (!best || best.gain <= 0) return null;
  // 소득 보기는 가구원 수에 맞춘 금액이라, 가구원 수를 모르면 그것부터
  if (best.id === "income" && s.profile.householdSize === "unknown" && !asked.includes("alone")) return { id: "alone", gain: best.gain };
  return best;
}

export interface RarePick {
  key: DimId;
  label: string;
}

const RARE_LABEL: Partial<Record<DimId, [string, string]>> = {
  disability: ["장애인으로 등록되어 있어요", "부모님 중 장애인으로 등록된 분이 있어요"],
  veteran: ["국가유공자·참전유공자 등 보훈 대상이에요", "부모님이 국가유공자·참전유공자 등 보훈 대상이에요"],
  multicultural: ["다문화 가족(결혼이민)이거나 북한이탈주민이에요", "부모님이 다문화 가족이거나 북한이탈주민이에요"],
  singleParent: ["혼자 자녀를 키워요 (한부모·조손 가구)", "부모님이 손주를 키우고 계세요 (조손 가구)"],
  illness: ["치매·암·희귀질환 등으로 치료 중이에요", "부모님 중 치매·암·희귀질환 등으로 치료 중인 분이 있어요"],
};

/** 마지막 '해당하는 것 모두 고르기' — 아직 모르는 드문 사항만 */
export function rarePicks(s: Situation): RarePick[] {
  const out: RarePick[] = [];
  for (const id of Object.keys(RARE_LABEL) as DimId[]) {
    const d = DIM_BY_ID[id];
    if (!d.isUnknown(s) || !dimAvailable(d, s)) continue;
    out.push({ key: id, label: RARE_LABEL[id]![s.mode === "parent" ? 1 : 0] });
  }
  return out;
}

/** 고른 것은 '예', 보였지만 고르지 않은 것은 '아니요' (장애는 정도를 모르므로 정도 '모름') */
export function rareApply(s: Situation, on: readonly DimId[]): Situation {
  let out = s;
  for (const { key } of rarePicks(s)) {
    const d = DIM_BY_ID[key];
    if (key === "disability") {
      out = on.includes(key)
        ? { ...out, profile: { ...out.profile, disability: "self", disabilitySeverity: "unknown" } }
        : d.answers.find((a) => a.key === "none")!.apply(out);
      continue;
    }
    out = d.answers.find((a) => a.key === (on.includes(key) ? "yes" : "no"))!.apply(out);
  }
  return out;
}
