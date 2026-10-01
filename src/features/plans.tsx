"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowSquareIn, CalendarCheck, MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react";
import { CHANNEL_LABEL } from "@/lib/domain/countries";
import { caseContext, createPlan, importFromPms, startFollowUp, validatePlanInput, type NewPlanInput } from "@/lib/domain/engine";
import { formatDate, formatMoney, formatRelative, formatShortDate, formatSlot } from "@/lib/domain/format";
import { isOpen } from "@/lib/domain/status";
import type { Case, Channel, DemoState } from "@/lib/domain/types";
import { caseRows, nextAction } from "@/lib/selectors";
import { useDemoState, useNow, useStore } from "@/lib/store";
import { StatusBadge } from "@/components/status";
import { ToneText } from "@/components/tone";
import { Badge, Button, ButtonLink, Card, CardHeader, DemoTag, Dl, EmptyState, Field, Input, PageHeader, Segmented, Select, Textarea } from "@/components/ui";

type PlanFilter = "all" | "unscheduled" | "scheduled" | "closed";

function bookingStatus(s: DemoState, c: Case) {
  const appt = s.appointments.find((a) => a.id === c.appointmentId);
  if (c.status === "completed") return { label: "Attended", tone: "brand" as const };
  if (appt) return { label: `Booked ${formatShortDate(appt.start, s.settings)}`, tone: "brand" as const };
  if (c.status === "lost" || c.status === "do_not_contact") return { label: "Not scheduled · closed", tone: "neutral" as const };
  return { label: "Not scheduled", tone: "warn" as const };
}

export function PlansList() {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const params = useSearchParams();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [filter, setFilter] = useState<PlanFilter>((params.get("filter") as PlanFilter) || "all");

  const rows = useMemo(() => {
    const all = caseRows(s).sort((a, b) => (b.presentedAt > a.presentedAt ? 1 : -1));
    return all.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q.toLowerCase().trim())) return false;
      if (cat !== "all" && r.categoryId !== cat) return false;
      if (filter === "unscheduled") return isOpen(r.c.status);
      if (filter === "scheduled") return r.c.status === "scheduled" || r.c.status === "completed";
      if (filter === "closed") return r.c.status === "lost" || r.c.status === "do_not_contact";
      return true;
    });
  }, [s, q, cat, filter]);

  const all = caseRows(s);
  const count = (f: PlanFilter) =>
    all.filter((r) =>
      f === "all"
        ? true
        : f === "unscheduled"
          ? isOpen(r.c.status)
          : f === "scheduled"
            ? r.c.status === "scheduled" || r.c.status === "completed"
            : r.c.status === "lost" || r.c.status === "do_not_contact",
    ).length;

  return (
    <>
      <PageHeader
        title="Treatment plans"
        description="Plans presented to patients who left without scheduling. Each plan has a follow-up case in CaseFlow."
        actions={
          <>
            <Button
              icon={<ArrowSquareIn size={16} />}
              onClick={() => act((d, n) => importFromPms(d, n), (cases) => `Imported ${cases.length} unscheduled plans from the practice system (simulated).`)}
            >
              Import from practice system
            </Button>
            <ButtonLink href="/plans/new" variant="primary" icon={<Plus size={16} />}>
              New treatment plan
            </ButtonLink>
          </>
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 lg:flex-row lg:items-center">
          <Segmented<PlanFilter>
            label="Filter plans"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: count("all") },
              { value: "unscheduled", label: "Not scheduled", count: count("unscheduled") },
              { value: "scheduled", label: "Scheduled", count: count("scheduled") },
              { value: "closed", label: "Closed", count: count("closed") },
            ]}
          />
          <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:justify-end">
            <label className="relative block sm:w-64">
              <span className="sr-only">Search patients</span>
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient" className="pl-9" />
            </label>
            <label className="sm:w-56">
              <span className="sr-only">Treatment category</span>
              <Select value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="all">All treatment categories</option>
                {s.settings.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No treatment plans match" action={<Button onClick={() => { setQ(""); setCat("all"); setFilter("all"); }}>Clear filters</Button>}>
            Try a different name or category.
          </EmptyState>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Patient</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Treatment</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Presented</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Est. value <DemoTag />
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Booking</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Next follow-up</th>
                    <th scope="col" className="py-2.5 pr-5 pl-3 font-medium">Last contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const { patient } = caseContext(s, r.c);
                    const booking = bookingStatus(s, r.c);
                    const plan = s.plans.find((p) => p.id === r.c.planId)!;
                    return (
                      <tr key={r.c.id} className="group relative hover:bg-subtle">
                        <td className="py-3 pr-3 pl-5">
                          <Link href={`/plans/${plan.id}`} className="font-medium text-ink no-underline after:absolute after:inset-0 group-hover:underline">
                            {r.name}
                          </Link>
                          <p className="text-[12px] text-muted">
                            {patient.consent.doNotContact ? "Do not contact" : `${CHANNEL_LABEL[patient.preferredChannel]}${patient.consent.automatedFollowUp ? "" : " · no automation consent"}`}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <p className="text-ink">{r.category}</p>
                          <p className="text-[12px] text-muted">{r.provider}</p>
                        </td>
                        <td className="tnum px-3 py-3 text-ink-2">{formatShortDate(r.presentedAt, s.settings)}</td>
                        <td className="tnum px-3 py-3 text-right text-ink">{formatMoney(r.value, s.settings)}</td>
                        <td className="px-3 py-3">
                          <StatusBadge status={r.c.status} />
                        </td>
                        <td className="px-3 py-3">
                          <ToneText tone={booking.tone} className="text-[12.5px] font-medium">
                            {booking.label}
                          </ToneText>
                        </td>
                        <td className="px-3 py-3 text-ink-2">
                          {r.c.sequence.nextStepAt && r.c.status === "follow_up_active" ? (
                            new Date(r.c.sequence.nextStepAt) <= now ? (
                              <span className="font-medium text-[#174ea6]">Due now</span>
                            ) : (
                              formatRelative(r.c.sequence.nextStepAt, now, s.settings)
                            )
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-5 pl-3 text-ink-2">
                          {r.c.lastContactAt ? formatRelative(r.c.lastContactAt, now, s.settings) : <span className="text-faint">Never</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Mobile list */}
            <ul className="divide-y divide-line lg:hidden">
              {rows.map((r) => {
                const plan = s.plans.find((p) => p.id === r.c.planId)!;
                const booking = bookingStatus(s, r.c);
                return (
                  <li key={r.c.id}>
                    <Link href={`/plans/${plan.id}`} className="flex flex-col gap-1.5 px-4 py-3 no-underline hover:bg-subtle">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                          <p className="truncate text-[12.5px] text-muted">
                            {r.category} · {formatShortDate(r.presentedAt, s.settings)}
                          </p>
                        </div>
                        <StatusBadge status={r.c.status} />
                      </div>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <ToneText tone={booking.tone} className="font-medium">
                          {booking.label}
                        </ToneText>
                        <span className="tnum text-ink-2">{formatMoney(r.value, s.settings)}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className="border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
          {rows.length} of {all.length} plans · Values are estimates entered by the clinic (demo data).
        </p>
      </Card>
    </>
  );
}

export function PlanDetail({ id }: { id: string }) {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const router = useRouter();
  const plan = s.plans.find((p) => p.id === id);
  if (!plan) {
    return (
      <Card>
        <EmptyState title="Treatment plan not found" action={<ButtonLink href="/plans">Back to treatment plans</ButtonLink>}>
          It may have been removed when the demo was reset.
        </EmptyState>
      </Card>
    );
  }
  const c = s.cases.find((x) => x.id === plan.caseId)!;
  const { patient, category, provider, appointmentType } = caseContext(s, c);
  const appt = s.appointments.find((a) => a.id === c.appointmentId);
  const na = nextAction(s, c, now);
  const booked = c.status === "scheduled" || c.status === "completed";

  return (
    <>
      <PageHeader
        back={{ href: "/plans", label: "Treatment plans" }}
        title={`${patient.firstName} ${patient.lastName}`}
        description={`${category.name} · presented by ${provider.name} on ${formatDate(plan.presentedAt, s.settings)}`}
        actions={
          <ButtonLink href={`/cases/${c.id}`} variant="primary">
            Open follow-up case
          </ButtonLink>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div className="flex flex-col gap-4 lg:gap-5">
          <Card
            className={clsx("flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5", booked ? "border-brand/30 bg-brand-soft/50" : "border-warn/30 bg-warn-soft/50")}
          >
            <span className={clsx("inline-flex size-10 shrink-0 items-center justify-center rounded-full", booked ? "bg-brand text-white" : "bg-warn-soft text-warn")}>
              {booked ? <CalendarCheck size={22} /> : <WarningCircle size={22} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">
                {c.status === "completed"
                  ? "Treatment visit attended"
                  : appt
                    ? `Scheduled for ${formatSlot(appt.start, s.settings)}`
                    : "The patient has not scheduled this treatment"}
              </p>
              <p className="text-[13px] text-ink-2">
                {booked
                  ? c.recovered
                    ? "Booked after CaseFlow follow-up — counted as recovered."
                    : "Booked directly with the clinic."
                  : `Presented ${formatRelative(plan.presentedAt, now, s.settings)}. ${c.followUpStartedAt ? `Follow-up started ${formatRelative(c.followUpStartedAt, now, s.settings)}.` : "No follow-up has started."}`}
              </p>
            </div>
            {c.status === "pending" && (
              <Button
                variant="primary"
                onClick={() => {
                  const r = act((d, n) => startFollowUp(d, c.id, n), "Follow-up started. The first message was sent (simulated).");
                  if (r.ok) router.push(`/cases/${c.id}`);
                }}
              >
                Start follow-up
              </Button>
            )}
          </Card>

          <Card>
            <CardHeader title="Treatment plan" description="Administrative summary. Clinical decisions stay with the dentist." />
            <div className="px-4 pb-5 sm:px-5">
              <Dl
                items={[
                  { label: "Treatment category", value: category.name },
                  { label: "Provider", value: `${provider.name}, ${provider.title}` },
                  { label: "Date presented", value: formatDate(plan.presentedAt, s.settings) },
                  {
                    label: "Estimated value",
                    value: (
                      <span className="inline-flex items-center gap-2">
                        {formatMoney(plan.estimatedValue, s.settings)} <DemoTag />
                      </span>
                    ),
                  },
                  { label: "Appointment type", value: `${appointmentType.name} · ${appointmentType.durationMin} min` },
                  { label: "Summary", value: plan.summary || "—" },
                  { label: "Source", value: plan.source === "pms_import" ? "Practice system import (simulated)" : plan.source === "manual" ? "Entered at front desk" : "Demo data" },
                ]}
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:gap-5">
          <Card>
            <CardHeader title="Follow-up case" />
            <div className="flex flex-col gap-3 px-4 pb-5 sm:px-5">
              <div className="flex items-center gap-2">
                <StatusBadge status={c.status} />
              </div>
              <div>
                <ToneText tone={na.tone} className="text-sm font-medium">
                  {na.label}
                </ToneText>
                {na.detail && <p className="text-[12.5px] text-muted">{na.detail}</p>}
              </div>
              <Dl
                items={[
                  { label: "Messages sent", value: c.sequence.sentCount },
                  { label: "Last contact", value: c.lastContactAt ? formatRelative(c.lastContactAt, now, s.settings) : "Never" },
                ]}
              />
              <ButtonLink href={`/cases/${c.id}`}>Open case</ButtonLink>
            </div>
          </Card>
          <Card>
            <CardHeader title="Contact preference" />
            <div className="px-4 pb-5 sm:px-5">
              <Dl
                items={[
                  { label: "Phone", value: <span className="tnum">{patient.phone}</span> },
                  { label: "Email", value: patient.email || "—" },
                  { label: "Channel", value: CHANNEL_LABEL[patient.preferredChannel] },
                  {
                    label: "Automated messages",
                    value: patient.consent.doNotContact ? (
                      <Badge className="bg-danger-soft text-danger">Opted out</Badge>
                    ) : patient.consent.automatedFollowUp ? (
                      "Consent recorded"
                    ) : (
                      <Badge className="bg-warn-soft text-[#8a4b04]">No consent — call only</Badge>
                    ),
                  },
                  { label: "Recorded", value: `${patient.consent.source}, ${formatDate(patient.consent.recordedAt, s.settings)}` },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export function NewPlanForm() {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const router = useRouter();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: s.settings.clinic.timezone }).format(now);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    preferredChannel: s.settings.channels.default as Channel,
    automatedConsent: true,
    categoryId: s.settings.categories.find((c) => c.active)?.id ?? "",
    providerId: s.settings.providers.find((p) => p.active)?.id ?? "",
    estimatedValue: "",
    presentedOn: today,
    summary: "",
    startNow: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const presentedAt = new Date(`${form.presentedOn}T12:00:00`);
    const input: NewPlanInput = {
      firstName: form.firstName,
      lastName: form.lastName,
      phone: form.phone,
      email: form.email,
      preferredChannel: form.preferredChannel,
      automatedConsent: form.automatedConsent,
      categoryId: form.categoryId,
      providerId: form.providerId,
      estimatedValue: form.estimatedValue === "" ? NaN : Number(form.estimatedValue),
      presentedAt: Number.isNaN(presentedAt.getTime()) ? "" : presentedAt.toISOString(),
      summary: form.summary,
      source: "manual",
    };
    const errs = validatePlanInput(input);
    if (presentedAt > now) errs.presentedOn = "The presentation date cannot be in the future.";
    if (errs.presentedAt) errs.presentedOn = errs.presentedAt;
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0] === "presentedAt" ? "presentedOn" : Object.keys(errs)[0];
      document.getElementById(`np-${first}`)?.focus();
      return;
    }
    const r = act(
      (d, n) => {
        const c = createPlan(d, input, n);
        if (form.startNow && form.automatedConsent) startFollowUp(d, c.id, n);
        return c;
      },
      form.startNow && form.automatedConsent ? "Plan added and follow-up started (simulated message sent)." : "Treatment plan added.",
    );
    if (r.ok) router.push(`/cases/${r.value.id}`);
  };

  const fieldProps = (k: string) => ({
    id: `np-${k}`,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `np-${k}-error` : undefined,
  });

  return (
    <>
      <PageHeader
        back={{ href: "/plans", label: "Treatment plans" }}
        title="New treatment plan"
        description="Add a plan the patient did not schedule. Use synthetic details only — this is a demo."
      />
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-5">
        <Card>
          <CardHeader title="Patient" />
          <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5">
            <Field label="First name" htmlFor="np-firstName" error={errors.firstName}>
              <Input {...fieldProps("firstName")} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Last name" htmlFor="np-lastName" error={errors.lastName}>
              <Input {...fieldProps("lastName")} value={form.lastName} onChange={(e) => set("lastName", e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Mobile number" htmlFor="np-phone" error={errors.phone} hint="Include the country code.">
              <Input {...fieldProps("phone")} value={form.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" placeholder="+91 90000 00000" />
            </Field>
            <Field label="Email (optional)" htmlFor="np-email" error={errors.email}>
              <Input {...fieldProps("email")} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" />
            </Field>
            <Field label="Preferred channel" htmlFor="np-preferredChannel">
              <Select {...fieldProps("preferredChannel")} value={form.preferredChannel} onChange={(e) => set("preferredChannel", e.target.value as Channel)}>
                {s.settings.channels.enabled.map((ch) => (
                  <option key={ch} value={ch}>
                    {CHANNEL_LABEL[ch]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col justify-end">
              <label className="flex items-start gap-2.5 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={form.automatedConsent}
                  onChange={(e) => set("automatedConsent", e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-brand)]"
                />
                <span>
                  Patient agreed to receive automated follow-up messages
                  <span className="block text-[12px] text-muted">Without consent, CaseFlow will not message them.</span>
                </span>
              </label>
            </div>
          </div>
          <div className="border-t border-line" />
          <CardHeader title="Treatment plan" description="Administrative details only. Do not enter clinical notes." />
          <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5">
            <Field label="Treatment category" htmlFor="np-categoryId" error={errors.categoryId}>
              <Select {...fieldProps("categoryId")} value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                {s.settings.categories.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Presenting provider" htmlFor="np-providerId" error={errors.providerId}>
              <Select {...fieldProps("providerId")} value={form.providerId} onChange={(e) => set("providerId", e.target.value)}>
                {s.settings.providers.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Estimated value (${s.settings.clinic.currency})`} htmlFor="np-estimatedValue" error={errors.estimatedValue} hint="Internal estimate. Never shown to the patient.">
              <Input {...fieldProps("estimatedValue")} inputMode="numeric" value={form.estimatedValue} onChange={(e) => set("estimatedValue", e.target.value.replace(/[^0-9]/g, ""))} placeholder="12000" />
            </Field>
            <Field label="Date presented" htmlFor="np-presentedOn" error={errors.presentedOn}>
              <Input {...fieldProps("presentedOn")} type="date" max={today} value={form.presentedOn} onChange={(e) => set("presentedOn", e.target.value)} />
            </Field>
            <Field label="Administrative note (optional)" htmlFor="np-summary" className="sm:col-span-2" hint="e.g. “Wants to check work schedule before booking.”">
              <Textarea {...fieldProps("summary")} value={form.summary} onChange={(e) => set("summary", e.target.value)} rows={3} />
            </Field>
          </div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="p-4 sm:p-5">
            <label className="flex items-start gap-2.5 text-[13px] text-ink">
              <input type="checkbox" checked={form.startNow} onChange={(e) => set("startNow", e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" disabled={!form.automatedConsent} />
              <span>
                Start follow-up now
                <span className="block text-[12px] text-muted">
                  Sends the Day 0 message (simulated) and schedules reminders on days{" "}
                  {s.settings.followUp.steps.slice(1).map((x) => x.dayOffset).join(", ")}.
                </span>
              </span>
            </label>
            <div className="mt-4 flex flex-col gap-2">
              <Button type="submit" variant="primary">
                Add treatment plan
              </Button>
              <ButtonLink href="/plans" variant="ghost">
                Cancel
              </ButtonLink>
            </div>
          </Card>
          <p className="px-1 text-[12px] text-muted">Demo mode: details stay in this browser only. Do not enter real patient information.</p>
        </div>
      </form>
    </>
  );
}
