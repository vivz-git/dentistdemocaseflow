import type { Metadata } from "next";
import { Suspense } from "react";
import { PlansList } from "@/features/plans";

export const metadata: Metadata = { title: "Treatment plans" };

export default function Page() {
  return (
    <Suspense>
      <PlansList />
    </Suspense>
  );
}
