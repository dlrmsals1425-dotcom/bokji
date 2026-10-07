"use client";
import { useRouter } from "next/navigation";
import { PRESETS } from "@/lib/client/presets";
import { resultsPath } from "@/lib/client/mode";
import { saveFiller, saveProfile } from "@/lib/client/storage";
import { Icon, type IconName } from "./Icon";

const ICON: Record<string, IconName> = {
  "suwon-senior": "senior",
  "parent-care": "heart",
  "seongnam-single-parent": "family",
  "goyang-youth": "briefcase",
  "bucheon-disability": "accessibility",
};

/** 홈 '예시 상황으로 먼저 보기' — 데모용 가상 입력으로 결과 화면을 바로 연다 */
export function PresetButtons() {
  const router = useRouter();
  return (
    <ul className="presets">
      {PRESETS.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            className={`preset${p.mode === "parent" ? " preset-parent" : ""}`}
            data-testid={`preset-${p.id}`}
            onClick={() => {
              const mode = p.mode ?? "self";
              saveProfile(p.profile, p.id, mode);
              if (mode === "parent") saveFiller("child");
              router.push(resultsPath(mode));
            }}
          >
            <span className="p-ic" aria-hidden="true">
              <Icon name={ICON[p.id] ?? "users"} size={22} />
            </span>
            <span className="t">
              {p.title}
              {p.mode === "parent" && <span className="preset-tag">부모님</span>}
            </span>
            <span className="d">{p.desc}</span>
            <span className="go" aria-hidden="true">
              결과 바로 보기 <Icon name="chevronRight" size={16} strokeWidth={2.2} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
