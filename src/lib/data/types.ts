import type { Rule } from "../engine/types";

/** 기관 유형 (기획안 7.2). coop_public 은 3단계 도입. */
export type OrgType = "central" | "metro" | "local" | "public_inst" | "edu_office" | "other";

export const ORG_TYPE_LABEL: Record<OrgType, string> = {
  central: "중앙부처·청",
  metro: "시·도",
  local: "시군구",
  public_inst: "공공기관",
  edu_office: "교육청",
  other: "기타 기관",
};

/** 지리 범위 (설계서 5.4) — org_type 과 별개 축 */
export type Scope = "national" | "sido" | "sigungu";

export const SCOPE_LABEL: Record<Scope, string> = {
  national: "전국 공통",
  sido: "시·도 사업",
  sigungu: "우리 시군구 사업",
};

/** 복지로 관심주제 15개 (설계서 5.3 1단계 분야) */
export const CATEGORIES = [
  "생활지원", "임신·출산", "신체건강", "교육", "안전·위기", "보호·돌봄", "일자리", "주거",
  "입양·위탁", "보육", "문화·여가", "서민금융", "정신건강", "에너지", "법률",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type SourceId = "gov24" | "bokjiro" | "welfare100" | "icare";

export const SOURCE_LABEL: Record<SourceId, string> = {
  gov24: "정부24 공공서비스(혜택) 정보 (행정안전부)",
  bokjiro: "복지로 복지서비스 정보 (한국사회보장정보원 OpenAPI)",
  welfare100: "복지로 기반 핵심 복지 100선 요약",
  icare: "보건복지부 통합돌봄 지방정부 서비스 메뉴판",
};

export interface SourceRef {
  source: SourceId;
  /** 원천 ID */
  id: string;
  url?: string;
  /** 원문 기준일 (YYYY-MM 또는 YYYY-MM-DD) */
  updatedAt?: string;
  /** 수집일 (YYYY-MM-DD) */
  fetchedAt: string;
}

/** 정보 신뢰도 (기획안 7.3): A 공식 통합 데이터 / B 기관 공식 누리집 / C 2차 정보 */
export type Trust = "A" | "B" | "C";

export type Badge = "financial" | "business" | "student";

export interface RegionRef {
  sido: string;
  sigungu?: string;
  label: string;
}

/** 통합돌봄 메뉴판의 '전국 공통 사업의 지역 운영분' (같은 사업, 우리 지역 운영 정보) */
export interface LocalOperation {
  name: string;
  provider?: string;
  description?: string;
  target?: string;
  url?: string;
  updatedAt?: string;
  contact?: string;
  applyMethod?: string;
  source?: SourceId;
}

export interface Program {
  id: string;
  name: string;
  summary: string;
  category: Category;
  /** 서비스 개념(돌봄 상세) 등 보조 태그 */
  tags?: string[];
  orgType: OrgType;
  scope: Scope;
  region?: RegionRef;
  /** 소관기관 (정책 책임) */
  owner?: string;
  /** 집행기관·신청처 */
  provider?: string;
  target?: string;
  criteria?: string;
  benefit?: string;
  applyMethod?: string;
  documents?: string;
  contact?: string;
  deadline?: string;
  /** 공식 원문 링크 */
  url?: string;
  /** 온라인 신청 링크 (있을 때만) */
  applyUrl?: string;
  provision?: string[];
  laws?: string[];
  sources: SourceRef[];
  trust: Trust;
  badges?: Badge[];
  rule: Rule;
  /** 교차 원천 병합으로 합쳐진 원천 레코드 수 (1 = 단일) */
  mergedCount?: number;
  /** 같은 사업의 다른 표기 */
  aliases?: string[];
  /** 복지 외 분야: agri 농림축산어업 종사자 대상 / business 소상공인·기업·창업 등 사업자 대상 (기본 결과에서 숨김) */
  sector?: Sector;
  /** 신청 유형: self 직접 신청 / auto 자동 제공 / institution 기관 추천·선정·시설 대상 / unknown 확인 필요 (없으면 unknown) */
  applyType?: ApplyType;
  /** 신청 유형 판단 근거 (상세 샤드에만) */
  applyReason?: string;
  /** 기관·시설 운영 지원(sector operator)으로 본 근거 (상세 샤드에만) */
  operatorReason?: string;
  /** 목록 번들 전용: 신청방법·연락처가 있는지 (상세 필드는 details 샤드에) */
  hasApply?: boolean;
}

export type Sector = "agri" | "business" | "operator";

/** 신청 유형 (운영자 방향 2026-10-02: 직접 신청해야 받는 혜택을 앞에, 자동·기관 선정 혜택은 아래 접힌 영역) */
export type ApplyType = "self" | "auto" | "institution" | "unknown";
export const APPLY_TYPE_LABEL: Record<ApplyType, string> = {
  self: "직접 신청",
  auto: "자동 제공",
  institution: "기관 추천·선정",
  unknown: "신청 방법 확인",
};
/** 결과 본문(추천·탭 목록)에서 빼고 '자동으로 받는 혜택'에 모으는 유형 */
export const isAutoLike = (p: { applyType?: ApplyType }) => p.applyType === "auto" || p.applyType === "institution";
export const SECTOR_LABEL: Record<Sector, string> = { agri: "농림축산어업", business: "사업자·창업", operator: "기관·시설 운영 지원" };

export interface Bundle {
  schema: 1;
  kind: "national" | "sido" | "sigungu";
  code: string;
  label: string;
  generatedAt: string;
  programs: Program[];
  /** 전국 사업 id → 이 시군구의 운영 정보 (통합돌봄 메뉴판 병합분) */
  localOps?: Record<string, LocalOperation[]>;
}

export interface RegionIndex {
  schema: 1;
  generatedAt: string;
  sidos: { code: string; name: string; short: string; pilot: boolean; sigungus: { code: string; name: string; count: number }[]; count: number }[];
}

export interface BuildMeta {
  schema: 1;
  generatedAt: string;
  dataAsOf: Record<string, string>;
  counts: Record<string, unknown>;
  gov24: { status: "ok" | "unavailable" | "error"; detail: string; services?: number };
}
