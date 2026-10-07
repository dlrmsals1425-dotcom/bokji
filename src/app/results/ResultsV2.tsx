"use client";
/**
 * v2 시험판 결과 (/results?v=2): 답한 상황과 맞지 않는 혜택은 본문에서 빼고,
 * '모름'으로 남은 조건은 맨 위 짧은 질문(예/아니오/모름)으로 다시 거른다. 답하면 바로 다시 계산 (기기 안에서만).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { SupportTags } from "@/components/ProgramCard";
import { ApplyBadge, orgText } from "@/components/Badges";
import { loadForRegion, type Loaded } from "@/lib/client/bundles";
import { saveExtras, saveProfile, useExtras } from "@/lib/client/storage";
import {
  EMPTY_EXTRAS, LOW_INCOME_PCT, buildView, incomeExplain, inferredNoRecipient, plainLine, profileForStorage, scoreV2, situationChips,
  type Bucket, type DimId, type Situation, type V2Item,
} from "@/lib/client/v2";
import type { FindMode } from "@/lib/client/mode";
import type { Profile } from "@/lib/engine/profile";

const FIRST = 10;
const MORE = 20;

export function ResultsV2({ profile, mode }: { profile: Profile; mode: FindMode }) {
  const extras = useExtras();
  const [data, setData] = useState<Loaded | null>(null);
  const [skipped, setSkipped] = useState<DimId[]>([]);
  useEffect(() => {
    let alive = true;
    loadForRegion(profile.sido, profile.sigungu).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [profile.sido, profile.sigungu]);

  const sit: Situation = useMemo(() => ({ profile, x: extras ?? EMPTY_EXTRAS }), [profile, extras]);
  const scored = useMemo(() => (data ? scoreV2(data.programs, sit) : []), [data, sit]);
  const view = useMemo(() => buildView(scored, sit, 12), [scored, sit]);

  if (!data || extras === undefined) {
    return (
      <div className="wrap page results-root" aria-busy="true">
        <p className="muted">내 지역 서비스를 불러와 이 기기에서 고르고 있어요…</p>
      </div>
    );
  }

  const parent = mode === "parent";
  const place = data.label.split(" ").pop();
  const questions = view.questions.filter((q) => !skipped.includes(q.dim.id)).slice(0, 3);
  const unlock = new Set(questions.flatMap((q) => q.keys)).size;
  const apply = (next: Situation) => {
    saveProfile(profileForStorage(next), undefined, mode);
    saveExtras(next.x);
  };
  const editHref = parent ? "/situation?for=parent" : "/situation";

  return (
    <div className="results-root v2" data-testid="v2-results">
      <section className="res-head" aria-labelledby="res-h">
        <div className="wrap">
          <ol className="crumbs no-print" aria-label="현재 위치">
            <li>
              <Link href="/">
                <Icon name="home" size={14} /> 홈
              </Link>
            </li>
            <li>
              <Link href={editHref}>내 상황</Link>
            </li>
            <li>
              <span aria-current="page">결과 (시험판)</span>
            </li>
          </ol>
          <p className="v2-flag">시험판 · 상황 먼저 묻는 방식</p>
          <h1 className="h1" id="res-h">
            {place} {parent ? "부모님께 맞는 혜택" : "나에게 맞는 혜택"}
          </h1>
          <p className="situation" data-testid="v2-chips">
            <span>
              <Icon name="mapPin" size={16} className="icon-inline" /> {[data.label, ...situationChips(sit)].join(" · ")}
            </span>
            <Link href={editHref} className="no-print">
              상황 고치기
            </Link>
          </p>
          <div className="tiles v2-tiles" aria-label="분류별 개수">
            <Tile href="#v2-fit" cls="t-eligible" label="받으실 수 있어요" n={view.fit.length} d="답하신 상황으로 조건이 맞아요" testId="v2-n-fit" />
            <Tile href="#v2-office" cls="t-likely" label="신청할 때 확인" n={view.office.length} d="원문의 세부 조건을 확인해요" testId="v2-n-office" />
            <Tile href="#v2-ask" cls="t-check" label="답하면 정해져요" n={view.ask.length} d="위 질문에 답하면 바로 갈려요" testId="v2-n-ask" />
            <Tile href="#v2-no" cls="t-none" label="맞지 않아 뺐어요" n={view.no.length} d="답하신 상황과 달라요" testId="v2-n-no" />
          </div>
        </div>
      </section>

      <div className="wrap page">
        <div className="v2-main">
          <section className="v2-follow" aria-labelledby="fq-h" data-testid="v2-followup">
            {questions.length > 0 ? (
              <>
                <h2 className="h2" id="fq-h">
                  이것만 알려주시면 {unlock.toLocaleString("ko-KR")}개를 더 정확히 알려드려요
                </h2>
                <p className="small muted">모르시면 &lsquo;모름&rsquo;을 누르세요. 답하면 아래 목록이 바로 바뀌어요.</p>
                <ol className="v2-qs">
                  {questions.map((q) => (
                    <li key={q.dim.id} className="v2-q" data-testid={`v2-q-${q.dim.id}`}>
                      <p className="v2-q-t">
                        <strong>{q.dim.q(mode)}</strong> <span className="small muted">(이 답으로 {q.groups}개가 정해져요)</span>
                      </p>
                      {q.dim.help && <p className="small muted">{q.dim.help}</p>}
                      {q.dim.id === "income" ? (
                        <IncomeAsk sit={sit} onApply={apply} onSkip={() => setSkipped((s) => [...s, "income"])} />
                      ) : (
                        <div className="btn-row v2-answers">
                          {q.dim.answers.map((a) => (
                            <button key={a.key} type="button" className="btn btn-ghost btn-sm" onClick={() => apply(a.apply(sit))} data-testid={`v2-a-${q.dim.id}-${a.key}`}>
                              {a.label}
                            </button>
                          ))}
                          <button type="button" className="btn btn-quiet" onClick={() => setSkipped((s) => [...s, q.dim.id])} data-testid={`v2-skip-${q.dim.id}`}>
                            모름
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="notice" id="fq-h">
                <Icon name="check" size={18} />
                <span>더 여쭤볼 것이 없어요. 아래 목록이 지금 답하신 상황 기준이에요.</span>
              </p>
            )}
            {inferredNoRecipient(sit) && (
              <p className="small muted" style={{ marginTop: "0.75rem" }} data-testid="v2-inferred">
                소득이 기준 중위소득 {LOW_INCOME_PCT}%를 넘어서 기초생활수급(생계·의료·주거·교육급여)·차상위는 아닌 것으로 보고 골랐어요.
              </p>
            )}
          </section>

          <BucketList id="v2-fit" bucket="fit" title={`받으실 수 있는 혜택 ${view.fit.length}개`} lead="답하신 상황으로 공개된 지원 조건이 모두 맞아요." groups={view.fit} sit={sit} mode={mode} />
          <BucketList
            id="v2-office"
            bucket="office"
            title={`신청할 때 확인이 필요한 혜택 ${view.office.length}개`}
            lead="답하신 상황과 어긋나는 조건은 없어요. 원문에 있는 세부 조건 한두 가지는 신청할 때 확인해요."
            groups={view.office}
            sit={sit}
            mode={mode}
          />
          <BucketList
            id="v2-ask"
            bucket="ask"
            title={`질문에 답하면 정해지는 혜택 ${view.ask.length}개`}
            lead="맨 위 질문에 답하시면 '받으실 수 있어요' 또는 '맞지 않아요'로 옮겨요."
            groups={view.ask}
            sit={sit}
            mode={mode}
            collapsed
          />
          <BucketList
            id="v2-no"
            bucket="no"
            title={`답하신 상황과 맞지 않아 뺀 혜택 ${view.no.length}개`}
            lead="나이·가구·소득·수급 등 답하신 내용과 지원 조건이 달라요. 상황이 바뀌면 '상황 고치기'로 다시 보세요."
            groups={view.no}
            sit={sit}
            mode={mode}
            collapsed
          />
          <p className="small muted v2-foot">
            기준: 2026년 기준 중위소득·기초연금 선정기준액(보건복지부). 숫자 기준이 없는 &lsquo;저소득&rsquo;은 기준 중위소득 {LOW_INCOME_PCT}% 이하로 봤어요. 실제 선정은
            재산을 포함한 소득인정액으로 신청처에서 정해요. <Link href={parent ? "/results?for=parent" : "/results"}>기존 결과 화면 보기</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Tile({ href, cls, label, n, d, testId }: { href: string; cls: string; label: string; n: number; d: string; testId: string }) {
  return (
    <a href={href} className={`tile ${cls}`} data-testid={testId}>
      <span className="l">{label}</span>
      <span className="n">{n.toLocaleString("ko-KR")}</span>
      <span className="d">{d}</span>
    </a>
  );
}

function IncomeAsk({ sit, onApply, onSkip }: { sit: Situation; onApply: (s: Situation) => void; onSkip: () => void }) {
  const [t, setT] = useState("");
  const size = sit.profile.householdSize === "unknown" ? null : sit.profile.householdSize;
  const n = t ? Number(t) : null;
  const ex = n !== null && size ? incomeExplain(n, size) : null;
  return (
    <div>
      <div className="btn-row v2-answers">
        <label htmlFor="fq-income" className="sr-only">
          한 달 소득 (만원)
        </label>
        <input
          id="fq-income"
          className="input v2-income-in"
          inputMode="numeric"
          placeholder="예: 300"
          value={t}
          onChange={(e) => setT(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
          data-testid="v2-a-income-input"
        />
        <span>만원 / 월</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={n === null} onClick={() => n !== null && onApply({ ...sit, x: { ...sit.x, incomeManwon: n } })} data-testid="v2-a-income-ok">
          확인
        </button>
        <button type="button" className="btn btn-quiet" onClick={onSkip} data-testid="v2-skip-income">
          모름
        </button>
      </div>
      {ex && (
        <p className="small" aria-live="polite">
          {ex.line}
        </p>
      )}
    </div>
  );
}

const BUCKET_ICON: Record<Bucket, "check" | "info" | "alert" | "x"> = { fit: "check", office: "info", ask: "alert", no: "x" };

function BucketList({
  id, title, lead, groups, sit, mode, collapsed,
}: {
  id: string; bucket: Bucket; title: string; lead: string; groups: V2Item[][]; sit: Situation; mode: FindMode; collapsed?: boolean;
}) {
  const [limit, setLimit] = useState(FIRST);
  if (!groups.length) return null;
  const body = (
    <>
      <p className="body">{lead}</p>
      <div className="v2-list">
        {groups.slice(0, limit).map((g) => (
          <V2Card key={g[0].s.program.id} item={g[0]} more={g.length - 1} sit={sit} mode={mode} />
        ))}
      </div>
      {groups.length > limit && (
        <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + MORE)} style={{ marginTop: "1rem" }}>
          {Math.min(MORE, groups.length - limit)}개 더 보기 ({limit}/{groups.length})
        </button>
      )}
    </>
  );
  if (collapsed) {
    return (
      <details className="details v2-sec" id={id} data-testid={id}>
        <summary>
          <span className="h3">{title}</span> <Icon name="chevronDown" size={18} />
        </summary>
        <div className="details-body">{body}</div>
      </details>
    );
  }
  return (
    <section className="v2-sec" id={id} aria-labelledby={`${id}-h`} data-testid={id}>
      <h2 className="h2" id={`${id}-h`}>
        {title}
      </h2>
      {body}
    </section>
  );
}

function V2Card({ item, more, sit, mode }: { item: V2Item; more: number; sit: Situation; mode: FindMode }) {
  const p = item.s.program;
  const where = p.provider || p.owner;
  return (
    <article className={`prow v2-card b-${item.bucket}`} data-testid="v2-card" data-bucket={item.bucket}>
      <div className="top">
        <h3>
          <Link href={`/p/${encodeURIComponent(p.id)}`}>{p.name}</Link>
        </h3>
        <SupportTags p={p} />
      </div>
      <p className={`v2-why w-${item.bucket}`}>
        <Icon name={BUCKET_ICON[item.bucket]} size={16} /> <span>{plainLine(item, sit, mode)}</span>
      </p>
      <p className="meta">
        <span>{orgText(p)}</span>
        {where && <span>{where.length > 30 ? where.slice(0, 29) + "…" : where}</span>}
        <ApplyBadge p={p} />
        {!item.reviewed && <span title="원문에서 자동으로 정리한 조건이에요">자동 정리 조건</span>}
        {more > 0 && <span>다른 기관 같은 사업 {more}개</span>}
      </p>
    </article>
  );
}
