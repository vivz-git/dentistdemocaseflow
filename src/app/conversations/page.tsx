import type { Metadata } from "next";
import { Suspense } from "react";
import { Inbox } from "@/features/inbox";

export const metadata: Metadata = { title: "Conversations" };

export default function Page() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
