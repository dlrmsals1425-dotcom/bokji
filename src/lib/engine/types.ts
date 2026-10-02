import type {
  Activity, Benefit, Car, CareNeed, ChildBucket, Disability, DisabilitySeverity, HouseholdTrait, Housing,
} from "./profile";

/** 3값 논리 (설계서 6.2) */
export type Tri = "T" | "F" | "U";

interface LeafBase {
  /** 사람이 읽는 조건 문구. 예: "만 65세 이상" */
  label: string;
  /**
   * soft: 원천 태그처럼 '배타적이지 않은' 신호. FALSE를 UNKNOWN으로 낮춘다 (해당 사업을 숨기지 않음).
   */
  soft?: boolean;
  /** capU: TRUE여도 UNKNOWN으로 낮춘다 (예: '임신 중'이면 출산 후 대상이 될 수 있음). */
  capU?: boolean;
}

export type Leaf =
  | (LeafBase & { field: "age"; min?: number; max?: number })
  | (LeafBase & { field: "childAge"; min?: number; max?: number })
  | (LeafBase & { field: "children"; anyOf: ChildBucket[] })
  | (LeafBase & { field: "income"; lte: number })
  /** S3 지원조건의 중위소득 구간 합집합 (예: 0~50, 51~75) */
  | (LeafBase & { field: "incomeBands"; bands: [number, number][] })
  | (LeafBase & { field: "householdSize"; min?: number; max?: number })
  | (LeafBase & { field: "trait"; anyOf: HouseholdTrait[] })
  | (LeafBase & { field: "benefit"; anyOf: Benefit[] })
  | (LeafBase & { field: "housing"; anyOf: Housing[] })
  | (LeafBase & { field: "car"; anyOf: Car[] })
  | (LeafBase & { field: "activity"; anyOf: Activity[] })
  | (LeafBase & { field: "care"; anyOf: CareNeed[] })
  | (LeafBase & { field: "disability"; anyOf: Exclude<Disability, "none">[]; severity?: DisabilitySeverity })
  /** 익명 단계에서 묻지 않는 조건 (성별, 소득하위 70%, 등급 판정 등) → 항상 UNKNOWN */
  | (LeafBase & { field: "unasked"; hint?: string })
  /** 지역 주민 누구나 (번들 선택 단계에서 거주지가 이미 맞음) → 항상 TRUE */
  | (LeafBase & { field: "resident" });

export type Cond = Leaf | { all: Cond[]; label?: string } | { any: Cond[]; label?: string };

export type ReviewStatus =
  /** 사람 검수 완료 (검수 원장에 검수자·일자 기록) */
  | "verified"
  /** 원문 근거 구절과 대조해 작성한 규칙 (1차 검수). 최종 사람 검수 대기 */
  | "curated"
  /** 공공서비스(혜택) API 구조화 지원조건 코드에서 변환 (전국·시범 지역). '조건 충족' 판정 허용 */
  | "structured"
  /** 구조화 조건·태그·문구에서 자동 변환한 초안. 판정 상한 '가능성 있음' */
  | "auto";

export type RuleOrigin = "curated" | "gov24_conditions" | "bokjiro_tags" | "text_extract" | "none";

export interface Rule {
  id: string;
  origin: RuleOrigin;
  review: ReviewStatus;
  logic: Cond | null;
  /** 구조화하지 못한 조건 문구 */
  unstructured: string[];
  /** 비정형 조건이 핵심(예: '돌봄이 필요하다고 판단되는 자') → 판정 상한 '확인 필요' */
  unstructuredCore: boolean;
  /** 규칙의 원문 근거 구절 */
  evidence?: string;
  reviewer?: string;
  reviewedAt?: string;
}

export type Tier = "eligible" | "likely" | "check" | "ineligible";

export type ReasonKind = "met" | "unmet" | "unknown" | "note";

export interface Reason {
  kind: ReasonKind;
  text: string;
}

export interface Evaluation {
  tier: Tier;
  reasons: Reason[];
  /** 카드에 보여줄 한 줄 근거 */
  headline: string;
}

export const TIER_LABEL: Record<Tier, string> = {
  eligible: "조건 충족",
  likely: "가능성 있음",
  check: "확인 필요",
  ineligible: "조건 불일치",
};
