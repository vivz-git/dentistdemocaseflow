import type { Metadata } from "next";
import { CaseDetail } from "@/features/case-detail";

export const metadata: Metadata = { title: "Case" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseDetail id={id} />;
}
