"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRESETS, presetAt, type Preset } from "@/lib/client/presets";
import { resultsPath } from "@/lib/client/mode";
import { startPreset, situationOf } from "@/lib/client/start";
import { loadForRegion, loadRegions } from "@/lib/client/bundles";
import { currentPosition, loadBoundaries, sigunguAt } from "@/lib/client/locate";
import { sidoOptionLabel } from "@/lib/client/regionLabel";
import { readExampleRegion, saveExampleRegion } from "@/lib/client/storage";
import { buildView, scoreV2 } from "@/lib/client/v2";
import type { RegionIndex } from "@/lib/data/types";
import { Icon, type IconName } from "./Icon";

const ICON: Record<string, IconName> = {
  "suwon-senior": "senior",
  "parent-care": "heart",
  "seongnam-single-parent": "family",
  "goyang-youth": "briefcase",
  "bucheon-disability": "accessibility",
};
const baseId = (id: string) => id.split("@")[0];

type Placed = { label: string; items: { p: Preset; fit: number }[] };
type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "error"; text: string };

/** 지역 이름 (예: '경기 용인시', '서울 광진구') */
function labelOf(regions: RegionIndex, sigungu: string): { sido: string; label: string } | null {
  for (const s of regions.sidos) {
    const g = s.sigungus.find((x) => x.code === sigungu);
    if (g) return { sido: s.code, label: `${s.short ?? s.name} ${g.name}` };
  }
  return null;
}

/**
 * (전국 확대 ③) 예시 5개를 그 시·군·구로 옮겨, 그 지역에서 '받으실 수 있어요'가 많은 예시부터 — 판정은 기기 안에서.
 * 예시 상황(나이·가구·소득)은 그대로이고 지역만 바뀐다.
 */
async function placePresets(regions: RegionIndex, sigungu: string): Promise<Placed | null> {
  const where = labelOf(regions, sigungu);
  if (!where) return null;
  const data = await loadForRegion(where.sido, sigungu);
  const items = PRESETS.map((p0) => {
    const p = presetAt(p0, where.sido, sigungu, where.label);
    const sit = situationOf(p.profile, p.x, p.mode ?? "self");
    return { p, fit: buildView(scoreV2(data.programs, sit), sit, 3).fit.length };
  }).sort((a, b) => b.fit - a.fit);
  return { label: where.label, items };
}

/**
 * 홈 '예시 상황으로 먼저 보기' — 데모용 가상 입력으로 결과 화면을 바로 연다.
 * (2026-10-16 소유자) 처음부터 내 위치 기준: 예시 칸이 화면에 보이면 위치를 확인해 그 시·군·구 예시로 바꾸고,
 * 정해진 지역(코드만)은 이 기기에 기억해 다음 방문에는 위치를 다시 묻지 않는다. 위치를 못 쓰면 경기도 예시 + 지역 고르기.
 */
export function PresetButtons() {
  const router = useRouter();
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [regions, setRegions] = useState<RegionIndex | null>(null);
  const [pickSido, setPickSido] = useState("");
  const [manual, setManual] = useState(false);

  // 마지막 요청만 화면에 반영 (지역을 연달아 고르거나 '처음 예시로'를 누르는 동안 늦게 끝난 계산이 덮어쓰지 않게)
  const seq = useRef(0);
  const openManual = async () => {
    setManual(true);
    if (!regions) setRegions(await loadRegions().catch(() => null));
  };
  const fail = async (text: string) => {
    setStatus({ kind: "error", text });
    await openManual();
  };
  const show = async (sigungu: string, my = ++seq.current) => {
    setStatus({ kind: "busy", text: "이 지역 예시를 계산하고 있어요…" });
    const rg = regions ?? (await loadRegions().catch(() => null));
    if (!regions && rg) setRegions(rg);
    const r = rg ? await placePresets(rg, sigungu).catch(() => null) : null;
    if (my !== seq.current) return;
    if (!r) return fail("이 지역 예시를 만들지 못했어요. 아래에서 지역을 다시 골라 주세요.");
    setPlaced(r);
    setStatus({ kind: "idle" });
    saveExampleRegion(sigungu);
  };
  const locate = async (auto = false) => {
    const my = ++seq.current;
    setStatus({ kind: "busy", text: "현재 위치를 확인하고 있어요…" });
    let sgg: string | null;
    try {
      // 좌표는 이 기기 안에서만 쓰고 저장하지 않아요 — 시·군·구 경계(약 300KB)를 받아 브라우저에서 계산
      const [pos, b] = await Promise.all([currentPosition(), loadBoundaries()]);
      sgg = sigunguAt(b, pos.lat, pos.lng);
    } catch {
      if (my === seq.current)
        await fail(
          auto
            ? "위치를 쓸 수 없어 경기도 예시를 보여 드려요. 아래에서 지역을 고르면 그 지역 예시로 바꿔 드려요."
            : "위치를 확인하지 못했어요(권한을 허용하지 않았거나 기기가 위치를 지원하지 않아요). 아래에서 지역을 골라 주세요.",
        );
      return;
    }
    if (my !== seq.current) return;
    if (!sgg) return fail(auto ? "국내 시·군·구 안의 위치가 아니라 경기도 예시를 보여 드려요. 아래에서 지역을 고르면 그 지역 예시로 바꿔 드려요." : "국내 시·군·구 안의 위치가 아니에요. 아래에서 지역을 골라 주세요.");
    await show(sgg, my);
  };
  const reset = () => {
    seq.current++;
    setPlaced(null);
    setStatus({ kind: "idle" });
    saveExampleRegion(null);
  };

  // 처음부터 내 위치 기준: 기억한 지역이 있으면 그 지역, 없으면 예시 칸이 화면에 보일 때 한 번 위치 확인
  // (홈을 열자마자 위치 권한을 묻지 않도록 칸이 보일 때만, 권한을 이미 거절했으면 묻지 않음)
  const boxRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    const saved = readExampleRegion();
    if (saved) {
      started.current = true;
      // 기기에 저장된 지역으로 다시 계산 (화면이 그려진 다음에)
      void Promise.resolve().then(() => show(saved));
      return;
    }
    const el = boxRef.current;
    const go = async () => {
      if (started.current) return;
      started.current = true;
      const state = await navigator.permissions?.query({ name: "geolocation" as PermissionName }).then((r) => r.state, () => "prompt");
      if (state === "denied") {
        setStatus({ kind: "error", text: "위치 권한이 꺼져 있어 경기도 예시를 보여 드려요. 아래에서 지역을 고르면 그 지역 예시로 바꿔 드려요." });
        void openManual();
        return;
      }
      void locate(true);
    };
    if (!el || typeof IntersectionObserver === "undefined") {
      void go();
      return;
    }
    const io = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) {
        io.disconnect();
        void go();
      }
    });
    io.observe(el);
    return () => io.disconnect();
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = placed ? placed.items : PRESETS.map((p) => ({ p, fit: -1 }));
  const sidoObj = regions?.sidos.find((s) => s.code === pickSido);
  return (
    <>
      <div className="preset-locate" data-testid="preset-locate" ref={boxRef}>
        <button type="button" className="btn btn-tonal btn-sm" onClick={() => locate()} disabled={status.kind === "busy"} data-testid="locate-btn">
          <Icon name="mapPin" size={18} /> 현재 위치로 내 지역 예시 보기
        </button>
        {!manual && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={openManual} data-testid="locate-manual">
            지역 직접 고르기
          </button>
        )}
        {placed && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={reset} data-testid="locate-reset">
            처음 예시로
          </button>
        )}
        <p className="small muted" aria-live="polite" data-testid="locate-status">
          {status.kind !== "idle"
            ? status.text
            : placed
              ? `${placed.label} 기준 예시예요. 상황은 같고 지역만 바꿨어요 — 이 지역에서 '받으실 수 있어요'가 많은 순서예요.`
              : "위치는 이 기기 안에서만 시·군·구로 바꾸고, 어디에도 보내거나 저장하지 않아요."}
        </p>
        {manual && (
          <div className="preset-pick">
            <label className="sr-only" htmlFor="pp-sido">
              시·도
            </label>
            <select id="pp-sido" className="select" value={pickSido} disabled={!regions} onChange={(e) => setPickSido(e.target.value)}>
              <option value="">시·도 고르기</option>
              {regions?.sidos.map((s) => (
                <option key={s.code} value={s.code}>
                  {sidoOptionLabel({ code: s.code, name: s.name })}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="pp-sgg">
              시·군·구
            </label>
            <select id="pp-sgg" className="select" value="" disabled={!sidoObj || status.kind === "busy"} onChange={(e) => e.target.value && show(e.target.value)} data-testid="locate-sigungu">
              <option value="">{sidoObj ? "시·군·구 고르기" : "시·도 먼저"}</option>
              {sidoObj?.sigungus.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <ul className="presets">
        {list.map(({ p, fit }) => (
          <li key={p.id}>
            <button
              type="button"
              className={`preset${p.mode === "parent" ? " preset-parent" : ""}`}
              data-testid={`preset-${baseId(p.id)}`}
              onClick={() => {
                startPreset(p);
                router.push(resultsPath(p.mode ?? "self"));
              }}
            >
              <span className="p-ic" aria-hidden="true">
                <Icon name={ICON[baseId(p.id)] ?? "users"} size={22} />
              </span>
              <span className="t">
                {p.title}
                {p.mode === "parent" && <span className="preset-tag">부모님</span>}
              </span>
              <span className="d">{p.desc}</span>
              {fit >= 0 && (
                <span className="d preset-fit" data-testid="preset-fit">
                  이 지역에서 받으실 수 있어요 <b>{fit}</b>개
                </span>
              )}
              <span className="go" aria-hidden="true">
                결과 바로 보기 <Icon name="chevronRight" size={16} strokeWidth={2.2} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
