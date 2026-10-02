"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ProgramCard } from "@/components/ProgramCard";
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

  const hits = useMemo(() => {
    if (!data || !q.trim()) return [];
    return data.programs.filter((p) => matchesQuery(p, q));
  }, [data, q]);

  const sidoObj = regions?.sidos.find((s) => s.code === sido);

  return (
    <div className="narrow page" style={{ width: "min(52rem, 100% - 2.25rem)" }}>
      <h1 className="h1">서비스 검색</h1>
      <p className="lead">이름이나 낱말로 복지 서비스를 찾습니다. 무엇을 받을 수 있는지 모르겠다면 <Link href="/check">맞춤 찾기</Link>가 더 빠릅니다.</p>
      <form
        role="search"
        className="search-box"
        onSubmit={(e) => {
          e.preventDefault();
          setLimit(PAGE);
          router.replace(`/search?q=${encodeURIComponent(input.trim())}`);
        }}
      >
        <label htmlFor="sq" className="sr-only">
          검색어
        </label>
        <input id="sq" type="search" className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="예: 기초연금, 에너지바우처, 산후조리" />
        <button type="submit" className="btn btn-primary">
          검색
        </button>
      </form>
      <div className="select-row" style={{ maxWidth: "34rem", marginTop: "1rem" }}>
        <select
          aria-label="시·도"
          className="select"
          value={sido ?? ""}
          onChange={(e) => setPick({ sido: e.target.value || null, sigungu: null })}
        >
          <option value="">전국 공통 사업만</option>
          {regions?.sidos.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="시·군·구"
          className="select"
          value={sigungu ?? ""}
          disabled={!sidoObj}
          onChange={(e) => setPick({ sido, sigungu: e.target.value || null })}
        >
          <option value="">{sidoObj ? "시도 사업까지" : "시·도를 먼저 고르세요"}</option>
          {sidoObj?.sigungus.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
      <p className="small muted" style={{ marginTop: "0.5rem" }}>
        검색 범위: 전국 공통{sido ? ` + ${sidoObj?.name ?? ""}` : ""}
        {sigungu ? ` + ${sidoObj?.sigungus.find((g) => g.code === sigungu)?.name ?? ""}` : ""} 사업
        {profile ? " · 입력하신 정보로 판정 결과도 함께 보여드려요" : ""}
      </p>

      <div style={{ marginTop: "2rem" }}>
        {!q.trim() ? (
          <p className="empty">찾고 싶은 서비스 이름이나 낱말을 입력하세요.</p>
        ) : !data ? (
          <p className="muted">검색 중…</p>
        ) : hits.length === 0 ? (
          <p className="empty">&lsquo;{q}&rsquo;에 맞는 서비스가 없습니다. 다른 낱말로 검색하거나 지역을 바꿔 보세요.</p>
        ) : (
          <>
            <h2 className="h3" aria-live="polite" style={{ paddingBottom: "0.75rem", borderBottom: "1px solid var(--line)" }}>
              &lsquo;{q}&rsquo; 검색 결과 {hits.length.toLocaleString("ko-KR")}개
            </h2>
            <div className="list">
              {hits.slice(0, limit).map((p) => (
                <ProgramCard key={p.id} p={p} ev={profile ? evaluateRule(p.rule, profile) : undefined} />
              ))}
            </div>
            {hits.length > limit && (
              <div className="more-row">
                <button type="button" className="btn btn-ghost" onClick={() => setLimit((l) => l + PAGE)}>
                  더 보기 ({hits.length - limit}개 남음)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
