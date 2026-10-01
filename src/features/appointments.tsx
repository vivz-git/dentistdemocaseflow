"use client";

import clsx from "clsx";
import Link from "next/link";
import { useState } from "react";
import { CalendarX, CheckCircle, ClockClockwise } from "@phosphor-icons/react";
import { cancelAppointment, caseContext, completeAppointment, rescheduleAppointment } from "@/lib/domain/engine";
import { formatDate, formatSlot, formatTime, formatWeekday } from "@/lib/domain/format";
import { zonedParts } from "@/lib/domain/time";
import type { Appointment, DemoState } from "@/lib/domain/types";
import { useDemoState, useNow, useStore } from "@/lib/store";
import { Badge, Button, Card, CardHeader, Dialog, EmptyState, Field, Input, PageHeader, Segmented } from "@/components/ui";
import { SlotPickerDialog } from "./slot-picker";

type View = "upcoming" | "past" | "calendar";

export function Appointments() {
  const s = useDemoState();
  const now = useNow();
  const [view, setView] = useState<View>("upcoming");
  const [reschedule, setReschedule] = useState<Appointment | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const act = useStore((x) => x.act);

  const caseAppts = s.appointments.filter((a) => a.caseId);
  const upcoming = caseAppts.filter((a) => a.status === "booked").sort((a, b) => (a.start > b.start ? 1 : -1));
  const past = caseAppts.filter((a) => a.status !== "booked").sort((a, b) => (a.start < b.start ? 1 : -1));

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Treatment appointments booked from CaseFlow cases. Bookings are written to the demo calendar, which blocks double-booking."
      />
      <div className="mb-4">
        <Segmented<View>
          label="Appointments view"
          value={view}
          onChange={setView}
          options={[
            { value: "upcoming", label: "Booked", count: upcoming.length },
            { value: "past", label: "Attended & cancelled", count: past.length },
            { value: "calendar", label: "Provider calendar" },
          ]}
        />
      </div>

      {view === "calendar" ? (
        <ProviderCalendar s={s} now={now} />
      ) : (
        <Card>
          {(view === "upcoming" ? upcoming : past).length === 0 ? (
            <EmptyState title={view === "upcoming" ? "No booked treatment appointments" : "Nothing here yet"}>Bookings made from cases appear here.</EmptyState>
          ) : (
            <DayGroups
              s={s}
              appts={view === "upcoming" ? upcoming : past}
              render={(a) => {
                const c = s.cases.find((x) => x.id === a.caseId)!;
                const { patient, category } = caseContext(s, c);
                const provider = s.settings.providers.find((p) => p.id === a.providerId);
                const started = new Date(a.start) <= now;
                return (
                  <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                    <div className="tnum w-28 shrink-0 text-[13px] font-semibold text-ink">
                      {formatTime(a.start, s.settings)}
                      <span className="block text-[12px] font-normal text-muted">{Math.round((new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000)} min</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/cases/${c.id}`} className="text-sm font-medium text-ink no-underline hover:underline">
                        {patient.firstName} {patient.lastName}
                      </Link>
                      <p className="truncate text-[12.5px] text-muted">
                        {category.name} · {provider?.name}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {c.recovered && <Badge className="bg-brand-soft text-brand-ink">Recovered by CaseFlow</Badge>}
                        <Badge>{a.bookedBy === "patient" ? "Self-booked" : "Booked by staff"}</Badge>
                        {a.status === "completed" && <Badge className="bg-brand text-white">Attended</Badge>}
                        {a.status === "cancelled" && <Badge className="bg-danger-soft text-danger">Cancelled · {a.cancelReason}</Badge>}
                      </div>
                    </div>
                    {a.status === "booked" && (
                      <div className="flex flex-wrap gap-2">
                        {started && (
                          <Button size="sm" icon={<CheckCircle size={15} />} onClick={() => act((d, n) => completeAppointment(d, a.id, n), "Marked attended.")}>
                            Mark attended
                          </Button>
                        )}
                        <Button size="sm" icon={<ClockClockwise size={15} />} onClick={() => setReschedule(a)}>
                          Reschedule
                        </Button>
                        <Button size="sm" variant="danger" icon={<CalendarX size={15} />} onClick={() => setCancel(a)}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </li>
                );
              }}
            />
          )}
        </Card>
      )}

      {reschedule && (
        <SlotPickerDialog
          open
          onClose={() => setReschedule(null)}
          s={s}
          now={now}
          title="Reschedule appointment"
          description={`Currently ${formatSlot(reschedule.start, s.settings)}`}
          appointmentTypeId={reschedule.appointmentTypeId}
          defaultProviderId={reschedule.providerId}
          patientId={reschedule.patientId}
          excludeAppointmentId={reschedule.id}
          confirmLabel="Move appointment"
          onConfirm={(slot) => act((d, n) => rescheduleAppointment(d, reschedule.id, slot, n), `Moved to ${formatSlot(slot.start, s.settings)}.`).ok}
        />
      )}
      <CancelDialog appt={cancel} onClose={() => setCancel(null)} />
    </>
  );
}

function DayGroups({ s, appts, render }: { s: DemoState; appts: Appointment[]; render: (a: Appointment) => React.ReactNode }) {
  const groups: { key: string; items: Appointment[] }[] = [];
  for (const a of appts) {
    const p = zonedParts(a.start, s.settings.clinic.timezone);
    const key = `${p.year}-${p.month}-${p.day}`;
    const g = groups.at(-1);
    if (g && g.key === key) g.items.push(a);
    else groups.push({ key, items: [a] });
  }
  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} aria-label={formatWeekday(g.items[0].start, s.settings)}>
          <h2 className="sticky top-14 z-10 border-y border-line bg-subtle px-4 py-1.5 text-[12.5px] font-semibold text-ink-2 first:border-t-0 sm:px-5">
            {formatWeekday(g.items[0].start, s.settings)}
          </h2>
          <ul className="divide-y divide-line">{g.items.map(render)}</ul>
        </section>
      ))}
    </div>
  );
}

function CancelDialog({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const act = useStore((x) => x.act);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog
      open={!!appt}
      onClose={onClose}
      title="Cancel appointment"
      description="The case returns to Engaged and staff keep control of the conversation."
      footer={
        <>
          <Button onClick={onClose}>Back</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (!reason.trim()) return setError("Add a short reason.");
              if (appt && act((d, n) => cancelAppointment(d, appt.id, reason, n), "Appointment cancelled.").ok) {
                setReason("");
                setError("");
                onClose();
              }
            }}
          >
            Cancel appointment
          </Button>
        </>
      }
    >
      <Field label="Reason" htmlFor="cancel-reason" error={error}>
        <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Patient travelling" aria-invalid={!!error || undefined} />
      </Field>
    </Dialog>
  );
}

/** Day view of each provider's chair time: CaseFlow bookings vs existing practice bookings. */
function ProviderCalendar({ s, now }: { s: DemoState; now: Date }) {
  const tz = s.settings.clinic.timezone;
  const days: Date[] = [];
  for (let d = 0; days.length < 6 && d < 14; d++) {
    const day = new Date(now.getTime() + d * 86400000);
    if (s.settings.workingHours[zonedParts(day, tz).weekday]?.open) days.push(day);
  }
  const [dayIdx, setDayIdx] = useState(0);
  const day = days[dayIdx] ?? now;
  const dp = zonedParts(day, tz);
  const hours = s.settings.workingHours[dp.weekday];
  const [sh, sm] = hours.start.split(":").map(Number);
  const [eh, em] = hours.end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const span = eh * 60 + em - startMin;
  const sameDay = (iso: string) => {
    const p = zonedParts(iso, tz);
    return p.year === dp.year && p.month === dp.month && p.day === dp.day;
  };
  return (
    <Card>
      <CardHeader title="Provider calendar" description={`${formatDate(day, s.settings)} · ${hours.start}–${hours.end}`} />
      <div className="flex flex-wrap gap-1.5 px-4 pb-3 sm:px-5">
        {days.map((d, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setDayIdx(i)}
            aria-pressed={i === dayIdx}
            className={clsx("h-8 rounded-lg px-2.5 text-[13px] font-medium", i === dayIdx ? "bg-ink text-white" : "border border-line-strong text-ink-2 hover:bg-subtle")}
          >
            {new Intl.DateTimeFormat(s.settings.clinic.locale, { timeZone: tz, weekday: "short", day: "numeric" }).format(d)}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2 text-[12px] text-ink-2 sm:px-5">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-brand" /> CaseFlow treatment booking
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-line-strong" /> Existing booking (practice calendar, simulated)
        </span>
        {hours.breakStart && (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px] bg-warn-soft ring-1 ring-warn/30" /> Break {hours.breakStart}–{hours.breakEnd}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:px-5">
        {s.settings.providers
          .filter((p) => p.active)
          .map((p) => {
            const appts = s.appointments.filter((a) => a.providerId === p.id && a.status !== "cancelled" && sameDay(a.start));
            return (
              <div key={p.id} className="grid gap-1.5 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center sm:gap-3">
                <p className="text-[13px] font-medium text-ink">
                  {p.name}
                  <span className="block text-[11.5px] font-normal text-muted">{appts.length} bookings</span>
                </p>
                <div className="relative h-9 rounded-md bg-subtle">
                  {hours.breakStart && hours.breakEnd && (
                    <div
                      className="absolute inset-y-0 bg-warn-soft"
                      style={{
                        left: `${((toMin(hours.breakStart) - startMin) / span) * 100}%`,
                        width: `${((toMin(hours.breakEnd) - toMin(hours.breakStart)) / span) * 100}%`,
                      }}
                    />
                  )}
                  {appts.map((a) => {
                    const ap = zonedParts(a.start, tz);
                    const m = ap.hour * 60 + ap.minute - startMin;
                    const len = (new Date(a.end).getTime() - new Date(a.start).getTime()) / 60000;
                    const c = a.caseId ? s.cases.find((x) => x.id === a.caseId) : undefined;
                    const label = c ? `${caseContext(s, c).patient.firstName} ${caseContext(s, c).patient.lastName}` : a.label;
                    return (
                      <div
                        key={a.id}
                        title={`${formatTime(a.start, s.settings)} · ${label}`}
                        className={clsx("absolute inset-y-1 overflow-hidden rounded px-1 text-[10.5px] leading-7 font-medium whitespace-nowrap", a.caseId ? "bg-brand text-white" : "bg-line-strong text-ink-2")}
                        style={{ left: `calc(${(m / span) * 100}% + 1px)`, width: `calc(${(len / span) * 100}% - 2px)` }}
                      >
                        {a.caseId ? caseContext(s, c!).patient.firstName : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        <div className="ml-0 flex justify-between text-[11px] text-faint sm:ml-[172px]">
          <span>{hours.start}</span>
          <span>{hours.end}</span>
        </div>
      </div>
    </Card>
  );
}

function toMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}
