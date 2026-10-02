import type { Cond } from "../../../src/lib/engine/types";
import { activity, age, all, any, children, disability, housing, incomeBands, kid, trait, unasked } from "./helpers";

/**
 * 행정안전부 공공서비스(혜택) API `supportConditions` 코드 → 규칙 스키마 (설계서 6.6).
 * 코드 정의: /workspace/welfare-plan/build/v03/gov24_swagger.json (supportConditions_model).
 * 자동 변환 결과는 사람 검수 전까지 판정 상한 '가능성 있음'.
 */
export type Gov24Conditions = Record<string, string | number | null | undefined>;

const yes = (v: unknown) => typeof v === "string" ? v.trim().toUpperCase() === "Y" : v === true;

const INCOME_CODES: [string, [number, number], string][] = [
  ["JA0201", [0, 50], "0~50%"],
  ["JA0202", [50, 75], "51~75%"],
  ["JA0203", [75, 100], "76~100%"],
  ["JA0204", [100, 200], "101~200%"],
  ["JA0205", [200, Infinity], "200% 초과"],
];

export interface Gov24RuleDraft {
  logic: Cond | null;
  unstructured: string[];
  badges: ("business" | "student")[];
  /** 개인 대상 조건 외(소상공인·법인) 코드가 있는지 */
  businessOnly: boolean;
}

export function rulesFromSupportConditions(c: Gov24Conditions): Gov24RuleDraft {
  const parts: Cond[] = [];
  const unstructured: string[] = [];
  const badges = new Set<"business" | "student">();

  // 성별 (간편 입력에서 묻지 않음)
  const male = yes(c.JA0101), female = yes(c.JA0102);
  if (male !== female) parts.push(unasked(male ? "남성 대상" : "여성 대상", "성별은 간편 입력에서 묻지 않아요."));

  // 연령
  const a0 = Number(c.JA0110 ?? 0), a1 = Number(c.JA0111 ?? 0);
  const min = a0 > 0 ? a0 : undefined;
  const max = a1 > 0 && a1 < 150 ? a1 : undefined;
  if (min !== undefined || max !== undefined) {
    const label = min !== undefined && max !== undefined ? `만 ${min}~${max}세` : min !== undefined ? `만 ${min}세 이상` : `만 ${max}세 이하`;
    parts.push(age(min, max, label));
  }

  // 중위소득 구간
  const inc = INCOME_CODES.filter(([code]) => yes(c[code]));
  if (inc.length > 0 && inc.length < INCOME_CODES.length) {
    parts.push(incomeBands(inc.map(([, r]) => r), `기준 중위소득 ${inc.map(([, , l]) => l).join(", ")}`));
  }

  // 개인 특성 (JA03xx) — OR
  const personal: Cond[] = [];
  if (!yes(c.JA0322)) {
    if (yes(c.JA0301)) personal.push(unasked("예비부모·난임", "난임 여부는 간편 입력에서 묻지 않아요."));
    if (yes(c.JA0302)) personal.push(children(["pregnant"], "임산부"));
    if (yes(c.JA0303)) personal.push(children(["0-1"], "출산·입양 가구 (0~1세 자녀)"));
    if (yes(c.JA0313)) personal.push(unasked("농업인"));
    if (yes(c.JA0314)) personal.push(unasked("어업인"));
    if (yes(c.JA0315)) personal.push(unasked("축산업인"));
    if (yes(c.JA0316)) personal.push(unasked("임업인"));
    if (yes(c.JA0317)) { personal.push(kid(6, 12, "초등학생 (자녀)")); badges.add("student"); }
    if (yes(c.JA0318)) { personal.push(kid(12, 15, "중학생 (자녀)")); badges.add("student"); }
    if (yes(c.JA0319)) { personal.push(kid(15, 18, "고등학생 (자녀)")); badges.add("student"); }
    if (yes(c.JA0320)) { personal.push(activity(["student"], "대학생·대학원생 (본인)", { capU: true })); badges.add("student"); }
    if (yes(c.JA0326)) personal.push(activity(["employed"], "근로자·직장인"));
    if (yes(c.JA0327)) personal.push(activity(["job_seeking"], "구직자·실업자"));
    if (yes(c.JA0328)) personal.push(disability(["self", "member"], "장애인 (본인 또는 가구원)"));
    if (yes(c.JA0329)) personal.push(trait(["veteran"], "국가보훈대상자"));
    if (yes(c.JA0330)) personal.push(unasked("질병·질환자", "질환 여부는 간편 입력에서 묻지 않아요."));
  }
  if (personal.length === 1) parts.push(personal[0]);
  else if (personal.length > 1) parts.push(any("대상 특성", ...personal));

  // 가구 유형 (JA04xx) — OR
  const household: Cond[] = [];
  if (!yes(c.JA0410)) {
    if (yes(c.JA0401)) household.push(trait(["multicultural"], "다문화가족"));
    if (yes(c.JA0402)) household.push(trait(["multicultural"], "북한이탈주민", { capU: true }));
    if (yes(c.JA0403)) household.push(trait(["single_parent"], "한부모·조손 가정"));
    if (yes(c.JA0404)) household.push(trait(["single"], "1인 가구"));
    if (yes(c.JA0411)) household.push(trait(["multi_child"], "다자녀 가구"));
    if (yes(c.JA0412)) household.push(housing(["jeonse", "monthly", "public_rental", "other"], "무주택 세대"));
    if (yes(c.JA0413)) household.push(unasked("신규 전입"));
    if (yes(c.JA0414)) household.push(unasked("확대가족"));
  }
  if (household.length === 1) parts.push(household[0]);
  else if (household.length > 1) parts.push(any("가구 유형", ...household));

  // 소상공인·법인 조건
  const bizCodes = ["JA1101", "JA1102", "JA1103", "JA1201", "JA1202", "JA1299"];
  const corpCodes = ["JA2101", "JA2102", "JA2103", "JA2201", "JA2202", "JA2203", "JA2299"];
  const hasBiz = bizCodes.some((k) => yes(c[k]));
  const hasCorp = corpCodes.some((k) => yes(c[k]));
  if (hasBiz) {
    badges.add("business");
    parts.push(activity(["self_employed"], "소상공인·자영업 (사업 상태·업종은 원문 확인)", { capU: true }));
  }
  if (hasCorp) unstructured.push("법인·시설·단체 대상 조건 포함");

  return {
    logic: parts.length === 0 ? null : parts.length === 1 ? parts[0] : all(...parts),
    unstructured,
    badges: [...badges],
    businessOnly: (hasBiz || hasCorp) && personal.length === 0 && household.length === 0 && min === undefined && max === undefined,
  };
}
