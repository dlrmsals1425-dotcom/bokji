"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TierBadge, orgText, reviewText, sectorText } from "@/components/Badges";
import { Icon } from "@/components/Icon";
import { CHANNEL_LABEL, TIER_PLAIN, firstLine, howTo } from "@/lib/client/howto";
import { supportTypes } from "@/lib/client/facets";
import { loadLocalOps, loadProgram } from "@/lib/client/bundles";
import { useProfile } from "@/lib/client/storage";
import { evaluateRule } from "@/lib/engine/evaluate";
import { SOURCE_LABEL, ORG_TYPE_LABEL, type LocalOperation, type Program } from "@/lib/data/types";
import type { ReasonKind } from "@/lib/engine/types";

const REASON_LABEL: Record<ReasonKind, string> = { met: "맞음", unmet: "맞지 않음", unknown: "확인 필요", note: "참고" };
const KIND_ORDER: Record<ReasonKind, number> = { met: 0, unmet: 1, unknown: 2, note: 3 };
const SECTIONS = [
  { id: "sec-target", label: "지원대상" },
  { id: "sec-benefit", label: "지원내용" },
  { id: "sec-apply", label: "신청방법" },
  { id: "sec-contact", label: "문의·출처" },
] as const;

/** 스크롤 위치에 맞춰 현재 탭을 표시한다 (모든 내용은 항상 펼쳐 둔다) */
function useActiveSection(ready: boolean) {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  useEffect(() => {
    if (!ready) return;
    const onScroll = () => {
      let cur: string = SECTIONS[0].id;
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < 160) cur = s.id;
      }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [ready]);
  return active;
}

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

  const active = useActiveSection(!!program);
  const ev = useMemo(() => (program && profile ? evaluateRule(program.rule, profile) : null), [program, profile]);

  if (program === undefined) return <div className="wrap page muted">불러오는 중…</div>;
  if (program === null)
    return (
      <div className="narrow page">
        <h1 className="h1">서비스를 찾을 수 없어요</h1>
        <p className="lead">데이터가 갱신되며 주소가 바뀌었을 수 있어요.</p>
        <Link href="/search" className="btn btn-primary">
          검색으로 찾기
        </Link>
      </div>
    );

  const p = program;
  const placeLabel = p.region?.label ?? "주소지";
  const hasApplyInfo = !!(p.applyMethod || p.contact || p.applyUrl);
  const review = reviewText(p);
  const sector = sectorText(p);
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

  const how = howTo(p, p);
  const types = supportTypes(p);
  const kind = types.length ? types.join(", ") : p.provision?.length ? p.provision.join(", ") : null;
  const back = profile ? { href: "/results", label: "내 결과" } : { href: "/search", label: "서비스 찾기" };

  return (
    <div className="wrap page">
      <ol className="crumbs no-print" aria-label="현재 위치">
        <li>
          <Link href="/">
            <Icon name="home" size={14} /> 홈
          </Link>
        </li>
        <li>
          <Link href={back.href}>{back.label}</Link>
        </li>
        <li>
          <span aria-current="page">{p.name}</span>
        </li>
      </ol>

      <header className="card d-head">
        <div className="tags">
          <span className="tag">{orgText(p)}</span>
          <span className="tag gray">{p.category}</span>
          {p.orgType === "edu_office" && <span className="tag gray">교육청 서비스</span>}
          {sector && <span className="tag gray">{sector}</span>}
        </div>
        <h1 className="h1">{p.name}</h1>
        {p.summary && <p className="lead">{p.summary}</p>}
        <dl className="keyfacts">
          <div>
            <dt>담당기관</dt>
            <dd>{p.provider || p.owner || ORG_TYPE_LABEL[p.orgType]}</dd>
          </div>
          <div>
            <dt>지원형태</dt>
            <dd>{kind ?? "원문 확인"}</dd>
          </div>
          <div>
            <dt>신청기간</dt>
            <dd>{p.deadline ? firstLine(p.deadline, 40) : "원문 확인"}</dd>
          </div>
          <div>
            <dt>신청 창구</dt>
            <dd>{how.channels.map((c) => CHANNEL_LABEL[c]).join(", ")}</dd>
          </div>
        </dl>
        {(ev || (p.applyType && p.applyType !== "unknown")) && (
          <div className="d-judge">
            {ev && (
              <p>
                <TierBadge tier={ev.tier} /> — {TIER_PLAIN[ev.tier]} <span className="muted">(입력하신 정보 기준)</span>
              </p>
            )}
            {p.applyType && p.applyType !== "unknown" && (
              <p data-testid="apply-type">
                {p.applyType === "self"
                  ? "직접 신청해야 받을 수 있습니다."
                  : p.applyType === "auto"
                    ? "대상이 되면 따로 신청하지 않아도 자동으로 지급·연계되는 경우가 많습니다. 받고 있지 않다면 문의처나 주민센터에 확인해 보세요."
                    : "기관·학교·시설이 대상자를 추천하거나 선정하는 사업입니다. 해당될 것 같다면 문의처에 확인해 보세요."}
                {p.applyReason && <span className="muted small"> (근거: {p.applyReason})</span>}
              </p>
            )}
          </div>
        )}
      </header>

      <div className="layout" style={{ marginTop: "1.5rem" }}>
        <div>
          <nav className="dtabs no-print" aria-label="상세 내용 바로가기">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} aria-current={active === s.id ? "true" : undefined}>
                {s.label}
              </a>
            ))}
          </nav>

          <section className="dsec" id="sec-target" aria-labelledby="h-target">
            <h2 id="h-target">지원대상</h2>
            <h3 className="h3">내 상황과 비교한 결과</h3>
            {ev ? (
              <>
                <ul className="reasons" data-testid="reasons">
                  {[...ev.reasons].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).map((r, i) => (
                    <li key={i} className={r.kind}>
                      <span className="k">{REASON_LABEL[r.kind]}</span>
                      <span>{r.text}</span>
                    </li>
                  ))}
                </ul>
                <RuleNote p={p} />
              </>
            ) : (
              <p className="inset">
                <Link href="/check">12개 질문에 답하면</Link> 이 서비스의 대상 여부를 이유와 함께 알려 드립니다. 로그인은 필요 없습니다.
              </p>
            )}
            {(p.target || p.criteria) && (
              <dl className="summary" style={{ marginTop: "1.25rem" }}>
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
              </dl>
            )}
          </section>

          <section className="dsec" id="sec-benefit" aria-labelledby="h-benefit">
            <h2 id="h-benefit">지원내용</h2>
            <dl className="summary">
              {p.benefit && (
                <>
                  <dt>지원 내용</dt>
                  <dd>
                    <LongText text={p.benefit} />
                  </dd>
                </>
              )}
              {kind && (
                <>
                  <dt>지원 형태</dt>
                  <dd>{kind}</dd>
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
                  <dd>{[...new Set(p.tags.flatMap((x) => x.split("||")))].join(", ")}</dd>
                </>
              ) : null}
            </dl>
            {!p.benefit && <p className="muted">세부 지원 내용은 공식 원문에서 확인하세요.</p>}
            {ops.length > 0 && (
              <>
                <h3 className="h3" style={{ marginTop: "1.5rem" }}>
                  우리 지역 운영 정보
                </h3>
                <ul className="ops">
                  {ops.map((o, i) => (
                    <li key={i}>
                      <strong>{o.name}</strong>
                      {o.provider && <div>운영: {o.provider}</div>}
                      {o.description && <div className="muted">{o.description}</div>}
                      {o.contact && <div>문의: {o.contact}</div>}
                      {o.applyMethod && <div style={{ whiteSpace: "pre-line" }}>신청: {o.applyMethod.length > 200 ? o.applyMethod.slice(0, 199) + "…" : o.applyMethod}</div>}
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noopener noreferrer">
                          원문 (새 창)
                        </a>
                      )}
                      <div className="small muted">
                        {o.updatedAt ? `원문 기준일 ${o.updatedAt} · ` : ""}
                        {o.source ? SOURCE_LABEL[o.source] : SOURCE_LABEL.icare}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="dsec" id="sec-apply" aria-labelledby="h-howto">
            <h2 id="h-howto">신청방법</h2>
            <ol className="howto compact">
              <li>
                <span className="n" aria-hidden="true">1</span>
                <div>
                  <h3>신청처 확인</h3>
                  <p>{how.place}</p>
                </div>
              </li>
              <li>
                <span className="n" aria-hidden="true">2</span>
                <div>
                  <h3>서류 준비</h3>
                  <p>{how.bring.length ? how.bring.join(", ") : "신분증, 그 밖의 서류는 신청처에 확인"}</p>
                </div>
              </li>
              <li>
                <span className="n" aria-hidden="true">3</span>
                <div>
                  <h3>신청</h3>
                  <p>{how.channels.map((c) => CHANNEL_LABEL[c]).join(", ")}</p>
                </div>
              </li>
            </ol>
            <dl className="summary" style={{ marginTop: "1.25rem" }}>
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
            </dl>
            {!p.applyMethod && <p className="muted">{how.fallback}</p>}
          </section>

          <section className="dsec" id="sec-contact" aria-labelledby="h-src">
            <h2 id="h-src">문의·출처</h2>
            <ul className="ops" data-testid="sources">
              {p.sources.map((s, i) => (
                <li key={i}>
                  <strong>{SOURCE_LABEL[s.source]}</strong>
                  <div className="small">
                    원문 기준일: {s.updatedAt ?? "원문에 표기 없음"} · 수집일: {s.fetchedAt}
                  </div>
                  {s.url && (
                    <a className="small" href={s.url} target="_blank" rel="noopener noreferrer">
                      원문 링크 (새 창)
                    </a>
                  )}
                </li>
              ))}
            </ul>
            <p className="rule-note">
              신뢰도 {TRUST_LABEL[p.trust]}
              {review ? ` · ${review}` : ""}
              {p.mergedCount && p.mergedCount > 1 ? ` · ${p.mergedCount}개 원천에서 같은 사업으로 합침` : ""}
            </p>
          </section>
        </div>

        <aside className="side">
          <section className="side-box apply" aria-labelledby="h-apply">
            <h2 id="h-apply">
              <Icon name="fileText" size={18} /> 신청·문의
            </h2>
            <dl className="summary stacked">
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
              <div className="inset" data-testid="apply-fallback">
                <p>
                  <strong>신청처·연락처 정보가 아직 정리되지 않았습니다.</strong>
                </p>
                <p>
                  {p.scope === "national"
                    ? "주소지 읍면동 행정복지센터(주민센터) 또는 시군구청 담당 부서에 문의하세요."
                    : p.scope === "sigungu"
                      ? `${placeLabel.split(" ").pop()}청 담당 부서 또는 주소지 읍면동 행정복지센터에 문의하세요.`
                      : `${placeLabel} 시·도청 담당 부서, 주소지 시군구청 또는 읍면동 행정복지센터에 문의하세요.`}
                </p>
                <p>보건복지상담센터 129 · 정부민원안내 110</p>
              </div>
            )}
            <div className="side-actions">
              {p.applyUrl && (
                <a href={p.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                  온라인 신청·관련 누리집 <Icon name="externalLink" size={18} />
                </a>
              )}
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" data-testid="official-link">
                  공식 원문 보기 <Icon name="externalLink" size={18} />
                </a>
              ) : (
                <a href="https://www.bokjiro.go.kr" target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  복지로에서 &lsquo;{p.name}&rsquo; 검색 <Icon name="externalLink" size={18} />
                </a>
              )}
            </div>
            <p className="small muted" style={{ marginTop: "0.75rem" }}>
              <Icon name="phone" size={14} className="icon-inline" /> 잘 모르겠으면 보건복지상담센터 129
            </p>
            <div className="no-print side-actions">
              <button type="button" className="btn btn-quiet btn-sm" disabled title="로그인 후 사용할 수 있는 기능으로 준비 중입니다">
                신청 준비 체크리스트 (준비 중)
              </button>
              <button type="button" className="btn btn-quiet btn-sm" disabled title="로그인 후 사용할 수 있는 기능으로 준비 중입니다">
                마감·변경 알림 (준비 중)
              </button>
            </div>
          </section>
          <section className="side-box no-print">
            <h2>이 페이지로 할 수 있는 일</h2>
            <ul className="link-list">
              <li>
                <button type="button" className="link-btn" onClick={() => window.print()}>
                  <Icon name="printer" size={18} /> 인쇄하거나 PDF로 저장
                </button>
              </li>
              <li>
                <button type="button" className="link-btn" onClick={share}>
                  <Icon name="share" size={18} /> 이 서비스 공유
                </button>
                {copied && (
                  <span role="status" className="small muted">
                    {" "}
                    링크를 복사했어요
                  </span>
                )}
              </li>
            </ul>
          </section>
        </aside>
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
    <div className="rule-note">
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
      <button type="button" className="btn btn-text no-print" aria-expanded={open} onClick={() => setOpen((o) => !o)} style={{ display: "flex" }}>
        {open ? "접기" : "원문 더 보기"}
      </button>
    </>
  );
}
