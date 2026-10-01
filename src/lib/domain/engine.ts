/**
 * CaseFlow workflow engine.
 *
 * Every function takes a mutable draft of DemoState plus an explicit `now`, so the
 * same code drives the live UI, the deterministic demo seed, and unit tests.
 * Callers (the store) clone state before invoking these functions.
 */
import { demoIntegrations } from "@/lib/integrations/demo";
import type { Integrations } from "@/lib/integrations/types";
import { INTENT_LABEL, isClinicalQuestion, isOptOut, GUARDRAIL_REPLY, type Intent } from "./assistant";
import { formatSlot } from "./format";
import { findConflict, findSlots } from "./slots";
import { assertTransition, assistantMayReply, isOpen, STATUS_LABEL } from "./status";
import { renderTemplate, validateTemplate } from "./templates";
import { DAY, addMs, inQuietHours, iso, nextQuietHoursEnd } from "./time";
import type {
  Actor,
  Appointment,
  AutomationState,
  Case,
  CaseEventType,
  CaseSequence,
  CaseStatus,
  Channel,
  DemoState,
  Message,
  Patient,
  PatientAction,
  RecipientState,
  SequenceStepSnapshot,
  SlotOption,
  TreatmentPlan,
} from "./types";

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

let integrations: Integrations = demoIntegrations;
/** Swap integrations (tests, or a future server-side production wiring). */
export function setIntegrations(next: Integrations) {
  integrations = next;
}

/* ------------------------------------------------------------------ */
/* Lookups and small helpers                                           */
/* ------------------------------------------------------------------ */

export function newId(s: DemoState, prefix: string) {
  s.seq += 1;
  return `${prefix}_${s.seq.toString(36)}`;
}

export function getCase(s: DemoState, caseId: string): Case {
  const c = s.cases.find((x) => x.id === caseId);
  if (!c) throw new DomainError("Case not found.");
  return c;
}

export function caseContext(s: DemoState, c: Case) {
  const patient = s.patients.find((p) => p.id === c.patientId)!;
  const plan = s.plans.find((p) => p.id === c.planId)!;
  const category = s.settings.categories.find((x) => x.id === plan.categoryId) ?? s.settings.categories[0];
  const provider = s.settings.providers.find((x) => x.id === plan.providerId) ?? s.settings.providers[0];
  const appointmentType =
    s.settings.appointmentTypes.find((x) => x.id === category.appointmentTypeId) ?? s.settings.appointmentTypes[0];
  return { patient, plan, category, provider, appointmentType };
}

function addEvent(
  s: DemoState,
  c: Case,
  type: CaseEventType,
  label: string,
  actor: Actor,
  now: Date,
  detail?: string,
) {
  s.events.push({ id: newId(s, "evt"), caseId: c.id, at: iso(now), type, label, actor, detail });
}

function addMessage(s: DemoState, c: Case, m: Omit<Message, "id" | "caseId">) {
  const msg: Message = { id: newId(s, "msg"), caseId: c.id, ...m };
  s.messages.push(msg);
  return msg;
}

function setStatus(s: DemoState, c: Case, to: CaseStatus, now: Date, actor: Actor, reason?: string) {
  if (c.status === to) return;
  assertTransition(c.status, to);
  const from = c.status;
  c.status = to;
  c.statusChangedAt = iso(now);
  if (from === "needs_human") {
    c.needsHumanReason = undefined;
    c.needsHumanAt = undefined;
    c.statusBeforeHandoff = undefined;
  }
  // Sequence reminders only go to patients who have not replied yet.
  if (to !== "follow_up_active") c.sequence.nextStepAt = undefined;
  addEvent(s, c, "status_changed", `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}`, actor, now, reason);
}

function setAutomation(s: DemoState, c: Case, state: AutomationState, reason: string, now: Date, actor: Actor) {
  if (c.automation.state === state && c.automation.reason === reason) return;
  c.automation = { state, reason, updatedAt: iso(now) };
  addEvent(s, c, "automation_changed", automationEventLabel(state), actor, now, reason);
}

function automationEventLabel(state: AutomationState) {
  switch (state) {
    case "running":
      return "Automation on";
    case "paused":
      return "Automation paused";
    case "staff":
      return "Staff took over";
    case "stopped":
      return "Automation stopped";
    case "finished":
      return "Follow-up sequence finished";
    default:
      return "Automation not started";
  }
}

function channelFor(s: DemoState, patient: Patient): Channel {
  return s.settings.channels.enabled.includes(patient.preferredChannel)
    ? patient.preferredChannel
    : s.settings.channels.default;
}

export function templateVars(s: DemoState, c: Case) {
  const { patient, category, provider } = caseContext(s, c);
  return {
    patient_first_name: patient.firstName,
    clinic_name: s.settings.clinic.name,
    treatment_name: category.patientLabel,
    provider_name: provider.name,
    clinic_phone: s.settings.clinic.phone,
  };
}

/** Whether CaseFlow may send an automated message to this patient. */
export function automatedMessagingBlock(s: DemoState, patient: Patient): string | null {
  if (patient.consent.doNotContact) return "Patient opted out of messages";
  if (s.settings.consent.requireAutomationConsent && !patient.consent.automatedFollowUp)
    return "No consent recorded for automated messages";
  return null;
}

function updateRecipient(s: DemoState, c: Case, state: RecipientState, now: Date) {
  if (!c.campaignId) return;
  const campaign = s.campaigns.find((x) => x.id === c.campaignId);
  const r = campaign?.recipients.find((x) => x.caseId === c.id);
  if (!r) return;
  const rank: Record<RecipientState, number> = {
    queued: 0,
    skipped: 0,
    delivered: 1,
    replied: 2,
    deferred: 3,
    needs_human: 4,
    opted_out: 5,
    scheduled: 6,
  };
  if (rank[state] >= rank[r.state]) r.state = state;
  if (state !== "delivered" && !r.repliedAt) r.repliedAt = iso(now);
}

function sendDelivery(s: DemoState, patient: Patient, channel: Channel, body: string, quickReplies?: string[]) {
  return integrations.messaging.send({
    to: { name: `${patient.firstName} ${patient.lastName}`, phone: patient.phone, email: patient.email },
    channel,
    body,
    quickReplies,
  });
}

const ALL_ACTIONS: PatientAction[] = ["book", "contact", "not_now", "stop"];
export const ACTION_LABEL: Record<PatientAction, string> = {
  book: "Book treatment",
  contact: "Contact clinic",
  not_now: "Not now",
  stop: "Stop messages",
};

function sendAi(
  s: DemoState,
  c: Case,
  body: string,
  now: Date,
  extra: Partial<Omit<Message, "id" | "caseId" | "body" | "at" | "sender">> = {},
) {
  const { patient } = caseContext(s, c);
  const channel = extra.channel ?? channelFor(s, patient);
  const result = sendDelivery(s, patient, channel, body, extra.actions?.map((a) => ACTION_LABEL[a]));
  c.lastContactAt = iso(now);
  return addMessage(s, c, { at: iso(now), sender: "ai", body, channel, kind: "reply", delivery: result.status, ...extra });
}

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

export interface NewPlanInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredChannel: Channel;
  automatedConsent: boolean;
  categoryId: string;
  providerId: string;
  estimatedValue: number;
  presentedAt: string;
  summary: string;
  source?: TreatmentPlan["source"];
}

export function validatePlanInput(input: NewPlanInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.firstName.trim()) errors.firstName = "Enter the patient's first name.";
  if (!input.lastName.trim()) errors.lastName = "Enter the patient's last name.";
  if (!/^\+?[0-9 ()-]{7,20}$/.test(input.phone.trim())) errors.phone = "Enter a phone number with country code, e.g. +91 98000 00000.";
  if (input.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) errors.email = "Enter a valid email address or leave it blank.";
  if (!input.categoryId) errors.categoryId = "Choose a treatment category.";
  if (!input.providerId) errors.providerId = "Choose the presenting provider.";
  if (!(input.estimatedValue >= 0) || !Number.isFinite(input.estimatedValue)) errors.estimatedValue = "Enter an estimated value of 0 or more.";
  if (!input.presentedAt || Number.isNaN(new Date(input.presentedAt).getTime())) errors.presentedAt = "Enter the date the plan was presented.";
  return errors;
}

export function createPlan(s: DemoState, input: NewPlanInput, now: Date) {
  const errors = validatePlanInput(input);
  if (Object.keys(errors).length) throw new DomainError(Object.values(errors)[0]);
  const patient: Patient = {
    id: newId(s, "pat"),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone.trim(),
    email: input.email.trim(),
    preferredChannel: input.preferredChannel,
    consent: {
      automatedFollowUp: input.automatedConsent,
      doNotContact: false,
      recordedAt: iso(input.presentedAt),
      source: input.source === "pms_import" ? "Practice system record" : "Recorded at front desk",
    },
  };
  const caseId = newId(s, "case");
  const plan: TreatmentPlan = {
    id: newId(s, "plan"),
    patientId: patient.id,
    categoryId: input.categoryId,
    providerId: input.providerId,
    presentedAt: iso(input.presentedAt),
    estimatedValue: Math.round(input.estimatedValue),
    summary: input.summary.trim(),
    source: input.source ?? "manual",
    caseId,
  };
  const c: Case = {
    id: caseId,
    planId: plan.id,
    patientId: patient.id,
    status: "pending",
    statusChangedAt: iso(now),
    automation: { state: "not_started", updatedAt: iso(now) },
    sequence: { kind: "standard", steps: [], stepIndex: 0, sentCount: 0 },
    recovered: false,
    unread: false,
  };
  s.patients.push(patient);
  s.plans.push(plan);
  s.cases.push(c);
  const { category, provider } = caseContext(s, c);
  addEvent(s, c, "plan_presented", `Treatment plan presented by ${provider.name}`, "staff", new Date(plan.presentedAt), category.name);
  return c;
}

export function importFromPms(s: DemoState, now: Date) {
  const batch = s.plans.filter((p) => p.source === "pms_import").length / 3;
  const imported = integrations.pms.fetchUnscheduledPlans(Math.floor(batch));
  return imported.map((p) =>
    createPlan(
      s,
      {
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        preferredChannel: s.settings.channels.default,
        automatedConsent: true,
        categoryId: p.categoryId,
        providerId: p.providerId,
        estimatedValue: p.estimatedValue,
        presentedAt: iso(addMs(now, -p.presentedDaysAgo * DAY)),
        summary: p.summary,
        source: "pms_import",
      },
      now,
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Follow-up sequence                                                  */
/* ------------------------------------------------------------------ */

function standardSteps(s: DemoState, firstBody?: string): SequenceStepSnapshot[] {
  return s.settings.followUp.steps
    .slice()
    .sort((a, b) => a.dayOffset - b.dayOffset)
    .map((step, i) => ({
      id: step.id,
      dayOffset: step.dayOffset,
      label: step.label,
      templateId: step.templateId,
      body: i === 0 && firstBody ? firstBody : undefined,
    }));
}

function reactivationSteps(s: DemoState, body: string): SequenceStepSnapshot[] {
  return [
    { id: "react_d0", dayOffset: 0, label: "Reactivation message", body },
    {
      id: "react_reminder",
      dayOffset: s.settings.followUp.reactivationReminderDays,
      label: "Reactivation reminder",
      templateId: "tpl_reactivation_reminder",
    },
  ];
}

function stepBody(s: DemoState, step: SequenceStepSnapshot) {
  if (step.body) return step.body;
  const tpl = s.settings.templates.find((t) => t.id === step.templateId);
  if (!tpl) throw new DomainError(`Template for "${step.label}" is missing. Check Settings → Messages.`);
  return tpl.body;
}

function beginSequence(
  s: DemoState,
  c: Case,
  sequence: Pick<CaseSequence, "kind" | "steps">,
  now: Date,
  actor: Actor,
  campaignId?: string,
) {
  const { patient } = caseContext(s, c);
  const block = automatedMessagingBlock(s, patient);
  if (block) throw new DomainError(`Cannot start follow-up: ${block.toLowerCase()}.`);
  if (!sequence.steps.length) throw new DomainError("The follow-up sequence has no steps. Add one in Settings.");
  for (const step of sequence.steps) {
    const v = validateTemplate(stepBody(s, step));
    if (!v.ok) throw new DomainError(`"${step.label}" message is invalid: ${v.errors[0]}`);
  }

  setStatus(s, c, "follow_up_active", now, actor);
  c.sequence = { kind: sequence.kind, steps: sequence.steps, stepIndex: 0, startedAt: iso(now), nextStepAt: iso(now), sentCount: 0 };
  c.followUpStartedAt ??= iso(now);
  c.campaignId = campaignId;
  c.deferredUntil = undefined;
  c.lostReason = undefined;
  addEvent(
    s,
    c,
    sequence.kind === "reactivation" ? "campaign_added" : "follow_up_started",
    sequence.kind === "reactivation" ? "Reactivation started" : "Follow-up started",
    actor,
    now,
    sequence.steps.map((st) => `Day ${st.dayOffset}: ${st.label}`).join(" · "),
  );
  setAutomation(s, c, "running", sequence.kind === "reactivation" ? "Reactivation sequence" : "Follow-up sequence", now, actor);
  sendNextStep(s, c, now, actor === "staff" ? "staff" : "system");
}

export function startFollowUp(s: DemoState, caseId: string, now: Date, actor: Actor = "staff") {
  const c = getCase(s, caseId);
  if (!["pending", "deferred", "lost", "engaged", "needs_human"].includes(c.status)) {
    throw new DomainError(`Follow-up cannot start while the case is ${STATUS_LABEL[c.status]}.`);
  }
  if (c.status === "engaged" || c.status === "needs_human") {
    throw new DomainError("The patient has already replied. Continue the conversation instead of restarting the sequence.");
  }
  beginSequence(s, c, { kind: "standard", steps: standardSteps(s) }, now, actor);
  return c;
}

/** Send the next sequence step now. Used by the scheduler and by "Send next step now". */
function sendNextStep(s: DemoState, c: Case, now: Date, trigger: "system" | "staff") {
  const seq = c.sequence;
  const step = seq.steps[seq.stepIndex];
  if (!step) throw new DomainError("All follow-up steps have already been sent.");
  const { patient } = caseContext(s, c);
  const body = renderTemplate(stepBody(s, step), templateVars(s, c));
  const channel = channelFor(s, patient);
  const result = sendDelivery(s, patient, channel, body, ALL_ACTIONS.map((a) => ACTION_LABEL[a]));
  const isCampaign = !!c.campaignId && seq.stepIndex === 0;
  addMessage(s, c, {
    at: iso(now),
    sender: "ai",
    body,
    channel,
    kind: isCampaign ? "campaign" : "follow_up",
    actions: ALL_ACTIONS,
    delivery: result.status,
    stepId: step.id,
    campaignId: isCampaign ? c.campaignId : undefined,
  });
  seq.stepIndex += 1;
  seq.sentCount += 1;
  seq.lastSentAt = iso(now);
  c.lastContactAt = iso(now);
  addEvent(
    s,
    c,
    "follow_up_sent",
    `${step.label} sent`,
    trigger === "staff" ? "staff" : "ai",
    now,
    `Day ${step.dayOffset} · ${result.simulated ? "simulated " : ""}${channel}`,
  );

  const next = seq.steps[seq.stepIndex];
  if (next && seq.startedAt) {
    let at = addMs(seq.startedAt, next.dayOffset * DAY);
    if (at.getTime() <= now.getTime()) at = addMs(now, DAY);
    seq.nextStepAt = iso(at);
    addEvent(s, c, "follow_up_scheduled", `Next follow-up scheduled: ${next.label}`, "system", now, iso(at));
  } else {
    seq.nextStepAt = undefined;
    setAutomation(s, c, "finished", "All sequence steps sent", now, "system");
  }
}

export function sendNextStepNow(s: DemoState, caseId: string, now: Date) {
  const c = getCase(s, caseId);
  if (c.status !== "follow_up_active" && c.status !== "engaged") {
    throw new DomainError(`No follow-up to send while the case is ${STATUS_LABEL[c.status]}.`);
  }
  const block = automatedMessagingBlock(s, caseContext(s, c).patient);
  if (block) throw new DomainError(`Cannot send: ${block.toLowerCase()}.`);
  if (c.automation.state === "stopped") throw new DomainError("Automation is stopped on this case. Turn it back on first.");
  sendNextStep(s, c, now, "staff");
  return c;
}

export function rescheduleNextStep(s: DemoState, caseId: string, at: Date, now: Date) {
  const c = getCase(s, caseId);
  const next = c.sequence.steps[c.sequence.stepIndex];
  if (!next) throw new DomainError("There is no upcoming follow-up step to reschedule.");
  if (at.getTime() < now.getTime()) throw new DomainError("Choose a time in the future.");
  c.sequence.nextStepAt = iso(at);
  addEvent(s, c, "follow_up_scheduled", `${next.label} rescheduled`, "staff", now, iso(at));
}

export interface SchedulerResult {
  sent: number;
  held: number;
  closed: number;
  blocked: number;
}

/**
 * The scheduler tick. In production this runs server-side every few minutes; in the
 * demo it runs when staff press "Run scheduler" or advance the demo clock.
 */
export function runDueFollowUps(s: DemoState, now: Date): SchedulerResult {
  const result: SchedulerResult = { sent: 0, held: 0, closed: 0, blocked: 0 };
  const tz = s.settings.clinic.timezone;
  const { quietHoursStart, quietHoursEnd } = s.settings.consent;

  for (const c of s.cases) {
    if (c.status !== "follow_up_active") continue;

    if (c.automation.state === "running" && c.sequence.nextStepAt && new Date(c.sequence.nextStepAt) <= now) {
      const { patient } = caseContext(s, c);
      const block = automatedMessagingBlock(s, patient);
      if (block) {
        setAutomation(s, c, "stopped", block, now, "system");
        result.blocked++;
        continue;
      }
      if (inQuietHours(now, tz, quietHoursStart, quietHoursEnd)) {
        const resumeAt = nextQuietHoursEnd(now, tz, quietHoursEnd);
        c.sequence.nextStepAt = iso(resumeAt);
        addEvent(s, c, "follow_up_held", "Follow-up held for quiet hours", "system", now, iso(resumeAt));
        result.held++;
        continue;
      }
      sendNextStep(s, c, now, "system");
      result.sent++;
      continue;
    }

    if (
      c.automation.state === "finished" &&
      c.sequence.lastSentAt &&
      new Date(c.sequence.lastSentAt).getTime() + s.settings.followUp.autoCloseAfterDays * DAY <= now.getTime()
    ) {
      c.lostAt = iso(now);
      c.lostReason = "No response after the follow-up sequence";
      setStatus(s, c, "lost", now, "system", c.lostReason);
      setAutomation(s, c, "stopped", "Case closed — no response", now, "system");
      result.closed++;
    }
  }
  return result;
}

/** Cases whose next automated step is due on or before `until`. */
export function dueFollowUps(s: DemoState, until: Date) {
  return s.cases.filter(
    (c) =>
      c.status === "follow_up_active" &&
      c.automation.state === "running" &&
      !!c.sequence.nextStepAt &&
      new Date(c.sequence.nextStepAt) <= until,
  );
}

/* ------------------------------------------------------------------ */
/* Automation controls                                                 */
/* ------------------------------------------------------------------ */

export function takeOver(s: DemoState, caseId: string, now: Date) {
  const c = getCase(s, caseId);
  if (c.automation.state === "staff") return c;
  setAutomation(s, c, "staff", `Taken over by ${s.settings.staff.currentUser}`, now, "staff");
  return c;
}

export function pauseAutomation(s: DemoState, caseId: string, now: Date, reason = "Paused by staff") {
  const c = getCase(s, caseId);
  if (c.automation.state !== "running" && c.automation.state !== "finished") {
    throw new DomainError("Automation is not running on this case.");
  }
  setAutomation(s, c, "paused", reason, now, "staff");
  return c;
}

export function stopAutomation(s: DemoState, caseId: string, now: Date, reason = "Stopped by staff") {
  const c = getCase(s, caseId);
  c.sequence.nextStepAt = undefined;
  setAutomation(s, c, "stopped", reason, now, "staff");
  return c;
}

/** "Return to Automation": hand the conversation back to CaseFlow. */
export function returnToAutomation(s: DemoState, caseId: string, now: Date) {
  const c = getCase(s, caseId);
  const { patient } = caseContext(s, c);
  const block = automatedMessagingBlock(s, patient);
  if (block) throw new DomainError(`Automation cannot resume: ${block.toLowerCase()}.`);
  if (!c.sequence.startedAt) throw new DomainError("Follow-up has not started on this case. Use Start follow-up.");
  if (!isOpen(c.status)) throw new DomainError(`Automation cannot run while the case is ${STATUS_LABEL[c.status]}.`);
  if (c.status === "deferred") throw new DomainError("This case is deferred. Start a reactivation instead.");

  if (c.status === "needs_human") {
    const before = c.statusBeforeHandoff;
    const back: CaseStatus =
      before === "engaged" || before === "follow_up_active" ? before : c.engagedAt ? "engaged" : "follow_up_active";
    setStatus(s, c, back, now, "staff", "Handoff resolved");
  }
  const remaining = c.sequence.stepIndex < c.sequence.steps.length;
  if (remaining && c.status === "follow_up_active" && !c.sequence.nextStepAt) c.sequence.nextStepAt = iso(addMs(now, DAY));
  setAutomation(s, c, remaining ? "running" : "finished", "Returned to automation", now, "staff");
  c.unread = false;
  return c;
}

export function markNeedsHuman(s: DemoState, caseId: string, reason: string, now: Date, actor: Actor = "staff") {
  const c = getCase(s, caseId);
  if (!isOpen(c.status)) throw new DomainError(`A ${STATUS_LABEL[c.status]} case cannot be flagged for staff.`);
  const before = c.status;
  setStatus(s, c, "needs_human", now, actor, reason);
  if (before !== "needs_human") c.statusBeforeHandoff = before;
  c.needsHumanAt = iso(now);
  c.needsHumanReason = reason;
  if (c.automation.state === "running" || c.automation.state === "finished") {
    setAutomation(s, c, "paused", "Waiting for staff (needs human)", now, "system");
  }
  addEvent(s, c, "handoff_created", "Handed to clinic team", actor, now, reason);
  updateRecipient(s, c, "needs_human", now);
  return c;
}

export function deferCase(s: DemoState, caseId: string, now: Date, actor: Actor, until?: Date, reason?: string) {
  const c = getCase(s, caseId);
  const untilDate = until ?? addMs(now, s.settings.followUp.defaultDeferDays * DAY);
  setStatus(s, c, "deferred", now, actor, reason);
  c.deferredAt = iso(now);
  c.deferredUntil = iso(untilDate);
  c.needsHumanReason = undefined;
  c.sequence.nextStepAt = undefined;
  if (c.automation.state !== "stopped") setAutomation(s, c, "stopped", "Deferred", now, actor === "patient" ? "system" : actor);
  addEvent(s, c, "deferred", "Deferred", actor, now, `Reactivation eligible from ${iso(untilDate)}`);
  updateRecipient(s, c, "deferred", now);
  return c;
}

export function setDeferredUntil(s: DemoState, caseId: string, until: Date, now: Date) {
  const c = getCase(s, caseId);
  if (c.status !== "deferred") throw new DomainError("Only deferred cases have a reactivation date.");
  c.deferredUntil = iso(until);
  addEvent(s, c, "deferred", "Reactivation date changed", "staff", now, iso(until));
}

export function markLost(s: DemoState, caseId: string, reason: string, now: Date) {
  const c = getCase(s, caseId);
  if (!reason.trim()) throw new DomainError("Add a short reason so the team knows why the case closed.");
  setStatus(s, c, "lost", now, "staff", reason);
  c.lostAt = iso(now);
  c.lostReason = reason.trim();
  c.sequence.nextStepAt = undefined;
  if (c.automation.state !== "stopped") setAutomation(s, c, "stopped", "Case closed", now, "staff");
  return c;
}

export function optOut(s: DemoState, patientId: string, now: Date, actor: Actor) {
  const patient = s.patients.find((p) => p.id === patientId);
  if (!patient) throw new DomainError("Patient not found.");
  patient.consent.doNotContact = true;
  patient.consent.automatedFollowUp = false;
  patient.consent.recordedAt = iso(now);
  patient.consent.source = actor === "patient" ? "Patient replied STOP" : "Recorded by staff";
  for (const c of s.cases.filter((x) => x.patientId === patientId)) {
    c.sequence.nextStepAt = undefined;
    if (c.automation.state !== "stopped") setAutomation(s, c, "stopped", "Patient opted out", now, "system");
    if (isOpen(c.status)) setStatus(s, c, "do_not_contact", now, actor, "Opted out of messages");
    addEvent(s, c, "opted_out", "Opted out of messages", actor, now);
    updateRecipient(s, c, "opted_out", now);
  }
}

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

export function staffSendMessage(s: DemoState, caseId: string, body: string, now: Date) {
  const c = getCase(s, caseId);
  const text = body.trim();
  if (!text) throw new DomainError("Write a message before sending.");
  if (text.length > 1000) throw new DomainError("Messages must be under 1,000 characters.");
  const { patient } = caseContext(s, c);
  if (patient.consent.doNotContact) throw new DomainError("This patient opted out. Messages cannot be sent.");
  if (c.automation.state === "running" || c.automation.state === "finished" || c.automation.state === "paused") {
    setAutomation(s, c, "staff", `Taken over by ${s.settings.staff.currentUser}`, now, "staff");
  }
  const channel = channelFor(s, patient);
  const result = sendDelivery(s, patient, channel, text);
  addMessage(s, c, {
    at: iso(now),
    sender: "staff",
    staffName: s.settings.staff.currentUser,
    body: text,
    channel,
    kind: "staff",
    delivery: result.status,
  });
  addEvent(s, c, "staff_message", "Staff replied", "staff", now);
  c.lastContactAt = iso(now);
  c.unread = false;
  return c;
}

function recordPatientMessage(s: DemoState, c: Case, body: string, now: Date, intent?: Intent) {
  const { patient } = caseContext(s, c);
  addMessage(s, c, {
    at: iso(now),
    sender: "patient",
    body,
    channel: channelFor(s, patient),
    kind: "patient",
    intent: intent ? INTENT_LABEL[intent] : undefined,
  });
  c.lastPatientMessageAt = iso(now);
  c.unread = true;
  addEvent(s, c, "patient_replied", "Patient replied", "patient", now, intent ? INTENT_LABEL[intent] : undefined);
  updateRecipient(s, c, "replied", now);
}

function markEngaged(s: DemoState, c: Case, now: Date) {
  c.engagedAt ??= iso(now);
  if (["pending", "follow_up_active", "deferred", "lost"].includes(c.status)) {
    setStatus(s, c, "engaged", now, "patient");
  }
}

function sendSystem(s: DemoState, c: Case, body: string, now: Date) {
  const { patient } = caseContext(s, c);
  const channel = channelFor(s, patient);
  const result = sendDelivery(s, patient, channel, body);
  addMessage(s, c, { at: iso(now), sender: "system", body, channel, kind: "confirmation", delivery: result.status });
}

function handleOptOut(s: DemoState, c: Case, now: Date) {
  const { patient } = caseContext(s, c);
  // The opt-out confirmation is a compliance message, sent once, before the block applies.
  if (!patient.consent.doNotContact) {
    sendSystem(
      s,
      c,
      `You won't receive any more messages from ${s.settings.clinic.name} through this service. If you need anything, you can call ${s.settings.clinic.phone}.`,
      now,
    );
  }
  optOut(s, c.patientId, now, "patient");
}

/** Offer bookable slots in the conversation. */
export function offerSlots(s: DemoState, c: Case, now: Date) {
  const { provider, appointmentType, category, patient } = caseContext(s, c);
  if (!s.settings.booking.allowPatientSelfBooking) {
    sendAi(s, c, "The clinic team will contact you to arrange a time.", now);
    markNeedsHuman(s, c.id, "Patient wants to book — self-booking is off", now, "ai");
    return [];
  }
  const slots = findSlots(s, {
    appointmentTypeId: appointmentType.id,
    providerId: provider.id,
    patientId: patient.id,
    now,
  });
  if (!slots.length) {
    sendAi(s, c, `I couldn't find an open time in the next ${s.settings.booking.horizonDays} days. I've asked the clinic team to contact you.`, now);
    markNeedsHuman(s, c.id, "Patient wants to book — no open slots found", now, "ai");
    return [];
  }
  sendAi(
    s,
    c,
    `Here are the next available times for your ${category.patientLabel} with ${provider.name} (about ${appointmentType.durationMin} minutes). Choose the one that suits you:`,
    now,
    { kind: "slot_offer", slots },
  );
  return slots;
}

/** Patient tapped one of the quick-reply buttons. */
export function patientAction(s: DemoState, caseId: string, action: PatientAction, now: Date) {
  const c = getCase(s, caseId);
  const { patient } = caseContext(s, c);
  if (patient.consent.doNotContact && action !== "stop") {
    throw new DomainError("This patient opted out. CaseFlow will not respond on this case.");
  }
  recordPatientMessage(s, c, ACTION_LABEL[action], now, action === "stop" ? "opt_out" : action === "not_now" ? "not_now" : action === "contact" ? "contact" : "book");

  if (action === "stop") {
    handleOptOut(s, c, now);
    return c;
  }
  if (c.status === "scheduled" || c.status === "completed") return c;

  const aiAllowed = assistantMayReply(c.automation.state);
  if (action === "not_now") {
    if (aiAllowed) {
      sendAi(s, c, "No problem. We'll leave it there for now. You can message us whenever you're ready, or reply STOP if you'd prefer no further messages.", now);
    }
    c.engagedAt ??= iso(now);
    deferCase(s, c.id, now, "patient", undefined, "Patient chose Not now");
    return c;
  }

  markEngaged(s, c, now);
  if (action === "contact") {
    if (aiAllowed) sendAi(s, c, `Thanks — I've let the clinic team know. Someone will contact you soon, or you can call ${s.settings.clinic.phone}.`, now);
    if (c.automation.state !== "staff") markNeedsHuman(s, c.id, "Patient asked the clinic to contact them", now, "patient");
    return c;
  }
  // book
  if (aiAllowed) offerSlots(s, c, now);
  return c;
}

/** Patient typed a free-text message. */
export function patientText(s: DemoState, caseId: string, text: string, now: Date) {
  const c = getCase(s, caseId);
  const body = text.trim();
  if (!body) throw new DomainError("Type a patient message first.");
  const { patient, appointmentType } = caseContext(s, c);
  const settings = s.settings;

  // Guardrail 1: opt-out is always honoured, whatever the automation state.
  if (isOptOut(body, settings)) {
    recordPatientMessage(s, c, body, now, "opt_out");
    handleOptOut(s, c, now);
    return c;
  }
  if (patient.consent.doNotContact) {
    recordPatientMessage(s, c, body, now);
    return c;
  }

  // Guardrail 2: clinical questions are never answered automatically.
  if (isClinicalQuestion(body, settings)) {
    recordPatientMessage(s, c, body, now, "clinical");
    if (!isOpen(c.status)) {
      if (assistantMayReply(c.automation.state)) sendAi(s, c, GUARDRAIL_REPLY, now, { kind: "handoff" });
      return c;
    }
    markEngaged(s, c, now);
    if (assistantMayReply(c.automation.state)) sendAi(s, c, GUARDRAIL_REPLY, now, { kind: "handoff" });
    if (c.automation.state !== "staff") {
      markNeedsHuman(s, c.id, "Clinical question — needs the dentist or clinic team", now, "ai");
    }
    return c;
  }

  const decision = integrations.assistant.respond({
    text: body,
    settings,
    appointmentDurationMin: appointmentType.durationMin,
    appointmentTypeName: appointmentType.name,
  });
  recordPatientMessage(s, c, body, now, decision.intent);
  if (c.status === "scheduled" || c.status === "completed") {
    // Booked patients: answer admin questions only; never re-offer booking.
    if (assistantMayReply(c.automation.state) && decision.reply && !decision.offerSlots) sendAi(s, c, decision.reply, now);
    return c;
  }

  if (decision.defer) {
    if (assistantMayReply(c.automation.state) && decision.reply) sendAi(s, c, decision.reply, now);
    c.engagedAt ??= iso(now);
    deferCase(s, c.id, now, "patient", undefined, "Patient asked to wait");
    return c;
  }

  markEngaged(s, c, now);
  if (!assistantMayReply(c.automation.state)) return c; // staff handles it

  if (decision.offerSlots) {
    offerSlots(s, c, now);
    return c;
  }
  if (decision.reply) {
    sendAi(s, c, decision.reply, now, { actions: decision.actions, kind: decision.handoffReason ? "handoff" : "reply" });
  }
  if (decision.handoffReason) markNeedsHuman(s, c.id, decision.handoffReason, now, "ai");
  return c;
}

export function markRead(s: DemoState, caseId: string) {
  getCase(s, caseId).unread = false;
}

/* ------------------------------------------------------------------ */
/* Appointments                                                        */
/* ------------------------------------------------------------------ */

export function patientSelectSlot(s: DemoState, caseId: string, slot: SlotOption, now: Date) {
  const c = getCase(s, caseId);
  if (c.status === "scheduled") throw new DomainError("This patient already has a treatment appointment booked.");
  recordPatientMessage(s, c, `Selected ${formatSlot(slot.start, s.settings)}`, now, "book");
  markEngaged(s, c, now);
  return bookAppointment(s, caseId, slot, now, "patient");
}

export function bookAppointment(s: DemoState, caseId: string, slot: SlotOption, now: Date, by: "patient" | "staff") {
  const c = getCase(s, caseId);
  const { patient, provider } = caseContext(s, c);
  if (c.status === "scheduled") throw new DomainError("This case already has a booked appointment. Reschedule it instead.");
  if (c.status === "completed") throw new DomainError("This case is completed.");
  if (by === "patient" && patient.consent.doNotContact) throw new DomainError("This patient opted out.");

  const conflict = findConflict(s, slot, { patientId: patient.id, now });
  if (conflict) {
    if (by === "patient" && assistantMayReply(c.automation.state)) {
      sendAi(s, c, "Sorry, that time is no longer available.", now);
      offerSlots(s, c, now);
      return null;
    }
    throw new DomainError(conflict);
  }
  const external = integrations.booking.confirm(slot);
  if (!external.ok) throw new DomainError(external.reason);

  const slotProvider = s.settings.providers.find((p) => p.id === slot.providerId) ?? provider;
  const appt: Appointment = {
    id: newId(s, "appt"),
    caseId: c.id,
    patientId: patient.id,
    providerId: slot.providerId,
    appointmentTypeId: slot.appointmentTypeId,
    start: slot.start,
    end: slot.end,
    status: "booked",
    bookedBy: by,
    createdAt: iso(now),
  };
  s.appointments.push(appt);

  if (by === "patient") c.engagedAt ??= iso(now);
  setStatus(s, c, "scheduled", now, by, "Appointment booked");
  c.scheduledAt = iso(now);
  c.appointmentId = appt.id;
  c.needsHumanReason = undefined;
  c.statusBeforeHandoff = undefined;
  c.recovered = !!c.followUpStartedAt;
  c.recoveredVia = !c.followUpStartedAt
    ? undefined
    : by === "staff"
      ? "staff_after_follow_up"
      : c.sequence.kind === "reactivation"
        ? "reactivation"
        : "follow_up";
  c.sequence.nextStepAt = undefined;
  setAutomation(s, c, "stopped", "Appointment booked", now, "system");
  // A self-service booking needs no staff reply.
  c.unread = false;
  addEvent(
    s,
    c,
    "appointment_booked",
    by === "patient" ? "Appointment booked by patient" : "Appointment booked by staff",
    by,
    now,
    `${formatSlot(slot.start, s.settings)} · ${slotProvider.name}`,
  );
  updateRecipient(s, c, "scheduled", now);

  if (!patient.consent.doNotContact) {
    sendSystem(
      s,
      c,
      `Booked: ${formatSlot(slot.start, s.settings)} with ${slotProvider.name} at ${s.settings.clinic.name}, ${s.settings.clinic.address}. To change it, reply here or call ${s.settings.clinic.phone}.`,
      now,
    );
  }
  return appt;
}

export function rescheduleAppointment(s: DemoState, appointmentId: string, slot: SlotOption, now: Date) {
  const appt = s.appointments.find((a) => a.id === appointmentId);
  if (!appt || appt.status !== "booked") throw new DomainError("Only booked appointments can be rescheduled.");
  const conflict = findConflict(s, slot, { patientId: appt.patientId, excludeAppointmentId: appt.id, now });
  if (conflict) throw new DomainError(conflict);
  const previous = appt.start;
  appt.start = slot.start;
  appt.end = slot.end;
  appt.providerId = slot.providerId;
  if (appt.caseId) {
    const c = getCase(s, appt.caseId);
    const { patient } = caseContext(s, c);
    addEvent(s, c, "appointment_rescheduled", "Appointment rescheduled", "staff", now, `${formatSlot(previous, s.settings)} → ${formatSlot(slot.start, s.settings)}`);
    if (!patient.consent.doNotContact) {
      sendSystem(s, c, `Your appointment at ${s.settings.clinic.name} has moved to ${formatSlot(slot.start, s.settings)}.`, now);
    }
  }
  return appt;
}

export function cancelAppointment(s: DemoState, appointmentId: string, reason: string, now: Date) {
  const appt = s.appointments.find((a) => a.id === appointmentId);
  if (!appt || appt.status !== "booked") throw new DomainError("Only booked appointments can be cancelled.");
  if (!reason.trim()) throw new DomainError("Add a cancellation reason.");
  appt.status = "cancelled";
  appt.cancelReason = reason.trim();
  if (appt.caseId) {
    const c = getCase(s, appt.caseId);
    const { patient } = caseContext(s, c);
    addEvent(s, c, "appointment_cancelled", "Appointment cancelled", "staff", now, reason.trim());
    if (c.status === "scheduled") {
      c.engagedAt ??= iso(now);
      setStatus(s, c, "engaged", now, "staff", "Appointment cancelled");
      c.scheduledAt = undefined;
      c.appointmentId = undefined;
      c.recovered = false;
      c.recoveredVia = undefined;
      if (!patient.consent.doNotContact) setAutomation(s, c, "staff", "Appointment cancelled — staff to follow up", now, "staff");
    }
    if (!patient.consent.doNotContact) {
      sendSystem(s, c, `Your appointment on ${formatSlot(appt.start, s.settings)} has been cancelled. Reply here or call ${s.settings.clinic.phone} to choose a new time.`, now);
    }
  }
  return appt;
}

export function completeAppointment(s: DemoState, appointmentId: string, now: Date) {
  const appt = s.appointments.find((a) => a.id === appointmentId);
  if (!appt || appt.status !== "booked") throw new DomainError("Only booked appointments can be marked attended.");
  if (new Date(appt.start) > now) throw new DomainError("This appointment has not started yet.");
  appt.status = "completed";
  if (appt.caseId) {
    const c = getCase(s, appt.caseId);
    setStatus(s, c, "completed", now, "staff", "Patient attended");
    c.completedAt = iso(now);
    addEvent(s, c, "appointment_completed", "Appointment attended", "staff", now);
  }
  return appt;
}

export function addNote(s: DemoState, caseId: string, body: string, now: Date) {
  const c = getCase(s, caseId);
  const text = body.trim();
  if (!text) throw new DomainError("Write a note first.");
  s.notes.push({ id: newId(s, "note"), caseId: c.id, at: iso(now), author: s.settings.staff.currentUser, body: text });
  addEvent(s, c, "note_added", "Internal note added", "staff", now);
}

/* ------------------------------------------------------------------ */
/* Reactivation / campaigns                                            */
/* ------------------------------------------------------------------ */

export function reactivationEligibility(s: DemoState, c: Case, now: Date): { eligible: boolean; reason: string; from?: string } {
  const { patient } = caseContext(s, c);
  const block = automatedMessagingBlock(s, patient);
  if (block) return { eligible: false, reason: block };
  const after = s.settings.followUp.reactivationEligibleAfterDays * DAY;
  if (c.status === "deferred") {
    const from = c.deferredUntil ?? iso(addMs(c.deferredAt ?? c.statusChangedAt, after));
    return new Date(from) <= now
      ? { eligible: true, reason: "Deferral period ended", from }
      : { eligible: false, reason: "Deferral period has not ended", from };
  }
  if (c.status === "lost" && c.lostReason === "No response after the follow-up sequence") {
    const from = iso(addMs(c.lostAt ?? c.statusChangedAt, after));
    return new Date(from) <= now
      ? { eligible: true, reason: "No response, closed over 30 days ago", from }
      : { eligible: false, reason: "Closed recently", from };
  }
  return { eligible: false, reason: `Case is ${STATUS_LABEL[c.status]}` };
}

export function followUpEligibility(s: DemoState, c: Case): { eligible: boolean; reason: string } {
  const block = automatedMessagingBlock(s, caseContext(s, c).patient);
  if (block) return { eligible: false, reason: block };
  if (c.status !== "pending") return { eligible: false, reason: `Case is ${STATUS_LABEL[c.status]}` };
  return { eligible: true, reason: "Pending, follow-up not started" };
}

export interface NewCampaignInput {
  name: string;
  kind: "reactivation" | "follow_up";
  categoryIds: string[];
  caseIds: string[];
  body: string;
  channel: Channel;
}

export function createCampaign(s: DemoState, input: NewCampaignInput, now: Date) {
  if (!input.name.trim()) throw new DomainError("Give the campaign a name.");
  if (!input.caseIds.length) throw new DomainError("Choose at least one recipient.");
  const campaign = {
    id: newId(s, "camp"),
    name: input.name.trim(),
    kind: input.kind,
    audience: {
      statuses: (input.kind === "reactivation" ? ["deferred", "lost"] : ["pending"]) as CaseStatus[],
      categoryIds: input.categoryIds,
    },
    body: input.body,
    channel: input.channel,
    status: "draft" as const,
    approval: {},
    createdAt: iso(now),
    createdBy: s.settings.staff.currentUser,
    recipients: input.caseIds.map((caseId) => ({ caseId, state: "queued" as RecipientState })),
    activity: [{ at: iso(now), label: `Draft created by ${s.settings.staff.currentUser}` }],
  };
  s.campaigns.push(campaign);
  return campaign;
}

export function updateCampaignDraft(s: DemoState, id: string, patch: Partial<Pick<NewCampaignInput, "name" | "body" | "channel">>) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp) throw new DomainError("Campaign not found.");
  if (camp.status !== "draft" && camp.status !== "approved") throw new DomainError("Only drafts can be edited.");
  Object.assign(camp, patch);
  if (camp.status === "approved") {
    camp.status = "draft";
    camp.approval = {};
  }
}

export function approveCampaign(s: DemoState, id: string, approver: string, now: Date) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp) throw new DomainError("Campaign not found.");
  if (camp.status !== "draft") throw new DomainError("Only drafts can be approved.");
  const v = validateTemplate(camp.body);
  if (!v.ok) throw new DomainError(`Fix the message first: ${v.errors[0]}`);
  if (!approver.trim()) throw new DomainError("Enter the approver's name.");
  camp.status = "approved";
  camp.approval = { approvedBy: approver.trim(), approvedAt: iso(now) };
  camp.activity.push({ at: iso(now), label: `Approved by ${approver.trim()}` });
}

export function launchCampaign(s: DemoState, id: string, now: Date) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp) throw new DomainError("Campaign not found.");
  if (camp.status !== "approved") throw new DomainError("A campaign must be approved before launch.");
  let sent = 0;
  for (const r of camp.recipients) {
    const c = getCase(s, r.caseId);
    const elig = camp.kind === "reactivation" ? reactivationEligibility(s, c, now) : followUpEligibility(s, c);
    if (!elig.eligible) {
      r.state = "skipped";
      r.skipReason = elig.reason;
      continue;
    }
    const steps = camp.kind === "reactivation" ? reactivationSteps(s, camp.body) : standardSteps(s, camp.body);
    beginSequence(s, c, { kind: camp.kind === "reactivation" ? "reactivation" : "standard", steps }, now, "staff", camp.id);
    r.state = "delivered";
    r.sentAt = iso(now);
    sent++;
  }
  camp.status = "running";
  camp.launchedAt = iso(now);
  const skipped = camp.recipients.length - sent;
  camp.activity.push({
    at: iso(now),
    label: `Simulated launch: ${sent} message${sent === 1 ? "" : "s"} sent${skipped ? `, ${skipped} skipped` : ""}`,
  });
  return { sent, skipped };
}

function campaignCases(s: DemoState, id: string) {
  return s.cases.filter((c) => c.campaignId === id);
}

export function pauseCampaign(s: DemoState, id: string, now: Date) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp || camp.status !== "running") throw new DomainError("Only running campaigns can be paused.");
  for (const c of campaignCases(s, id)) {
    if (c.automation.state === "running") setAutomation(s, c, "paused", "Campaign paused", now, "staff");
  }
  camp.status = "paused";
  camp.activity.push({ at: iso(now), label: "Campaign paused — no further automated messages" });
}

export function resumeCampaign(s: DemoState, id: string, now: Date) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp || camp.status !== "paused") throw new DomainError("Only paused campaigns can be resumed.");
  for (const c of campaignCases(s, id)) {
    if (c.automation.state === "paused" && c.automation.reason === "Campaign paused") {
      setAutomation(s, c, "running", "Campaign resumed", now, "staff");
    }
  }
  camp.status = "running";
  camp.activity.push({ at: iso(now), label: "Campaign resumed" });
}

export function stopCampaign(s: DemoState, id: string, now: Date) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp || !["running", "paused", "draft", "approved"].includes(camp.status)) {
    throw new DomainError("This campaign has already ended.");
  }
  for (const c of campaignCases(s, id)) {
    if (["running", "paused"].includes(c.automation.state) && c.status === "follow_up_active") {
      c.sequence.nextStepAt = undefined;
      setAutomation(s, c, "stopped", "Campaign stopped", now, "staff");
    }
  }
  camp.status = "stopped";
  camp.endedAt = iso(now);
  camp.activity.push({ at: iso(now), label: "Campaign stopped" });
}

/** Deterministic pseudo-random in [0, 1) from a string. */
export function hashUnit(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

const SIM_ADMIN_QUESTIONS = ["Is there parking near the clinic?", "Do you accept UPI?", "What are your timings on Saturday?"];
const SIM_CLINICAL_QUESTIONS = ["Do I really need this treatment now?", "Will this hurt?", "Can this heal on its own?"];

/**
 * Demo only: simulate how recipients who have not replied might respond.
 * Every simulated reply goes through the real engine, guardrails included.
 */
export function simulateCampaignResponses(s: DemoState, id: string, now: Date) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp || !["running", "paused"].includes(camp.status)) throw new DomainError("Launch the campaign before simulating replies.");
  const outcome = { booked: 0, questions: 0, needsHuman: 0, deferred: 0, optedOut: 0, noReply: 0 };
  let minute = 0;
  for (const r of camp.recipients) {
    if (r.state !== "delivered") continue;
    const c = getCase(s, r.caseId);
    const roll = hashUnit(`${c.id}:${camp.id}`);
    const at = addMs(now, ++minute * 60_000);
    if (roll < 0.4) {
      patientAction(s, c.id, "book", at);
      const offer = [...s.messages].reverse().find((m) => m.caseId === c.id && m.kind === "slot_offer");
      if (offer?.slots?.length && c.status !== "needs_human") {
        patientSelectSlot(s, c.id, offer.slots[Math.floor(roll * 10) % offer.slots.length], addMs(at, 60_000));
        outcome.booked++;
      }
    } else if (roll < 0.55) {
      patientText(s, c.id, SIM_ADMIN_QUESTIONS[Math.floor(roll * 100) % SIM_ADMIN_QUESTIONS.length], at);
      outcome.questions++;
    } else if (roll < 0.67) {
      patientText(s, c.id, SIM_CLINICAL_QUESTIONS[Math.floor(roll * 100) % SIM_CLINICAL_QUESTIONS.length], at);
      outcome.needsHuman++;
    } else if (roll < 0.77) {
      patientAction(s, c.id, "not_now", at);
      outcome.deferred++;
    } else if (roll < 0.82) {
      patientAction(s, c.id, "stop", at);
      outcome.optedOut++;
    } else {
      outcome.noReply++;
    }
  }
  camp.activity.push({
    at: iso(now),
    label: `Simulated replies: ${outcome.booked} booked, ${outcome.questions} questions, ${outcome.needsHuman} handed to staff, ${outcome.deferred} not now, ${outcome.optedOut} opted out, ${outcome.noReply} no reply`,
  });
  return outcome;
}

/** Recipient metrics for campaign screens. */
export function campaignStats(s: DemoState, id: string) {
  const camp = s.campaigns.find((x) => x.id === id);
  if (!camp) return null;
  const rs = camp.recipients;
  const sent = rs.filter((r) => r.sentAt).length;
  const replied = rs.filter((r) => r.repliedAt).length;
  const replyTimes = rs
    .filter((r) => r.sentAt && r.repliedAt)
    .map((r) => new Date(r.repliedAt!).getTime() - new Date(r.sentAt!).getTime());
  const messages = s.messages.filter((m) => m.campaignId === id).length;
  return {
    recipients: rs.length,
    messages,
    sent,
    delivered: sent,
    skipped: rs.filter((r) => r.state === "skipped").length,
    replied,
    scheduled: rs.filter((r) => r.state === "scheduled").length,
    optedOut: rs.filter((r) => r.state === "opted_out").length,
    needsHuman: rs.filter((r) => r.state === "needs_human").length,
    deferred: rs.filter((r) => r.state === "deferred").length,
    avgReplyMs: replyTimes.length ? replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length : null,
  };
}
