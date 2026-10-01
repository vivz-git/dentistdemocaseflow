"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  ArrowRight,
  ChatCircleDots,
  ClockCountdown,
  HandWaving,
  Play,
  Plus,
  UserFocus,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { computeMetrics, roiEstimate } from "@/lib/domain/analytics";
import { caseContext, reactivationEligibility, runDueFollowUps } from "@/lib/domain/engine";
import { formatDate, formatMoney, formatRelative, formatShortDate, formatSlot, formatWeekday } from "@/lib/domain/format";
import { CASE_STATUSES, STATUS_LABEL } from "@/lib/domain/status";
import type { Case, DemoState } from "@/lib/domain/types";
import { caseRows, nextAction, urgency } from "@/lib/selectors";
import { useDemoState, useNow, useStore } from "@/lib/store";
import { Funnel } from "@/components/charts";
import { StatusBadge, STATUS_STYLE } from "@/components/status";
import { Button, ButtonLink, Card, CardHeader, DemoTag, PageHeader } from "@/components/ui";
import { ToneText } from "@/components/tone";

export function Dashboard() {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const notify = useStore((x) => x.notify);
  const m = computeMetrics(s, now);
  const roi = roiEstimate(s, now);
  const eligible = s.cases.filter((c) => reactivationEligibility(s, c, now).eligible).length;
  const waiting = m.counts.needs_human + m.unread + m.followUpsDue + m.counts.pending + eligible;

  const run = () => {
    const r = act((d, n) => runDueFollowUps(d, n));
    if (r.ok) notify(r.value.sent ? "success" : "info", r.value.held ? `${r.value.held} follow-ups held until quiet hours end.` : `${r.value.sent} follow-up${r.value.sent === 1 ? "" : "s"} sent (simulated).`);
  };

  return (
    <>
      <PageHeader
        title="Today at SmileCare"
        description={`${formatWeekday(now, s.settings)} · ${waiting} item${waiting === 1 ? "" : "s"} waiting for action`}
        actions={
          <>
            <ButtonLink href="/plans/new" icon={<Plus size={16} />}>
              New treatment plan
            </ButtonLink>
            {m.followUpsDue > 0 && (
              <Button variant="primary" icon={<Play size={15} weight="fill" />} onClick={run}>
                Send {m.followUpsDue} due follow-up{m.followUpsDue === 1 ? "" : "s"}
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <WaitingCard s={s} now={now} m={m} eligible={eligible} />
        <RecoveredCard s={s} now={now} m={m} roi={roi} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
        <Card>
          <CardHeader
            title="Treatment plan conversion"
            description="Every plan presented and not scheduled, and how far it has moved."
            action={
              <Link href="/analytics" className="text-[13px] font-medium text-brand no-underline hover:underline">
                Analytics
              </Link>
            }
          />
          <div className="px-4 pb-5 sm:px-5">
            <Funnel
              ariaLabel="Treatment plan conversion funnel"
              stages={[
                { label: "Treatment plans presented", value: m.presented, hint: "Left without scheduling" },
                { label: "Follow-up started", value: m.followUpStarted, hint: "CaseFlow contacted" },
                { label: "Engaged", value: m.engaged, hint: "Patient replied" },
                { label: "Scheduled", value: m.scheduledFunnel, hint: "Appointment booked" },
                { label: "Completed", value: m.completedFunnel, hint: "Visit attended" },
              ]}
            />
            <p className="mt-4 text-[12.5px] text-muted">
              Percentages show conversion from the previous stage. Demo data.
            </p>
          </div>
        </Card>
        <StatusCard s={s} m={m} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-5 lg:grid-cols-2 lg:gap-5">
        <UpcomingCard s={s} now={now} />
        <ActivityCard s={s} now={now} />
      </div>
    </>
  );
}

type M = ReturnType<typeof computeMetrics>;

function WaitingCard({ s, now, m, eligible }: { s: DemoState; now: Date; m: M; eligible: number }) {
  const queues: { key: string; icon: ReactNode; title: string; detail: string; count: number; href: string; cta: string; urgent?: boolean }[] = [
    {
      key: "human",
      icon: <HandWaving size={18} />,
      title: "Needs a human",
      detail: "Clinical questions and call-back requests. CaseFlow has paused on these.",
      count: m.counts.needs_human,
      href: "/cases?status=needs_human",
      cta: "Review",
      urgent: true,
    },
    {
      key: "unread",
      icon: <ChatCircleDots size={18} />,
      title: "Unread patient replies",
      detail: "Patients who wrote back and have not been seen by staff.",
      count: m.unread,
      href: "/conversations?filter=unread",
      cta: "Open inbox",
      urgent: true,
    },
    {
      key: "due",
      icon: <ClockCountdown size={18} />,
      title: "Follow-ups due today",
      detail: "Automated messages scheduled for today.",
      count: m.followUpsDue,
      href: "/follow-ups",
      cta: "View queue",
    },
    {
      key: "pending",
      icon: <UserFocus size={18} />,
      title: "Not yet followed up",
      detail: "Plans presented recently with no follow-up started.",
      count: m.counts.pending,
      href: "/cases?status=pending",
      cta: "Start",
    },
    {
      key: "react",
      icon: <ArrowCounterClockwise size={18} />,
      title: "Ready for reactivation",
      detail: "Deferred or unanswered cases whose waiting period has ended.",
      count: eligible,
      href: "/campaigns/new?kind=reactivation",
      cta: "Reactivate",
    },
  ];

  const top = caseRows(s)
    .filter((r) => urgency(s, r.c, now) < 6)
    .sort((a, b) => urgency(s, a.c, now) - urgency(s, b.c, now) || b.value - a.value)
    .slice(0, 6);

  return (
    <Card>
      <CardHeader title="Waiting for action" description="Open treatment opportunities, most urgent first." />
      <ul className="grid gap-px border-y border-line bg-line sm:grid-cols-2 xl:grid-cols-5">
        {queues.map((q) => (
          <li key={q.key} className="bg-surface">
            <Link href={q.href} className="group flex h-full flex-col gap-1 px-4 py-3.5 no-underline hover:bg-subtle sm:px-5 xl:px-4">
              <span className="flex items-center justify-between gap-2">
                <span className={clsx("inline-flex", q.urgent && q.count ? "text-warn" : "text-muted")}>{q.icon}</span>
                <span className={clsx("text-xl font-semibold", q.urgent && q.count ? "text-[#8a4b04]" : "text-ink", !q.count && "text-faint")}>
                  {q.count}
                </span>
              </span>
              <span className="text-[13px] font-medium text-ink">{q.title}</span>
              <span className="text-[12px] leading-snug text-muted xl:hidden">{q.detail}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-1 text-[12.5px] font-medium text-brand opacity-90 group-hover:opacity-100">
                {q.cta} <ArrowRight size={12} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {top.length ? (
        <ul className="divide-y divide-line">
          {top.map((r) => {
            const na = nextAction(s, r.c, now);
            return (
              <li key={r.c.id}>
                <Link
                  href={`/cases/${r.c.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 no-underline hover:bg-subtle sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {r.name}
                      {r.c.unread && <span className="ml-2 inline-block size-2 rounded-full bg-[#d97706] align-middle" aria-label="Unread reply" />}
                    </p>
                    <p className="truncate text-[12.5px] text-muted">
                      {r.category} · {formatMoney(r.value, s.settings)}
                    </p>
                  </div>
                  <div className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-auto">
                    <ToneText tone={na.tone} className="block truncate text-[13px] font-medium">
                      {na.label}
                    </ToneText>
                    {na.detail && <p className="truncate text-[12px] text-muted">{na.detail}</p>}
                  </div>
                  <StatusBadge status={r.c.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-muted">Nothing is waiting. Every open case is with CaseFlow or booked.</p>
      )}
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <Link href="/cases" className="text-[13px] font-medium text-brand no-underline hover:underline">
          All cases
        </Link>
      </div>
    </Card>
  );
}

function RecoveredCard({ s, now, m, roi }: { s: DemoState; now: Date; m: M; roi: ReturnType<typeof roiEstimate> }) {
  const latest = s.cases
    .filter((c) => c.recovered && (c.status === "scheduled" || c.status === "completed") && c.scheduledAt)
    .sort((a, b) => (b.scheduledAt! > a.scheduledAt! ? 1 : -1))[0];
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="bg-brand-soft/60 px-4 pt-4 pb-5 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-brand-ink">Recovered by CaseFlow</h2>
          <DemoTag>Estimate · demo data</DemoTag>
        </div>
        <p className="mt-3 text-[40px] leading-none font-semibold tracking-[-0.02em] text-brand-ink">
          {formatMoney(m.recoveredValue, s.settings)}
        </p>
        <p className="mt-2 text-[13px] text-brand-ink/80">
          Estimated treatment value from {m.recovered} plan{m.recovered === 1 ? "" : "s"} scheduled after follow-up.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-px border-y border-line bg-line">
        <Mini label="Scheduled rate" value={`${Math.round(m.scheduledRate * 100)}%`} sub={`${m.booked} of ${m.presented} plans`} />
        <Mini label="Avg. time to schedule" value={m.avgDaysToSchedule ? `${Math.round(m.avgDaysToSchedule)} days` : "—"} sub="Presented → booked" />
        <Mini label="Engagement" value={`${Math.round(m.engagementRate * 100)}%`} sub="Replied to follow-up" />
        <Mini
          label="Value ÷ software cost"
          value={roi.multiple !== null ? `${roi.multiple.toFixed(1)}×` : "—"}
          sub={`Last ${roi.days} days · demo calculation`}
        />
      </dl>
      {latest && <LatestRecovery s={s} c={latest} now={now} />}
    </Card>
  );
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-surface px-4 py-3 sm:px-5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-ink">{value}</dd>
      <dd className="text-[11.5px] text-faint">{sub}</dd>
    </div>
  );
}

function LatestRecovery({ s, c, now }: { s: DemoState; c: Case; now: Date }) {
  const { patient, plan, category } = caseContext(s, c);
  const msgs = s.messages.filter((x) => x.caseId === c.id);
  const firstFollowUp = msgs.find((x) => x.sender === "ai");
  const followUps = msgs.filter((x) => x.kind === "follow_up" || x.kind === "campaign").length;
  const firstReply = msgs.find((x) => x.sender === "patient");
  const appt = s.appointments.find((a) => a.id === c.appointmentId);
  const steps = [
    { label: "Plan presented", when: plan.presentedAt, note: category.name },
    { label: c.recoveredVia === "reactivation" ? "Reactivation sent" : "CaseFlow followed up", when: firstFollowUp?.at, note: `${followUps} message${followUps === 1 ? "" : "s"}` },
    { label: "Patient replied", when: firstReply?.at, note: firstReply?.body },
    { label: "Scheduled", when: c.scheduledAt, note: appt ? formatSlot(appt.start, s.settings) : undefined },
  ];
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-ink">Latest recovery</h3>
        <Link href={`/cases/${c.id}`} className="text-[12.5px] font-medium text-brand no-underline hover:underline">
          {patient.firstName} {patient.lastName}
        </Link>
      </div>
      <ol className="mt-3 flex flex-col">
        {steps.map((st, i) => (
          <li key={st.label} className="relative flex gap-3 pb-3 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden className="absolute top-3 left-[5px] h-full w-px bg-line-strong" />}
            <span aria-hidden className={clsx("relative mt-1 size-[11px] shrink-0 rounded-full border-2 border-surface", i === steps.length - 1 ? "bg-brand" : "bg-line-strong")} />
            <div className="min-w-0">
              <p className="text-[13px] text-ink">
                <span className="font-medium">{st.label}</span>
                {st.when && <span className="text-muted"> · {formatShortDate(st.when, s.settings)}</span>}
              </p>
              {st.note && <p className="truncate text-[12px] text-muted">{st.note}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-[11.5px] text-faint">Scheduled {formatRelative(c.scheduledAt!, now, s.settings)}.</p>
    </div>
  );
}

function StatusCard({ s, m }: { s: DemoState; m: M }) {
  return (
    <Card>
      <CardHeader title="Cases by status" description={`${s.cases.length} treatment plans in CaseFlow`} />
      <ul className="px-2 pb-3">
        {CASE_STATUSES.map((st) => (
          <li key={st}>
            <Link href={`/cases?status=${st}`} className="flex h-9 items-center gap-3 rounded-lg px-3 no-underline hover:bg-subtle">
              <span aria-hidden className={clsx("size-2 rounded-full", STATUS_STYLE[st].dot)} />
              <span className="flex-1 text-[13px] text-ink">{STATUS_LABEL[st]}</span>
              <span className="tnum text-[13px] font-semibold text-ink">{m.counts[st]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function UpcomingCard({ s, now }: { s: DemoState; now: Date }) {
  const upcoming = s.appointments
    .filter((a) => a.status === "booked" && a.caseId && new Date(a.end) >= now)
    .sort((a, b) => (a.start > b.start ? 1 : -1))
    .slice(0, 5);
  return (
    <Card>
      <CardHeader
        title="Upcoming treatment appointments"
        description="Booked from CaseFlow cases."
        action={
          <Link href="/appointments" className="text-[13px] font-medium text-brand no-underline hover:underline">
            Calendar
          </Link>
        }
      />
      {upcoming.length ? (
        <ul className="divide-y divide-line border-t border-line">
          {upcoming.map((a) => {
            const c = s.cases.find((x) => x.id === a.caseId)!;
            const { patient, category } = caseContext(s, c);
            const provider = s.settings.providers.find((p) => p.id === a.providerId);
            return (
              <li key={a.id}>
                <Link href={`/cases/${c.id}`} className="flex items-center gap-4 px-4 py-3 no-underline hover:bg-subtle sm:px-5">
                  <div className="w-24 shrink-0">
                    <p className="text-[13px] font-semibold text-ink">{formatSlot(a.start, s.settings).split(",").slice(0, 2).join(",")}</p>
                    <p className="tnum text-[12px] text-muted">{formatSlot(a.start, s.settings).split(",").slice(2).join(",").trim()}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {patient.firstName} {patient.lastName}
                    </p>
                    <p className="truncate text-[12.5px] text-muted">
                      {category.name} · {provider?.name}
                    </p>
                  </div>
                  {c.recovered && <span className="hidden text-[12px] font-medium text-brand sm:inline">Recovered</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="border-t border-line px-5 py-8 text-center text-sm text-muted">No upcoming treatment appointments.</p>
      )}
    </Card>
  );
}

function ActivityCard({ s, now }: { s: DemoState; now: Date }) {
  const interesting = new Set(["appointment_booked", "handoff_created", "opted_out", "patient_replied", "follow_up_started", "deferred", "campaign_added"]);
  const events = s.events
    .filter((e) => interesting.has(e.type) && new Date(e.at) <= now)
    .filter((e, i, all) => !(all[i + 1] && all[i + 1].caseId === e.caseId && (all[i + 1].type === e.type || all[i + 1].type === "appointment_booked")))
    .slice(-7)
    .reverse();
  return (
    <Card>
      <CardHeader title="Recent activity" description="What CaseFlow and the team did most recently." />
      <ul className="divide-y divide-line border-t border-line">
        {events.map((e) => {
          const c = s.cases.find((x) => x.id === e.caseId)!;
          const { patient } = caseContext(s, c);
          return (
            <li key={e.id}>
              <Link href={`/cases/${c.id}`} className="flex items-start gap-3 px-4 py-2.5 no-underline hover:bg-subtle sm:px-5">
                <span className="tnum w-16 shrink-0 pt-px text-[12px] text-faint">{formatRelative(e.at, now, s.settings)}</span>
                <p className="min-w-0 flex-1 text-[13px] text-ink">
                  <span className="font-medium">{patient.firstName} {patient.lastName}</span>
                  <span className="text-ink-2"> — {e.label.charAt(0).toLowerCase() + e.label.slice(1)}</span>
                  {e.detail && e.type !== "follow_up_started" && <span className="block truncate text-[12px] text-muted">{e.detail}</span>}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line px-4 py-3 text-[12px] text-faint sm:px-5">Last updated {formatDate(now, s.settings)}</p>
    </Card>
  );
}
