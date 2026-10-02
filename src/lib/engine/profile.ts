/**
 * 익명 간편 입력 12개 항목 (기획안 9장, 설계서 6.4).
 * - 모든 항목은 '모름/응답 안 함'을 가진다 → null 또는 'unknown'.
 * - 다중 선택 항목: null = 모름(미응답), [] = 해당 없음.
 * - 장애·돌봄(민감정보)은 선택 입력이며 기기(localStorage)에만 저장한다.
 */

export const AGE_BANDS = [
  "0-18", "19-24", "25-29", "30-34", "35-39", "40-49",
  "50-59", "60-64", "65-69", "70-74", "75-79", "80+",
] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const INCOME_BANDS = ["32", "40", "48", "50", "60", "100", "120", "150", "200", "200+"] as const;
export type IncomeBand = (typeof INCOME_BANDS)[number];

export const HOUSEHOLD_TRAITS = ["single", "single_parent", "multi_child", "multicultural", "veteran"] as const;
export type HouseholdTrait = (typeof HOUSEHOLD_TRAITS)[number];

export const CHILD_BUCKETS = ["pregnant", "0-1", "2-5", "6-12", "13-18", "19+"] as const;
export type ChildBucket = (typeof CHILD_BUCKETS)[number];

export const BENEFITS = ["livelihood", "medical", "housing", "education", "near_poverty", "basic_pension"] as const;
export type Benefit = (typeof BENEFITS)[number];

export const HOUSING = ["own", "jeonse", "monthly", "public_rental", "other"] as const;
export type Housing = (typeof HOUSING)[number];

export const CARS = ["0", "1", "2+"] as const;
export type Car = (typeof CARS)[number];

export const ACTIVITIES = ["employed", "job_seeking", "self_employed", "student", "none"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const CARE_NEEDS = ["daily", "discharged"] as const;
export type CareNeed = (typeof CARE_NEEDS)[number];

export const DISABILITY = ["self", "member", "none"] as const;
export type Disability = (typeof DISABILITY)[number];
export const DISABILITY_SEVERITY = ["severe", "mild"] as const;
export type DisabilitySeverity = (typeof DISABILITY_SEVERITY)[number];

export type Unknown = "unknown";

export interface Profile {
  /** 1. 거주지 (필수): 시도 코드 + 시군구 코드 */
  sido: string | null;
  sigungu: string | null;
  /** 2. 본인 나이대 */
  age: AgeBand | Unknown;
  /** 3. 가구원 수 (6 = 6명 이상) */
  householdSize: 1 | 2 | 3 | 4 | 5 | 6 | Unknown;
  /** 4. 가구 특성 (복수) */
  traits: HouseholdTrait[] | null;
  /** 5. 자녀 유무·나이대 (복수) */
  children: ChildBucket[] | null;
  /** 6. 소득 구간: 기준 중위소득 대비 '○% 이하' */
  income: IncomeBand | Unknown;
  /** 7. 수급·자격 상태 (복수) */
  benefits: Benefit[] | null;
  /** 8. 주거 형태 */
  housing: Housing | Unknown;
  /** 9. 차량 보유 */
  car: Car | Unknown;
  /** 10. 취업·활동 상태 */
  activity: Activity | Unknown;
  /** 11. 돌봄 필요 (민감·선택, 기기에만 저장) */
  care: CareNeed[] | null;
  /** 12. 장애 (민감·선택, 기기에만 저장) */
  disability: Disability | Unknown;
  disabilitySeverity: DisabilitySeverity | Unknown;
}

export const EMPTY_PROFILE: Profile = {
  sido: null,
  sigungu: null,
  age: "unknown",
  householdSize: "unknown",
  traits: null,
  children: null,
  income: "unknown",
  benefits: null,
  housing: "unknown",
  car: "unknown",
  activity: "unknown",
  care: null,
  disability: "unknown",
  disabilitySeverity: "unknown",
};

/* ---------- 한국어 라벨 ---------- */

export const AGE_LABEL: Record<AgeBand, string> = {
  "0-18": "18세 이하", "19-24": "19~24세", "25-29": "25~29세", "30-34": "30~34세",
  "35-39": "35~39세", "40-49": "40~49세", "50-59": "50~59세", "60-64": "60~64세",
  "65-69": "65~69세", "70-74": "70~74세", "75-79": "75~79세", "80+": "80세 이상",
};

export const INCOME_LABEL: Record<IncomeBand, string> = {
  "32": "32% 이하", "40": "32% 초과~40% 이하", "48": "40% 초과~48% 이하", "50": "48% 초과~50% 이하",
  "60": "50% 초과~60% 이하", "100": "60% 초과~100% 이하", "120": "100% 초과~120% 이하",
  "150": "120% 초과~150% 이하", "200": "150% 초과~200% 이하", "200+": "200% 초과",
};

export const TRAIT_LABEL: Record<HouseholdTrait, string> = {
  single: "1인 가구", single_parent: "한부모·조손 가구", multi_child: "다자녀 가구",
  multicultural: "다문화·북한이탈주민 가구", veteran: "보훈대상 가구",
};

export const CHILD_LABEL: Record<ChildBucket, string> = {
  pregnant: "임신 중", "0-1": "0~1세", "2-5": "2~5세", "6-12": "6~12세", "13-18": "13~18세", "19+": "19세 이상",
};

export const BENEFIT_LABEL: Record<Benefit, string> = {
  livelihood: "생계급여", medical: "의료급여", housing: "주거급여", education: "교육급여",
  near_poverty: "차상위계층", basic_pension: "기초연금",
};

export const HOUSING_LABEL: Record<Housing, string> = {
  own: "자가", jeonse: "전세", monthly: "월세", public_rental: "공공임대", other: "기타(무상거주 등)",
};

export const CAR_LABEL: Record<Car, string> = { "0": "없음", "1": "1대", "2+": "2대 이상" };

export const ACTIVITY_LABEL: Record<Activity, string> = {
  employed: "재직 중", job_seeking: "구직 중", self_employed: "자영업", student: "학생", none: "해당 없음",
};

export const CARE_LABEL: Record<CareNeed, string> = { daily: "일상생활 도움 필요", discharged: "최근 퇴원" };

export const DISABILITY_LABEL: Record<Disability, string> = { self: "본인", member: "가구원 중 있음", none: "해당 없음" };
export const SEVERITY_LABEL: Record<DisabilitySeverity, string> = { severe: "심한 장애", mild: "심하지 않은 장애" };

/* ---------- 구간 수치 ---------- */

export function ageRange(b: AgeBand): [number, number] {
  if (b === "80+") return [80, 120];
  const [a, c] = b.split("-").map(Number);
  return [a, c];
}

/** 소득 구간 → (하한 초과, 상한 이하) 비율(%) */
export function incomeRange(b: IncomeBand): [number, number] {
  const idx = INCOME_BANDS.indexOf(b);
  const upper = b === "200+" ? Infinity : Number(b);
  const lower = idx === 0 ? 0 : Number(INCOME_BANDS[idx - 1]);
  return [lower, upper];
}

/** 자녀 나이 구간 (임신 중은 -1) */
export function childRange(b: ChildBucket): [number, number] {
  switch (b) {
    case "pregnant": return [-1, -1];
    case "0-1": return [0, 1];
    case "2-5": return [2, 5];
    case "6-12": return [6, 12];
    case "13-18": return [13, 18];
    case "19+": return [19, 120];
  }
}

/** 입력 완료 항목 수 (12개 중) */
export function answeredCount(p: Profile): number {
  let n = 0;
  if (p.sigungu) n++;
  if (p.age !== "unknown") n++;
  if (p.householdSize !== "unknown") n++;
  if (p.traits !== null) n++;
  if (p.children !== null) n++;
  if (p.income !== "unknown") n++;
  if (p.benefits !== null) n++;
  if (p.housing !== "unknown") n++;
  if (p.car !== "unknown") n++;
  if (p.activity !== "unknown") n++;
  if (p.care !== null) n++;
  if (p.disability !== "unknown") n++;
  return n;
}

/** 2026년 기준 중위소득(월, 원) — 보건복지부 고시 보도자료(기획안 9장 [검증]: 1인 2,564,238 / 4인 6,494,738). */
export const MEDIAN_INCOME_2026: Partial<Record<number, number>> = {
  1: 2564238,
  4: 6494738,
};
