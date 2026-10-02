"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { MultiGroup, RadioGroup, opts } from "@/components/Choice";
import { clearProfile, saveProfile, setSettings, useProfile, useSettings } from "@/lib/client/storage";
import { loadRegions } from "@/lib/client/bundles";
import type { RegionIndex } from "@/lib/data/types";
import {
  ACTIVITIES, ACTIVITY_LABEL, AGE_BANDS, AGE_LABEL, BENEFITS, BENEFIT_LABEL, CARE_LABEL, CARE_NEEDS, CARS, CAR_LABEL,
  CHILD_BUCKETS, CHILD_LABEL, DISABILITY, DISABILITY_LABEL, DISABILITY_SEVERITY, EMPTY_PROFILE, HOUSEHOLD_TRAITS, HOUSING,
  HOUSING_LABEL, INCOME_BANDS, INCOME_LABEL, MEDIAN_INCOME_2026, SEVERITY_LABEL, TRAIT_LABEL, answeredCount, type Profile,
} from "@/lib/engine/profile";

const STEPS = ["사는 곳", "나와 가구", "자녀", "소득·주거", "활동·돌봄·장애"] as const;
const QUESTION = ["어디에 사시나요?", "나와 함께 사는 가구에 대해 알려 주세요", "자녀가 있나요?", "소득과 주거 형편은 어떤가요?", "지금 하시는 일과 돌봄이 필요한 상황"] as const;

export function Wizard() {
  const stored = useProfile();
  if (stored === undefined) return <div className="narrow page muted">불러오는 중…</div>;
  return <WizardInner initial={stored ?? EMPTY_PROFILE} editing={!!stored} />;
}

function WizardInner({ initial, editing }: { initial: Profile; editing: boolean }) {
  const router = useRouter();
  const settings = useSettings();
  const [p, setP] = useState<Profile>(initial);
  const [step, setStep] = useState(0);
  const [regions, setRegions] = useState<RegionIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    loadRegions().then(setRegions);
  }, []);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP((prev) => ({ ...prev, [k]: v }));

  const go = (next: number) => {
    if (step === 0 && next > 0 && !p.sigungu) {
      setError("결과를 보려면 사는 시군구를 선택해 주세요. 지역마다 받을 수 있는 서비스가 달라요.");
      return;
    }
    setError(null);
    setStep(next);
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      titleRef.current?.focus();
    });
  };

  const finish = () => {
    if (!p.sigungu) {
      setStep(0);
      setError("사는 시군구를 선택해 주세요.");
      return;
    }
    saveProfile(p);
    router.push("/results");
  };

  const sido = regions?.sidos.find((s) => s.code === p.sido);

  return (
    <>
      <div className="form-head">
        <div className="narrow">
          <ol className="crumbs" aria-label="현재 위치">
            <li>
              <Link href="/">
                <Icon name="home" size={14} /> 홈
              </Link>
            </li>
            <li>
              <span aria-current="page">맞춤 찾기</span>
            </li>
          </ol>
          <h1 className="h1" style={{ marginBottom: "0.25rem" }}>
            맞춤 찾기
          </h1>
          <p className="small muted">12개 중 {answeredCount(p)}개 입력 · 모르는 항목은 &lsquo;모름&rsquo;으로 넘어가도 됩니다</p>
          <ol className="stepper" aria-label={`입력 단계 (${STEPS.length}단계 중 ${step + 1}단계)`}>
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>
                <span className="dot" aria-hidden="true">
                  {i < step ? <Icon name="check" size={16} strokeWidth={3} /> : i + 1}
                </span>
                <span className="lbl">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="form-body">
        <div className="narrow">
          <div className="form-panel">
            <p className="eyebrow">
              {step + 1}단계 · {STEPS[step]}
            </p>
            <h2 className="h2" tabIndex={-1} ref={titleRef}>
              {QUESTION[step]}
            </h2>

      {step === 0 && (
        <>
          <p className="body">주민등록상 주소지를 골라 주세요. 그 지역에서만 하는 서비스와 신청하는 곳을 알려 드리는 데 씁니다.</p>
          {error && (
            <p role="alert" className="error">
              <Icon name="alert" size={18} /> {error}
            </p>
          )}
          <div className="select-row field">
            <div>
              <label htmlFor="sido" className="label">
                시·도
              </label>
              <select
                id="sido"
                className="select"
                value={p.sido ?? ""}
                onChange={(e) => setP((prev) => ({ ...prev, sido: e.target.value || null, sigungu: null }))}
              >
                <option value="">선택하세요</option>
                {regions?.sidos.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                    {s.pilot ? " (시범 지역)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="sigungu" className="label">
                시·군·구
              </label>
              <select id="sigungu" className="select" value={p.sigungu ?? ""} disabled={!sido} onChange={(e) => set("sigungu", e.target.value || null)}>
                <option value="">{sido ? "선택하세요" : "시·도를 먼저 고르세요"}</option>
                {sido?.sigungus.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {sido && (
            <p className="notice" style={{ marginTop: "1.25rem" }}>
              <Icon name="info" size={18} />
              {sido.pilot
                ? "경기도는 시범 지역이에요. 자격 규칙을 우선 검수하고 있어 더 정확한 결과를 보여드려요."
                : "이 지역은 아직 규칙 검수 전이라 대부분 '가능성 있음'·'확인 필요'로 안내돼요. 서비스 목록과 신청처는 모두 볼 수 있어요."}
            </p>
          )}
        </>
      )}

      {step === 1 && (
        <>
          <RadioGroup name="age" legend="본인 나이" options={opts(AGE_BANDS, AGE_LABEL)} value={p.age} onChange={(v) => set("age", v)} />
          <RadioGroup
            name="hh"
            legend="함께 사는 가구원 수 (본인 포함)"
            options={[1, 2, 3, 4, 5, 6].map((v) => ({ value: v as 1 | 2 | 3 | 4 | 5 | 6, label: v === 6 ? "6명 이상" : `${v}명` }))}
            value={p.householdSize}
            onChange={(v) => set("householdSize", v)}
          />
          <MultiGroup
            name="traits"
            legend="가구 특성"
            options={opts(HOUSEHOLD_TRAITS, TRAIT_LABEL)}
            value={p.traits}
            onChange={(v) => set("traits", v)}
          />
        </>
      )}

      {step === 2 && (
        <MultiGroup
          name="children"
          legend="자녀(또는 임신) 나이대"
          hint="가구 안에 자녀가 있으면 모두 골라 주세요."
          options={opts(CHILD_BUCKETS, CHILD_LABEL)}
          value={p.children}
          onChange={(v) => set("children", v)}
          noneLabel="자녀 없음"
        />
      )}

      {step === 3 && (
        <>
          <RadioGroup
            name="income"
            legend="가구 소득 (기준 중위소득 대비)"
            hint="정확히 몰라도 괜찮아요. 수급 중이면 아래 '수급·자격'만 골라도 돼요."
            options={opts(INCOME_BANDS, INCOME_LABEL)}
            value={p.income}
            onChange={(v) => set("income", v)}
          />
          <details className="details" style={{ marginTop: "0.75rem" }}>
            <summary>
              기준 중위소득이 뭔가요? <Icon name="chevronDown" size={18} />
            </summary>
            <p className="details-body small">
              2026년 기준 중위소득(월)은 1인 가구 {MEDIAN_INCOME_2026[1]!.toLocaleString("ko-KR")}원, 4인 가구{" "}
              {MEDIAN_INCOME_2026[4]!.toLocaleString("ko-KR")}원입니다(보건복지부 고시). 다른 가구원 수의 금액과 소득인정액 계산은 복지로
              &lsquo;모의계산&rsquo;에서 확인하세요.
            </p>
          </details>
          <MultiGroup
            name="benefits"
            legend="받고 있는 수급·자격"
            options={opts(BENEFITS, BENEFIT_LABEL)}
            value={p.benefits}
            onChange={(v) => set("benefits", v)}
          />
          <RadioGroup name="housing" legend="주거 형태" options={opts(HOUSING, HOUSING_LABEL)} value={p.housing} onChange={(v) => set("housing", v)} />
          <RadioGroup name="car" legend="가구 차량" options={opts(CARS, CAR_LABEL)} value={p.car} onChange={(v) => set("car", v)} />
        </>
      )}

      {step === 4 && (
        <>
          <RadioGroup
            name="activity"
            legend="취업·활동 상태"
            options={opts(ACTIVITIES, ACTIVITY_LABEL)}
            value={p.activity}
            onChange={(v) => set("activity", v)}
          />
          <div className="sensitive">
            <p>
              <Icon name="shieldCheck" size={18} /> 선택 입력 · 돌봄·장애 같은 민감 정보는 이 기기에만 저장돼요
            </p>
            <MultiGroup
              name="care"
              legend="돌봄이 필요한 상황"
              options={opts(CARE_NEEDS, CARE_LABEL)}
              value={p.care}
              onChange={(v) => set("care", v)}
            />
            <RadioGroup
              name="disability"
              legend="장애"
              options={opts(DISABILITY, DISABILITY_LABEL)}
              value={p.disability}
              onChange={(v) => setP((prev) => ({ ...prev, disability: v, disabilitySeverity: v === "self" || v === "member" ? prev.disabilitySeverity : "unknown" }))}
              unknownLabel="응답 안 함"
            />
            {(p.disability === "self" || p.disability === "member") && (
              <RadioGroup
                name="severity"
                legend="장애 정도"
                options={opts(DISABILITY_SEVERITY, SEVERITY_LABEL)}
                value={p.disabilitySeverity}
                onChange={(v) => set("disabilitySeverity", v)}
              />
            )}
          </div>
        </>
      )}

      <div className="wizard-nav">
        {step > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => go(step - 1)}>
            <Icon name="arrowLeft" size={18} /> 이전
          </button>
        ) : (
          <Link href="/" className="btn btn-ghost">
            취소
          </Link>
        )}
        <div className="grow">
          {step > 0 && step < STEPS.length - 1 && (
            <button type="button" className="btn btn-text" onClick={finish}>
              지금까지 입력으로 결과 보기
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn btn-primary" onClick={() => go(step + 1)} data-testid="next">
              다음 <Icon name="arrowRight" size={18} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={finish} data-testid="finish">
              결과 보기 <Icon name="arrowRight" size={18} />
            </button>
          )}
        </div>
      </div>
          </div>

          <div className="wizard-aside">
            <span style={{ display: "inline-flex", gap: "0.375rem", alignItems: "center" }}>
              <Icon name="shieldCheck" size={18} /> 입력한 내용은 서버로 보내지 않고 이 브라우저에만 저장됩니다.
            </span>
            <label className="check-inline">
              <input type="checkbox" checked={settings?.shared ?? false} onChange={(e) => setSettings({ shared: e.target.checked })} />
              공용 기기 모드 (브라우저를 닫으면 삭제)
            </label>
            {editing && (
              <button
                type="button"
                className="btn btn-text"
                onClick={() => {
                  clearProfile();
                  setP(EMPTY_PROFILE);
                  setStep(0);
                }}
              >
                이 기기에서 지우기
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
