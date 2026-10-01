import clsx from "clsx";
import { AUTOMATION_LABEL, STATUS_DESCRIPTION, STATUS_LABEL } from "@/lib/domain/status";
import type { Actor, AutomationState, CaseStatus } from "@/lib/domain/types";

export const STATUS_STYLE: Record<CaseStatus, { badge: string; dot: string }> = {
  pending: { badge: "bg-subtle text-ink-2 ring-1 ring-inset ring-line-strong", dot: "bg-faint" },
  follow_up_active: { badge: "bg-info-soft text-[#174ea6]", dot: "bg-info" },
  engaged: { badge: "bg-[#e2f3f4] text-[#0b5f67]", dot: "bg-[#0e7c86]" },
  needs_human: { badge: "bg-warn-soft text-[#8a4b04]", dot: "bg-[#d97706]" },
  scheduled: { badge: "bg-brand-soft text-brand-ink", dot: "bg-brand" },
  completed: { badge: "bg-brand text-white", dot: "bg-brand-strong" },
  deferred: { badge: "bg-[#f1ede6] text-[#5f5140]", dot: "bg-[#9a8566]" },
  lost: { badge: "bg-[#f3eeee] text-[#7a3b39]", dot: "bg-[#a65d5a]" },
  do_not_contact: { badge: "bg-danger-soft text-danger", dot: "bg-danger" },
};

export function StatusBadge({ status, className }: { status: CaseStatus; className?: string }) {
  return (
    <span
      title={STATUS_DESCRIPTION[status]}
      className={clsx(
        "inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs font-medium whitespace-nowrap",
        STATUS_STYLE[status].badge,
        className,
      )}
    >
      {status !== "completed" && <span aria-hidden className={clsx("size-1.5 rounded-full", STATUS_STYLE[status].dot)} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

const AUTOMATION_STYLE: Record<AutomationState, string> = {
  not_started: "text-muted",
  running: "text-brand",
  paused: "text-warn",
  staff: "text-info",
  stopped: "text-muted",
  finished: "text-muted",
};

export function AutomationIndicator({ state, className }: { state: AutomationState; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap", AUTOMATION_STYLE[state], className)}>
      <span
        aria-hidden
        className={clsx(
          "size-1.5 rounded-full",
          state === "running" ? "bg-brand" : state === "paused" ? "bg-[#d97706]" : state === "staff" ? "bg-info" : "bg-line-strong",
        )}
      />
      {AUTOMATION_LABEL[state]}
    </span>
  );
}

export const ACTOR_LABEL: Record<Actor, string> = {
  ai: "AI",
  staff: "Staff",
  system: "System",
  patient: "Patient",
};

export function ActorTag({ actor }: { actor: Actor }) {
  return (
    <span
      className={clsx(
        "inline-flex h-[18px] items-center rounded px-1 text-[10.5px] font-semibold tracking-wide uppercase",
        actor === "ai" && "bg-brand-soft text-brand-ink",
        actor === "staff" && "bg-info-soft text-[#174ea6]",
        actor === "system" && "bg-rail text-ink-2",
        actor === "patient" && "bg-subtle text-muted ring-1 ring-inset ring-line",
      )}
    >
      {ACTOR_LABEL[actor]}
    </span>
  );
}
