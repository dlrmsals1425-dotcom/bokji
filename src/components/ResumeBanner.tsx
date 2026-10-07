"use client";
import Link from "next/link";
import { useMode, useProfile } from "@/lib/client/storage";
import { resultsPath } from "@/lib/client/mode";
import { Icon } from "./Icon";

/** 이 기기에 저장된 입력이 있으면 '이어서 보기' */
export function ResumeBanner() {
  const p = useProfile();
  const mode = useMode();
  if (!p) return null;
  const parent = mode === "parent";
  return (
    <p className="notice" style={{ marginTop: "1.25rem", maxWidth: "36rem" }}>
      <Icon name="info" size={18} />
      <span>
        이 기기에 저장된 {parent ? "부모님 " : ""}상황이 있어요.{" "}
        <Link href={resultsPath(mode ?? "self")}>지난 결과 이어서 보기</Link>
      </span>
    </p>
  );
}
