import type { Cond } from "../../../src/lib/engine/types";
import { activity, age, all, any, benefit, children, disability, housing, income, incomeBands, kid, trait, unasked, RECIPIENT_NEAR } from "./helpers";
import type { Leaf } from "../../../src/lib/engine/types";

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
  const max = a1 > 0 && a1 < 99 ? a1 : undefined;
  // '만 0~120세', '만 19세 이상'처럼 사실상 제한이 없는 연령은 조건으로 쓰지 않는다 (과대 판정 방지)
  const trivialAge = (min ?? 0) <= 19 && (max === undefined || max >= 99);
  if (!trivialAge && (min !== undefined || max !== undefined)) {
    const label = min !== undefined && max !== undefined ? `만 ${min}~${max}세` : min !== undefined ? `만 ${min}세 이상` : `만 ${max}세 이하`;
    // 상한이 18세 이하면 아동 대상 서비스: 본인(아동) 또는 자녀 나이로 판단 (신청인은 보통 보호자)
    if (max !== undefined && max <= 18) parts.push(any(`${label} (본인 또는 자녀)`, age(min, max, `본인 ${label}`), kid(min ?? 0, max, `자녀 ${label}`)));
    else parts.push(age(min, max, label));
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

/* ---------- 원문 보완 (지원대상·선정기준 문구) ---------- */

function fieldsIn(c: Cond | null, acc = new Set<string>()): Set<string> {
  if (!c) return acc;
  if ("all" in c) c.all.forEach((x) => fieldsIn(x, acc));
  else if ("any" in c) c.any.forEach((x) => fieldsIn(x, acc));
  else acc.add((c as Leaf).field);
  return acc;
}

const SUPPLEMENTS: { re: RegExp; fields: string[]; make: () => Cond }[] = [
  {
    re: /(기초생활|생계급여|의료급여|주거급여|수급자|수급권자|차상위|저소득|소득인정액|중위소득|소득\s?하위)/,
    fields: ["income", "incomeBands", "benefit"],
    make: () => any("소득 기준 (원문 확인)", benefit(RECIPIENT_NEAR, "수급·차상위", { soft: true }), income(50, "저소득", { soft: true })),
  },
  { re: /장애/, fields: ["disability"], make: () => disability(["self", "member"], "장애 관련 조건 (원문 확인)", undefined, { soft: true }) },
  { re: /(한부모|조손)/, fields: ["trait"], make: () => trait(["single_parent"], "한부모·조손 관련 조건 (원문 확인)", { soft: true }) },
  { re: /(독거|홀로 사는|홀몸|1인\s?가구)/, fields: ["trait"], make: () => trait(["single"], "1인 가구 관련 조건 (원문 확인)", { soft: true }) },
  { re: /(다문화|결혼이민|북한이탈)/, fields: ["trait"], make: () => trait(["multicultural"], "다문화·북한이탈 관련 조건 (원문 확인)", { soft: true }) },
  { re: /(보훈|국가유공자)/, fields: ["trait"], make: () => trait(["veteran"], "보훈 관련 조건 (원문 확인)", { soft: true }) },
  { re: /(임산부|임신)/, fields: ["children", "childAge"], make: () => children(["pregnant"], "임신 관련 조건 (원문 확인)", { soft: true }) },
  { re: /무주택/, fields: ["housing"], make: () => housing(["jeonse", "monthly", "public_rental", "other"], "무주택 (원문 확인)", { soft: true }) },
];
/** 간편 입력 12개로는 확인할 수 없는 신분·상황 요건 (원문에 보이면 '확인 필요(U)' 조건으로 덧붙임) */
const STATUS_RE = /(구직급여|실업급여|산재|국민취업지원제도|취업성공패키지|피해자|학대|피해|귀국|사할린|선정하여|국외|해외|피해를 입은|유가족|유족|명장|선정자|수상자|입상자|가입자|가입한|참여자|참여하는|이용자|소유자|소유한|사업자|농업인|농업경영체|어업인|임업인|축산농가|도서민|도서에|재학생|재학 중|졸업생|졸업 예정|등록된|근로자|종사자|종사하는|환자|질환자|진단|확진|수술|입원|검진 결과|입주자|퇴소|출소|군인|전역|제대|교직원|공무원|납세자|운전자|차량|자동차|반려동물|동물|외국인|난민|귀농|귀촌|창업|예술인|체육인|선수|자원봉사|봉사자|임차인|세입자|전입|신혼부부|예비부부|결혼|입양|위탁|보호대상|보호종료|자립준비|실직|폐업|파산|채무|신용|대출|임신부|난임|산모|출산한|학부모|보호자|회원|수강생|참가자|응시자|해당자|대상자로 선정)/;

const CORE_RE = /(필요하다고\s?(?:판단|인정)|판단되는\s?(?:자|사람|가구|분)|인정하는\s?(?:자|사람)|추천(?:받은|한)\s?(?:자|사람))/;

/**
 * 지원조건 코드에 없는 대상 요건이 지원대상 문구에 보이면 '부드러운(soft)' 조건으로 덧붙인다.
 * soft 조건은 불충족이어도 숨기지 않고 '확인 필요(U)'로만 바꿔 → 과대 판정('조건 충족')만 막는다.
 */
export function supplementFromText(logic: Cond | null, targetText: string | undefined): { logic: Cond | null; added: string[]; core: boolean } {
  const text = (targetText ?? "").replace(/\s+/g, " ");
  if (!text) return { logic, added: [], core: false };
  const have = fieldsIn(logic);
  const extra: Cond[] = [];
  const added: string[] = [];
  for (const s of SUPPLEMENTS) {
    if (!s.re.test(text) || s.fields.some((f) => have.has(f))) continue;
    const c = s.make();
    extra.push(c);
    added.push("any" in c ? (c.label ?? "") : (c as Leaf).label ?? "");
    s.fields.forEach((f) => have.add(f));
  }
  const core = CORE_RE.test(text);
  const status = text.match(STATUS_RE);
  if (status) {
    extra.push(unasked(`원문의 대상 요건 확인 ('${status[1]}' 등)`, "간편 입력으로는 확인할 수 없는 요건이에요. 원문·신청처에서 확인하세요."));
    added.push(`원문 요건: ${status[1]}`);
  }
  if (!extra.length) return { logic, added, core };
  const merged = logic ? ("all" in logic ? { all: [...logic.all, ...extra] } : all(logic, ...extra)) : extra.length === 1 ? extra[0] : all(...extra);
  return { logic: merged, added, core };
}
