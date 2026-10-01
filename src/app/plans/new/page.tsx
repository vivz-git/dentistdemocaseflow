import type { Metadata } from "next";
import { NewPlanForm } from "@/features/plans";

export const metadata: Metadata = { title: "New treatment plan" };

export default function Page() {
  return <NewPlanForm />;
}
