import type { Metadata } from "next";
import { FormsOverview } from "./FormsOverview";
import writingSummary from "../../../public/forms/writing/v1/index.json";

export const metadata: Metadata = { title: "신청서 연결 현황" };
export default function FormsPage() { return <FormsOverview writingCounts={writingSummary.counts} />; }
