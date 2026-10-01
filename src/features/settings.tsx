"use client";

import clsx from "clsx";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Plus, Trash } from "@phosphor-icons/react";
import { CHANNEL_LABEL, COUNTRIES } from "@/lib/domain/countries";
import { validateTemplate } from "@/lib/domain/templates";
import type { Channel, ClinicSettings, CountryCode } from "@/lib/domain/types";
import { useDemoState, useStore } from "@/lib/store";
import { Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { MessageEditor, ValidationSummary } from "./campaigns";

type Tab = "clinic" | "hours" | "team" | "followup" | "messages" | "knowledge" | "consent" | "notifications";

const TABS: { id: Tab; label: string }[] = [
  { id: "clinic", label: "Clinic" },
  { id: "hours", label: "Hours & booking" },
  { id: "team", label: "Providers & services" },
  { id: "followup", label: "Follow-up timing" },
  { id: "messages", label: "Message templates" },
  { id: "knowledge", label: "Clinic knowledge" },
  { id: "consent", label: "Consent & escalation" },
  { id: "notifications", label: "Notifications" },
];

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMin(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Returns field-keyed error messages. Empty object means the settings can be saved. */
export function validateSettings(st: ClinicSettings): Record<string, string> {
  const e: Record<string, string> = {};
  if (!st.clinic.name.trim()) e["clinic.name"] = "Enter the clinic name.";
  if (!/^\+?[0-9 ()-]{7,20}$/.test(st.clinic.phone.trim())) e["clinic.phone"] = "Enter a phone number with country code.";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(st.clinic.email.trim())) e["clinic.email"] = "Enter a valid email address.";
  try {
    new Intl.DateTimeFormat("en", { timeZone: st.clinic.timezone });
  } catch {
    e["clinic.timezone"] = "Enter a valid IANA timezone, e.g. Asia/Kolkata.";
  }
  for (let d = 0; d < 7; d++) {
    const h = st.workingHours[d];
    if (!h.open) continue;
    if (!HM.test(h.start) || !HM.test(h.end) || toMin(h.start) >= toMin(h.end)) e[`hours.${d}`] = `${DAYS[d]}: closing time must be after opening time.`;
    else if (h.breakStart || h.breakEnd) {
      if (!h.breakStart || !h.breakEnd || !HM.test(h.breakStart) || !HM.test(h.breakEnd)) e[`hours.${d}`] = `${DAYS[d]}: enter both break times or neither.`;
      else if (toMin(h.breakStart) >= toMin(h.breakEnd) || toMin(h.breakStart) < toMin(h.start) || toMin(h.breakEnd) > toMin(h.end))
        e[`hours.${d}`] = `${DAYS[d]}: the break must sit inside opening hours.`;
    }
  }
  if (![0, 1, 2, 3, 4, 5, 6].some((d) => st.workingHours[d].open)) e["hours.any"] = "Open the clinic on at least one day.";
  const b = st.booking;
  if (!(b.minNoticeHours >= 0 && b.minNoticeHours <= 168)) e["booking.minNoticeHours"] = "Use 0–168 hours.";
  if (!(b.horizonDays >= 1 && b.horizonDays <= 60)) e["booking.horizonDays"] = "Use 1–60 days.";
  if (![10, 15, 20, 30, 60].includes(b.slotIntervalMin)) e["booking.slotIntervalMin"] = "Choose 10, 15, 20, 30 or 60 minutes.";
  if (!(b.slotsOffered >= 1 && b.slotsOffered <= 8)) e["booking.slotsOffered"] = "Offer between 1 and 8 times.";
  if (!(b.bufferMin >= 0 && b.bufferMin <= 60)) e["booking.bufferMin"] = "Use 0–60 minutes.";
  if (!st.providers.some((p) => p.active)) e["providers"] = "Keep at least one active provider.";
  st.providers.forEach((p, i) => {
    if (!p.name.trim()) e[`providers.${i}`] = "Every provider needs a name.";
  });
  st.appointmentTypes.forEach((t, i) => {
    if (!t.name.trim() || !(t.durationMin >= 10 && t.durationMin <= 240)) e[`types.${i}`] = "Each service needs a name and a duration of 10–240 minutes.";
  });
  st.categories.forEach((c, i) => {
    if (!c.name.trim() || !c.patientLabel.trim()) e[`categories.${i}`] = "Each category needs a name and patient wording.";
  });
  const steps = st.followUp.steps;
  if (!steps.length) e["followUp.steps"] = "Add at least one follow-up step.";
  else if (steps[0].dayOffset !== 0) e["followUp.steps"] = "The first step must be Day 0.";
  steps.forEach((s, i) => {
    if (i > 0 && !(s.dayOffset > steps[i - 1].dayOffset)) e["followUp.steps"] = "Each step must come on a later day than the one before.";
    if (s.dayOffset > 60) e["followUp.steps"] = "Keep steps within 60 days.";
    if (!st.templates.some((t) => t.id === s.templateId)) e["followUp.steps"] = `"${s.label}" uses a template that no longer exists.`;
    if (!s.label.trim()) e["followUp.steps"] = "Every step needs a label.";
  });
  if (!(st.followUp.autoCloseAfterDays >= 1 && st.followUp.autoCloseAfterDays <= 60)) e["followUp.autoCloseAfterDays"] = "Use 1–60 days.";
  if (!(st.followUp.defaultDeferDays >= 1 && st.followUp.defaultDeferDays <= 365)) e["followUp.defaultDeferDays"] = "Use 1–365 days.";
  if (!(st.followUp.reactivationReminderDays >= 1 && st.followUp.reactivationReminderDays <= 30)) e["followUp.reactivationReminderDays"] = "Use 1–30 days.";
  if (!(st.followUp.reactivationEligibleAfterDays >= 1 && st.followUp.reactivationEligibleAfterDays <= 365)) e["followUp.reactivationEligibleAfterDays"] = "Use 1–365 days.";
  st.templates.forEach((t) => {
    const v = validateTemplate(t.body);
    if (!v.ok) e[`templates.${t.id}`] = `${t.name}: ${v.errors[0]}`;
  });
  st.faqs.forEach((f, i) => {
    if (!f.question.trim() || !f.answer.trim()) e[`faqs.${i}`] = "Each FAQ needs a question and an answer.";
    else if (!f.keywords.some((k) => k.trim())) e[`faqs.${i}`] = "Add at least one keyword so the assistant can match this FAQ.";
  });
  if (!HM.test(st.consent.quietHoursStart) || !HM.test(st.consent.quietHoursEnd)) e["consent.quiet"] = "Use HH:MM for quiet hours.";
  if (!st.consent.stopKeywords.some((k) => k.trim())) e["consent.stopKeywords"] = "Keep at least one opt-out keyword.";
  if (!st.channels.enabled.length) e["channels"] = "Enable at least one channel.";
  if (!st.channels.enabled.includes(st.channels.default)) e["channels"] = "The default channel must be enabled.";
  if (st.notifications.alertEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(st.notifications.alertEmail)) e["notifications.alertEmail"] = "Enter a valid email address.";
  if (!(st.roi.monthlySoftwareCost >= 0)) e["roi"] = "Enter 0 or more.";
  return e;
}

export function Settings() {
  const s = useDemoState();
  const act = useStore((x) => x.act);
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "clinic");
  const [draft, setDraft] = useState<ClinicSettings>(() => structuredClone(s.settings));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = JSON.stringify(draft) !== JSON.stringify(s.settings);

  const update = (fn: (d: ClinicSettings) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });

  const save = () => {
    const errs = validateSettings(draft);
    setErrors(errs);
    if (Object.keys(errs).length) {
      useStore.getState().notify("error", `Fix ${Object.keys(errs).length} issue${Object.keys(errs).length === 1 ? "" : "s"} before saving: ${Object.values(errs)[0]}`);
      return;
    }
    act((d) => {
      d.settings = structuredClone(draft);
    }, "Settings saved.");
  };

  const err = (k: string) => errors[k];
  const num = (v: string) => (v === "" ? NaN : Number(v));

  return (
    <>
      <PageHeader
        title="Settings"
        description="Clinic configuration used by follow-up, booking and the assistant. The assistant answers only from what is configured here."
        actions={
          <>
            <Button disabled={!dirty} onClick={() => { setDraft(structuredClone(s.settings)); setErrors({}); }}>
              Discard changes
            </Button>
            <Button variant="primary" disabled={!dirty} onClick={save}>
              Save changes
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Settings sections" className="scroll-thin -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
          {TABS.map((t) => {
            const hasError = Object.keys(errors).some((k) => sectionOf(k) === t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={clsx(
                  "flex h-9 shrink-0 items-center justify-between gap-2 rounded-lg px-3 text-left text-[13.5px] whitespace-nowrap",
                  tab === t.id ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:bg-rail",
                )}
              >
                {t.label}
                {hasError && <span className="size-2 rounded-full bg-danger" aria-label="Has errors" />}
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          {tab === "clinic" && (
            <Card>
              <CardHeader title="Clinic information" description="Shown to patients in messages and used for answers about location and contact." />
              <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5">
                <Field label="Clinic name" htmlFor="c-name" error={err("clinic.name")}>
                  <Input id="c-name" value={draft.clinic.name} onChange={(e) => update((d) => void (d.clinic.name = e.target.value))} aria-invalid={!!err("clinic.name") || undefined} />
                </Field>
                <Field label="Country" htmlFor="c-country" hint="Sets currency, locale, timezone and default channel suggestions.">
                  <Select
                    id="c-country"
                    value={draft.clinic.country}
                    onChange={(e) =>
                      update((d) => {
                        const c = COUNTRIES[e.target.value as CountryCode];
                        d.clinic.country = c.code;
                        d.clinic.currency = c.currency;
                        d.clinic.locale = c.locale;
                        d.clinic.timezone = c.timezone;
                        d.channels.default = c.defaultChannel;
                        if (!d.channels.enabled.includes(c.defaultChannel)) d.channels.enabled.push(c.defaultChannel);
                      })
                    }
                  >
                    {Object.values(COUNTRIES).map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Phone" htmlFor="c-phone" error={err("clinic.phone")}>
                  <Input id="c-phone" value={draft.clinic.phone} onChange={(e) => update((d) => void (d.clinic.phone = e.target.value))} aria-invalid={!!err("clinic.phone") || undefined} />
                </Field>
                <Field label="Email" htmlFor="c-email" error={err("clinic.email")}>
                  <Input id="c-email" value={draft.clinic.email} onChange={(e) => update((d) => void (d.clinic.email = e.target.value))} aria-invalid={!!err("clinic.email") || undefined} />
                </Field>
                <Field label="Address" htmlFor="c-address" className="sm:col-span-2">
                  <Input id="c-address" value={draft.clinic.address} onChange={(e) => update((d) => void (d.clinic.address = e.target.value))} />
                </Field>
                <Field label="Currency" htmlFor="c-currency">
                  <Input id="c-currency" value={draft.clinic.currency} onChange={(e) => update((d) => void (d.clinic.currency = e.target.value.toUpperCase().slice(0, 3)))} />
                </Field>
                <Field label="Timezone" htmlFor="c-tz" error={err("clinic.timezone")}>
                  <Input id="c-tz" value={draft.clinic.timezone} onChange={(e) => update((d) => void (d.clinic.timezone = e.target.value))} aria-invalid={!!err("clinic.timezone") || undefined} />
                </Field>
              </div>
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <p className="text-[13px] font-medium text-ink">Before going live in {COUNTRIES[draft.clinic.country].name}</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[12.5px] text-muted">
                  {COUNTRIES[draft.clinic.country].reviewNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-faint">Pointers for legal review only. CaseFlow does not claim compliance with any regulation.</p>
              </div>
            </Card>
          )}

          {tab === "hours" && (
            <>
              <Card>
                <CardHeader title="Working hours" description="Bookable times fall inside these hours and outside breaks." />
                {err("hours.any") && <p className="px-5 pb-2 text-[12.5px] text-danger">{err("hours.any")}</p>}
                <ul className="divide-y divide-line border-t border-line">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const h = draft.workingHours[d];
                    return (
                      <li key={d} className="flex flex-col gap-2 px-4 py-3 sm:px-5 md:flex-row md:items-center md:gap-4">
                        <label className="flex w-36 items-center gap-2 text-[13.5px] font-medium text-ink">
                          <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={h.open} onChange={(e) => update((x) => void (x.workingHours[d].open = e.target.checked))} />
                          {DAYS[d]}
                        </label>
                        {h.open ? (
                          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                            <TimeInput label={`${DAYS[d]} opens`} value={h.start} onChange={(v) => update((x) => void (x.workingHours[d].start = v))} />
                            to
                            <TimeInput label={`${DAYS[d]} closes`} value={h.end} onChange={(v) => update((x) => void (x.workingHours[d].end = v))} />
                            <span className="ml-2">Break</span>
                            <TimeInput label={`${DAYS[d]} break starts`} value={h.breakStart ?? ""} onChange={(v) => update((x) => void (x.workingHours[d].breakStart = v || undefined))} />
                            to
                            <TimeInput label={`${DAYS[d]} break ends`} value={h.breakEnd ?? ""} onChange={(v) => update((x) => void (x.workingHours[d].breakEnd = v || undefined))} />
                          </div>
                        ) : (
                          <span className="text-[13px] text-muted">Closed</span>
                        )}
                        {err(`hours.${d}`) && <p className="text-[12.5px] text-danger">{err(`hours.${d}`)}</p>}
                      </li>
                    );
                  })}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Booking rules" />
                <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5 xl:grid-cols-3">
                  <NumField id="b-notice" label="Minimum notice (hours)" value={draft.booking.minNoticeHours} error={err("booking.minNoticeHours")} onChange={(v) => update((d) => void (d.booking.minNoticeHours = num(v)))} />
                  <NumField id="b-horizon" label="Book up to (days ahead)" value={draft.booking.horizonDays} error={err("booking.horizonDays")} onChange={(v) => update((d) => void (d.booking.horizonDays = num(v)))} />
                  <Field label="Slot interval" htmlFor="b-interval" error={err("booking.slotIntervalMin")}>
                    <Select id="b-interval" value={draft.booking.slotIntervalMin} onChange={(e) => update((d) => void (d.booking.slotIntervalMin = Number(e.target.value)))}>
                      {[10, 15, 20, 30, 60].map((m) => (
                        <option key={m} value={m}>
                          {m} minutes
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <NumField id="b-offer" label="Times offered to the patient" value={draft.booking.slotsOffered} error={err("booking.slotsOffered")} onChange={(v) => update((d) => void (d.booking.slotsOffered = num(v)))} />
                  <NumField id="b-buffer" label="Buffer between appointments (min)" value={draft.booking.bufferMin} error={err("booking.bufferMin")} onChange={(v) => update((d) => void (d.booking.bufferMin = num(v)))} />
                </div>
                <div className="border-t border-line px-4 py-2 sm:px-5">
                  <Toggle
                    checked={draft.booking.allowPatientSelfBooking}
                    onChange={(v) => update((d) => void (d.booking.allowPatientSelfBooking = v))}
                    label="Let patients pick a time in the conversation"
                    description="When off, a booking request is handed to staff instead."
                  />
                </div>
              </Card>
            </>
          )}

          {tab === "team" && (
            <>
              <Card>
                <CardHeader
                  title="Providers"
                  action={
                    <Button size="sm" icon={<Plus size={14} />} onClick={() => update((d) => void d.providers.push({ id: `prov_${Date.now().toString(36)}`, name: "", title: "Dentist", active: true }))}>
                      Add provider
                    </Button>
                  }
                />
                {err("providers") && <p className="px-5 pb-2 text-[12.5px] text-danger">{err("providers")}</p>}
                <ul className="divide-y divide-line border-t border-line">
                  {draft.providers.map((p, i) => (
                    <li key={p.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center sm:px-5">
                      <Input aria-label="Provider name" value={p.name} placeholder="Dr. Name" onChange={(e) => update((d) => void (d.providers[i].name = e.target.value))} aria-invalid={!!err(`providers.${i}`) || undefined} />
                      <Input aria-label="Role" value={p.title} onChange={(e) => update((d) => void (d.providers[i].title = e.target.value))} />
                      <label className="flex items-center gap-2 text-[13px] text-ink-2">
                        <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={p.active} onChange={(e) => update((d) => void (d.providers[i].active = e.target.checked))} />
                        Accepts bookings
                      </label>
                      {err(`providers.${i}`) && <p className="text-[12.5px] text-danger sm:col-span-3">{err(`providers.${i}`)}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Services (appointment types)" description="Duration determines the length of each bookable slot." />
                <ul className="divide-y divide-line border-t border-line">
                  {draft.appointmentTypes.map((t, i) => (
                    <li key={t.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_140px] sm:items-center sm:px-5">
                      <Input aria-label="Service name" value={t.name} onChange={(e) => update((d) => void (d.appointmentTypes[i].name = e.target.value))} />
                      <label className="flex items-center gap-2 text-[13px] text-muted">
                        <Input aria-label={`${t.name} duration in minutes`} inputMode="numeric" value={Number.isNaN(t.durationMin) ? "" : t.durationMin} onChange={(e) => update((d) => void (d.appointmentTypes[i].durationMin = num(e.target.value)))} aria-invalid={!!err(`types.${i}`) || undefined} />
                        min
                      </label>
                      {err(`types.${i}`) && <p className="text-[12.5px] text-danger sm:col-span-2">{err(`types.${i}`)}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Treatment categories" description="Workflow categories only. Patient wording appears in messages; it makes no clinical claim." />
                <ul className="divide-y divide-line border-t border-line">
                  {draft.categories.map((c, i) => (
                    <li key={c.id} className="grid gap-2 px-4 py-3 sm:px-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
                      <Input aria-label="Category name" value={c.name} onChange={(e) => update((d) => void (d.categories[i].name = e.target.value))} />
                      <Input aria-label="Patient wording" value={c.patientLabel} onChange={(e) => update((d) => void (d.categories[i].patientLabel = e.target.value))} />
                      <Select aria-label="Appointment type" value={c.appointmentTypeId} onChange={(e) => update((d) => void (d.categories[i].appointmentTypeId = e.target.value))}>
                        {draft.appointmentTypes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                      <label className="flex items-center gap-2 text-[13px] text-ink-2">
                        <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={c.active} onChange={(e) => update((d) => void (d.categories[i].active = e.target.checked))} />
                        Active
                      </label>
                      {err(`categories.${i}`) && <p className="text-[12.5px] text-danger md:col-span-4">{err(`categories.${i}`)}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          {tab === "followup" && (
            <>
              <Card>
                <CardHeader
                  title="Follow-up sequence"
                  description="Applies to follow-ups started after you save. Running sequences keep their original steps."
                  action={
                    <Button
                      size="sm"
                      icon={<Plus size={14} />}
                      onClick={() =>
                        update((d) => {
                          const last = d.followUp.steps.at(-1);
                          d.followUp.steps.push({ id: `step_${Date.now().toString(36)}`, dayOffset: (last?.dayOffset ?? 0) + 3, label: "Check-in", templateId: d.templates[1]?.id ?? d.templates[0].id });
                        })
                      }
                    >
                      Add step
                    </Button>
                  }
                />
                {err("followUp.steps") && <p className="px-5 pb-2 text-[12.5px] text-danger" role="alert">{err("followUp.steps")}</p>}
                <ul className="divide-y divide-line border-t border-line">
                  {draft.followUp.steps.map((st, i) => (
                    <li key={st.id} className="grid gap-2 px-4 py-3 sm:px-5 md:grid-cols-[110px_1fr_1fr_auto] md:items-center">
                      <label className="flex items-center gap-2 text-[13px] text-muted">
                        Day
                        <Input aria-label={`Step ${i + 1} day`} inputMode="numeric" value={Number.isNaN(st.dayOffset) ? "" : st.dayOffset} onChange={(e) => update((d) => void (d.followUp.steps[i].dayOffset = num(e.target.value)))} />
                      </label>
                      <Input aria-label={`Step ${i + 1} label`} value={st.label} onChange={(e) => update((d) => void (d.followUp.steps[i].label = e.target.value))} />
                      <Select aria-label={`Step ${i + 1} template`} value={st.templateId} onChange={(e) => update((d) => void (d.followUp.steps[i].templateId = e.target.value))}>
                        {draft.templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </Select>
                      <Button size="sm" variant="ghost" aria-label={`Remove step ${i + 1}`} icon={<Trash size={15} />} disabled={draft.followUp.steps.length <= 1} onClick={() => update((d) => void d.followUp.steps.splice(i, 1))} />
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Timing rules" />
                <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5">
                  <NumField id="f-close" label="Close as lost after the last step (days)" value={draft.followUp.autoCloseAfterDays} error={err("followUp.autoCloseAfterDays")} onChange={(v) => update((d) => void (d.followUp.autoCloseAfterDays = num(v)))} />
                  <NumField id="f-defer" label="“Not now” defers for (days)" value={draft.followUp.defaultDeferDays} error={err("followUp.defaultDeferDays")} onChange={(v) => update((d) => void (d.followUp.defaultDeferDays = num(v)))} />
                  <NumField id="f-react-rem" label="Reactivation reminder after (days)" value={draft.followUp.reactivationReminderDays} error={err("followUp.reactivationReminderDays")} onChange={(v) => update((d) => void (d.followUp.reactivationReminderDays = num(v)))} />
                  <NumField id="f-react-elig" label="Unanswered cases reactivation-eligible after (days)" value={draft.followUp.reactivationEligibleAfterDays} error={err("followUp.reactivationEligibleAfterDays")} onChange={(v) => update((d) => void (d.followUp.reactivationEligibleAfterDays = num(v)))} />
                </div>
              </Card>
            </>
          )}

          {tab === "messages" &&
            draft.templates.map((t, i) => (
              <Card key={t.id}>
                <CardHeader title={t.name} description={t.purpose} />
                <div className="px-4 pb-5 sm:px-5">
                  <MessageEditor id={`tpl-${t.id}`} value={t.body} onChange={(v) => update((d) => void (d.templates[i].body = v))} />
                  <ValidationSummary v={validateTemplate(t.body)} />
                </div>
              </Card>
            ))}

          {tab === "knowledge" && (
            <>
              <Card>
                <CardHeader title="Administrative knowledge" description="The assistant answers only from these fields. Leave a field empty and it will reply “I don't have that information” and hand over to staff." />
                <div className="grid gap-4 px-4 pb-5 sm:px-5">
                  {(
                    [
                      ["bookingProcess", "Booking process"],
                      ["paymentMethods", "Accepted payment methods"],
                      ["financing", "Financing / EMI options"],
                      ["parking", "Parking and directions"],
                      ["cancellationPolicy", "Cancellation policy"],
                      ["otherPolicies", "Other clinic policies"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label} htmlFor={`k-${key}`}>
                      <Textarea id={`k-${key}`} rows={2} className="min-h-16" value={draft.knowledge[key]} onChange={(e) => update((d) => void (d.knowledge[key] = e.target.value))} />
                    </Field>
                  ))}
                  <p className="text-[12px] text-muted">Opening hours, address and phone come from the Clinic and Hours tabs. Prices are never shared by the assistant.</p>
                </div>
              </Card>
              <Card>
                <CardHeader
                  title="Administrative FAQs"
                  action={
                    <Button size="sm" icon={<Plus size={14} />} onClick={() => update((d) => void d.faqs.push({ id: `faq_${Date.now().toString(36)}`, question: "", answer: "", keywords: [] }))}>
                      Add FAQ
                    </Button>
                  }
                />
                <ul className="divide-y divide-line border-t border-line">
                  {draft.faqs.map((f, i) => (
                    <li key={f.id} className="grid gap-2 px-4 py-4 sm:px-5">
                      <div className="flex gap-2">
                        <Input aria-label="Question" placeholder="Question" value={f.question} onChange={(e) => update((d) => void (d.faqs[i].question = e.target.value))} />
                        <Button size="sm" variant="ghost" className="h-9" aria-label="Remove FAQ" icon={<Trash size={15} />} onClick={() => update((d) => void d.faqs.splice(i, 1))} />
                      </div>
                      <Textarea aria-label="Answer" placeholder="Answer (administrative only)" rows={2} className="min-h-16" value={f.answer} onChange={(e) => update((d) => void (d.faqs[i].answer = e.target.value))} />
                      <Input
                        aria-label="Keywords"
                        placeholder="Keywords, comma separated"
                        value={f.keywords.join(", ")}
                        onChange={(e) => update((d) => void (d.faqs[i].keywords = e.target.value.split(",").map((k) => k.trimStart())))}
                      />
                      {err(`faqs.${i}`) && <p className="text-[12.5px] text-danger">{err(`faqs.${i}`)}</p>}
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          {tab === "consent" && (
            <>
              <Card>
                <CardHeader title="Consent and contact" />
                <div className="px-4 pb-4 sm:px-5">
                  <Toggle
                    checked={draft.consent.requireAutomationConsent}
                    onChange={(v) => update((d) => void (d.consent.requireAutomationConsent = v))}
                    label="Require recorded consent before automated messages"
                    description="Recommended. Patients without consent appear as “call only”."
                  />
                  <Toggle checked disabled onChange={() => undefined} label="Always honour opt-out keywords" description="Cannot be turned off. An opt-out stops all messaging immediately." />
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Quiet hours start" htmlFor="q-start" error={err("consent.quiet")}>
                      <Input id="q-start" type="time" value={draft.consent.quietHoursStart} onChange={(e) => update((d) => void (d.consent.quietHoursStart = e.target.value))} />
                    </Field>
                    <Field label="Quiet hours end" htmlFor="q-end">
                      <Input id="q-end" type="time" value={draft.consent.quietHoursEnd} onChange={(e) => update((d) => void (d.consent.quietHoursEnd = e.target.value))} />
                    </Field>
                    <Field label="Opt-out keywords" htmlFor="q-stop" error={err("consent.stopKeywords")} hint="A message that is exactly one of these opts the patient out." className="sm:col-span-2">
                      <Input id="q-stop" value={draft.consent.stopKeywords.join(", ")} onChange={(e) => update((d) => void (d.consent.stopKeywords = e.target.value.split(",").map((k) => k.trimStart())))} />
                    </Field>
                  </div>
                </div>
              </Card>
              <Card>
                <CardHeader title="Channels" description="All channels are simulated in this demo." />
                <div className="flex flex-col gap-3 px-4 pb-5 sm:px-5">
                  <div className="flex flex-wrap gap-4">
                    {(["whatsapp", "sms", "email"] as Channel[]).map((ch) => (
                      <label key={ch} className="flex items-center gap-2 text-[13.5px] text-ink">
                        <input
                          type="checkbox"
                          className="size-4 accent-[var(--color-brand)]"
                          checked={draft.channels.enabled.includes(ch)}
                          onChange={(e) => update((d) => void (d.channels.enabled = e.target.checked ? [...d.channels.enabled, ch] : d.channels.enabled.filter((x) => x !== ch)))}
                        />
                        {CHANNEL_LABEL[ch]}
                      </label>
                    ))}
                  </div>
                  <Field label="Default channel" htmlFor="ch-default" error={err("channels")} className="max-w-xs">
                    <Select id="ch-default" value={draft.channels.default} onChange={(e) => update((d) => void (d.channels.default = e.target.value as Channel))}>
                      {(["whatsapp", "sms", "email"] as Channel[]).map((ch) => (
                        <option key={ch} value={ch}>
                          {CHANNEL_LABEL[ch]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </Card>
              <Card>
                <CardHeader title="Escalation rules" description="When CaseFlow stops and hands the conversation to a person." />
                <div className="px-4 pb-4 sm:px-5">
                  <Toggle checked disabled onChange={() => undefined} label="Clinical questions always go to staff" description="Cannot be turned off. The assistant never answers treatment questions." />
                  <Toggle checked={draft.escalation.escalateCostQuestions} onChange={(v) => update((d) => void (d.escalation.escalateCostQuestions = v))} label="Hand cost questions to staff" description="The assistant never quotes prices." />
                  <Toggle checked={draft.escalation.escalateUnknownQuestions} onChange={(v) => update((d) => void (d.escalation.escalateUnknownQuestions = v))} label="Hand unanswered questions to staff" />
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <Field label="Assign handoffs to" htmlFor="esc-assign">
                      <Input id="esc-assign" value={draft.escalation.assignTo} onChange={(e) => update((d) => void (d.escalation.assignTo = e.target.value))} />
                    </Field>
                    <Field label="Extra words that mean “clinical question”" htmlFor="esc-kw" hint="Comma separated. Added to the built-in list.">
                      <Input id="esc-kw" value={draft.escalation.extraClinicalKeywords.join(", ")} onChange={(e) => update((d) => void (d.escalation.extraClinicalKeywords = e.target.value.split(",").map((k) => k.trimStart()).filter((k, idx, arr) => k || idx === arr.length - 1)))} />
                    </Field>
                  </div>
                </div>
              </Card>
            </>
          )}

          {tab === "notifications" && (
            <Card>
              <CardHeader title="Notification preferences" description="Delivered by email in production. Not sent in this demo." />
              <div className="px-4 pb-5 sm:px-5">
                <Toggle checked={draft.notifications.needsHumanAlert} onChange={(v) => update((d) => void (d.notifications.needsHumanAlert = v))} label="Alert when a case needs a human" />
                <Toggle checked={draft.notifications.bookingAlert} onChange={(v) => update((d) => void (d.notifications.bookingAlert = v))} label="Alert when a patient books" />
                <Toggle checked={draft.notifications.dailyDigest} onChange={(v) => update((d) => void (d.notifications.dailyDigest = v))} label="Daily summary for the practice manager" />
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Send alerts to" htmlFor="n-email" error={err("notifications.alertEmail")}>
                    <Input id="n-email" value={draft.notifications.alertEmail} onChange={(e) => update((d) => void (d.notifications.alertEmail = e.target.value))} />
                  </Field>
                  <Field label="Daily summary time" htmlFor="n-time">
                    <Input id="n-time" type="time" value={draft.notifications.digestTime} onChange={(e) => update((d) => void (d.notifications.digestTime = e.target.value))} />
                  </Field>
                  <NumField id="n-roi" label={`Assumed software cost per month (${draft.clinic.currency})`} value={draft.roi.monthlySoftwareCost} error={err("roi")} onChange={(v) => update((d) => void (d.roi.monthlySoftwareCost = num(v)))} hint="Used only for the ROI demo calculation." />
                </div>
              </div>
            </Card>
          )}

          {dirty && <p className="px-1 text-[12.5px] text-warn">You have unsaved changes.</p>}
        </div>
      </div>
    </>
  );
}

function sectionOf(key: string): Tab {
  if (key.startsWith("clinic")) return "clinic";
  if (key.startsWith("hours") || key.startsWith("booking")) return "hours";
  if (key.startsWith("providers") || key.startsWith("types") || key.startsWith("categories")) return "team";
  if (key.startsWith("followUp")) return "followup";
  if (key.startsWith("templates")) return "messages";
  if (key.startsWith("faqs")) return "knowledge";
  if (key.startsWith("consent") || key.startsWith("channels")) return "consent";
  return "notifications";
}

function TimeInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <span className="inline-block w-[128px]">
      <Input type="time" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </span>
  );
}

function NumField({ id, label, value, error, onChange, hint }: { id: string; label: ReactNode; value: number; error?: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint}>
      <Input id={id} inputMode="numeric" value={Number.isNaN(value) ? "" : value} onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))} aria-invalid={!!error || undefined} />
    </Field>
  );
}
