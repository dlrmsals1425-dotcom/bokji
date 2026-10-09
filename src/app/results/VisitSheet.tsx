"use client";
/**
 * 방문처별 준비물 한 장 (인쇄·이미지 저장·보내기). 이 기기에서만 만들고, 지역 이름만 넣는다 (나이·소득 등 입력값 없음).
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { buildVisitSheet, SHEET_STATUS, type SheetEntry, type SheetPlace } from "@/lib/client/visit";
import { renderSheetPng } from "@/lib/client/sheetImage";

const FILE = "복지나침반-방문처별-준비물.png";
/** 인쇄할 때 이 곳 수 이상이면 2단 (QA 7차 V3: A4 한 장에 맞춤) */
const PRINT_TWO_COLS = 4;
/** 문의 문구에서 전화번호만 ('한부모상담전화 1577-4206' → '15774206'). 번호가 없으면 null */
function telOf(text: string): string | null {
  const m = text.match(/(?<!\d)(0\d{1,2}-?\d{3,4}-?\d{4}|1[5-9]\d{2}-?\d{4}|1\d{2})(?!\d)/);
  return m ? m[1].replace(/-/g, "") : null;
}

function SheetBody({ places, region, date, forPrint }: { places: SheetPlace[]; region: string; date: string; forPrint?: boolean }) {
  return (
    <>
      <div className="vs-head">
        {forPrint ? <p className="vs-title">방문처별 준비물 한 장</p> : (
          <h2 className="h2" id="vs-h">
            방문처별 준비물 한 장
          </h2>
        )}
        <p className="vs-meta">
          복지나침반 · {region} 기준 · {date}
        </p>
      </div>
      <ol className="vs-places">
        {places.map((pl, i) => (
          <li key={pl.key} className="vs-place" data-testid={forPrint ? undefined : "vs-place"}>
            {forPrint ? <p className="vs-ptitle">{`${i + 1}. ${pl.label}`}</p> : <h3 className="vs-ptitle">{`${i + 1}. ${pl.label}`}</h3>}
            <p className="vs-k">여기서 신청할 것</p>
            <ul className="vs-progs">
              {pl.programs.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  <span className="vs-sub">{[SHEET_STATUS[p.bucket], ...p.also].join(" · ")}</span>
                </li>
              ))}
            </ul>
            {pl.key !== "none" && (
              <>
                <p className="vs-k">{pl.key === "online" ? "준비할 서류" : "가져갈 것"}</p>
                {pl.bring.length > 0 && (
                  <ul className="vs-check" data-testid={forPrint ? undefined : "vs-bring"}>
                    {pl.bring.map((b) => (
                      <li key={b.item}>
                        <span className="vs-box" aria-hidden="true" />
                        <span>
                          {b.item}
                          {pl.programs.length > 1 && <span className="vs-for"> ({b.for.length === pl.programs.length ? "모두" : b.for.join(", ")})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {pl.cond.length > 0 && <p className="vs-note">해당하는 분만: {pl.cond.map((c) => `${c.item}${pl.programs.length > 1 ? ` (${c.for.join(", ")})` : ""}`).join(", ")}</p>}
                {pl.forms.length > 0 && (
                  <p className="vs-note">신청서 서식(원문 첨부, 창구에도 있어요): {pl.forms.map((c) => `${c.item}${pl.programs.length > 1 ? ` (${c.for.join(", ")})` : ""}`).join(", ")}</p>
                )}
                {pl.proxy.length > 0 && <p className="vs-note">가족이 대신 신청할 때: {pl.proxy.join(", ")}</p>}
                {pl.programs.some((p) => p.docs === "missing") && (
                  <p className="vs-note" data-testid={forPrint ? undefined : "vs-ask"}>
                    가기 전에 전화로 물어볼 것 — 구비서류가 원문에 없어요: {pl.programs.filter((p) => p.docs === "missing").map((p) => p.name).join(", ")}
                  </p>
                )}
                {(pl.trimmed > 0 || pl.programs.some((p) => p.more > 0)) && (
                  <p className="vs-note">서류가 더 있어요 — 상세 페이지·창구에서 확인{pl.programs.some((p) => p.more > 0) ? `: ${pl.programs.filter((p) => p.more > 0).map((p) => p.name).join(", ")}` : ""}</p>
                )}
                {pl.programs.some((p) => p.docs === "none") && pl.key !== "online" && (
                  <p className="vs-note">원문에 구비서류 &lsquo;해당 없음&rsquo;: {pl.programs.filter((p) => p.docs === "none").map((p) => p.name).join(", ")}</p>
                )}
              </>
            )}
            {pl.phones.length > 0 && (
              <p className="vs-note" data-testid={forPrint ? undefined : "vs-phones"}>
                문의:{" "}
                {pl.phones.map((x, i) => (
                  <span key={x.phone}>
                    {i > 0 && " / "}
                    {/* 화면에서는 눌러서 바로 전화 (QA 7차 V1). 인쇄·이미지는 글자 그대로 */}
                    {!forPrint && telOf(x.phone) ? <a href={`tel:${telOf(x.phone)}`}>{x.phone}</a> : x.phone}
                  </span>
                ))}
              </p>
            )}
          </li>
        ))}
      </ol>
      <p className="vs-foot">원문(정부24·복지로) 기준이에요. 서류는 바뀔 수 있으니 가기 전에 전화로 확인하세요. 모르면 보건복지상담센터 129.</p>
    </>
  );
}

export function VisitSheet({ entries, region, sido, loading, extra, teen, onClose }: { entries: SheetEntry[]; region: string; sido?: string | null; loading: boolean; extra: number; teen?: boolean; onClose: () => void }) {
  const places = useMemo(() => buildVisitSheet(entries, sido), [entries, sido]);
  const date = useMemo(() => new Date().toLocaleDateString("ko-KR"), []);
  // 이 컴포넌트는 사용자가 버튼을 눌러야 열리므로(클라이언트에서만 렌더) 초기값에서 바로 확인한다
  const [canShare] = useState(() => {
    try {
      const f = new File([new Uint8Array(1)], FILE, { type: "image/png" });
      return typeof navigator !== "undefined" && typeof navigator.share === "function" && !!navigator.canShare?.({ files: [f] });
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const mounted = typeof document !== "undefined";
  useEffect(
    () => () => {
      delete document.documentElement.dataset.print;
    },
    [],
  );

  const printSheet = () => {
    document.documentElement.dataset.print = "sheet";
    const done = () => {
      delete document.documentElement.dataset.print;
    };
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  };
  const toPng = async () => {
    setBusy(true);
    try {
      return await renderSheetPng(places, { region, date });
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    try {
      const blob = await toPng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = FILE;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setMsg("이미지를 저장했어요. 사진첩이나 다운로드 폴더에서 카카오톡으로 보낼 수 있어요.");
    } catch {
      setMsg("이미지를 만들지 못했어요. '이 한 장만 인쇄'에서 PDF로 저장해 주세요.");
    }
  };
  const send = async () => {
    try {
      const blob = await toPng();
      const file = new File([blob], FILE, { type: "image/png" });
      await navigator.share({ files: [file], title: "방문처별 준비물 한 장" });
    } catch {}
  };

  return (
    <section className="visit-sheet card" id="visit-sheet" aria-labelledby="vs-h" data-testid="visit-sheet" aria-busy={loading}>
      <p className="small muted vs-lead no-print">
        &lsquo;먼저 확인할 5가지&rsquo;{extra > 0 ? `와 직접 담은 ${extra}개` : ""}를 신청하는 곳별로 묶고, 가져갈 것은 한 번씩만 적었어요. 이 기기에서만 만들었고 나이·소득 같은 입력값은 넣지 않았어요.
      </p>
      {/* 10대 본인 (QA 7차 T1) */}
      {teen && (
        <p className="small vs-lead no-print" data-testid="vs-teen">
          부모님이나 선생님께 이 화면을 보여 드려도 좋아요.
        </p>
      )}
      {loading ? <p className="muted">신청 방법·구비서류를 불러오는 중…</p> : <SheetBody places={places} region={region} date={date} />}
      <div className="btn-row vs-actions no-print">
        <button type="button" className="btn btn-primary btn-sm" onClick={printSheet} disabled={loading} data-testid="vs-print">
          <Icon name="printer" size={18} /> 이 한 장만 인쇄
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={save} disabled={loading || busy} data-testid="vs-png">
          <Icon name="fileText" size={18} /> 이미지로 저장
        </button>
        {canShare && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={send} disabled={loading || busy} data-testid="vs-share">
            <Icon name="share" size={18} /> 이미지로 보내기
          </button>
        )}
        <button type="button" className="btn btn-quiet btn-sm" onClick={onClose} data-testid="vs-close">
          닫기
        </button>
      </div>
      {msg && (
        <p className="small" role="status" data-testid="vs-msg">
          {msg}
        </p>
      )}
      {mounted && !loading &&
        createPortal(
          <div className="sheet-print-root" aria-hidden="true" data-cols={places.length >= PRINT_TWO_COLS ? 2 : 1}>
            <SheetBody places={places} region={region} date={date} forPrint />
          </div>,
          document.body,
        )}
    </section>
  );
}
