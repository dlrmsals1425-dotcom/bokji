/**
 * 규칙 다듬기 (QA 1차 C3·H3) — 번들을 만들 때(pipeline)와 번들을 읽을 때(client) 같은 함수로 적용한다.
 *  1) 공공부조 관문 제도 자체(생계·의료·주거·교육급여, 차상위 확인): 정부24 소득 코드(0~50%) 대신 법정 선정기준(32·40·48·50%)으로 좁히고
 *     재산·부양 조사가 따로 있으므로 meansTest 표시 → 조건이 맞아도 '신청할 때 확인' (v2 classifyBase)
 *  2) 장기요양 '등급을 받은 뒤' 이용하는 급여·서비스: 장기요양등급 조건을 덧붙인다 (없으면 '받으실 수 있어요'가 되지 않게)
 *  3) 원천 자료의 담당 부처가 틀린 사업 고침
 * 원칙: 조건을 좁히기만 하고 넓히지 않는다. 여러 번 적용해도 결과가 같다.
 * (원문의 '수급자'·'중위소득 N%' 문구는 v2 textGate 가 소득 코드보다 좁으면 관문으로 건다)
 */
import type { Cond, Leaf, Rule } from "../engine/types";
import type { Program } from "./types";

const PREFIX = String.raw`^(?:기초\s*생활\s*보장\s*)?`;
const SUFFIX = String.raw`\s*(?:지원)?\s*(?:\(\s*(?:맞춤형\s*급여|의료\s*급여|생계\s*급여|주거\s*급여|교육\s*급여)\s*\))?$`;
/** 이름이 제도 자체인 경우만 (예: '의료급여 틀니'는 수급자가 받는 별도 사업이라 제외) */
export const MEANS_TESTED: { re: RegExp; pct: number; label: string }[] = [
  { re: new RegExp(`${PREFIX}생계\\s*급여${SUFFIX}`), pct: 32, label: "생계급여 선정기준: 소득인정액 기준 중위소득 32% 이하" },
  { re: new RegExp(`${PREFIX}의료\\s*급여${SUFFIX}`), pct: 40, label: "의료급여 선정기준: 소득인정액 기준 중위소득 40% 이하" },
  { re: new RegExp(`${PREFIX}주거\\s*급여${SUFFIX}`), pct: 48, label: "주거급여 선정기준: 소득인정액 기준 중위소득 48% 이하" },
  { re: new RegExp(`${PREFIX}교육\\s*급여${SUFFIX}`), pct: 50, label: "교육급여 선정기준: 소득인정액 기준 중위소득 50% 이하" },
  { re: /^차상위\s*계층\s*확인(?:서)?(?:\s*발급)?$/, pct: 50, label: "차상위 기준: 소득인정액 기준 중위소득 50% 이하" },
];

export function meansTestOf(name: string) {
  return MEANS_TESTED.find((m) => m.re.test(name.trim()));
}

/** 장기요양 인정 '신청' 자체 (등급은 신청 과정에서 정해짐) */
export const LTC_APPLY = /^노인\s*장기\s*요양\s*보험$|장기\s*요양\s*(인정|등급\s*(신청|판정))/;
const LTC_AFTER_NAME = /(장기\s*요양|노인\s*장기)[^()]{0,12}(재가|시설|급여|복지\s*용구|방문|주\s*야간|단기\s*보호|가족\s*휴가)|^(재가|시설)\s*급여|^방문\s*(요양|목욕|간호)$/;
const LTC_AFTER_TARGET = /(\d\s*[~∼-]\s*\d\s*등급|재가\s*(급여\s*)?(수급자|대상자|급여자)|등급\s*판정\s*(을\s*)?받|인지\s*지원\s*등급|요양\s*등급\s*(보유|인정)|장기\s*요양\s*(급여\s*)?(수급자|대상자|인정자|등급\s*(을\s*)?받))/;
/** '등급 외', '등급 무관', '신청 대기' 처럼 등급이 없어도 되는 사업 */
const LTC_NOT_NEEDED = /등급\s*외|등급\s*무관|무관|대기|등급\s*신청\s*(을\s*)?(받|한)|해당\s*되지\s*않|제외|미\s*판정|탈락/;
const LTC_LEAF_RE = /장기\s*요양\s*(등급|인정|수급)|요양\s*등급|등급\s*판정/;
export const LTC_LEAF_LABEL = "장기요양등급(1~5등급·인지지원등급)을 받은 분";

export function needsLtcGrade(p: Pick<Program, "name" | "target">): boolean {
  const name = p.name.trim();
  if (LTC_APPLY.test(name) && !/(급여|용구|재가|시설|가족|본인\s*부담|감경)/.test(name)) return false;
  const target = (p.target ?? "").replace(/&#13;/g, "\n").slice(0, 300);
  if (LTC_NOT_NEEDED.test(`${name}\n${target}`)) return false;
  return LTC_AFTER_NAME.test(name) || LTC_AFTER_TARGET.test(target);
}

/** 원천 자료의 담당 부처 오류 (id → 바른 담당) */
export const OWNER_FIX: Record<string, string> = {
  "n.welfare100-long-term-care-insurance": "보건복지부 (국민건강보험공단)",
};

const leaves = (c: Cond | null, out: Leaf[] = []): Leaf[] => {
  if (!c) return out;
  if ("all" in c) c.all.forEach((x) => leaves(x, out));
  else if ("any" in c) c.any.forEach((x) => leaves(x, out));
  else out.push(c);
  return out;
};

function mapLeaves(c: Cond, f: (l: Leaf) => Cond): Cond {
  if ("all" in c) return { ...c, all: c.all.map((x) => mapLeaves(x, f)) };
  if ("any" in c) return { ...c, any: c.any.map((x) => mapLeaves(x, f)) };
  return f(c);
}

/** 원문 '중위소득 N% 이하' (여러 개면 가장 큰 값 — 유형별 기준 중 가장 넓은 것보다 넓히지 않음) */
const MEDIAN_ALL = /중위\s*(?:소득\s*)?(?:의\s*)?(\d{2,3})\s*%\s*(?:이하|이내|미만)/g;
export function textMedianCap(target: string | undefined): number | null {
  const t = (target ?? "").replace(/&#13;/g, "\n").slice(0, 400);
  const nums = [...t.matchAll(MEDIAN_ALL)].map((m) => Number(m[1])).filter((n) => n >= 20 && n <= 300);
  return nums.length ? Math.max(...nums) : null;
}
/** 0부터 이어진 구간인지 (예: 0~50, 51~75, 76~100) */
const contiguousFromZero = (bands: [number, number][]) => {
  const b = [...bands].sort((x, y) => x[0] - y[0]);
  return b[0]?.[0] === 0 && b.every((x, i) => i === 0 || x[0] <= b[i - 1][1] + 1);
};

const incomeMax = (l: Leaf) => (l.field === "income" ? l.lte : l.field === "incomeBands" ? Math.max(...l.bands.map((b) => b[1])) : Infinity);

export function refineRule(p: Pick<Program, "name" | "target">, rule: Rule): Rule {
  if (rule.refined) return rule;
  let logic = rule.logic;
  let meansTest: true | undefined;
  const mt = meansTestOf(p.name);
  if (mt) {
    meansTest = true;
    const inc = leaves(logic).filter((l) => !l.soft && (l.field === "income" || l.field === "incomeBands"));
    const cap = Math.min(mt.pct, ...inc.map(incomeMax));
    const leaf: Leaf = { field: "income", lte: cap, label: mt.label };
    if (!inc.length) logic = logic ? { all: [logic, leaf] } : leaf;
    else {
      // 소득 잎을 법정 기준으로 바꾼다 (수급 중이면 맞음으로 보는 'any' 안의 수급 잎은 그대로)
      logic = mapLeaves(logic!, (l) => (inc.includes(l) ? { ...leaf, label: l.field === "income" && l.lte <= cap ? l.label : mt.label } : l));
    }
  }
  else if (rule.origin === "gov24_conditions" && logic) {
    // 정부24 소득 코드는 0~50/51~75/76~100/101~200 네 구간뿐이라 원문 '중위소득 N%'가 위로 반올림됨 → 원문 비율로 좁힘
    const cap = textMedianCap(p.target);
    if (cap !== null) {
      logic = mapLeaves(logic, (l) =>
        l.field === "incomeBands" && !l.soft && contiguousFromZero(l.bands) && cap < incomeMax(l)
          ? { field: "income", lte: cap, label: `기준 중위소득 ${cap}% 이하 (원문)` }
          : l);
    }
  }
  if (needsLtcGrade(p) && !leaves(logic).some((l) => l.field === "unasked" && LTC_LEAF_RE.test(l.label))) {
    const leaf: Leaf = { field: "unasked", label: LTC_LEAF_LABEL, hint: "국민건강보험공단의 장기요양등급 판정을 받은 분이 이용해요." };
    logic = logic ? ("all" in logic ? { ...logic, all: [...logic.all, leaf] } : { all: [logic, leaf] }) : leaf;
  }
  return { ...rule, logic, ...(meansTest ? { meansTest } : {}), refined: true };
}

export function refineProgram<T extends Program>(p: T): T {
  if (p.rule?.refined && !OWNER_FIX[p.id]) return p;
  const owner = OWNER_FIX[p.id] ?? p.owner;
  return { ...p, owner, rule: p.rule ? refineRule(p, p.rule) : p.rule };
}
