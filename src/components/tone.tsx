import clsx from "clsx";
import type { ReactNode } from "react";
import type { Tone } from "@/lib/selectors";

const TONE: Record<Tone, string> = {
  brand: "text-brand",
  warn: "text-[#8a4b04]",
  info: "text-[#174ea6]",
  neutral: "text-ink-2",
  danger: "text-danger",
};

export function ToneText({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return <span className={clsx(TONE[tone], className)}>{children}</span>;
}
