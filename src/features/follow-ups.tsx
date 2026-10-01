"use client";

import Link from "next/link";
import { Pause, PaperPlaneTilt, Play } from "@phosphor-icons/react";
import { CHANNEL_LABEL } from "@/lib/domain/countries";
import { caseContext, dueFollowUps, followUpEligibility, pauseAutomation, returnToAutomation, runDueFollowUps, sendNextStepNow, startFollowUp } from "@/lib/domain/engine";
import { formatDateTime, formatMoney, formatRelative } from "@/lib/domain/format";
import { DAY, endOfLocalDay, inQuietHours } from "@/lib/domain/time";
import { renderTemplate } from "@/lib/domain/templates";
import type { Case } from "@/lib/domain/types";
import { useDemoState, useNow, useStore } from "@/lib/store";
import { AutomationIndicator, StatusBadge } from "@/components/status";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";

export function FollowUps() {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const notify = useStore((x) => x.notify);
  const tz = s.settings.clinic.timezone;
  const due = dueFollowUps(s, endOfLocalDay(now, tz)).sort((a, b) => (a.sequence.nextStepAt! > b.sequence.nextStepAt! ? 1 : -1));
  const upcoming = dueFollowUps(s, new Date(now.getTime() + 7 * DAY))
    .filter((c) => !due.includes(c))
    .sort((a, b) => (a.sequence.nextStepAt! > b.sequence.nextStepAt! ? 1 : -1));
  const paused = s.cases.filter((c) => (c.status === "follow_up_active" || c.status === "engaged") && (c.automation.state === "paused" || c.automation.state === "staff"));
  const ready = s.cases.filter((c) => c.status === "pending");
  const quiet = inQuietHours(now, tz, s.settings.consent.quietHoursStart, s.settings.consent.quietHoursEnd);

  const run = () => {
    const r = act((d, n) => runDueFollowUps(d, n));
    if (r.ok) {
      const v = r.value;
      notify(v.sent || v.closed ? "success" : "info", `Scheduler ran: ${v.sent} sent${v.held ? `, ${v.held} held for quiet hours` : ""}${v.closed ? `, ${v.closed} closed with no response` : ""}.`);
    }
  };
  const startAll = () => {
    const eligible = ready.filter((c) => followUpEligibility(s, c).eligible);
    act(
      (d, n) => eligible.forEach((c) => startFollowUp(d, c.id, n)),
      `Follow-up started for ${eligible.length} patient${eligible.length === 1 ? "" : "s"} (simulated messages sent).`,
    );
  };

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="The automated sequence for every plan that was not scheduled. Staff can send, pause or reschedule any step."
        actions={
          <Button variant="primary" icon={<Play size={15} weight="fill" />} onClick={run}>
            Run scheduler now
          </Button>
        }
      />
      {quiet && (
        <p className="mb-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px] text-[#7a4304]">
          Quiet hours are on ({s.settings.consent.quietHoursStart}–{s.settings.consent.quietHoursEnd}). Automated messages wait until quiet hours end. Staff can still send a step manually.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <Card>
            <CardHeader title={`Due today · ${due.length}`} description="Sent by the scheduler. Overdue items send on the next run." />
            {due.length ? (
              <QueueList cases={due} now={now} mode="due" />
            ) : (
              <EmptyState title="Nothing due today">Upcoming steps are listed below.</EmptyState>
            )}
          </Card>
          <Card>
            <CardHeader title={`Next 7 days · ${upcoming.length}`} />
            {upcoming.length ? <QueueList cases={upcoming} now={now} mode="upcoming" /> : <EmptyState title="No steps scheduled this week" />}
          </Card>
          <Card>
            <CardHeader title={`Paused or with staff · ${paused.length}`} description="Automation will not send or reply on these until a person hands them back." />
            {paused.length ? <QueueList cases={paused} now={now} mode="paused" /> : <EmptyState title="Nothing paused" />}
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:gap-5">
          <Card>
            <CardHeader
              title={`Ready to start · ${ready.length}`}
              description="Plans with no follow-up yet."
              action={
                ready.some((c) => followUpEligibility(s, c).eligible) ? (
                  <Button size="sm" variant="primary" onClick={startAll}>
                    Start all eligible
                  </Button>
                ) : undefined
              }
            />
            <ul className="divide-y divide-line border-t border-line">
              {ready.map((c) => {
                const { patient, category, plan } = caseContext(s, c);
                const e = followUpEligibility(s, c);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/cases/${c.id}`} className="text-sm font-medium text-ink no-underline hover:underline">
                        {patient.firstName} {patient.lastName}
                      </Link>
                      <p className="truncate text-[12px] text-muted">
                        {category.name} · {formatMoney(plan.estimatedValue, s.settings)}
                      </p>
                      {!e.eligible && <p className="text-[12px] text-warn">{e.reason}</p>}
                    </div>
                    {e.eligible && (
                      <Button size="sm" onClick={() => act((d, n) => startFollowUp(d, c.id, n), `Follow-up started for ${patient.firstName}.`)}>
                        Start
                      </Button>
                    )}
                  </li>
                );
              })}
              {!ready.length && <li className="px-5 py-6 text-center text-[13px] text-muted">Every plan has follow-up started.</li>}
            </ul>
          </Card>
          <Card>
            <CardHeader
              title="Default sequence"
              action={
                <ButtonLink href="/settings?tab=followup" size="sm" variant="ghost">
                  Edit
                </ButtonLink>
              }
            />
            <ol className="flex flex-col gap-3 px-4 pb-5 sm:px-5">
              {s.settings.followUp.steps.map((st) => {
                const tpl = s.settings.templates.find((t) => t.id === st.templateId);
                return (
                  <li key={st.id} className="text-[13px]">
                    <p className="font-medium text-ink">
                      Day {st.dayOffset} · {st.label}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">
                      {tpl ? renderTemplate(tpl.body, { patient_first_name: "Priya", clinic_name: s.settings.clinic.name, treatment_name: "crown appointment", provider_name: "Dr. Ananya Rao", clinic_phone: s.settings.clinic.phone }) : "Template missing"}
                    </p>
                  </li>
                );
              })}
            </ol>
            <p className="border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
              Stops automatically when the patient books, replies, opts out, asks a clinical question, or staff take over. Cases with no reply close {s.settings.followUp.autoCloseAfterDays} days after the last step.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function QueueList({ cases, now, mode }: { cases: Case[]; now: Date; mode: "due" | "upcoming" | "paused" }) {
  const s = useDemoState();
  const act = useStore((x) => x.act);
  return (
    <ul className="divide-y divide-line border-t border-line">
      {cases.map((c) => {
        const { patient, category } = caseContext(s, c);
        const step = c.sequence.steps[c.sequence.stepIndex];
        const overdue = c.sequence.nextStepAt && new Date(c.sequence.nextStepAt) <= now;
        return (
          <li key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/cases/${c.id}`} className="text-sm font-medium text-ink no-underline hover:underline">
                  {patient.firstName} {patient.lastName}
                </Link>
                {mode === "paused" ? <StatusBadge status={c.status} /> : <Badge>{CHANNEL_LABEL[patient.preferredChannel]}</Badge>}
              </div>
              <p className="truncate text-[12.5px] text-muted">
                {category.name}
                {step && mode !== "paused" && (
                  <>
                    {" "}
                    · <span className="text-ink-2">{step.label}</span> · {c.sequence.kind === "reactivation" ? "Reactivation" : `Day ${step.dayOffset}`}
                  </>
                )}
              </p>
              {mode === "paused" ? (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
                  <AutomationIndicator state={c.automation.state} />
                  <span className="text-muted">{c.automation.reason}</span>
                </div>
              ) : (
                <p className={overdue ? "text-[12px] font-medium text-[#174ea6]" : "text-[12px] text-muted"}>
                  {overdue ? "Due now" : formatDateTime(c.sequence.nextStepAt!, s.settings)} · {formatRelative(c.sequence.nextStepAt!, now, s.settings)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              {mode !== "paused" ? (
                <>
                  <Button size="sm" icon={<PaperPlaneTilt size={14} />} onClick={() => act((d, n) => sendNextStepNow(d, c.id, n), `${step?.label ?? "Follow-up"} sent to ${patient.firstName} (simulated).`)}>
                    Send now
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pause size={14} />} onClick={() => act((d, n) => pauseAutomation(d, c.id, n), "Automation paused.")}>
                    Pause
                  </Button>
                </>
              ) : (
                <>
                  {!patient.consent.doNotContact && c.status !== "needs_human" && (
                    <Button size="sm" onClick={() => act((d, n) => returnToAutomation(d, c.id, n), "Returned to automation.")}>
                      Resume
                    </Button>
                  )}
                  <ButtonLink href={`/cases/${c.id}`} size="sm" variant="ghost">
                    Open
                  </ButtonLink>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
