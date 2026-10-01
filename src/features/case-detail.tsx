"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  CheckCircle,
  ClockClockwise,
  Hourglass,
  PaperPlaneTilt,
  Play,
  Prohibit,
  XCircle,
} from "@phosphor-icons/react";
import { CHANNEL_LABEL } from "@/lib/domain/countries";
import {
  addNote,
  bookAppointment,
  cancelAppointment,
  caseContext,
  completeAppointment,
  deferCase,
  markLost,
  optOut,
  reactivationEligibility,
  rescheduleAppointment,
  rescheduleNextStep,
  returnToAutomation,
  sendNextStepNow,
  setDeferredUntil,
  startFollowUp,
} from "@/lib/domain/engine";
import { formatDate, formatDateTime, formatMoney, formatRelative, formatSlot } from "@/lib/domain/format";
import { STATUS_DESCRIPTION } from "@/lib/domain/status";
import { DAY, zonedTimeToUtc } from "@/lib/domain/time";
import type { Case, DemoState } from "@/lib/domain/types";
import { nextAction, patientName } from "@/lib/selectors";
import { useDemoState, useNow, useStore } from "@/lib/store";
import { ActorTag, AutomationIndicator, StatusBadge } from "@/components/status";
import { ToneText } from "@/components/tone";
import { Badge, Button, ButtonLink, Card, CardHeader, DemoTag, Dialog, Dl, EmptyState, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { ConversationPanel } from "./conversation";
import { SlotPickerDialog } from "./slot-picker";

type DialogKind = null | "book" | "reschedule" | "cancel" | "lost" | "defer" | "deferDate" | "followup" | "optout";

/** yyyy-mm-dd in the clinic timezone, for date inputs. */
function dateInput(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

export function CaseDetail({ id }: { id: string }) {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const c = s.cases.find((x) => x.id === id);

  if (!c) {
    return (
      <Card>
        <EmptyState title="Case not found" action={<ButtonLink href="/cases">Back to cases</ButtonLink>}>
          It may have been removed when the demo was reset.
        </EmptyState>
      </Card>
    );
  }

  const { patient, plan, category, provider, appointmentType } = caseContext(s, c);
  const appt = s.appointments.find((a) => a.id === c.appointmentId);

  return (
    <>
      <PageHeader
        back={{ href: "/cases", label: "Cases" }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {patient.firstName} {patient.lastName}
            <StatusBadge status={c.status} className="align-middle" />
          </span>
        }
        description={
          <>
            {category.name} · {provider.name} · {formatMoney(plan.estimatedValue, s.settings)} <DemoTag />
          </>
        }
        actions={<AutomationIndicator state={c.automation.state} />}
      />

      <NextStepBar s={s} c={c} now={now} open={setDialog} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-5">
        <div className="flex min-w-0 flex-col gap-4 xl:gap-5">
          <Card className="overflow-hidden">
            <ConversationPanel s={s} c={c} />
          </Card>
          <TimelineCard s={s} c={c} />
        </div>

        <div className="flex flex-col gap-4 xl:gap-5">
          <Card>
            <CardHeader title="Patient & plan" />
            <div className="px-4 pb-5 sm:px-5">
              <Dl
                items={[
                  { label: "Treatment", value: category.name },
                  { label: "Provider", value: provider.name },
                  { label: "Presented", value: `${formatDate(plan.presentedAt, s.settings)} (${formatRelative(plan.presentedAt, now, s.settings)})` },
                  { label: "Estimated value", value: <span className="inline-flex items-center gap-1.5">{formatMoney(plan.estimatedValue, s.settings)} <DemoTag /></span> },
                  { label: "Phone", value: <span className="tnum">{patient.phone}</span> },
                  { label: "Channel", value: CHANNEL_LABEL[patient.preferredChannel] },
                  {
                    label: "Consent",
                    value: patient.consent.doNotContact ? (
                      <Badge className="bg-danger-soft text-danger">Do not contact</Badge>
                    ) : patient.consent.automatedFollowUp ? (
                      "Automated messages allowed"
                    ) : (
                      <Badge className="bg-warn-soft text-[#8a4b04]">Call only</Badge>
                    ),
                  },
                ]}
              />
              {plan.summary && <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-[12.5px] text-ink-2">{plan.summary}</p>}
              <Link href={`/plans/${plan.id}`} className="mt-3 inline-block text-[13px] font-medium text-brand no-underline hover:underline">
                View treatment plan
              </Link>
            </div>
          </Card>

          <Card>
            <CardHeader title="Appointment" />
            <div className="px-4 pb-5 sm:px-5">
              {appt ? (
                <div className="flex flex-col gap-3">
                  <div className="rounded-lg border border-brand/25 bg-brand-soft/50 px-3 py-2.5">
                    <p className="text-sm font-semibold text-brand-ink">{formatSlot(appt.start, s.settings)}</p>
                    <p className="text-[12.5px] text-brand-ink/80">
                      {s.settings.appointmentTypes.find((t) => t.id === appt.appointmentTypeId)?.name} · {s.settings.providers.find((p) => p.id === appt.providerId)?.name}
                    </p>
                    <p className="mt-1 text-[12px] text-muted">Booked by {appt.bookedBy === "patient" ? "the patient via CaseFlow" : "staff"} · {appt.status === "completed" ? "Attended" : "Confirmed"}</p>
                  </div>
                  {appt.status === "booked" && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" icon={<ClockClockwise size={15} />} onClick={() => setDialog("reschedule")}>
                        Reschedule
                      </Button>
                      <Button size="sm" variant="danger" icon={<CalendarX size={15} />} onClick={() => setDialog("cancel")}>
                        Cancel
                      </Button>
                      {new Date(appt.start) <= now && (
                        <Button size="sm" icon={<CheckCircle size={15} />} onClick={() => act((d, n) => completeAppointment(d, appt.id, n), "Marked attended. Case completed.")}>
                          Mark attended
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-[13px] text-muted">No treatment appointment booked.</p>
                  {c.status !== "completed" && (
                    <Button size="sm" icon={<CalendarPlus size={15} />} onClick={() => setDialog("book")}>
                      Book for patient
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>

          <SequenceCard s={s} c={c} now={now} open={setDialog} />
          <NotesCard s={s} c={c} />
          {!patient.consent.doNotContact && (
            <div className="px-1">
              <button type="button" onClick={() => setDialog("optout")} className="text-[12.5px] text-muted underline hover:text-danger">
                Record opt-out from patient (phone or in person)
              </button>
            </div>
          )}
        </div>
      </div>

      <SlotPickerDialog
        open={dialog === "book"}
        onClose={() => setDialog(null)}
        s={s}
        now={now}
        title={`Book ${category.name.toLowerCase()} for ${patient.firstName}`}
        appointmentTypeId={appointmentType.id}
        defaultProviderId={provider.id}
        patientId={patient.id}
        confirmLabel="Book appointment"
        onConfirm={(slot) => act((d, n) => bookAppointment(d, c.id, slot, n, "staff"), `Booked ${formatSlot(slot.start, s.settings)}. Case is now Scheduled.`).ok}
      />
      {appt && (
        <SlotPickerDialog
          open={dialog === "reschedule"}
          onClose={() => setDialog(null)}
          s={s}
          now={now}
          title="Reschedule appointment"
          description={`Currently ${formatSlot(appt.start, s.settings)}`}
          appointmentTypeId={appt.appointmentTypeId}
          defaultProviderId={appt.providerId}
          patientId={patient.id}
          excludeAppointmentId={appt.id}
          confirmLabel="Move appointment"
          onConfirm={(slot) => act((d, n) => rescheduleAppointment(d, appt.id, slot, n), `Moved to ${formatSlot(slot.start, s.settings)}.`).ok}
        />
      )}
      <ReasonDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        title="Cancel appointment"
        description="The case returns to Engaged and staff keep control of the conversation."
        label="Cancellation reason"
        placeholder="e.g. Patient travelling that week"
        confirm="Cancel appointment"
        onConfirm={(reason) => (appt ? act((d, n) => cancelAppointment(d, appt.id, reason, n), "Appointment cancelled.").ok : false)}
      />
      <ReasonDialog
        open={dialog === "lost"}
        onClose={() => setDialog(null)}
        title="Close case as lost"
        description="Automation stops. The case can be reactivated later."
        label="Reason"
        placeholder="e.g. Chose a clinic closer to work"
        confirm="Close case"
        onConfirm={(reason) => act((d, n) => markLost(d, c.id, reason, n), "Case closed as lost.").ok}
      />
      <DateDialog
        open={dialog === "defer" || dialog === "deferDate"}
        onClose={() => setDialog(null)}
        title={dialog === "defer" ? "Defer case" : "Change reactivation date"}
        description="Automation stops. The case becomes eligible for reactivation on this date."
        initial={dateInput(c.deferredUntil ? new Date(c.deferredUntil) : new Date(now.getTime() + s.settings.followUp.defaultDeferDays * DAY), s.settings.clinic.timezone)}
        min={dateInput(now, s.settings.clinic.timezone)}
        confirm={dialog === "defer" ? "Defer case" : "Save date"}
        onConfirm={(date) =>
          act(
            (d, n) => (dialog === "defer" ? deferCase(d, c.id, n, "staff", date, "Deferred by staff") : setDeferredUntil(d, c.id, date, n)),
            `Reactivation date set to ${formatDate(date, s.settings)}.`,
          ).ok
        }
      />
      <DateDialog
        open={dialog === "followup"}
        onClose={() => setDialog(null)}
        title="Reschedule next follow-up"
        description={c.sequence.steps[c.sequence.stepIndex]?.label}
        withTime
        initial={c.sequence.nextStepAt ? toLocalInput(new Date(c.sequence.nextStepAt), s.settings.clinic.timezone) : toLocalInput(new Date(now.getTime() + DAY), s.settings.clinic.timezone)}
        min={toLocalInput(now, s.settings.clinic.timezone)}
        confirm="Reschedule"
        onConfirm={(date) => act((d, n) => rescheduleNextStep(d, c.id, date, n), `Next follow-up set for ${formatDateTime(date, s.settings)}.`).ok}
      />
      <Dialog
        open={dialog === "optout"}
        onClose={() => setDialog(null)}
        title="Record opt-out"
        description={`${patient.firstName} will never receive automated or staff messages through CaseFlow.`}
        footer={
          <>
            <Button onClick={() => setDialog(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (act((d, n) => optOut(d, patient.id, n, "staff"), "Opt-out recorded. Messaging is blocked.").ok) setDialog(null);
              }}
            >
              Record opt-out
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Use this when the patient asks the clinic in person or by phone to stop contacting them.</p>
      </Dialog>
    </>
  );
}

function toLocalInput(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

/** Parse a date / datetime-local value as clinic-local time. */
function parseClinicLocal(value: string, tz: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h = "09", mi = "00"] = m;
  return zonedTimeToUtc(+y, +mo, +d, +h, +mi, tz);
}

function NextStepBar({ s, c, now, open }: { s: DemoState; c: Case; now: Date; open: (d: DialogKind) => void }) {
  const act = useStore((x) => x.act);
  const na = nextAction(s, c, now);
  const { patient } = caseContext(s, c);
  const buttons: ReactNode[] = [];
  const start = (
    <Button key="start" variant="primary" icon={<Play size={15} weight="fill" />} onClick={() => act((d, n) => startFollowUp(d, c.id, n), "Follow-up started. Day 0 message sent (simulated).")}>
      {c.status === "pending" ? "Start follow-up" : "Restart follow-up"}
    </Button>
  );
  const book = (
    <Button key="book" icon={<CalendarPlus size={15} />} onClick={() => open("book")}>
      Book for patient
    </Button>
  );
  const defer = (
    <Button key="defer" variant="ghost" icon={<Hourglass size={15} />} onClick={() => open("defer")}>
      Defer
    </Button>
  );
  const lost = (
    <Button key="lost" variant="ghost" icon={<XCircle size={15} />} onClick={() => open("lost")}>
      Close as lost
    </Button>
  );

  switch (c.status) {
    case "pending":
      if (!patient.consent.doNotContact && (patient.consent.automatedFollowUp || !s.settings.consent.requireAutomationConsent)) buttons.push(start);
      buttons.push(book, defer, lost);
      break;
    case "follow_up_active":
      if (c.sequence.stepIndex < c.sequence.steps.length && c.automation.state !== "stopped") {
        buttons.push(
          <Button key="send" variant="primary" icon={<PaperPlaneTilt size={15} />} onClick={() => act((d, n) => sendNextStepNow(d, c.id, n), "Follow-up sent (simulated).")}>
            Send next step now
          </Button>,
          <Button key="resched" icon={<ClockClockwise size={15} />} onClick={() => open("followup")}>
            Reschedule
          </Button>,
        );
      }
      buttons.push(book, defer, lost);
      break;
    case "engaged":
      buttons.push(book, defer, lost);
      break;
    case "needs_human":
      buttons.push(
        <Button key="resume" variant="primary" onClick={() => act((d, n) => returnToAutomation(d, c.id, n), "Handoff resolved. CaseFlow is handling the conversation again.")}>
          Resolve & return to automation
        </Button>,
        book,
        defer,
        lost,
      );
      break;
    case "deferred":
      if (reactivationEligibility(s, c, now).eligible) buttons.push(start);
      buttons.push(
        <Button key="date" icon={<CalendarCheck size={15} />} onClick={() => open("deferDate")}>
          Change reactivation date
        </Button>,
        book,
      );
      break;
    case "lost":
      if (!patient.consent.doNotContact) buttons.push(start);
      buttons.push(book);
      break;
    case "do_not_contact":
      buttons.push(book);
      break;
    default:
      break;
  }

  const tone =
    c.status === "needs_human" ? "border-warn/35 bg-warn-soft/60" : c.status === "scheduled" || c.status === "completed" ? "border-brand/25 bg-brand-soft/50" : c.status === "do_not_contact" ? "border-danger/25 bg-danger-soft/50" : "";

  return (
    <Card className={clsx("flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center", tone)}>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium tracking-wide text-muted uppercase">Next step</p>
        <ToneText tone={na.tone} className="text-[15px] font-semibold">
          {na.label}
        </ToneText>
        <p className="text-[13px] text-ink-2">{na.detail ?? STATUS_DESCRIPTION[c.status]}</p>
        {c.status === "do_not_contact" && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] text-danger">
            <Prohibit size={14} /> All automated and staff messaging is blocked. Staff can still book if the patient calls.
          </p>
        )}
      </div>
      {buttons.length > 0 && <div className="flex flex-wrap gap-2">{buttons}</div>}
    </Card>
  );
}

function SequenceCard({ s, c, now, open }: { s: DemoState; c: Case; now: Date; open: (d: DialogKind) => void }) {
  const steps = c.sequence.steps.length ? c.sequence.steps : s.settings.followUp.steps.map((x) => ({ ...x }));
  const sentIds = new Set(s.messages.filter((m) => m.caseId === c.id && m.stepId).map((m) => m.stepId));
  const started = !!c.sequence.startedAt;
  return (
    <Card>
      <CardHeader
        title={c.sequence.kind === "reactivation" ? "Reactivation sequence" : "Follow-up sequence"}
        description={started ? `Started ${formatDate(c.sequence.startedAt!, s.settings)}` : "Not started"}
      />
      <ol className="px-4 pb-4 sm:px-5">
        {steps.map((st, i) => {
          const sent = started && i < c.sequence.stepIndex && sentIds.has(st.id);
          const isNext = started && i === c.sequence.stepIndex && c.sequence.nextStepAt;
          const at = started && c.sequence.startedAt ? new Date(new Date(c.sequence.startedAt).getTime() + st.dayOffset * DAY) : null;
          return (
            <li key={st.id} className="flex items-start gap-3 py-1.5">
              <span
                aria-hidden
                className={clsx(
                  "mt-1 flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                  sent ? "border-brand bg-brand" : isNext ? "border-info bg-surface" : "border-line-strong bg-surface",
                )}
              >
                {sent && <span className="size-1.5 rounded-full bg-white" />}
              </span>
              <div className="min-w-0 flex-1 text-[13px]">
                <p className="text-ink">
                  <span className="font-medium">Day {st.dayOffset}</span> · {st.label}
                </p>
                <p className="text-[12px] text-muted">
                  {sent
                    ? "Sent"
                    : isNext
                      ? `Scheduled ${formatDateTime(c.sequence.nextStepAt!, s.settings)}${new Date(c.sequence.nextStepAt!) <= now ? " · due now" : ""}`
                      : started && c.automation.state === "stopped"
                        ? "Will not send"
                        : at && i >= c.sequence.stepIndex
                          ? c.status === "follow_up_active"
                            ? `Planned ${formatDate(at, s.settings)}`
                            : "Paused — patient replied"
                          : "Not sent"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {c.status === "follow_up_active" && c.sequence.nextStepAt && (
        <div className="border-t border-line px-4 py-3 sm:px-5">
          <button type="button" onClick={() => open("followup")} className="text-[13px] font-medium text-brand hover:underline">
            Reschedule next step
          </button>
        </div>
      )}
      <p className="border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
        Automation stops when the patient books, opts out, asks a clinical question, or staff take over.
      </p>
    </Card>
  );
}

function NotesCard({ s, c }: { s: DemoState; c: Case }) {
  const act = useStore((x) => x.act);
  const [text, setText] = useState("");
  const notes = s.notes.filter((n) => n.caseId === c.id).slice().reverse();
  return (
    <Card>
      <CardHeader title="Internal notes" description="Visible to clinic staff only. Never sent to the patient." />
      <form
        className="flex flex-col gap-2 px-4 pb-4 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (act((d, n) => addNote(d, c.id, text, n), "Note added.").ok) setText("");
        }}
      >
        <label htmlFor={`note-${c.id}`} className="sr-only">
          New note
        </label>
        <Textarea id={`note-${c.id}`} rows={2} className="min-h-16" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the team" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!text.trim()}>
            Add note
          </Button>
        </div>
      </form>
      {notes.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {notes.map((n) => (
            <li key={n.id} className="px-4 py-3 text-[13px] sm:px-5">
              <p className="text-ink">{n.body}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {n.author} · {formatDateTime(n.at, s.settings)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function TimelineCard({ s, c }: { s: DemoState; c: Case }) {
  const [all, setAll] = useState(false);
  const events = s.events.filter((e) => e.caseId === c.id).slice().reverse();
  const shown = all ? events : events.slice(0, 10);
  return (
    <Card>
      <CardHeader title="Activity history" description={`${events.length} recorded events for ${patientName(s, c)}`} />
      <ol className="border-t border-line">
        {shown.map((e) => (
          <li key={e.id} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 border-b border-line px-4 py-2.5 last:border-b-0 sm:grid-cols-[120px_64px_minmax(0,1fr)] sm:px-5">
            <span className="tnum text-[12px] text-muted">{formatDateTime(e.at, s.settings)}</span>
            <span className="hidden sm:block">
              <ActorTag actor={e.actor} />
            </span>
            <span className="min-w-0 text-[13px] text-ink">
              {e.label}
              {e.detail && !/^\d{4}-\d{2}-\d{2}T/.test(e.detail) && <span className="text-muted"> · {e.detail}</span>}
              {e.detail && /^\d{4}-\d{2}-\d{2}T/.test(e.detail) && <span className="text-muted"> · {formatDateTime(e.detail, s.settings)}</span>}
            </span>
          </li>
        ))}
      </ol>
      {events.length > 10 && (
        <div className="border-t border-line px-4 py-2.5 sm:px-5">
          <button type="button" className="text-[13px] font-medium text-brand hover:underline" onClick={() => setAll((v) => !v)}>
            {all ? "Show recent only" : `Show all ${events.length} events`}
          </button>
        </div>
      )}
    </Card>
  );
}

function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label,
  placeholder,
  confirm,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  confirm: string;
  onConfirm: (reason: string) => boolean;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!value.trim()) {
                setError("Add a short reason.");
                return;
              }
              if (onConfirm(value)) {
                setValue("");
                setError("");
                onClose();
              }
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <Field label={label} htmlFor="reason-input" error={error}>
        <Input id="reason-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-invalid={!!error || undefined} />
      </Field>
    </Dialog>
  );
}

function DateDialog({
  open,
  onClose,
  title,
  description,
  initial,
  min,
  confirm,
  withTime,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  initial: string;
  min: string;
  confirm: string;
  withTime?: boolean;
  onConfirm: (date: Date) => boolean;
}) {
  const s = useDemoState();
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState("");
  const current = value ?? initial;
  return (
    <Dialog
      open={open}
      onClose={() => {
        setValue(null);
        setError("");
        onClose();
      }}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant="primary"
            onClick={() => {
              const d = parseClinicLocal(current, s.settings.clinic.timezone);
              if (!d) {
                setError("Enter a valid date.");
                return;
              }
              if (onConfirm(d)) {
                setValue(null);
                setError("");
                onClose();
              }
            }}
          >
            {confirm}
          </Button>
        </>
      }
    >
      <Field label={withTime ? "Date and time (clinic time)" : "Date"} htmlFor="date-input" error={error}>
        <Input id="date-input" type={withTime ? "datetime-local" : "date"} min={min} value={current} onChange={(e) => setValue(e.target.value)} />
      </Field>
    </Dialog>
  );
}
