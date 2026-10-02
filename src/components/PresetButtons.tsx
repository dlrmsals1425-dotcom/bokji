"use client";
import { useRouter } from "next/navigation";
import { PRESETS } from "@/lib/client/presets";
import { saveProfile } from "@/lib/client/storage";

/** 홈 '예시로 먼저 보기' — 데모용 가상 입력으로 결과 화면을 바로 연다 */
export function PresetButtons() {
  const router = useRouter();
  return (
    <ul className="list" style={{ borderTop: "1px solid var(--line)" }}>
      {PRESETS.map((p) => (
        <li key={p.id} className="prow">
          <button
            type="button"
            className="link-btn h3"
            data-testid={`preset-${p.id}`}
            onClick={() => {
              saveProfile(p.profile, p.id);
              router.push("/results");
            }}
          >
            {p.title}
          </button>
          <p className="sum">{p.desc}</p>
        </li>
      ))}
    </ul>
  );
}
