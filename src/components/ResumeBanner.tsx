"use client";
import Link from "next/link";
import { useProfile } from "@/lib/client/storage";
import { answeredCount } from "@/lib/engine/profile";
import { Icon } from "./Icon";

/** 이 기기에 저장된 입력이 있으면 '이어서 보기' */
export function ResumeBanner() {
  const p = useProfile();
  if (!p) return null;
  return (
    <p className="notice" style={{ marginTop: "1.25rem", maxWidth: "36rem" }}>
      <Icon name="info" size={18} />
      <span>
        이 기기에 저장된 입력이 있습니다(12개 중 {answeredCount(p)}개). <Link href="/results">지난 결과 이어서 보기</Link>
      </span>
    </p>
  );
}
