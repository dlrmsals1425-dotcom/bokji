/**
 * 규칙 다듬기 (QA 1차 C3·H3) — 번들을 만들 때(pipeline)와 번들을 읽을 때(client) 같은 함수로 적용한다.
 *  1) 공공부조 관문 제도 자체(생계·의료·주거·교육급여, 차상위 확인): 정부24 소득 코드(0~50%) 대신 법정 선정기준(32·40·48·50%)으로 좁히고
 *     재산·부양 조사가 따로 있으므로 meansTest 표시 → 조건이 맞아도 '신청할 때 확인' (v2 classifyBase)
 *  2) 장기요양 '등급을 받은 뒤' 이용하는 급여·서비스: 장기요양등급 조건을 덧붙인다 (없으면 '받으실 수 있어요'가 되지 않게)
 *  3) 원천 자료의 담당 부처가 틀린 사업 고침
 *  4) (QA 2차 C3) 원문(대상 + 선정기준 전문)의 '중위소득 N%'로 소득 코드를 좁히고,
 *     원문이 수급·차상위인데 정부24 소득 코드(0~50%)만 있는 규칙에 recBand 표시 → 소득 구간만으로 '받으실 수 있어요'가 되지 않게 (v2 textGate)
 * 원칙: 원문에 맞춘다 — 코드가 원문보다 넓으면 좁히고, (QA 3차 R4) 원문 비율이 코드보다 넓으면 원문 비율로 넓힌다. 여러 번 적용해도 결과가 같다.
 * REFINE_VERSION 이 바뀌면 이전 번들의 규칙도 읽을 때 다시 다듬는다 (좁히기만 하므로 다시 적용해도 안전).
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
const MEDIAN_OVER = /중위\s*(?:소득\s*)?(?:의\s*)?(\d{2,3})\s*%\s*(?:초과|이상|넘는)/g;
export function textMedianCap(target: string | undefined, limit = 400): number | null {
  const t = (target ?? "").replace(/&#13;/g, "\n").slice(0, limit);
  const nums = [...t.matchAll(MEDIAN_ALL)].map((m) => Number(m[1])).filter((n) => n >= 20 && n <= 300);
  if (!nums.length) return null;
  const cap = Math.max(...nums);
  // '120% 이하(국비) / 120% 초과(군비)' 처럼 기준 위쪽도 지원하면 상한이 아님
  if ([...t.matchAll(MEDIAN_OVER)].some((m) => Number(m[1]) >= cap)) return null;
  return cap;
}
/** 0부터 이어진 구간인지 (예: 0~50, 51~75, 76~100) */
const contiguousFromZero = (bands: [number, number][]) => {
  const b = [...bands].sort((x, y) => x[0] - y[0]);
  return b[0]?.[0] === 0 && b.every((x, i) => i === 0 || x[0] <= b[i - 1][1] + 1);
};

const incomeMax = (l: Leaf) => (l.field === "income" ? l.lte : l.field === "incomeBands" ? Math.max(...l.bands.map((b) => b[1] ?? Infinity)) : Infinity);

/** 원문 비율 상한: 대상 문구와 선정기준 전문에 적힌 비율 중 가장 큰 값 (넓은 쪽 — 좁히기 과잉 방지) */
export function sourceMedianCap(p: { target?: string; criteria?: string }): number | null {
  const caps = [textMedianCap(p.target, 1200), textMedianCap(p.criteria, 1200)].filter((x): x is number => x !== null);
  return caps.length ? Math.max(...caps) : null;
}
/**
 * 넓히는 쪽에 쓰는 원문 비율 (QA 3차 R4): '우선·가점·순위' 문구의 비율은 빼고 가장 큰 값.
 * 정부24 소득 코드(0~50/51~75/76~100…)가 원문 125%·150%를 담지 못해 규칙이 원문보다 좁아지는 것을 원문 기준으로 맞춘다.
 */
export function sourceMedianCapForWiden(p: { target?: string; criteria?: string }): number | null {
  const caps: number[] = [];
  const overs: number[] = [];
  for (const raw of [p.target, p.criteria]) {
    const t = (raw ?? "").replace(/&#13;/g, "\n").slice(0, 1200);
    for (const m of t.matchAll(MEDIAN_ALL)) {
      const n = Number(m[1]);
      if (n < 20 || n > 300) continue;
      // 같은 줄·같은 구절 안에서만 본다 ('120% 이하, 우선순위: 수급자'의 우선순위는 다른 이야기). '(3순위) 80% 이하'는 대상 단계라 빼지 않음
      const i = m.index ?? 0;
      const before = t.slice(Math.max(0, i - 30), i).split(/\n|[,;]/).pop() ?? "";
      const after = (t.slice(i + m[0].length, i + m[0].length + 20).split(/\n|[,;]/)[0]) ?? "";
      if (/우선|가점|추가\s*지원/.test(before + after)) continue;
      caps.push(n);
    }
    // 기준 위쪽도 지원하는 사업('120% 초과(군비)')은 상한을 넓히지 않음
    if ([...t.matchAll(MEDIAN_OVER)].length) return null;
    overs.push(...[...t.matchAll(/(\d{2,3})\s*%\s*(?:초과|넘는)/g)].map((m) => Number(m[1])));
  }
  if (!caps.length) return null;
  const cap = Math.max(...caps);
  return overs.some((n) => n >= cap) ? null : cap;
}
export const REC_TEXT = /(수급자|수급권자|차상위|기초\s*생활\s*보장|생계\s*급여|의료\s*급여|주거\s*급여)/;
const MED_TEXT = /중위\s*(?:소득\s*)?(?:의\s*)?\d{2,3}\s*%/;
export const REFINE_VERSION = 4;

export function refineRule(p: { name: string; target?: string; criteria?: string }, rule: Rule): Rule {
  if (rule.refined === REFINE_VERSION) return rule;
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
    const cap = sourceMedianCap(p);
    // (QA 3차 R4) 원문 비율이 코드 상한보다 넓으면 원문 비율로 넓힌다 (0부터 이어진 구간만 — 예: 0~100% → 원문 125%)
    const wcap = sourceMedianCapForWiden(p);
    if (wcap !== null) {
      logic = mapLeaves(logic, (l) => {
        if (l.field !== "incomeBands" || l.soft || wcap <= incomeMax(l) + 5 || !contiguousFromZero(l.bands)) return l;
        return { field: "income", lte: wcap, label: `기준 중위소득 ${wcap}% 이하 (원문)` };
      });
    }
    if (cap !== null) {
      logic = mapLeaves(logic, (l) => {
        if (l.field !== "incomeBands" || l.soft || cap >= incomeMax(l)) return l;
        if (contiguousFromZero(l.bands)) return { field: "income", lte: cap, label: `기준 중위소득 ${cap}% 이하 (원문)` };
        // 0부터 이어지지 않는 구간(예: 51~100%)은 원문 상한에서 자른다 (구간을 넓히지 않음)
        const bands = l.bands.filter((b) => b[0] < cap).map((b) => [b[0], Math.min(b[1] ?? Infinity, cap)] as [number, number]);
        return bands.length ? { ...l, bands, label: `${l.label} 중 원문 기준 중위소득 ${cap}% 이하` } : l;
      });
    }
  }
  // QA 2차 N7: 수기 규칙의 '저소득' soft 소득 잎이 원문 비율(±5%p)과 같으면 원문이 확인해 준 기준 → soft를 푼다
  // (같은 'any' 묶음의 수급 soft 잎도 함께: 수급 아님·소득 초과가 분명하면 대상 아님)
  if (logic) {
    const cap = sourceMedianCap(p);
    if (cap !== null) logic = hardenConfirmed(logic, cap);
  }
  if (needsLtcGrade(p) && !leaves(logic).some((l) => l.field === "unasked" && LTC_LEAF_RE.test(l.label))) {
    const leaf: Leaf = { field: "unasked", label: LTC_LEAF_LABEL, hint: "국민건강보험공단의 장기요양등급 판정을 받은 분이 이용해요." };
    logic = logic ? ("all" in logic ? { ...logic, all: [...logic.all, leaf] } : { all: [logic, leaf] }) : leaf;
  }
  // 원문이 수급·차상위(비율 없음)인데 규칙은 정부24 소득 코드 0~50%뿐 → 소득 구간만으로 맞음 판정 금지 표시
  let recBand: true | undefined = rule.recBand ? true : undefined;
  if (!meansTest && rule.origin === "gov24_conditions" && logic) {
    const ls = leaves(logic);
    const band = ls.filter((l) => !l.soft && l.field === "incomeBands");
    const src = `${p.target ?? ""}\n${p.criteria ?? ""}`.replace(/&#13;/g, "\n");
    if (band.length && Math.max(...band.map(incomeMax)) <= 50 && !ls.some((l) => !l.soft && l.field === "benefit") && REC_TEXT.test(src) && !MED_TEXT.test(src)) recBand = true;
  }
  return { ...rule, logic, ...(meansTest ? { meansTest } : {}), ...(recBand ? { recBand } : {}), refined: REFINE_VERSION };
}

const confirmedIncome = (l: Cond, cap: number) => !("all" in l) && !("any" in l) && l.field === "income" && !!l.soft && Math.abs(l.lte - cap) <= 5;
function hardenConfirmed(c: Cond, cap: number): Cond {
  if ("all" in c) return { ...c, all: c.all.map((x) => hardenConfirmed(x, cap)) };
  if ("any" in c) {
    const kids = c.any;
    const flat = kids.every((k) => !("all" in k) && !("any" in k) && (k.field === "income" || k.field === "benefit"));
    // '(원문 확인)' 묶음은 자동 변환이 불확실하다고 표시한 것 (예: HPV — 청소년은 소득 무관) → 그대로 둔다
    if (/원문 확인/.test(c.label ?? "")) return c;
    if (flat && kids.some((k) => confirmedIncome(k, cap))) return { ...c, any: kids.map((k) => ({ ...(k as Leaf), soft: undefined })) };
    return { ...c, any: kids.map((x) => hardenConfirmed(x, cap)) };
  }
  return confirmedIncome(c, cap) && !/원문 확인/.test(c.label) ? { ...c, soft: undefined } : c;
}

export function refineProgram<T extends Program>(p: T): T {
  if (p.rule?.refined === REFINE_VERSION && !OWNER_FIX[p.id]) return p;
  const owner = OWNER_FIX[p.id] ?? p.owner;
  return { ...p, owner, rule: p.rule ? refineRule(p, p.rule) : p.rule };
}
