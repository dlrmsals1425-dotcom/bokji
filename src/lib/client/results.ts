/** 판정 결과 계산·정렬·필터 (순수 함수 — 단위 테스트 대상) */
import { evaluateRule } from "../engine/evaluate";
import type { Profile } from "../engine/profile";
import type { Evaluation, Tier } from "../engine/types";
import type { Category, OrgType, Program } from "../data/types";

export interface Scored {
  program: Program;
  ev: Evaluation;
  met: number;
}

const REVIEW_RANK = { verified: 0, curated: 1, auto: 2 } as const;
const SCOPE_RANK = { sigungu: 0, sido: 1, national: 2 } as const;

export function scoreAll(programs: Program[], profile: Profile): Scored[] {
  const out: Scored[] = programs.map((program) => {
    const ev = evaluateRule(program.rule, profile);
    return { program, ev, met: ev.reasons.filter((r) => r.kind === "met").length };
  });
  out.sort(
    (a, b) =>
      REVIEW_RANK[a.program.rule.review] - REVIEW_RANK[b.program.rule.review] ||
      b.met - a.met ||
      SCOPE_RANK[a.program.scope] - SCOPE_RANK[b.program.scope] ||
      a.program.name.localeCompare(b.program.name, "ko"),
  );
  return out;
}

export interface Filters {
  tier: Tier;
  category: Category | null;
  org: OrgType | null;
  q: string;
}

export function normalizeQuery(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

export function matchesQuery(p: Program, q: string): boolean {
  if (!q) return true;
  const hay = normalizeQuery([p.name, p.summary, p.target ?? "", p.owner ?? "", p.provider ?? "", (p.tags ?? []).join(" "), (p.aliases ?? []).join(" ")].join(" "));
  return normalizeQuery(q)
    .split(/[,]/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

/** 각 축의 개수는 '다른 축의 필터'를 적용한 상태에서 센다 → 필터를 바꾸면 모든 개수가 함께 갱신된다 */
export function facetCounts(items: Scored[], f: Filters) {
  const tiers: Record<Tier, number> = { eligible: 0, likely: 0, check: 0, ineligible: 0 };
  const cats = new Map<Category, number>();
  const orgs = new Map<OrgType, number>();
  for (const s of items) {
    const p = s.program;
    if (!matchesQuery(p, f.q)) continue;
    const okCat = !f.category || p.category === f.category;
    const okOrg = !f.org || p.orgType === f.org;
    const okTier = s.ev.tier === f.tier;
    if (okCat && okOrg) tiers[s.ev.tier]++;
    if (okTier && okOrg) cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
    if (okTier && okCat) orgs.set(p.orgType, (orgs.get(p.orgType) ?? 0) + 1);
  }
  return { tiers, cats, orgs };
}

export function applyFilters(items: Scored[], f: Filters): Scored[] {
  return items.filter(
    (s) =>
      s.ev.tier === f.tier &&
      (!f.category || s.program.category === f.category) &&
      (!f.org || s.program.orgType === f.org) &&
      matchesQuery(s.program, f.q),
  );
}
