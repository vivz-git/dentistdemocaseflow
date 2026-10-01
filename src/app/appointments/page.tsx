import type { Metadata } from "next";
import { Appointments } from "@/features/appointments";

export const metadata: Metadata = { title: "Appointments" };

export default function Page() {
  return <Appointments />;
}
