/**
 * 판정·분류 표시. 색깔 알약 배지 대신 굵은 글자/회색 글자로만 보여 준다.
 * (이름은 예전 컴포넌트와 같게 유지)
 */
import type { Tier } from "@/lib/engine/types";
import { TIER_LABEL } from "@/lib/engine/types";
import { APPLY_TYPE_LABEL, ORG_TYPE_LABEL, SECTOR_LABEL, type Program } from "@/lib/data/types";

export function TierBadge({ tier }: { tier: Tier }) {
  return <strong className={`status tier-${tier}`}>{TIER_LABEL[tier]}</strong>;
}

/** 기관 단계 · 지역 (예: 시군구 · 경기도 수원시) */
export function orgText(p: Program): string {
  const where = p.scope === "national" ? "전국" : (p.region?.label ?? "");
  return `${ORG_TYPE_LABEL[p.orgType]}${where ? ` · ${where}` : ""}`;
}

export function reviewText(p: Program): string | null {
  if (p.rule.review === "verified") return "검수 규칙";
  if (p.rule.review === "curated") return "검수 규칙(1차)";
  if (p.rule.review === "structured") return "API 지원조건";
  return null;
}

/** 복지 외 분야·운영 지원 표시 (기본 숨김 대상) */
export function sectorText(p: Program): string | null {
  if (!p.sector) return null;
  return p.sector === "operator" ? SECTOR_LABEL[p.sector] : `${SECTOR_LABEL[p.sector]} 대상`;
}

const APPLY_TITLE = {
  self: "본인이나 가족이 직접 신청해야 받을 수 있어요",
  auto: "대상이 되면 따로 신청하지 않아도 자동으로 지급·연계되는 경우가 많아요",
  institution: "기관·학교·시설이 대상자를 추천하거나 선정하는 사업이에요",
  unknown: "",
} as const;

/** 신청 유형 표시: 자동 제공 / 기관 추천·선정만 글자로 (직접 신청이 기본이라 따로 표시하지 않음) */
export function ApplyBadge({ p, showSelf = false }: { p: Program; showSelf?: boolean }) {
  const t = p.applyType;
  if (!t || t === "unknown" || (t === "self" && !showSelf)) return null;
  return (
    <span title={APPLY_TITLE[t]} data-testid="apply-badge">
      {APPLY_TYPE_LABEL[t]}
    </span>
  );
}
