/**
 * CaseFlow domain model.
 *
 * Every entity here is synthetic demo data. Timestamps are ISO-8601 UTC strings;
 * display and scheduling logic convert them to the clinic's configured timezone.
 */

export type CountryCode = "IN" | "AU" | "GB" | "US";
export type Channel = "whatsapp" | "sms" | "email";

export type CaseStatus =
  | "pending"
  | "follow_up_active"
  | "engaged"
  | "scheduled"
  | "completed"
  | "deferred"
  | "lost"
  | "needs_human"
  | "do_not_contact";

/**
 * Automation is tracked separately from the business status so staff can always
 * see whether CaseFlow is allowed to send or reply on a case.
 */
export type AutomationState =
  | "not_started"
  | "running"
  | "paused"
  | "staff"
  | "stopped"
  | "finished";

export type Actor = "system" | "ai" | "staff" | "patient";

export type PatientAction = "book" | "contact" | "not_now" | "stop";

export interface Consent {
  /** Patient agreed to receive automated administrative follow-up messages. */
  automatedFollowUp: boolean;
  /** Patient opted out of all messages. Overrides everything else. */
  doNotContact: boolean;
  recordedAt: string;
  source: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredChannel: Channel;
  consent: Consent;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  categoryId: string;
  providerId: string;
  presentedAt: string;
  /** Estimated treatment value in the clinic currency. Internal only — never sent to patients. */
  estimatedValue: number;
  /** Administrative summary only. No clinical detail. */
  summary: string;
  source: "manual" | "pms_import" | "demo_seed";
  caseId: string;
}

export interface SequenceStepSnapshot {
  id: string;
  dayOffset: number;
  label: string;
  templateId?: string;
  body?: string;
}

export interface CaseSequence {
  kind: "standard" | "reactivation";
  steps: SequenceStepSnapshot[];
  /** Index of the next step to send. Equal to steps.length when all steps were sent. */
  stepIndex: number;
  startedAt?: string;
  nextStepAt?: string;
  lastSentAt?: string;
  sentCount: number;
}

export interface Automation {
  state: AutomationState;
  reason?: string;
  updatedAt: string;
}

export interface Case {
  id: string;
  planId: string;
  patientId: string;
  status: CaseStatus;
  statusChangedAt: string;
  automation: Automation;
  sequence: CaseSequence;
  /** True once at least one CaseFlow follow-up message was sent for this case. */
  followUpStartedAt?: string;
  engagedAt?: string;
  scheduledAt?: string;
  completedAt?: string;
  deferredAt?: string;
  deferredUntil?: string;
  lostAt?: string;
  lostReason?: string;
  needsHumanAt?: string;
  needsHumanReason?: string;
  /** Status to return to when a needs-human handoff is resolved. */
  statusBeforeHandoff?: CaseStatus;
  /** Scheduled after CaseFlow outreach — the north-star outcome. */
  recovered: boolean;
  recoveredVia?: "follow_up" | "reactivation" | "staff_after_follow_up";
  appointmentId?: string;
  campaignId?: string;
  lastContactAt?: string;
  lastPatientMessageAt?: string;
  unread: boolean;
}

export interface SlotOption {
  start: string;
  end: string;
  providerId: string;
  appointmentTypeId: string;
}

export interface Message {
  id: string;
  caseId: string;
  at: string;
  sender: Actor;
  body: string;
  channel: Channel;
  kind:
    | "follow_up"
    | "reply"
    | "slot_offer"
    | "confirmation"
    | "handoff"
    | "campaign"
    | "staff"
    | "patient"
    | "event";
  actions?: PatientAction[];
  slots?: SlotOption[];
  delivery?: "sent" | "delivered" | "read" | "failed";
  /** Assistant intent classification for inbound patient messages (shown to staff). */
  intent?: string;
  staffName?: string;
  campaignId?: string;
  /** Sequence step that produced this message. */
  stepId?: string;
}

export type CaseEventType =
  | "plan_presented"
  | "status_changed"
  | "follow_up_started"
  | "follow_up_sent"
  | "follow_up_scheduled"
  | "follow_up_held"
  | "patient_replied"
  | "assistant_replied"
  | "handoff_created"
  | "automation_changed"
  | "appointment_booked"
  | "appointment_rescheduled"
  | "appointment_cancelled"
  | "appointment_completed"
  | "opted_out"
  | "deferred"
  | "note_added"
  | "campaign_added"
  | "staff_message";

export interface CaseEvent {
  id: string;
  caseId: string;
  at: string;
  type: CaseEventType;
  label: string;
  actor: Actor;
  detail?: string;
}

export interface Note {
  id: string;
  caseId: string;
  at: string;
  author: string;
  body: string;
}

export type AppointmentStatus = "booked" | "cancelled" | "completed";

export interface Appointment {
  id: string;
  caseId?: string;
  patientId?: string;
  /** Free-text label for calendar entries that come from the (simulated) practice system. */
  label?: string;
  providerId: string;
  appointmentTypeId: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  bookedBy: "patient" | "staff" | "pms";
  createdAt: string;
  cancelReason?: string;
}

export type CampaignStatus = "draft" | "approved" | "running" | "paused" | "stopped" | "completed";
export type CampaignKind = "reactivation" | "follow_up";

export type RecipientState =
  | "queued"
  | "skipped"
  | "delivered"
  | "replied"
  | "scheduled"
  | "opted_out"
  | "needs_human"
  | "deferred";

export interface CampaignRecipient {
  caseId: string;
  state: RecipientState;
  sentAt?: string;
  repliedAt?: string;
  skipReason?: string;
}

export interface Campaign {
  id: string;
  name: string;
  kind: CampaignKind;
  audience: {
    statuses: CaseStatus[];
    categoryIds: string[];
  };
  body: string;
  channel: Channel;
  status: CampaignStatus;
  approval: { approvedBy?: string; approvedAt?: string };
  createdAt: string;
  createdBy: string;
  launchedAt?: string;
  endedAt?: string;
  recipients: CampaignRecipient[];
  activity: { at: string; label: string }[];
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface DayHours {
  open: boolean;
  start: string; // "HH:MM"
  end: string;
  breakStart?: string;
  breakEnd?: string;
}

export interface Provider {
  id: string;
  name: string;
  title: string;
  active: boolean;
}

export interface AppointmentType {
  id: string;
  name: string;
  durationMin: number;
}

export interface TreatmentCategory {
  id: string;
  name: string;
  /** Wording used in patient messages, e.g. "crown appointment". */
  patientLabel: string;
  appointmentTypeId: string;
  active: boolean;
}

export interface MessageTemplate {
  id: string;
  name: string;
  purpose: string;
  body: string;
}

export interface FollowUpStep {
  id: string;
  dayOffset: number;
  label: string;
  templateId: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
}

export interface ClinicSettings {
  clinic: {
    name: string;
    country: CountryCode;
    currency: string;
    locale: string;
    timezone: string;
    address: string;
    phone: string;
    email: string;
  };
  workingHours: Record<number, DayHours>; // 0 = Sunday
  providers: Provider[];
  appointmentTypes: AppointmentType[];
  categories: TreatmentCategory[];
  booking: {
    minNoticeHours: number;
    horizonDays: number;
    slotIntervalMin: number;
    bufferMin: number;
    slotsOffered: number;
    allowPatientSelfBooking: boolean;
  };
  followUp: {
    steps: FollowUpStep[];
    autoCloseAfterDays: number;
    defaultDeferDays: number;
    reactivationReminderDays: number;
    reactivationEligibleAfterDays: number;
  };
  templates: MessageTemplate[];
  knowledge: {
    bookingProcess: string;
    paymentMethods: string;
    financing: string;
    parking: string;
    cancellationPolicy: string;
    otherPolicies: string;
  };
  faqs: Faq[];
  notifications: {
    needsHumanAlert: boolean;
    bookingAlert: boolean;
    dailyDigest: boolean;
    digestTime: string;
    alertEmail: string;
  };
  escalation: {
    escalateUnknownQuestions: boolean;
    escalateCostQuestions: boolean;
    extraClinicalKeywords: string[];
    assignTo: string;
  };
  consent: {
    requireAutomationConsent: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    stopKeywords: string[];
  };
  channels: { default: Channel; enabled: Channel[] };
  roi: { monthlySoftwareCost: number };
  staff: { currentUser: string; role: string };
}

/* ------------------------------------------------------------------ */
/* Aggregate                                                           */
/* ------------------------------------------------------------------ */

export interface DemoState {
  schemaVersion: number;
  seededAt: string;
  clockOffsetMs: number;
  seq: number;
  settings: ClinicSettings;
  patients: Patient[];
  plans: TreatmentPlan[];
  cases: Case[];
  messages: Message[];
  events: CaseEvent[];
  notes: Note[];
  appointments: Appointment[];
  campaigns: Campaign[];
}
