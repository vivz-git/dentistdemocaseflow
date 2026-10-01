import { caseContext, followUpEligibility, reactivationEligibility } from "@/lib/domain/engine";
import { formatRelative, formatSlot } from "@/lib/domain/format";
import type { Case, DemoState } from "@/lib/domain/types";

export type Tone = "brand" | "warn" | "info" | "neutral" | "danger";

export interface NextAction {
  label: string;
  detail?: string;
  tone: Tone;
}

export function patientName(s: DemoState, c: Case) {
  const p = s.patients.find((x) => x.id === c.patientId);
  return p ? `${p.firstName} ${p.lastName}` : "Unknown patient";
}

/** The one thing staff should do next on a case — shown wherever cases are listed. */
export function nextAction(s: DemoState, c: Case, now: Date): NextAction {
  const { patient } = caseContext(s, c);
  switch (c.status) {
    case "pending": {
      const e = followUpEligibility(s, c);
      return e.eligible
        ? { label: "Start follow-up", detail: "Not contacted yet", tone: "brand" }
        : { label: "Call the patient", detail: e.reason, tone: "warn" };
    }
    case "follow_up_active":
      if (c.automation.state === "running" && c.sequence.nextStepAt) {
        const step = c.sequence.steps[c.sequence.stepIndex];
        const due = new Date(c.sequence.nextStepAt) <= now;
        return {
          label: due ? `${step?.label ?? "Follow-up"} due now` : `${step?.label ?? "Next follow-up"} ${formatRelative(c.sequence.nextStepAt, now, s.settings)}`,
          detail: "Automated",
          tone: due ? "info" : "neutral",
        };
      }
      if (c.automation.state === "finished") return { label: "No reply yet", detail: "Sequence finished — call or close", tone: "neutral" };
      if (c.automation.state === "paused") return { label: "Automation paused", detail: c.automation.reason, tone: "warn" };
      if (c.automation.state === "staff") return { label: "Staff following up", detail: c.automation.reason, tone: "info" };
      return { label: "Follow up manually", detail: c.automation.reason, tone: "neutral" };
    case "engaged":
      if (c.unread) return { label: "Reply to patient", detail: "New message", tone: "warn" };
      return { label: "Help them choose a time", detail: "Patient engaged", tone: "info" };
    case "needs_human":
      return { label: "Respond to patient", detail: c.needsHumanReason, tone: "warn" };
    case "scheduled": {
      const appt = s.appointments.find((a) => a.id === c.appointmentId);
      return { label: appt ? formatSlot(appt.start, s.settings) : "Scheduled", detail: "Appointment booked", tone: "brand" };
    }
    case "completed":
      return { label: "Treatment visit attended", tone: "neutral" };
    case "deferred": {
      const e = reactivationEligibility(s, c, now);
      return e.eligible
        ? { label: "Eligible for reactivation", detail: "Deferral period ended", tone: "brand" }
        : { label: `Reactivate ${e.from ? formatRelative(e.from, now, s.settings) : "later"}`, detail: "Patient asked to wait", tone: "neutral" };
    }
    case "lost":
      return { label: "Closed", detail: c.lostReason, tone: "neutral" };
    case "do_not_contact":
      return { label: "Do not message", detail: patient.consent.source, tone: "danger" };
  }
}

export interface CaseRow {
  c: Case;
  name: string;
  firstName: string;
  category: string;
  categoryId: string;
  provider: string;
  value: number;
  presentedAt: string;
  lastActivity: string;
}

export function caseRows(s: DemoState): CaseRow[] {
  return s.cases.map((c) => {
    const { patient, plan, category, provider } = caseContext(s, c);
    const last = [c.lastContactAt, c.lastPatientMessageAt, c.statusChangedAt, plan.presentedAt]
      .filter(Boolean)
      .sort()
      .at(-1)!;
    return {
      c,
      name: `${patient.firstName} ${patient.lastName}`,
      firstName: patient.firstName,
      category: category.name,
      categoryId: category.id,
      provider: provider.name,
      value: plan.estimatedValue,
      presentedAt: plan.presentedAt,
      lastActivity: last,
    };
  });
}

/** Priority order for worklists: what needs a human first. */
export function urgency(s: DemoState, c: Case, now: Date) {
  if (c.status === "needs_human") return 0;
  if (c.unread) return 1;
  if (c.status === "follow_up_active" && c.automation.state === "running" && c.sequence.nextStepAt && new Date(c.sequence.nextStepAt) <= now)
    return 2;
  if (c.status === "pending") return 3;
  if (c.status === "engaged") return 4;
  if (c.status === "deferred" && reactivationEligibility(s, c, now).eligible) return 5;
  if (c.status === "follow_up_active") return 6;
  return 9;
}
