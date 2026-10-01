import type { Metadata } from "next";
import { Analytics } from "@/features/analytics";

export const metadata: Metadata = { title: "Analytics" };

export default function Page() {
  return <Analytics />;
}
