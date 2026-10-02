"use client";
import Link from "next/link";
import { useProfile } from "@/lib/client/storage";
import { answeredCount } from "@/lib/engine/profile";

/** 이 기기에 저장된 입력이 있으면 '이어서 보기' */
export function ResumeBanner() {
  const p = useProfile();
  if (!p) return null;
  return (
    <p className="inset">
      이 기기에 저장된 입력이 있습니다(12개 중 {answeredCount(p)}개). <Link href="/results">지난 결과 이어서 보기</Link>
    </p>
  );
}
