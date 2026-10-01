import type { Metadata } from "next";
import { Suspense } from "react";
import { CasesList } from "@/features/cases-list";

export const metadata: Metadata = { title: "Cases" };

export default function Page() {
  return (
    <Suspense>
      <CasesList />
    </Suspense>
  );
}
