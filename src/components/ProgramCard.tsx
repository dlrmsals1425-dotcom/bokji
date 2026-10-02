import Link from "next/link";
import type { Program } from "@/lib/data/types";
import type { Evaluation } from "@/lib/engine/types";
import { OrgBadge, ReviewBadge, TierBadge } from "./Badges";

export function ProgramCard({ p, ev }: { p: Program; ev?: Evaluation }) {
  const where = p.provider || p.owner;
  return (
    <article className={`card pcard ${ev ? `t-${ev.tier}` : ""}`} data-testid="program-card">
      <div className="badges">
        {ev && <TierBadge tier={ev.tier} />}
        <OrgBadge p={p} />
        <span className="badge org">{p.category}</span>
        <ReviewBadge p={p} />
      </div>
      <h3>
        <Link href={`/p/${encodeURIComponent(p.id)}`}>{p.name}</Link>
      </h3>
      {p.summary && <p className="sum">{p.summary}</p>}
      {ev && (
        <p className="why">
          <span className="sr-only">판단 이유: </span>
          {ev.headline}
        </p>
      )}
      <div className="meta">
        {where && <span>기관: {where}</span>}
        {p.deadline && <span>기간: {p.deadline}</span>}
      </div>
    </article>
  );
}
