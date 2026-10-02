import type { Metadata } from "next";
import { Detail } from "./Detail";

export const metadata: Metadata = { title: "서비스 상세" };

export default async function ProgramPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  return <Detail id={decodeURIComponent(id)} />;
}
