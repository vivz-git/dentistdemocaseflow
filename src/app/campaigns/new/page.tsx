import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignBuilder } from "@/features/campaigns";

export const metadata: Metadata = { title: "New campaign" };

export default function Page() {
  return (
    <Suspense>
      <CampaignBuilder />
    </Suspense>
  );
}
