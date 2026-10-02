import Link from "next/link";
import type { Program } from "@/lib/data/types";
import type { Evaluation, Reason } from "@/lib/engine/types";
import { OrgBadge, ReviewBadge, SectorBadge, TierBadge } from "./Badges";

export interface Variant {
  p: Program;
  ev: Evaluation;
}

const short = (s: string, n = 46) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** '… — 나이대를 입력하면 확인할 수 있어요' 같은 안내 꼬리를 떼고 조건 이름만 */
const condOnly = (t: string) => t.replace(/\s+—\s+.*$/, "").replace(/\s*\(입력:.*\)$/, "");

/** 카드용 판단 이유: 맞은 조건 최대 3개(✓) + 확인할 조건 1개(?) 또는 맞지 않는 조건 1개(✕) */
export function ReasonSummary({ ev }: { ev: Evaluation }) {
  const met = ev.reasons.filter((r) => r.kind === "met").slice(0, 3);
  const pick = (k: Reason["kind"]) => ev.reasons.find((r) => r.kind === k);
  const unmet = ev.tier === "ineligible" ? pick("unmet") : undefined;
  const unknown = ev.tier !== "ineligible" && ev.tier !== "eligible" ? pick("unknown") ?? pick("note") : undefined;
  if (!met.length && !unmet && !unknown) return <p className="why">{ev.headline}</p>;
  return (
    <ul className="why-list" aria-label="판단 이유">
      {met.map((r) => (
        <li key={r.text} className="met">
          <span aria-hidden="true">✓</span>
          <span className="sr-only">맞는 조건:</span> {short(r.text)}
        </li>
      ))}
      {unknown && (
        <li className="unknown">
          <span aria-hidden="true">?</span>
          <span className="sr-only">확인할 조건:</span> {short(condOnly(unknown.text.replace(/^(추가로 확인할 조건|상담으로 판단하는 조건): /, "")), 56)}
        </li>
      )}
      {unmet && (
        <li className="unmet">
          <span aria-hidden="true">✕</span>
          <span className="sr-only">맞지 않는 조건:</span> {short(unmet.text, 60)}
        </li>
      )}
    </ul>
  );
}

export function ProgramCard({ p, ev, variants, rank }: { p: Program; ev?: Evaluation; variants?: Variant[]; rank?: number }) {
  const where = p.provider || p.owner;
  return (
    <article className={`card pcard ${ev ? `t-${ev.tier}` : ""}`} data-testid="program-card">
      <div className="badges">
        {ev && <TierBadge tier={ev.tier} />}
        <OrgBadge p={p} />
        <span className="badge org">{p.category}</span>
        <ReviewBadge p={p} />
        <SectorBadge p={p} />
        {p.orgType === "edu_office" && <span className="badge edu">교육청</span>}
      </div>
      <h3>
        {rank !== undefined && <span className="rank" aria-hidden="true">{rank}</span>}
        <Link href={`/p/${encodeURIComponent(p.id)}`}>{p.name}</Link>
      </h3>
      {p.summary && <p className="sum">{p.summary}</p>}
      {ev && <ReasonSummary ev={ev} />}
      <div className="meta">
        {where && <span>기관: {where}</span>}
        {p.deadline && <span>기간: {short(p.deadline, 40)}</span>}
      </div>
      {variants && variants.length > 0 && (
        <details className="variants">
          <summary data-testid="variants-toggle">
            같은 이름의 다른 기관 사업 {variants.length}개 더 보기
          </summary>
          <ul>
            {variants.map((v) => (
              <li key={v.p.id}>
                <Link href={`/p/${encodeURIComponent(v.p.id)}`}>{v.p.name}</Link>{" "}
                <span className="small muted">
                  · {v.p.scope === "national" ? "전국" : v.p.region?.label} · {v.p.provider || v.p.owner || ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}
