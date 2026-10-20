import type { Metadata } from "next";
import { KioskSetup } from "./KioskSetup";

export const metadata: Metadata = { title: "키오스크 설정", robots: { index: false, follow: false } };

export default function KioskPage() {
  return <KioskSetup />;
}
