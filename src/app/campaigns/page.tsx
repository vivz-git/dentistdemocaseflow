import type { Metadata } from "next";
import { CampaignsList } from "@/features/campaigns";

export const metadata: Metadata = { title: "Campaigns" };

export default function Page() {
  return <CampaignsList />;
}
