import type { Metadata } from "next";
import { Suspense } from "react";
import { SituationForm } from "./SituationForm";

export const metadata: Metadata = { title: "내 상황 알려주기" };

export default function SituationPage() {
  return (
    <Suspense fallback={<div className="narrow page muted">불러오는 중…</div>}>
      <SituationForm />
    </Suspense>
  );
}
