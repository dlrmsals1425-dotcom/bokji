import type { Tier } from "@/lib/engine/types";
import { TIER_LABEL } from "@/lib/engine/types";
import { APPLY_TYPE_LABEL, ORG_TYPE_ICON, ORG_TYPE_LABEL, SECTOR_LABEL, type Program } from "@/lib/data/types";

const TIER_ICON: Record<Tier, string> = { eligible: "●", likely: "◐", check: "○", ineligible: "✕" };

export function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`badge tier-${tier}`}>
      <span aria-hidden="true">{TIER_ICON[tier]}</span> {TIER_LABEL[tier]}
    </span>
  );
}

export function OrgBadge({ p }: { p: Program }) {
  const where = p.scope === "national" ? "전국" : (p.region?.label ?? "");
  return (
    <span className="badge org">
      <span aria-hidden="true">{ORG_TYPE_ICON[p.orgType]}</span> {ORG_TYPE_LABEL[p.orgType]}
      {where ? ` · ${where}` : ""}
    </span>
  );
}

export function ReviewBadge({ p }: { p: Program }) {
  if (p.rule.review === "verified") return <span className="badge reviewed">✔ 검수 규칙</span>;
  if (p.rule.review === "curated")
    return (
      <span className="badge reviewed" title="원문 근거 구절과 대조해 작성한 규칙입니다. 최종 사람 검수는 진행 중입니다.">
        ✔ 검수 규칙(1차)
      </span>
    );
  if (p.rule.review === "structured")
    return (
      <span className="badge api" title="공공서비스(혜택) API의 구조화된 지원조건 코드로 판정했어요. 재산 등 세부 요건은 원문에서 확인하세요.">
        ⚙ API 지원조건
      </span>
    );
  return null;
}

/** 복지 외 분야 표시 (기본 숨김 대상) */
export function SectorBadge({ p }: { p: Program }) {
  if (!p.sector) return null;
  return (
    <span className="badge warn" title="기본 결과에서는 숨기는 복지 외 분야 서비스예요">
      {SECTOR_LABEL[p.sector]} 대상
    </span>
  );
}

const APPLY_ICON = { self: "✍", auto: "🔄", institution: "🏢", unknown: "" } as const;
const APPLY_TITLE = {
  self: "본인이나 가족이 직접 신청해야 받을 수 있어요",
  auto: "대상이 되면 따로 신청하지 않아도 자동으로 지급·연계되는 경우가 많아요",
  institution: "기관·학교·시설이 대상자를 추천하거나 선정하는 사업이에요",
  unknown: "",
} as const;

/** 신청 유형 표시: 직접 신청 / 자동 제공 / 기관 추천·선정 (확인 필요는 표시하지 않음) */
export function ApplyBadge({ p }: { p: Program }) {
  const t = p.applyType;
  if (!t || t === "unknown") return null;
  return (
    <span className={`badge apply-${t}`} title={APPLY_TITLE[t]} data-testid="apply-badge">
      <span aria-hidden="true">{APPLY_ICON[t]}</span> {APPLY_TYPE_LABEL[t]}
    </span>
  );
}
