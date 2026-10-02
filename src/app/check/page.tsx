import type { Metadata } from "next";
import { Wizard } from "./Wizard";

export const metadata: Metadata = { title: "맞춤 찾기" };

export default function CheckPage() {
  return <Wizard />;
}
