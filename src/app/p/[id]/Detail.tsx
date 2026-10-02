"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApplyBadge, OrgBadge, ReviewBadge, SectorBadge, TierBadge } from "@/components/Badges";
import { loadLocalOps, loadProgram } from "@/lib/client/bundles";
import { useProfile } from "@/lib/client/storage";
import { evaluateRule } from "@/lib/engine/evaluate";
import { SOURCE_LABEL, ORG_TYPE_LABEL, type LocalOperation, type Program } from "@/lib/data/types";
import type { ReasonKind } from "@/lib/engine/types";

const REASON_ICON: Record<ReasonKind, string> = { met: "✓", unmet: "✕", unknown: "?", note: "i" };
const KIND_ORDER: Record<ReasonKind, number> = { met: 0, unmet: 1, unknown: 2, note: 3 };
const TRUST_LABEL = {
  A: "A · 공식 통합 데이터(복지로·정부24)",
  B: "B · 기관 공식 문서·누리집 기반",
  C: "C · 2차 정보",
} as const;

export function Detail({ id }: { id: string }) {
  const profile = useProfile();
  const [program, setProgram] = useState<Program | null | undefined>(undefined);
  const [ops, setOps] = useState<LocalOperation[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    loadProgram(id).then((p) => alive && setProgram(p));
    return () => {
      alive = false;
    };
  }, [id]);

  const sido = profile?.sido ?? null;
  const sigungu = profile?.sigungu ?? null;
  useEffect(() => {
    let alive = true;
    if (id.startsWith("n.") && sigungu) loadLocalOps(id, sido, sigungu).then((o) => alive && setOps(o));
    return () => {
      alive = false;
    };
  }, [id, sido, sigungu]);

  const ev = useMemo(() => (program && profile ? evaluateRule(program.rule, profile) : null), [program, profile]);

  if (program === undefined) return <div className="wrap detail muted">불러오는 중…</div>;
  if (program === null)
    return (
      <div className="narrow detail">
        <div className="card pad empty">
          <h1 style={{ fontSize: "1.3rem", color: "var(--ink)" }}>서비스를 찾을 수 없어요</h1>
          <p style={{ marginTop: 8 }}>데이터가 갱신되며 주소가 바뀌었을 수 있어요.</p>
          <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
            <Link href="/search" className="btn btn-primary">
              검색으로 찾기
            </Link>
          </div>
        </div>
      </div>
    );

  const p = program;
  const placeLabel = p.region?.label ?? "주소지";
  const hasApplyInfo = !!(p.applyMethod || p.contact || p.applyUrl);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: p.name, text: `${p.name} — 복지나침반`, url });
      else {
        await navigator.clipboard.writeText(`${p.name}\n${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  return (
    <div className="wrap detail">
      <nav className="no-print small" aria-label="이동">
        <Link href={profile ? "/results" : "/search"}>← {profile ? "내 결과로" : "검색으로"} 돌아가기</Link>
      </nav>
      <div className="badges" style={{ marginTop: 12 }}>
        {ev && <TierBadge tier={ev.tier} />}
        <ApplyBadge p={p} />
        <OrgBadge p={p} />
        <span className="badge org">{p.category}</span>
        <ReviewBadge p={p} />
        {p.orgType === "edu_office" && <span className="badge edu">교육청 서비스</span>}
        <SectorBadge p={p} />
        <span className="badge trust">신뢰도 {p.trust}</span>
      </div>
      <h1>{p.name}</h1>
      {p.summary && <p className="lead">{p.summary}</p>}

      <div className="dgrid">
        <div>
          <section className="card pad dsec" aria-labelledby="h-why">
            <h2 id="h-why">🧭 왜 이렇게 판단했나요?</h2>
            {ev ? (
              <>
                <p style={{ marginBottom: 10 }}>
                  <TierBadge tier={ev.tier} /> <span className="small muted">입력하신 정보 기준</span>
                </p>
                <ul className="reasons" data-testid="reasons">
                  {[...ev.reasons].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).map((r, i) => (
                    <li key={i} className={r.kind}>
                      <span className="ic" aria-hidden="true">
                        {REASON_ICON[r.kind]}
                      </span>
                      <span>
                        <span className="sr-only">
                          {{ met: "충족: ", unmet: "불충족: ", unknown: "확인 필요: ", note: "참고: " }[r.kind]}
                        </span>
                        {r.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <RuleNote p={p} />
              </>
            ) : (
              <div className="info">
                <span aria-hidden="true">💡</span>
                <span>
                  <Link href="/check">12개 질문에 답하면</Link> 이 서비스의 대상 여부를 이유와 함께 알려드려요. 로그인은 필요 없어요.
                </span>
              </div>
            )}
          </section>

          <section className="card pad dsec" aria-labelledby="h-info">
            <h2 id="h-info">📋 서비스 내용</h2>
            <dl className="kv">
              {p.target && (
                <>
                  <dt>지원 대상</dt>
                  <dd>
                    <LongText text={p.target} />
                  </dd>
                </>
              )}
              {p.criteria && (
                <>
                  <dt>선정 기준</dt>
                  <dd>
                    <LongText text={p.criteria} />
                  </dd>
                </>
              )}
              {p.benefit && (
                <>
                  <dt>지원 내용</dt>
                  <dd>
                    <LongText text={p.benefit} />
                  </dd>
                </>
              )}
              {p.provision?.length ? (
                <>
                  <dt>지원 형태</dt>
                  <dd>{p.provision.join(", ")}</dd>
                </>
              ) : null}
              {p.applyMethod && (
                <>
                  <dt>신청 방법</dt>
                  <dd>
                    <LongText text={p.applyMethod} />
                  </dd>
                </>
              )}
              {p.documents && (
                <>
                  <dt>구비 서류</dt>
                  <dd>
                    <LongText text={p.documents} />
                  </dd>
                </>
              )}
              {p.deadline && (
                <>
                  <dt>신청 기간</dt>
                  <dd>{p.deadline}</dd>
                </>
              )}
              {p.laws?.length ? (
                <>
                  <dt>근거</dt>
                  <dd>{p.laws.join("\n")}</dd>
                </>
              ) : null}
              {p.tags?.length ? (
                <>
                  <dt>관련 주제</dt>
                  <dd>{[...new Set(p.tags)].join(" · ")}</dd>
                </>
              ) : null}
            </dl>
            {!p.target && !p.criteria && !p.benefit && <p className="muted">세부 내용은 아래 원문 링크에서 확인하세요.</p>}
          </section>

          {ops.length > 0 && (
            <section className="card pad dsec" aria-labelledby="h-ops">
              <h2 id="h-ops">📍 우리 지역 운영 정보</h2>
              <ul className="ops">
                {ops.map((o, i) => (
                  <li key={i}>
                    <strong>{o.name}</strong>
                    {o.provider && <div className="small">운영: {o.provider}</div>}
                    {o.description && <div className="small muted">{o.description}</div>}
                    {o.contact && <div className="small">문의: {o.contact}</div>}
                    {o.applyMethod && <div className="small textblock">신청: {o.applyMethod.length > 200 ? o.applyMethod.slice(0, 199) + "…" : o.applyMethod}</div>}
                    {o.url && (
                      <a className="small" href={o.url} target="_blank" rel="noopener noreferrer">
                        원문 ↗
                      </a>
                    )}
                    <div className="small muted">
                      {o.updatedAt ? `원문 기준일 ${o.updatedAt} · ` : ""}
                      {o.source ? SOURCE_LABEL[o.source] : SOURCE_LABEL.icare}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div>
          <section className="card pad dsec" aria-labelledby="h-apply">
            <h2 id="h-apply">📞 신청·문의</h2>
            {p.applyType && p.applyType !== "unknown" && (
              <p className={`info small ${p.applyType === "self" ? "" : "warn"}`} style={{ marginBottom: 12 }} data-testid="apply-type">
                <span aria-hidden="true">{p.applyType === "self" ? "✍" : p.applyType === "auto" ? "🔄" : "🏢"}</span>
                <span>
                  <strong>
                    {p.applyType === "self"
                      ? "직접 신청해야 받을 수 있어요."
                      : p.applyType === "auto"
                        ? "대상이 되면 따로 신청하지 않아도 자동으로 지급·연계되는 경우가 많아요."
                        : "기관·학교·시설이 대상자를 추천하거나 선정하는 사업이에요."}
                  </strong>
                  {p.applyType !== "self" && " 해당될 것 같은데 받고 있지 않다면 아래 문의처나 주민센터에 확인해 보세요."}
                  {p.applyReason && (
                    <>
                      <br />
                      <span className="muted">근거: {p.applyReason}</span>
                    </>
                  )}
                </span>
              </p>
            )}
            <dl className="kv">
              {p.owner && (
                <>
                  <dt>소관기관</dt>
                  <dd>{p.owner}</dd>
                </>
              )}
              {p.provider && (
                <>
                  <dt>집행·신청처</dt>
                  <dd>{p.provider}</dd>
                </>
              )}
              <dt>기관 유형</dt>
              <dd>{ORG_TYPE_LABEL[p.orgType]}</dd>
              {p.contact && (
                <>
                  <dt>문의</dt>
                  <dd>{p.contact}</dd>
                </>
              )}
            </dl>
            {!hasApplyInfo && (
              <div className="fallback" style={{ marginTop: 12 }} data-testid="apply-fallback">
                <p className="small">
                  <strong>신청처·연락처 정보가 아직 정리되지 않았어요.</strong>
                  <br />
                  {p.scope === "national"
                    ? "주소지 읍면동 행정복지센터(주민센터) 또는 시군구청 담당 부서에 문의하세요."
                    : p.scope === "sigungu"
                      ? `${placeLabel.split(" ").pop()}청 담당 부서 또는 주소지 읍면동 행정복지센터에 문의하세요.`
                      : `${placeLabel} 시·도청 담당 부서, 주소지 시군구청 또는 읍면동 행정복지센터에 문의하세요.`}
                  <br />
                  보건복지상담센터 ☎ 129 · 정부민원안내 ☎ 110
                </p>
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 14, flexDirection: "column" }}>
              {p.applyUrl && (
                <a href={p.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  온라인 신청·관련 누리집 ↗
                </a>
              )}
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-testid="official-link">
                  공식 원문 보기 ↗
                </a>
              ) : (
                <a href="https://www.bokjiro.go.kr" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  복지로에서 &lsquo;{p.name}&rsquo; 검색 ↗
                </a>
              )}
              <button type="button" className="btn btn-locked" disabled title="로그인 후 사용할 수 있는 기능으로 준비 중입니다">
                🔒 신청 준비 체크리스트 (준비 중)
              </button>
              <button type="button" className="btn btn-locked" disabled title="로그인 후 사용할 수 있는 기능으로 준비 중입니다">
                🔒 마감·변경 알림 (준비 중)
              </button>
            </div>
          </section>

          <section className="card pad dsec" aria-labelledby="h-src">
            <h2 id="h-src">🔎 출처·기준일</h2>
            <ul className="ops" data-testid="sources">
              {p.sources.map((s, i) => (
                <li key={i}>
                  <strong className="small">{SOURCE_LABEL[s.source]}</strong>
                  <div className="small">원문 기준일: {s.updatedAt ?? "원문에 표기 없음"}</div>
                  <div className="small">수집일: {s.fetchedAt}</div>
                  {s.url && (
                    <a className="small" href={s.url} target="_blank" rel="noopener noreferrer">
                      원문 링크 ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <p className="small muted" style={{ marginTop: 10 }}>
              신뢰도 {TRUST_LABEL[p.trust]}
              {p.mergedCount && p.mergedCount > 1 ? ` · ${p.mergedCount}개 원천에서 같은 사업으로 합침` : ""}
            </p>
          </section>
        </div>
      </div>

      <div className="btn-row no-print" style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.print()}>
          🖨 인쇄·PDF 저장
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={share}>
          🔗 이 서비스 공유
        </button>
        {copied && (
          <span role="status" className="small muted" style={{ alignSelf: "center" }}>
            링크를 복사했어요
          </span>
        )}
      </div>
    </div>
  );
}

function RuleNote({ p }: { p: Program }) {
  const r = p.rule;
  let text: string;
  if (r.review === "verified") text = `검수 규칙 · ${r.reviewer ?? "검수자"} ${r.reviewedAt ?? ""}`;
  else if (r.review === "curated")
    text = "검수 규칙(1차) · 원문 근거 구절과 대조해 작성했고(AI 보조), 최종 사람 검수는 진행 중이에요.";
  else if (r.review === "structured")
    text = "API 지원조건 · 공공서비스(혜택) API의 구조화된 지원조건 코드(나이·소득 구간·대상 특성·가구 유형)로 판정했어요. 재산 등 세부 요건과 원문 문구에서 보완한 조건은 신청처에서 확인하세요.";
  else if (r.origin === "gov24_conditions")
    text = "API 지원조건(시범 지역 외) · 공공서비스(혜택) API 지원조건 코드로 변환했지만, 시범 지역(경기도)·전국 사업이 아니어서 최대 '가능성 있음'까지만 판정해요.";
  else if (r.origin === "none") text = "아직 구조화된 자격 규칙이 없어요. 원문·신청처에서 확인하세요.";
  else text = "자동 변환 규칙(검수 전) · 원문 문구·분류 태그에서 자동으로 뽑은 조건이라 최대 '가능성 있음'까지만 판정해요.";
  return (
    <div className="small muted" style={{ marginTop: 12 }}>
      <p>{text}</p>
      {r.evidence && (
        <p style={{ marginTop: 4 }}>
          근거 구절: &ldquo;{r.evidence.length > 160 ? r.evidence.slice(0, 159) + "…" : r.evidence}&rdquo;
        </p>
      )}
    </div>
  );
}

/** 긴 원문은 접어서 보여 준다 */
function LongText({ text, limit = 280 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (text.length <= limit + 40) return <>{text}</>;
  return (
    <>
      {open ? text : text.slice(0, limit).replace(/\s+\S*$/, "") + "…"}
      <button type="button" className="btn btn-text btn-sm no-print" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ display: "block", padding: "4px 0" }}>
        {open ? "접기 ▲" : "원문 더 보기 ▼"}
      </button>
    </>
  );
}
