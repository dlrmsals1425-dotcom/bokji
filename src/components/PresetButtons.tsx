"use client";
import { useRouter } from "next/navigation";
import { PRESETS } from "@/lib/client/presets";
import { saveProfile } from "@/lib/client/storage";

/** 홈 '예시 상황' 원클릭 프리셋 — 데모용 가상 입력으로 결과 화면을 바로 연다 */
export function PresetButtons() {
  const router = useRouter();
  return (
    <div className="presets">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className="preset"
          data-testid={`preset-${p.id}`}
          onClick={() => {
            saveProfile(p.profile, p.id);
            router.push("/results");
          }}
        >
          <span className="ex">예시</span>
          <span className="t">
            <span aria-hidden="true">{p.icon}</span> {p.title}
          </span>
          <span className="d">{p.desc}</span>
          <span className="go" aria-hidden="true">
            결과 바로 보기 →
          </span>
        </button>
      ))}
    </div>
  );
}
