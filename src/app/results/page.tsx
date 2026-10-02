import type { Metadata } from "next";
import { Results } from "./Results";

export const metadata: Metadata = { title: "내 결과" };

export default function ResultsPage() {
  return <Results />;
}
