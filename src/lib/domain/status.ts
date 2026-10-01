import type { AutomationState, CaseStatus } from "./types";

export const CASE_STATUSES: CaseStatus[] = [
  "pending",
  "follow_up_active",
  "engaged",
  "needs_human",
  "scheduled",
  "completed",
  "deferred",
  "lost",
  "do_not_contact",
];

export const STATUS_LABEL: Record<CaseStatus, string> = {
  pending: "Pending",
  follow_up_active: "Follow-up Active",
  engaged: "Engaged",
  scheduled: "Scheduled",
  completed: "Completed",
  deferred: "Deferred",
  lost: "Lost",
  needs_human: "Needs Human",
  do_not_contact: "Do Not Contact",
};

export const STATUS_DESCRIPTION: Record<CaseStatus, string> = {
  pending: "Plan presented, not scheduled, follow-up not started.",
  follow_up_active: "Follow-up sequence is running. No reply yet.",
  engaged: "Patient replied and has not scheduled yet.",
  scheduled: "Treatment appointment is booked.",
  completed: "Treatment appointment attended.",
  deferred: "Patient asked to pause. Eligible for reactivation later.",
  lost: "Closed without scheduling.",
  needs_human: "Waiting for a staff member to respond.",
  do_not_contact: "Patient opted out. No messages will be sent.",
};

/**
 * Allowed status transitions. Every status change in the engine goes through
 * `assertTransition`, which keeps the workflow predictable for staff.
 */
export const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  pending: ["follow_up_active", "engaged", "scheduled", "deferred", "lost", "needs_human", "do_not_contact"],
  follow_up_active: ["engaged", "scheduled", "deferred", "lost", "needs_human", "do_not_contact"],
  engaged: ["follow_up_active", "scheduled", "deferred", "lost", "needs_human", "do_not_contact"],
  needs_human: ["follow_up_active", "engaged", "scheduled", "deferred", "lost", "do_not_contact"],
  scheduled: ["completed", "engaged"],
  deferred: ["follow_up_active", "engaged", "scheduled", "lost", "needs_human", "do_not_contact"],
  lost: ["follow_up_active", "engaged", "scheduled", "deferred", "needs_human", "do_not_contact"],
  completed: [],
  // A patient who opted out can still phone the clinic and book with staff.
  do_not_contact: ["scheduled"],
};

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export class TransitionError extends Error {
  constructor(from: CaseStatus, to: CaseStatus) {
    super(`A case cannot move from ${STATUS_LABEL[from]} to ${STATUS_LABEL[to]}.`);
    this.name = "TransitionError";
  }
}

export function assertTransition(from: CaseStatus, to: CaseStatus) {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

/** Statuses where the opportunity is still open (not booked, not closed). */
export const OPEN_STATUSES: CaseStatus[] = ["pending", "follow_up_active", "engaged", "needs_human", "deferred"];

export function isOpen(status: CaseStatus) {
  return OPEN_STATUSES.includes(status);
}

export const AUTOMATION_LABEL: Record<AutomationState, string> = {
  not_started: "Not started",
  running: "Automation on",
  paused: "Paused",
  staff: "Staff in control",
  stopped: "Stopped",
  finished: "Sequence finished",
};

/** Whether the assistant may reply automatically on a case in this automation state. */
export function assistantMayReply(state: AutomationState) {
  return state === "running" || state === "finished";
}
