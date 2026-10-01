import type { Metadata } from "next";
import { PlanDetail } from "@/features/plans";

export const metadata: Metadata = { title: "Treatment plan" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlanDetail id={id} />;
}
