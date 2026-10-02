"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProgramCard, ReasonSummary } from "@/components/ProgramCard";
import { TierBadge } from "@/components/Badges";
import { clearProfile, saveProfile, useExample, useProfile } from "@/lib/client/storage";
import { loadForRegion, type Loaded } from "@/lib/client/bundles";
import { applyFilters, autoGroups, eduCount, facetCounts, groupVariants, industryCount, operatorCount, scoreAll, topPicks, type Filters } from "@/lib/client/results";
import { PRESETS } from "@/lib/client/presets";
import { profileChips } from "@/lib/client/summary";
import { CATEGORIES, ORG_TYPE_LABEL, type Category, type OrgType } from "@/lib/data/types";
import { TIER_LABEL, type Tier } from "@/lib/engine/types";
import { answeredCount, type Profile } from "@/lib/engine/profile";

const TABS: { tier: Tier; desc: string }[] = [
  { tier: "eligible", desc: "검수된 조건을 모두 충족" },
  { tier: "likely", desc: "일부 조건 확인 필요" },
  { tier: "check", desc: "상담·원문으로 확인" },
];
const ORGS: OrgType[] = ["central", "metro", "local", "public_inst"];
/** 처음에는 관련도 상위 10개만 크게 보여 주고, '더 보기'로 20개씩 */
const FIRST = 10;
const PAGE = 20;

function Skeleton({ label }: { label: string }) {
  return (
    <div className="wrap results-head results-root" aria-busy="true" aria-live="polite">
      <p className="muted">{label}</p>
      <div className="skeleton" aria-hidden="true">
        <div className="sk" />
        <div className="sk" />
        <div className="sk" />
      </div>
    </div>
  );
}

export function Results() {
  const profile = useProfile();
  // /results?example=<예시 id> 링크로 예시 상황을 바로 연다 (데모·성능 점검용)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("example");
    const preset = PRESETS.find((x) => x.id === id);
    if (preset) {
      saveProfile(preset.profile, preset.id);
      window.history.replaceState(null, "", "/results");
    }
  }, []);
  if (profile === undefined) return <Skeleton label="불러오는 중…" />;
  if (profile === null)
    return (
      <div className="narrow" style={{ padding: "48px 0" }}>
        <div className="card pad empty">
          <h1 style={{ fontSize: "1.4rem", color: "var(--ink)" }}>아직 입력한 정보가 없어요</h1>
          <p style={{ marginTop: 8 }}>12개 간단한 질문에 답하면 받을 수 있을 만한 서비스를 찾아드려요. 로그인은 필요 없어요.</p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 18 }}>
            <Link href="/check" className="btn btn-primary btn-lg">
              맞춤 찾기 시작
            </Link>
          </div>
        </div>
      </div>
    );
  return <ResultsInner profile={profile} key={JSON.stringify(profile)} />;
}

function ResultsInner({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [f, setF] = useState<Filters>({ tier: "eligible", category: null, org: null, q: "" });
  const [limit, setLimit] = useState(FIRST);
  const example = useExample();
  const preset = PRESETS.find((x) => x.id === example);
  const [toast, setToast] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoLimit, setAutoLimit] = useState(FIRST);

  useEffect(() => {
    let alive = true;
    loadForRegion(profile.sido, profile.sigungu).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [profile.sido, profile.sigungu]);

  const scored = useMemo(() => (data ? scoreAll(data.programs, profile) : []), [data, profile]);
  const counts = useMemo(() => facetCounts(scored, f), [scored, f]);
  const groups = useMemo(() => groupVariants(applyFilters(scored, f)), [scored, f]);
  const edu = useMemo(() => eduCount(scored, f), [scored, f]);
  const industry = useMemo(() => industryCount(scored, f), [scored, f]);
  const operator = useMemo(() => operatorCount(scored, f), [scored, f]);
  // 자동 제공·기관 선정 사업 (본문에서 빼고 아래 접힌 영역에) — 분야·기관·검색·기본 숨김 필터는 본문과 같게
  const autos = useMemo(() => autoGroups(scored, f), [scored, f]);
  // 머리글 합계: 분야·기관·검색 필터는 빼고, 기본 숨김(교육청·복지 외 분야) 설정만 반영한 카드 수
  const total = useMemo(
    () => facetCounts(scored, { tier: "eligible", category: null, org: null, q: "", includeEdu: f.includeEdu, includeIndustry: f.includeIndustry, includeOperator: f.includeOperator }).tiers,
    [scored, f.includeEdu, f.includeIndustry, f.includeOperator],
  );
  const picks = useMemo(
    () => topPicks(scored, { includeEdu: f.includeEdu, includeIndustry: f.includeIndustry, includeOperator: f.includeOperator }, 5),
    [scored, f.includeEdu, f.includeIndustry, f.includeOperator],
  );

  const update = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setLimit(FIRST);
    setAutoLimit(FIRST);
  };

  // 처음 열었을 때 '조건 충족'이 0개면 '가능성 있음' 탭부터 보여준다
  const [autoTabDone, setAutoTabDone] = useState(false);
  if (data && !autoTabDone) {
    setAutoTabDone(true);
    if (total.eligible === 0) setF((prev) => ({ ...prev, tier: total.likely ? "likely" : "check" }));
  }

  if (!data) return <Skeleton label="내 지역 서비스를 불러와 이 기기에서 판정하고 있어요…" />;

  const chips = profileChips(profile, data.label);
  const share = async () => {
    const top = picks.map((g) => `· ${g.lead.program.name}`);
    const text = [
      `복지나침반에서 ${data.label} 기준으로 찾아본 결과: 조건 충족 ${total.eligible}개, 가능성 있음 ${total.likely}개, 확인 필요 ${total.check}개`,
      ...top,
      "(입력한 개인 정보는 공유되지 않아요. 직접 확인해 보세요)",
    ].join("\n");
    const url = window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: "복지나침반", text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setToast("결과 요약을 복사했어요 (입력값은 포함되지 않아요)");
        setTimeout(() => setToast(null), 2500);
      }
    } catch {}
  };

  return (
    <div className="wrap results-root" style={{ paddingBottom: 48 }}>
      <section className="results-head">
        <div className="print-only">
          <strong>복지나침반 결과 요약</strong> — 출력일 {new Date().toLocaleDateString("ko-KR")}
        </div>
        <h1 style={{ fontSize: "clamp(1.4rem, 1.1rem + 1.2vw, 2rem)", fontWeight: 850 }}>
          {data.label}에서 찾은 서비스{" "}
          <span style={{ color: "var(--brand)" }}>{(total.eligible + total.likely + total.check).toLocaleString("ko-KR")}개</span>
        </h1>
        {preset && (
          <p className="info warn small example-banner" data-testid="example-banner">
            <span aria-hidden="true">🧪</span>
            <span>
              <strong>예시 상황</strong>으로 보는 중이에요: {preset.title} ({preset.desc}). 실제 개인 정보가 아닌 데모용 입력이에요.{" "}
              <Link href="/check">내 상황으로 다시 입력</Link>
            </span>
          </p>
        )}
        <div className="profile-chips" aria-label="입력한 내 상황">
          {chips.map((c) => (
            <span className="chip" key={c}>
              {c}
            </span>
          ))}
          <span className="chip" style={{ borderStyle: "dashed" }}>
            12개 중 {answeredCount(profile)}개 입력
          </span>
          <Link href="/check" className="btn btn-text btn-sm no-print">
            입력 수정
          </Link>
        </div>

        {picks.length > 0 && (
          <section className="picks" aria-labelledby="picks-h" data-testid="top-picks">
            <h2 id="picks-h">
              <span aria-hidden="true">⭐</span> 먼저 확인해 보세요 — 내 상황과 가장 관련 있는 {picks.length}개
            </h2>
            <ol>
              {picks.map((g, i) => (
                <li key={g.key}>
                  <span className="num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <div className="badges">
                      <TierBadge tier={g.lead.ev.tier} />
                      <span className="badge org">{g.lead.program.scope === "national" ? "전국" : g.lead.program.region?.label}</span>
                    </div>
                    <Link href={`/p/${encodeURIComponent(g.lead.program.id)}`}>{g.lead.program.name}</Link>
                    <div className="r">
                      <ReasonSummary ev={g.lead.ev} />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="tabs" role="tablist" aria-label="판정 결과">
          {TABS.map((t) => (
            <button
              key={t.tier}
              role="tab"
              type="button"
              className={`tab t-${t.tier}`}
              aria-selected={f.tier === t.tier}
              aria-controls="result-list"
              onClick={() => update({ tier: t.tier })}
              data-testid={`tab-${t.tier}`}
            >
              <span className="l">{TIER_LABEL[t.tier]}</span>
              <span className="n">{counts.tiers[t.tier].toLocaleString("ko-KR")}</span>
              <span className="d">{t.desc}</span>
            </button>
          ))}
        </div>
        {answeredCount(profile) < 6 && (
          <p className="info warn small" style={{ marginTop: 12 }}>
            <span aria-hidden="true">💡</span>
            <span>
              입력한 항목이 적어 &lsquo;확인 필요&rsquo;가 많아요. <Link href="/check">항목을 더 입력</Link>하면 더 정확해져요.
            </span>
          </p>
        )}
        <div className="result-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
            🖨 인쇄·PDF 저장
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
            🔗 결과 공유
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              clearProfile();
              router.push("/");
            }}
          >
            🗑 이 기기에서 지우기
          </button>
          <button type="button" className="btn btn-locked btn-sm" disabled title="로그인 후 사용할 수 있는 기능으로 준비 중입니다">
            🔒 정밀 매칭 (준비 중)
          </button>
          <button type="button" className="btn btn-locked btn-sm" disabled title="로그인 후 사용할 수 있는 기능으로 준비 중입니다">
            🔒 저장·알림 (준비 중)
          </button>
        </div>
      </section>

      <div className="results-layout">
        <aside className={`card pad filters ${filtersOpen ? "open" : ""}`} aria-label="결과 좁히기">
          <button
            type="button"
            className="btn btn-ghost btn-sm mobile-only filter-toggle"
            aria-expanded={filtersOpen}
            aria-controls="filter-body"
            onClick={() => setFiltersOpen((o) => !o)}
          >
            ⚙ 결과 좁히기{f.category || f.org || f.q ? " (적용 중)" : ""} {filtersOpen ? "▲" : "▼"}
          </button>
          <div id="filter-body" className="filter-body">
          <h3>
            <label htmlFor="rq">결과 안에서 검색</label>
          </h3>
          <input
            id="rq"
            type="search"
            className="select"
            placeholder="예: 돌봄, 의료비"
            value={f.q}
            onChange={(e) => update({ q: e.target.value })}
          />
          <h3>기관 유형</h3>
          <div className="fchips">
            <button type="button" className="fchip" aria-pressed={!f.org} onClick={() => update({ org: null })}>
              전체
            </button>
            {ORGS.filter((o) => (counts.orgs.get(o) ?? 0) > 0 || f.org === o).map((o) => (
              <button key={o} type="button" className="fchip" aria-pressed={f.org === o} onClick={() => update({ org: f.org === o ? null : o })}>
                {ORG_TYPE_LABEL[o]} <span className="c">{counts.orgs.get(o) ?? 0}</span>
              </button>
            ))}
          </div>
          <h3>분야</h3>
          <div className="fchips">
            <button type="button" className="fchip" aria-pressed={!f.category} onClick={() => update({ category: null })}>
              전체
            </button>
            {CATEGORIES.filter((c) => (counts.cats.get(c) ?? 0) > 0 || f.category === c).map((c: Category) => (
              <button
                key={c}
                type="button"
                className="fchip"
                aria-pressed={f.category === c}
                onClick={() => update({ category: f.category === c ? null : c })}
              >
                {c} <span className="c">{counts.cats.get(c) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="hidden-toggles">
            <p className="small muted">기본으로 숨긴 서비스</p>
            <label>
              <input type="checkbox" checked={!!f.includeIndustry} onChange={(e) => update({ includeIndustry: e.target.checked })} data-testid="include-industry" />
              <span>
                농림축산어업·사업자(창업·소상공인) 대상도 보기 <span className="muted">({industry.toLocaleString("ko-KR")}개)</span>
              </span>
            </label>
            <label>
              <input type="checkbox" checked={!!f.includeOperator} onChange={(e) => update({ includeOperator: e.target.checked })} data-testid="include-operator" />
              <span>
                기관·시설 운영 지원 사업도 보기 <span className="muted">({operator.toLocaleString("ko-KR")}개)</span>
              </span>
            </label>
            <label>
              <input type="checkbox" checked={!!f.includeEdu} onChange={(e) => update({ includeEdu: e.target.checked })} data-testid="include-edu" />
              <span>
                교육청 서비스도 보기 <span className="muted">({edu.toLocaleString("ko-KR")}개)</span>
              </span>
            </label>
          </div>
          </div>
        </aside>

        <div className="results-main">
        <section id="result-list" data-testid="result-list" role="tabpanel" aria-label={TIER_LABEL[f.tier]}>
          <div className="list-head">
            <p className="small" aria-live="polite">
              <strong>{TIER_LABEL[f.tier]} {groups.length.toLocaleString("ko-KR")}개</strong>
              {f.category || f.org || f.q ? " (필터 적용)" : ""}
              {groups.length > limit ? ` 중 관련도 상위 ${Math.min(limit, groups.length)}개` : ""}
            </p>
            <p className="small muted">정렬: 내 상황과 맞는 조건 → 검수 규칙 → 우리 동네 사업 · 같은 이름의 지역 사업은 한 카드로 묶음</p>
          </div>
          {groups.length === 0 ? (
            <div className="card empty">
              <p>이 조건에 해당하는 서비스가 없어요.</p>
              {f.tier === "eligible" && (
                <p className="small" style={{ marginTop: 6 }}>
                  &lsquo;조건 충족&rsquo;은 검수 규칙·API 지원조건이 있는 서비스만 해당돼요. &lsquo;가능성 있음&rsquo; 탭도 확인해 보세요.
                </p>
              )}
              {(f.category || f.org || f.q) && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => update({ category: null, org: null, q: "" })}>
                  필터 모두 해제
                </button>
              )}
            </div>
          ) : (
            <div className="list">
              {groups.slice(0, limit).map((g, i) => (
                <ProgramCard
                  key={g.key}
                  p={g.lead.program}
                  ev={g.lead.ev}
                  rank={i < FIRST ? i + 1 : undefined}
                  variants={g.variants.map((v) => ({ p: v.program, ev: v.ev }))}
                />
              ))}
            </div>
          )}
          {groups.length > limit && (
            <div style={{ textAlign: "center", marginTop: 16 }} className="no-print">
              <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)} data-testid="more">
                더 보기 ({(groups.length - limit).toLocaleString("ko-KR")}개 남음)
              </button>
            </div>
          )}
          <div style={{ marginTop: 18 }} className="no-print">
            {f.tier === "ineligible" ? (
              <button type="button" className="btn btn-text" onClick={() => update({ tier: "eligible" })}>
                ← 판정 결과로 돌아가기
              </button>
            ) : (
              <button type="button" className="btn btn-text" onClick={() => update({ tier: "ineligible" })} data-testid="show-ineligible">
                조건이 맞지 않는 서비스 {total.ineligible.toLocaleString("ko-KR")}개도 보기
              </button>
            )}
          </div>
        </section>
        {autos.length > 0 && (
          <details
            className="auto-section"
            data-testid="auto-section"
            open={autoOpen}
            onToggle={(e) => setAutoOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary data-testid="auto-toggle">
              <span className="t">
                <span aria-hidden="true">🔄</span> 자동으로 받는 혜택
              </span>
              <span className="s">(따로 신청하지 않아도 되는 경우가 많아요)</span>
              <span className="c">
                <span data-testid="auto-count">{autos.length.toLocaleString("ko-KR")}</span>개 <span className="chev" aria-hidden="true">▼</span>
              </span>
            </summary>
            {autoOpen && (
              <div className="auto-body">
                <p className="small muted">
                  대상이 되면 기관이 자동으로 지급·연계하거나(공단 명단 통보, 수급자 선정 시 연계, 담당 공무원 직권 처리), 학교·시설·기관이 추천·선정하는
                  서비스예요. 해당될 것 같은데 받고 있지 않다면 주민센터나 ☎129에 확인해 보세요.
                </p>
                <div className="list">
                  {autos.slice(0, autoLimit).map((g) => (
                    <ProgramCard key={g.key} p={g.lead.program} ev={g.lead.ev} variants={g.variants.map((v) => ({ p: v.program, ev: v.ev }))} />
                  ))}
                </div>
                {autos.length > autoLimit && (
                  <div style={{ textAlign: "center", marginTop: 16 }} className="no-print">
                    <button type="button" className="btn btn-ghost" onClick={() => setAutoLimit((l) => l + PAGE)} data-testid="auto-more">
                      더 보기 ({(autos.length - autoLimit).toLocaleString("ko-KR")}개 남음)
                    </button>
                  </div>
                )}
              </div>
            )}
          </details>
        )}
        <p className="disclaimer">
          이 결과는 공개된 자격 조건과 입력하신 정보만으로 계산한 안내이며, 실제 선정은 소득·재산 조사 등 기관 심사로 결정됩니다. 검수 전인
          자동 변환 규칙은 최대 &lsquo;가능성 있음&rsquo;까지만 판정합니다. &lsquo;직접 신청&rsquo;·&lsquo;자동 제공&rsquo; 표시는 원문 신청방법 문구로
          분류한 것이니 정확한 절차는 기관에 확인하세요.
        </p>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
