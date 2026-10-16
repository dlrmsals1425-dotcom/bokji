import type { Metadata } from "next";
import { GuidedFlow } from "./GuidedFlow";

export const metadata: Metadata = { title: "질문 따라 찾기" };

export default function AskPage() {
  return <GuidedFlow />;
}
