import type { Metadata } from "next";
import { FollowUps } from "@/features/follow-ups";

export const metadata: Metadata = { title: "Follow-ups" };

export default function Page() {
  return <FollowUps />;
}
