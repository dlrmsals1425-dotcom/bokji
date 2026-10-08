"use client";
/** 월 소득 한 줄 입력 (추가 질문·맨 위 요약에서 함께 씀). prefix로 id·테스트 id가 겹치지 않게 한다. */
import { useState } from "react";
import { incomeExplain, type Situation } from "@/lib/client/v2";

export function IncomeAsk({ sit, onApply, onSkip, idPrefix = "fq", testPrefix = "v2" }: { sit: Situation; onApply: (s: Situation) => void; onSkip: () => void; idPrefix?: string; testPrefix?: string }) {
  const [t, setT] = useState("");
  const size = sit.profile.householdSize === "unknown" ? null : sit.profile.householdSize;
  const n = t ? Number(t) : null;
  const ex = n !== null && size ? incomeExplain(n, size) : null;
  const id = `${idPrefix}-income`;
  return (
    <div>
      <div className="btn-row v2-answers">
        <label htmlFor={id} className="sr-only">
          한 달 소득 (만원)
        </label>
        <input
          id={id}
          className="input v2-income-in"
          inputMode="numeric"
          placeholder="예: 300"
          value={t}
          onChange={(e) => setT(e.target.value.replace(/[^0-9]/g, "").slice(0, 5))}
          data-testid={`${testPrefix}-a-income-input`}
        />
        <span>만원 / 월</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={n === null} onClick={() => n !== null && onApply({ ...sit, x: { ...sit.x, incomeManwon: n } })} data-testid={`${testPrefix}-a-income-ok`}>
          확인
        </button>
        <button type="button" className="btn btn-quiet" onClick={onSkip} data-testid={`${testPrefix}-skip-income`}>
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
