import { Suspense } from "react";
import type { Metadata } from "next";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "맞춤 찾기 · 부모님 복지" };

export default function CheckPage() {
  return (
    <Suspense fallback={<div className="narrow page muted">불러오는 중…</div>}>
      <Wizard />
    </Suspense>
  );
}
