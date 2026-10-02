"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ProgramCard } from "@/components/ProgramCard";
import { Icon } from "@/components/Icon";
import { EMPTY_SELECTION, HOUSEHOLD, LIFE, TOPICS, matchesSelection, parseSelection, selectionQuery, selectionSize, type FacetSelection } from "@/lib/client/facets";
import { loadForRegion, loadRegions, type Loaded } from "@/lib/client/bundles";
import { useProfile } from "@/lib/client/storage";
import { matchesQuery } from "@/lib/client/results";
import { evaluateRule } from "@/lib/engine/evaluate";
import type { RegionIndex } from "@/lib/data/types";

const PAGE = 30;

export function Search() {
  const params = useSearchParams();
  const router = useRouter();
  const profile = useProfile();
  const q = params.get("q") ?? "";
  const [input, setInput] = useState(q);
  const [regions, setRegions] = useState<RegionIndex | null>(null);
  const [pick, setPick] = useState<{ sido: string | null; sigungu: string | null } | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const sido = pick ? pick.sido : (profile?.sido ?? null);
  const sigungu = pick ? pick.sigungu : (profile?.sigungu ?? null);

  useEffect(() => {
    loadRegions().then(setRegions);
  }, []);
  useEffect(() => {
    let alive = true;
    loadForRegion(sido, sigungu).then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, [sido, sigungu]);

  const sel = useMemo(() => parseSelection(new URLSearchParams(params.toString())), [params]);
  const active = !!q.trim() || selectionSize(sel) > 0;
  const apply = (nq: string, ns: FacetSelection) => {
    setLimit(PAGE);
    router.replace(`/search${selectionQuery(nq, ns)}`, { scroll: false });
  };
  const toggle = (group: keyof FacetSelection, id: string) => {
    const cur = sel[group];
    apply(q, { ...sel, [group]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const hits = useMemo(() => {
    if (!data || !active) return [];
    return data.programs.filter((p) => (!q.trim() || matchesQuery(p, q)) && matchesSelection(p, sel));
  }, [data, q, sel, active]);

  const sidoObj = regions?.sidos.find((s) => s.code === sido);
  const chosen = [
    ...LIFE.filter((f) => sel.life.includes(f.id)).map((f) => ({ group: "life" as const, id: f.id, label: f.label })),
    ...HOUSEHOLD.filter((f) => sel.house.includes(f.id)).map((f) => ({ group: "house" as const, id: f.id, label: f.label })),
    ...sel.topic.map((c) => ({ group: "topic" as const, id: c, label: c })),
  ];
  const scope = `전국 공통${sido ? ` + ${sidoObj?.name ?? ""}` : ""}${sigungu ? ` + ${sidoObj?.sigungus.find((g) => g.code === sigungu)?.name ?? ""}` : ""}`;

  return (
    <div className="wrap page">
      <ol className="crumbs" aria-label="현재 위치">
        <li>
          <Link href="/">
            <Icon name="home" size={14} /> 홈
          </Link>
        </li>
        <li>
          <span aria-current="page">서비스 찾기</span>
        </li>
      </ol>
      <h1 className="h1">서비스 찾기</h1>
      <p className="lead" style={{ marginBottom: "1.5rem" }}>
        대상과 주제를 고르거나 이름으로 찾습니다. 받을 수 있는지까지 알고 싶다면 <Link href="/check">맞춤 찾기</Link>가 더 빠릅니다.
      </p>

      <form
        role="search"
        aria-label="복지 서비스 찾기"
        className="fbox"
        onSubmit={(e) => {
          e.preventDefault();
          apply(input, sel);
        }}
      >
        <div className="fgrid">
          <fieldset>
            <legend>생애주기</legend>
            <div className="fchecks">
              {LIFE.map((f) => (
                <label key={f.id}>
                  <input type="checkbox" checked={sel.life.includes(f.id)} onChange={() => toggle("life", f.id)} />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>가구상황</legend>
            <div className="fchecks">
              {HOUSEHOLD.map((f) => (
                <label key={f.id}>
                  <input type="checkbox" checked={sel.house.includes(f.id)} onChange={() => toggle("house", f.id)} />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>관심주제</legend>
            <div className="fchecks">
              {TOPICS.map((c) => (
                <label key={c}>
                  <input type="checkbox" checked={sel.topic.includes(c)} onChange={() => toggle("topic", c)} />
                  {c}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="fbar">
          <div className="grow">
            <label htmlFor="sq" className="label">
              검색어
            </label>
            <input id="sq" type="search" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="예: 기초연금, 에너지바우처, 산후조리" />
          </div>
          <div className="sel">
            <label htmlFor="s-sido" className="label">
              시·도
            </label>
            <select id="s-sido" className="select" value={sido ?? ""} onChange={(e) => setPick({ sido: e.target.value || null, sigungu: null })}>
              <option value="">전국 공통만</option>
              {regions?.sidos.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sel">
            <label htmlFor="s-sigungu" className="label">
              시·군·구
            </label>
            <select id="s-sigungu" className="select" value={sigungu ?? ""} disabled={!sidoObj} onChange={(e) => setPick({ sido, sigungu: e.target.value || null })}>
              <option value="">{sidoObj ? "시도 사업까지" : "시·도 먼저"}</option>
              {sidoObj?.sigungus.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setInput("");
              apply("", EMPTY_SELECTION);
            }}
          >
            초기화
          </button>
          <button type="submit" className="btn btn-primary">
            <Icon name="search" size={18} /> 검색
          </button>
        </div>
        {chosen.length > 0 && (
          <div className="chosen">
            <span>선택한 조건</span>
            {chosen.map((c) => (
              <button key={`${c.group}-${c.id}`} type="button" className="chip-x" onClick={() => toggle(c.group, c.id)} aria-label={`${c.label} 조건 빼기`}>
                {c.label} <Icon name="x" size={14} />
              </button>
            ))}
          </div>
        )}
      </form>
      <p className="small muted" style={{ marginTop: "0.625rem" }}>
        검색 범위: {scope} 사업 · 같은 묶음 안에서는 하나라도 해당하면, 묶음끼리는 모두 해당하는 서비스를 보여 줍니다
        {profile ? " · 입력하신 정보로 판정 결과도 함께 표시" : ""}
      </p>

      {!active ? (
        <p className="empty" style={{ marginTop: "2rem" }}>
          대상·주제를 고르거나 검색어를 입력하세요.
        </p>
      ) : !data ? (
        <p className="muted" style={{ marginTop: "2rem" }}>
          검색 중…
        </p>
      ) : (
        <>
          <div className="search-count" aria-live="polite">
            <h2>
              {q.trim() ? <>&lsquo;{q}&rsquo; </> : null}검색 결과 <b>{hits.length.toLocaleString("ko-KR")}</b>개
            </h2>
            <span className="small muted">{scope}</span>
          </div>
          {hits.length === 0 ? (
            <p className="empty">조건에 맞는 서비스가 없습니다. 조건을 줄이거나 다른 낱말로 찾아 보세요.</p>
          ) : (
            <div className="list">
              {hits.slice(0, limit).map((p) => (
                <ProgramCard key={p.id} p={p} ev={profile ? evaluateRule(p.rule, profile) : undefined} />
              ))}
            </div>
          )}
          {hits.length > limit && (
            <div className="more-row">
              <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
                더 보기 ({(hits.length - limit).toLocaleString("ko-KR")}개 남음) <Icon name="chevronDown" size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
