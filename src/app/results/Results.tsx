"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProgramCard } from "@/components/ProgramCard";
import { clearProfile, useProfile } from "@/lib/client/storage";
import { loadForRegion, type Loaded } from "@/lib/client/bundles";
import { applyFilters, eduCount, facetCounts, scoreAll, type Filters } from "@/lib/client/results";
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
const PAGE = 30;

export function Results() {
  const profile = useProfile();
  if (profile === undefined) return <div className="wrap results-head muted">불러오는 중…</div>;
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
  const [limit, setLimit] = useState(PAGE);
  const [toast, setToast] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    loadForRegion(profile.sido, profile.sigungu).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [profile.sido, profile.sigungu]);

  const scored = useMemo(() => (data ? scoreAll(data.programs, profile) : []), [data, profile]);
  const counts = useMemo(() => facetCounts(scored, f), [scored, f]);
  const list = useMemo(() => applyFilters(scored, f), [scored, f]);
  const edu = useMemo(() => eduCount(scored, f), [scored, f]);
  const total = useMemo(() => {
    const t: Record<Tier, number> = { eligible: 0, likely: 0, check: 0, ineligible: 0 };
    scored.forEach((s) => {
      if (s.program.orgType !== "edu_office") t[s.ev.tier]++;
    });
    return t;
  }, [scored]);

  const update = (patch: Partial<Filters>) => {
    setF((prev) => ({ ...prev, ...patch }));
    setLimit(PAGE);
  };

  // 처음 열었을 때 '조건 충족'이 0개면 '가능성 있음' 탭부터 보여준다
  const [autoTabDone, setAutoTabDone] = useState(false);
  if (data && !autoTabDone) {
    setAutoTabDone(true);
    if (total.eligible === 0) setF((prev) => ({ ...prev, tier: total.likely ? "likely" : "check" }));
  }

  if (!data)
    return (
      <div className="wrap results-head" aria-busy="true">
        <p className="muted">내 지역 서비스를 불러와 이 기기에서 판정하고 있어요…</p>
      </div>
    );

  const chips = profileChips(profile, data.label);
  const share = async () => {
    const top = scored.filter((s) => s.ev.tier === "eligible").slice(0, 5).map((s) => `· ${s.program.name}`);
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
    <div className="wrap" style={{ paddingBottom: 48 }}>
      <section className="results-head">
        <div className="print-only">
          <strong>복지나침반 결과 요약</strong> — 출력일 {new Date().toLocaleDateString("ko-KR")}
        </div>
        <h1 style={{ fontSize: "clamp(1.4rem, 1.1rem + 1.2vw, 2rem)", fontWeight: 850 }}>
          {data.label}에서 찾은 서비스{" "}
          <span style={{ color: "var(--brand)" }}>{(total.eligible + total.likely + total.check).toLocaleString("ko-KR")}개</span>
        </h1>
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
          <label className="small" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={!!f.includeEdu} onChange={(e) => update({ includeEdu: e.target.checked })} data-testid="include-edu" />
            교육청 서비스도 보기 ({edu.toLocaleString("ko-KR")}개)
          </label>
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
          </div>
        </aside>

        <section id="result-list" role="tabpanel" aria-label={TIER_LABEL[f.tier]}>
          <p className="small muted" aria-live="polite" style={{ marginBottom: 10 }}>
            {TIER_LABEL[f.tier]} {list.length.toLocaleString("ko-KR")}개
            {f.category || f.org || f.q ? " (필터 적용)" : ""} · 검수 규칙 → 맞는 조건 많은 순 → 우리 동네 사업 순
          </p>
          {list.length === 0 ? (
            <div className="card empty">
              <p>이 조건에 해당하는 서비스가 없어요.</p>
              {f.tier === "eligible" && (
                <p className="small" style={{ marginTop: 6 }}>
                  &lsquo;조건 충족&rsquo;은 검수된 규칙이 있는 서비스만 해당돼요. &lsquo;가능성 있음&rsquo; 탭도 확인해 보세요.
                </p>
              )}
            </div>
          ) : (
            <div className="list">
              {list.slice(0, limit).map((s) => (
                <ProgramCard key={s.program.id} p={s.program} ev={s.ev} />
              ))}
            </div>
          )}
          {list.length > limit && (
            <div style={{ textAlign: "center", marginTop: 16 }} className="no-print">
              <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
                더 보기 ({(list.length - limit).toLocaleString("ko-KR")}개 남음)
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
          <p className="disclaimer">
            이 결과는 공개된 자격 조건과 입력하신 정보만으로 계산한 안내이며, 실제 선정은 소득·재산 조사 등 기관 심사로 결정됩니다. 검수 전인
            자동 변환 규칙은 최대 &lsquo;가능성 있음&rsquo;까지만 판정합니다.
          </p>
        </section>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
