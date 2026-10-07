"use client";
/**
 * 결과 (기본 화면): 답한 상황과 맞지 않는 혜택은 본문에서 빼고, '모름'으로 남은 조건은 맨 위 짧은 질문(최대 3개)으로 다시 거른다.
 * 답하면 바로 다시 계산 (기기 안에서만). 예전 결과 화면은 /results?v=1 (비교용).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { SupportTags } from "@/components/ProgramCard";
import { ApplyBadge, orgText } from "@/components/Badges";
import { loadForRegion, loadProgram, loadRegions, type Loaded } from "@/lib/client/bundles";
import { CHANNEL_LABEL, firstLine, howTo } from "@/lib/client/howto";
import { clearProfile, useExample, useExtras } from "@/lib/client/storage";
import { saveSituation, situationOf } from "@/lib/client/start";
import { PRESETS } from "@/lib/client/presets";
import { checkPath, coupleNote, resultsCopy, type FindMode } from "@/lib/client/mode";
import {
  BUCKET_LABEL, LOW_INCOME_PCT, answersFor, autoV2, buildView, classify, incomeExplain, inferredNoRecipient, plainLine, scoreV2, situationChips, topPicksV2,
  type Bucket, type DimId, type Situation, type V2Item,
} from "@/lib/client/v2";
import type { Program } from "@/lib/data/types";
import type { Profile } from "@/lib/engine/profile";

const FIRST = 10;
const MORE = 20;

export function ResultsV2({ profile, mode }: { profile: Profile; mode: FindMode }) {
  const extras = useExtras();
  const example = useExample();
  const router = useRouter();
  const [data, setData] = useState<Loaded | null>(null);
  const [skipped, setSkipped] = useState<DimId[]>([]);
  const [details, setDetails] = useState<Record<string, Program>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoLimit, setAutoLimit] = useState(FIRST);
  const [pilotSidos, setPilotSidos] = useState<string[] | null>(null);
  useEffect(() => {
    loadRegions().then((r) => setPilotSidos(r ? r.sidos.filter((x) => x.pilot).map((x) => x.code) : null));
  }, []);
  useEffect(() => {
    let alive = true;
    loadForRegion(profile.sido, profile.sigungu).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [profile.sido, profile.sigungu]);

  const sit: Situation = useMemo(() => situationOf(profile, extras ?? null, mode), [profile, extras, mode]);
  const scored = useMemo(() => (data ? scoreV2(data.programs, sit) : []), [data, sit]);
  const view = useMemo(() => buildView(scored, sit, 12), [scored, sit]);
  const picks = useMemo(() => topPicksV2(view, 5, sit), [view, sit]);
  const autos = useMemo(() => (data ? autoV2(data.programs, sit) : []), [data, sit]);

  // 먼저 확인할 5가지는 신청 방법(어디서·무엇을 가져가서)을 보여 주려고 상세 묶음을 따로 불러온다
  const pickIds = picks.map((g) => g[0].s.program.id).join("|");
  useEffect(() => {
    if (!pickIds) return;
    let alive = true;
    Promise.all(pickIds.split("|").map((id) => loadProgram(id))).then((ps) => {
      if (!alive) return;
      const out: Record<string, Program> = {};
      ps.forEach((p) => p && (out[p.id] = p));
      setDetails(out);
    });
    return () => {
      alive = false;
    };
  }, [pickIds]);

  if (!data || extras === undefined) {
    return (
      <div className="wrap page results-root" aria-busy="true" aria-live="polite">
        <p className="muted">내 지역 서비스를 불러와 이 기기에서 고르고 있어요…</p>
        <div className="skeleton" aria-hidden="true">
          <div className="sk" />
          <div className="sk" />
          <div className="sk" />
        </div>
      </div>
    );
  }

  const parent = mode === "parent";
  const copy = resultsCopy(mode);
  const preset = PRESETS.find((x) => x.id === example);
  const place = data.label.split(" ").pop();
  const questions = view.questions.filter((q) => !skipped.includes(q.dim.id)).slice(0, 3);
  const unlock = new Set(questions.flatMap((q) => q.keys)).size;
  const apply = (next: Situation) => saveSituation(next, mode);
  const editHref = checkPath(mode);
  const picked = new Set(picks);
  const couple = coupleNote(mode, profile);

  // 나이를 모르면 먼저 확인할 것이 크게 달라지므로 질문을 위에, 아니면 '먼저 확인할 것'을 맨 위에 (QA 1차 H5)
  const askFirst = questions.some((q) => q.dim.id === "age");
  const followUp = (
    <section className="v2-follow no-print" aria-labelledby="fq-h" data-testid="v2-followup">
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
                        <strong>{q.dim.q(mode, sit)}</strong> <span className="small muted">(이 답으로 {q.groups}개가 정해져요)</span>
                      </p>
                      {q.dim.help && <p className="small muted">{q.dim.help}</p>}
                      {q.dim.id === "income" ? (
                        <IncomeAsk sit={sit} onApply={apply} onSkip={() => setSkipped((s) => [...s, "income"])} />
                      ) : (
                        <div className="btn-row v2-answers">
                          {answersFor(q.dim, sit).map((a) => (
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
  );

  // 공유 (QA 1차 M3): 상황(나이·소득 등)은 주소에 싣지 않는다 — 받는 사람이 바로 열어 볼 수 있게
  // 먼저 확인할 혜택마다 공개 상세 주소(/p/…)를 붙이고, 자기 상황으로 다시 찾는 시작 주소를 덧붙인다
  const share = async () => {
    const origin = window.location.origin;
    const text = [
      `복지나침반에서 ${data.label} 기준${parent ? "으로 부모님께" : "으로"} 먼저 확인해 볼 혜택이에요.`,
      ...picks.map((g) => `· ${g[0].s.program.name} — ${origin}/p/${encodeURIComponent(g[0].s.program.id)}`),
      `내 상황으로 다시 찾기: ${origin}/situation${parent ? "?for=parent" : ""}`,
      "(나이·소득 등 입력한 정보는 들어 있지 않아요)",
    ].join("\n");
    try {
      if (navigator.share) await navigator.share({ title: "복지나침반 — 먼저 확인할 혜택", text });
      else {
        await navigator.clipboard.writeText(text);
        setToast("먼저 확인할 혜택과 상세 주소를 복사했어요 (입력값은 들어 있지 않아요)");
        setTimeout(() => setToast(null), 2500);
      }
    } catch {}
  };

  return (
    <div className="results-root v2" data-testid="v2-results">
      <div className="print-only wrap">
        <strong>복지나침반 결과 요약</strong> — 출력일 {new Date().toLocaleDateString("ko-KR")}
      </div>
      <section className="res-head" aria-labelledby="res-h">
        <div className="wrap">
          <ol className="crumbs no-print" aria-label="현재 위치">
            <li>
              <Link href="/">
                <Icon name="home" size={14} /> 홈
              </Link>
            </li>
            <li>
              <Link href={editHref}>{parent ? "부모님 상황" : "내 상황"}</Link>
            </li>
            <li>
              <span aria-current="page">결과</span>
            </li>
          </ol>
          {parent && (
            <p className="notice warm" data-testid="parent-results-banner" role="note">
              <Icon name="heart" size={18} />
              <span>
                <strong>부모님 복지 찾기</strong> — 부모님 상황을 기준으로 골랐어요.
              </span>
            </p>
          )}
          {couple && (
            <details className="notice couple-fold" data-testid="couple-note">
              <summary>
                <Icon name="info" size={18} /> <strong>부모님 두 분이 함께 사시면</strong> <span className="small muted">(눌러서 보기)</span>
              </summary>
              <p>{couple}</p>
            </details>
          )}
          {pilotSidos && profile.sido && !pilotSidos.includes(profile.sido) && (
            <p className="notice" data-testid="non-pilot-note" role="note">
              <Icon name="info" size={18} />
              <span>
                <strong>시범 지역(경기도) 밖이에요.</strong> 이 지역 사업은 조건을 사람이 아직 검수하지 않아 &lsquo;신청할 때 확인&rsquo;이 많을 수 있어요.
              </span>
            </p>
          )}
          {preset && (
            <p className="notice warm" data-testid="example-banner" role="note">
              <Icon name="info" size={18} />
              <span>
                <strong>예시 상황으로 보는 중입니다.</strong> {preset.title}({preset.desc})인 경우로 계산했어요. 실제 개인 정보가 아니에요.{" "}
                <Link href={`${editHref}&new=1`}>{copy.reenterLabel}</Link>
              </span>
            </p>
          )}
          <h1 className="h1" id="res-h">
            {place} {parent ? "부모님께 맞는 혜택" : "나에게 맞는 혜택"}
          </h1>
          <p className="situation" data-testid="v2-chips">
            <span>
              <Icon name="mapPin" size={16} className="icon-inline" /> {[data.label, ...situationChips(sit)].join(" · ")}
            </span>
            <Link href={editHref} className="no-print" data-testid="edit-situation">
              상황 고치기
            </Link>
          </p>
          {/* 큰 숫자 타일 대신 한 줄 개수 (QA 1차 H5: 모바일 첫 화면에 할 일이 보이게) */}
          <ul className="v2-counts" aria-label="분류별 개수">
            <Count href="#v2-fit" cls="t-eligible" label="받으실 수 있어요" n={view.fit.length} testId="v2-n-fit" />
            <Count href="#v2-office" cls="t-likely" label="신청할 때 확인" n={view.office.length} testId="v2-n-office" />
            <Count href="#v2-ask" cls="t-check" label="답하면 정해져요" n={view.ask.length} testId="v2-n-ask" />
            <Count href="#v2-no" cls="t-none" label="맞지 않아 뺀 것" n={view.no.length} testId="v2-n-no" />
          </ul>
        </div>
      </section>

      <div className="wrap page">
        <div className="v2-main">
          {askFirst && followUp}

          {picks.length > 0 && (
            <section aria-labelledby="picks-h" data-testid="top-picks" className="v2-sec">
              <h2 className="h2" id="picks-h">
                {copy.picksTitle(picks.length)}
              </h2>
              <p className="body">{parent ? "부모님 상황에 가장 관련 깊은 순서예요. '받으실 수 있어요'를 먼저 넣었어요." : "내 상황에 가장 관련 깊은 순서예요. '받으실 수 있어요'를 먼저 넣었어요."}</p>
              <ol className="picks">
                {picks.map((g, i) => (
                  <Pick key={g[0].s.program.id} item={g[0]} i={i} detail={details[g[0].s.program.id]} sit={sit} mode={mode} />
                ))}
              </ol>
            </section>
          )}

          {!askFirst && followUp}

          <BucketList id="v2-fit" bucket="fit" title={picks.some((g) => g[0].bucket === "fit") ? `그 밖에 받으실 수 있는 혜택` : "받으실 수 있는 혜택"} lead="답하신 상황으로 공개된 지원 조건이 모두 맞아요." groups={view.fit.filter((g) => !picked.has(g))} sit={sit} mode={mode} />
          <BucketList
            id="v2-office"
            bucket="office"
            title="신청할 때 확인이 필요한 혜택"
            lead="답하신 상황과 어긋나는 조건은 없어요. 원문에 있는 세부 조건 한두 가지는 신청할 때 확인해요."
            groups={view.office.filter((g) => !picked.has(g))}
            sit={sit}
            mode={mode}
          />
          <BucketList
            id="v2-ask"
            bucket="ask"
            title="질문에 답하면 정해지는 혜택"
            lead="맨 위 질문에 답하시면 '받으실 수 있어요' 또는 '맞지 않아요'로 옮겨요."
            groups={view.ask.filter((g) => !picked.has(g))}
            sit={sit}
            mode={mode}
            collapsed
          />
          <BucketList
            id="v2-no"
            bucket="no"
            title="답하신 상황과 맞지 않아 뺀 혜택"
            lead="나이·가구·소득·수급 등 답하신 내용과 지원 조건이 달라요. 상황이 바뀌면 '상황 고치기'로 다시 보세요."
            groups={view.no}
            sit={sit}
            mode={mode}
            collapsed
          />

          {autos.length > 0 && (
            <details className="details auto-panel" data-testid="auto-section" open={autoOpen} onToggle={(e) => setAutoOpen((e.currentTarget as HTMLDetailsElement).open)}>
              <summary data-testid="auto-toggle">
                <span>
                  신청하지 않아도 받는 혜택 <span className="s">— 조건이 맞으면 기관이 알아서 제공해요</span>
                </span>
                <span className="c">
                  <span data-testid="auto-count">{autos.length.toLocaleString("ko-KR")}</span>개 <Icon name="chevronDown" size={18} />
                </span>
              </summary>
              {autoOpen && (
                <div className="details-body">
                  <p className="body">
                    대상이 되면 기관이 알아서 지급·연계하거나(공단 명단 통보, 수급자 선정 시 연계, 담당 공무원 직권 처리), 학교·시설·기관이 추천·선정하는 혜택이에요.
                    해당될 것 같은데 받고 있지 않다면 주민센터나 129에 물어보세요.
                  </p>
                  <div className="v2-list">
                    {autos.slice(0, autoLimit).map((g) => (
                      <V2Card key={g.key} item={classify(g.lead, sit)} more={g.variants.length} sit={sit} mode={mode} />
                    ))}
                  </div>
                  {autos.length > autoLimit && (
                    <div className="more-row no-print">
                      <button type="button" className="btn btn-ghost" onClick={() => setAutoLimit((l) => l + MORE)} data-testid="auto-more">
                        더 보기 ({(autos.length - autoLimit).toLocaleString("ko-KR")}개 남음)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </details>
          )}

          {copy.proxyNote && (
            <p className="notice" data-testid="proxy-apply-note" role="note" style={{ marginTop: "1.5rem" }}>
              <Icon name="info" size={18} />
              <span>
                <strong>가족이 대신 신청할 때</strong> — {copy.proxyNote}
              </span>
            </p>
          )}

          <div className="v2-actions no-print" role="group" aria-label="이 결과로 할 수 있는 일">
            <button type="button" className="link-btn" onClick={() => window.print()}>
              <Icon name="printer" size={18} /> 인쇄하거나 PDF로 저장
            </button>
            <button type="button" className="link-btn" onClick={share} data-testid="share">
              <Icon name="share" size={18} /> 가족에게 보내기 (입력값 제외)
            </button>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                clearProfile();
                router.push("/");
              }}
              data-testid="clear"
            >
              <Icon name="trash" size={18} /> 이 기기에서 지우기
            </button>
            <span className="small muted">
              <Icon name="phone" size={16} /> 상담: 보건복지상담센터 <strong>129</strong> (평일 9~18시)
            </span>
          </div>

          <p className="small muted v2-foot">
            기준: 2026년 기준 중위소득·기초연금 선정기준액(보건복지부). 숫자 기준이 없는 &lsquo;저소득&rsquo;은 기준 중위소득 {LOW_INCOME_PCT}% 이하로 봤어요. 실제 선정은 재산을
            포함한 소득인정액으로 신청처에서 정해요. <Link href="/about#v2">판단 기준 자세히 보기</Link>
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

function Count({ href, cls, label, n, testId }: { href: string; cls: string; label: string; n: number; testId: string }) {
  return (
    <li>
      <a href={href} className={`v2-count ${cls}`} data-testid={testId}>
        <span className="l">{label}</span> <span className="n">{n.toLocaleString("ko-KR")}</span>
      </a>
    </li>
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

/** 먼저 확인할 카드: 번호 · 지원형태 · 이름 · 판단(쉬운 말) · 신청방법/기관/문의/가져갈 것 */
function Pick({ item, i, detail, sit, mode }: { item: V2Item; i: number; detail?: Program; sit: Situation; mode: FindMode }) {
  const p = item.s.program;
  const how = howTo(detail, p);
  const href = `/p/${encodeURIComponent(p.id)}`;
  return (
    <li className="card pick" data-testid="pick" data-bucket={item.bucket}>
      <div className="pick-top">
        <span className="pick-no" aria-hidden="true">
          {i + 1}
        </span>
        <span className={`v2-badge b-${item.bucket}`}>{BUCKET_LABEL[item.bucket]}</span>
        <SupportTags p={detail ?? p} />
      </div>
      <h3>
        <Link href={href}>{p.name}</Link>
      </h3>
      <p className="sum">{firstLine(p.summary, 90)}</p>
      <p className={`v2-why w-${item.bucket}`}>
        <Icon name={BUCKET_ICON[item.bucket]} size={16} /> <span>{plainLine(item, sit, mode)}</span>
      </p>
      <ul className="rows">
        <li>
          <span className="k">신청방법</span>
          <span className="v">
            {how.place}
            {how.channels.length > 0 && ` (${how.channels.map((c) => CHANNEL_LABEL[c]).join(", ")})`}
          </span>
        </li>
        <li>
          <span className="k">담당기관</span>
          <span className="v">{p.provider || p.owner || orgText(p)}</span>
        </li>
        {how.phone && (
          <li>
            <span className="k">문의</span>
            <span className="v">{how.phone}</span>
          </li>
        )}
        {how.bring.length > 0 && (
          <li>
            <span className="k">가져갈 것</span>
            <span className="v">{how.bring.join(", ")}</span>
          </li>
        )}
      </ul>
      <div className="pick-foot no-print">
        <Link href={href} className="btn btn-tonal btn-sm">
          자세히 보기
        </Link>
        <Link href={`${href}#sec-apply`} className="btn btn-ghost btn-sm">
          신청 방법 보기
        </Link>
      </div>
    </li>
  );
}

function BucketList({
  id, title, lead, groups, sit, mode, collapsed,
}: {
  id: string; bucket: Bucket; title: string; lead: string; groups: V2Item[][]; sit: Situation; mode: FindMode; collapsed?: boolean;
}) {
  const [limit, setLimit] = useState(FIRST);
  if (!groups.length) return null;
  const head = `${title} ${groups.length.toLocaleString("ko-KR")}개`;
  const body = (
    <>
      <p className="body">{lead}</p>
      <div className="v2-list">
        {groups.slice(0, limit).map((g) => (
          <V2Card key={g[0].s.program.id} item={g[0]} more={g.length - 1} sit={sit} mode={mode} />
        ))}
      </div>
      {groups.length > limit && (
        <button type="button" className="btn btn-ghost no-print" onClick={() => setLimit((l) => l + MORE)} style={{ marginTop: "1rem" }} data-testid={`${id}-more`}>
          {Math.min(MORE, groups.length - limit)}개 더 보기 ({limit}/{groups.length})
        </button>
      )}
    </>
  );
  if (collapsed) {
    return (
      <details className="details v2-sec" id={id} data-testid={id}>
        <summary>
          <span className="h3">{head}</span> <Icon name="chevronDown" size={18} />
        </summary>
        <div className="details-body">{body}</div>
      </details>
    );
  }
  return (
    <section className="v2-sec" id={id} aria-labelledby={`${id}-h`} data-testid={id}>
      <h2 className="h2" id={`${id}-h`}>
        {head}
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
