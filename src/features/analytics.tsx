"use client";

import { useState } from "react";
import { categoryBreakdown, computeMetrics, reactivationPerformance, roiEstimate, stepPerformance, weeklyTrend } from "@/lib/domain/analytics";
import { formatMoney, formatShortDate } from "@/lib/domain/format";
import { useDemoState, useNow, useStore } from "@/lib/store";
import { Funnel, GroupedColumns } from "@/components/charts";
import { Card, CardHeader, DemoTag, Field, Input, PageHeader } from "@/components/ui";

const PRESENTED = "#8a9d96";
const SCHEDULED = "var(--color-brand)";

export function Analytics() {
  const s = useDemoState();
  const now = useNow();
  const m = computeMetrics(s, now);
  const trend = weeklyTrend(s, now, 12);
  const cats = categoryBreakdown(s);
  const steps = stepPerformance(s);
  const react = reactivationPerformance(s);
  const money = (v: number) => formatMoney(v, s.settings);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          <>
            Treatment-plan conversion for {s.settings.clinic.name}. All figures come from synthetic demo data. <DemoTag>Demo data</DemoTag>
          </>
        }
      />

      <Card className="mb-4 lg:mb-5">
        <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Treatment plans presented" value={String(m.presented)} sub="In CaseFlow" />
          <Kpi label="Scheduled rate" value={`${Math.round(m.scheduledRate * 100)}%`} sub={`${m.booked} scheduled or attended`} />
          <Kpi label="Follow-up engagement" value={`${Math.round(m.engagementRate * 100)}%`} sub={`${m.engaged} of ${m.followUpStarted} replied`} />
          <Kpi label="Avg. time to schedule" value={m.avgDaysToSchedule ? `${Math.round(m.avgDaysToSchedule)} days` : "—"} sub="Presented → booked (recovered)" />
          <Kpi label="Recovered cases" value={String(m.recovered)} sub={`${m.counts.deferred} deferred · ${m.counts.lost} lost`} />
          <Kpi label="Est. value recovered" value={money(m.recoveredValue)} sub="Estimate · demo data" accent />
        </dl>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
        <Card>
          <CardHeader title="Conversion funnel" description="Cohort: every plan in CaseFlow. Each stage includes only cases that reached the previous one." />
          <div className="px-4 pb-5 sm:px-5">
            <Funnel
              ariaLabel="Conversion funnel"
              stages={[
                { label: "Plans presented", value: m.presented },
                { label: "Follow-up started", value: m.followUpStarted },
                { label: "Engaged", value: m.engaged },
                { label: "Scheduled", value: m.scheduledFunnel },
                { label: "Completed", value: m.completedFunnel },
              ]}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Plans presented vs scheduled, by week" description="Last 12 weeks. Scheduled counts the week the appointment was booked." />
          <div className="px-4 pb-4 sm:px-5">
            <GroupedColumns
              ariaLabel="Weekly plans presented and scheduled"
              series={[
                { name: "Presented", color: PRESENTED },
                { name: "Scheduled", color: SCHEDULED },
              ]}
              data={trend.map((w) => ({
                key: w.start,
                label: formatShortDate(w.start, s.settings),
                values: [w.presented, w.scheduled],
                tooltip: (
                  <div>
                    <p className="font-semibold text-ink">Week of {formatShortDate(w.start, s.settings)}</p>
                    <p className="text-ink-2">Presented: {w.presented}</p>
                    <p className="text-ink-2">Scheduled: {w.scheduled}</p>
                    <p className="text-ink-2">Recovered value: {money(w.recoveredValue)}</p>
                  </div>
                ),
              }))}
            />
            <details className="mt-3 text-[12.5px]">
              <summary className="cursor-pointer text-muted hover:text-ink">View as table</summary>
              <table className="mt-2 w-full text-left">
                <thead className="text-muted">
                  <tr>
                    <th scope="col" className="py-1 font-medium">Week of</th>
                    <th scope="col" className="py-1 text-right font-medium">Presented</th>
                    <th scope="col" className="py-1 text-right font-medium">Scheduled</th>
                    <th scope="col" className="py-1 text-right font-medium">Recovered value</th>
                  </tr>
                </thead>
                <tbody className="tnum">
                  {trend.map((w) => (
                    <tr key={w.start} className="border-t border-line">
                      <td className="py-1">{formatShortDate(w.start, s.settings)}</td>
                      <td className="py-1 text-right">{w.presented}</td>
                      <td className="py-1 text-right">{w.scheduled}</td>
                      <td className="py-1 text-right">{money(w.recoveredValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="By treatment category" description="Where open opportunity sits and where follow-up converts. Values are estimates." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[12px] text-muted">
                <tr className="border-y border-line">
                  <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Category</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Presented</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Scheduled</th>
                  <th scope="col" className="w-[28%] px-3 py-2.5 font-medium">Scheduled rate</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Open value</th>
                  <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-medium">Recovered value</th>
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-line">
                {cats.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-3 pl-5 text-ink">{c.name}</td>
                    <td className="px-3 py-2.5 text-right">{c.presented}</td>
                    <td className="px-3 py-2.5 text-right">{c.scheduled}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2.5 flex-1 rounded-r-[4px] bg-subtle">
                          <div className="h-full rounded-r-[4px] bg-brand" style={{ width: `${c.scheduledRate * 100}%` }} />
                        </div>
                        <span className="w-9 text-right text-ink-2">{Math.round(c.scheduledRate * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{money(c.openValue)}</td>
                    <td className="py-2.5 pr-5 pl-3 text-right font-medium text-ink">{money(c.recoveredValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Follow-up performance" description="Which step came before the patient's first reply, and before the booking." />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="text-[12px] text-muted">
                <tr className="border-y border-line">
                  <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Step</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Sent</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">First replies</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Reply rate</th>
                  <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-medium">Bookings</th>
                </tr>
              </thead>
              <tbody className="tnum divide-y divide-line">
                {steps.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 pr-3 pl-5 text-ink">
                      Day {r.dayOffset} · {r.label}
                    </td>
                    <td className="px-3 py-2.5 text-right">{r.sent}</td>
                    <td className="px-3 py-2.5 text-right">{r.firstReplies}</td>
                    <td className="px-3 py-2.5 text-right text-ink-2">{r.sent ? `${Math.round((r.firstReplies / r.sent) * 100)}%` : "—"}</td>
                    <td className="py-2.5 pr-5 pl-3 text-right font-medium text-brand">{r.bookings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Reactivation performance" description="Deferred patients contacted again through reactivation campaigns." />
          <dl className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4">
            <Kpi label="Contacted" value={String(m.reactivation.contacted)} />
            <Kpi label="Engaged" value={String(m.reactivation.engaged)} />
            <Kpi label="Booked" value={String(m.reactivation.booked)} accent />
            <Kpi label="Est. value" value={money(m.reactivation.value)} sub="Estimate" />
          </dl>
          <ul className="divide-y divide-line">
            {react.map((r) => (
              <li key={r.id} className="px-4 py-3 text-[13px] sm:px-5">
                <p className="font-medium text-ink">{r.name}</p>
                <p className="text-[12.5px] text-muted">
                  Launched {formatShortDate(r.launchedAt, s.settings)} · {r.recipients} recipients · {r.replied} replied · {r.scheduled} booked · {r.optedOut} opted out · {r.needsHuman} needs human
                </p>
              </li>
            ))}
            {!react.length && <li className="px-5 py-6 text-center text-[13px] text-muted">No reactivation campaigns launched yet.</li>}
          </ul>
        </Card>

        <Hypothetical />
        <Roi />
      </div>
    </>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={accent ? "mt-1 text-xl font-semibold text-brand-ink" : "mt-1 text-xl font-semibold text-ink"}>{value}</dd>
      {sub && <dd className="text-[11.5px] text-faint">{sub}</dd>}
    </div>
  );
}

function Hypothetical() {
  const s = useDemoState();
  const avg = s.plans.length ? s.plans.reduce((sum, p) => sum + p.estimatedValue, 0) / s.plans.length : 0;
  const plans = 100;
  const before = 25;
  const after = 38;
  return (
    <Card className="border-warn/35">
      <div className="border-b border-warn/30 bg-warn-soft px-4 py-2.5 sm:px-5">
        <p className="text-[12px] font-semibold tracking-wide text-[#7a4304] uppercase">Hypothetical demo data — not customer results</p>
      </div>
      <CardHeader title="Illustration: structured follow-up" description="A worked example to explain the idea. These are not measured CaseFlow outcomes." />
      <div className="px-4 pb-5 sm:px-5">
        <div className="flex flex-col gap-3">
          {[
            { label: "Without structured follow-up", value: before },
            { label: "With structured follow-up", value: after },
          ].map((row, i) => (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-[13px]">
                <span className="text-ink">{row.label}</span>
                <span className="tnum font-semibold text-ink">
                  {row.value} of {plans} scheduled
                </span>
              </div>
              <div className="h-3 rounded-r-[4px] bg-subtle">
                <div className="h-full rounded-r-[4px]" style={{ width: `${row.value}%`, background: i ? SCHEDULED : PRESENTED }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-ink-2">
          In this illustration, {after - before} more of {plans} plans are scheduled. At this demo clinic&apos;s average estimated plan value of {formatMoney(avg, s.settings)}, that would be about{" "}
          <span className="font-semibold text-ink">{formatMoney((after - before) * avg, s.settings)}</span> in additional scheduled treatment. <DemoTag>Demo calculation</DemoTag>
        </p>
      </div>
    </Card>
  );
}

function Roi() {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const [cost, setCost] = useState(String(s.settings.roi.monthlySoftwareCost));
  const roi = roiEstimate(s, now);
  const save = (v: string) => {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) act((d) => void (d.settings.roi.monthlySoftwareCost = Math.round(n)));
  };
  return (
    <Card>
      <CardHeader title="Return on software cost" description={`Last ${roi.days} days. All values are estimates from demo data.`} action={<DemoTag>Demo calculation</DemoTag>} />
      <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5">
        <Field label={`Software cost per month (${s.settings.clinic.currency})`} htmlFor="roi-cost" hint="Assumed price for the calculation. Not a quote.">
          <Input
            id="roi-cost"
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => save(cost)}
            onKeyDown={(e) => e.key === "Enter" && save(cost)}
          />
        </Field>
        <div className="rounded-lg bg-subtle px-4 py-3">
          <p className="text-[12px] text-muted">Estimated treatment value recovered ÷ estimated software cost</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{roi.multiple !== null ? `${roi.multiple.toFixed(1)}×` : "—"}</p>
          <p className="tnum text-[12px] text-muted">
            {formatMoney(roi.value, s.settings)} ÷ {formatMoney(roi.cost, s.settings)}
          </p>
        </div>
      </div>
      <p className="border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
        Estimated value is the clinic&apos;s plan estimate for cases scheduled after CaseFlow follow-up. It is not collected revenue.
      </p>
    </Card>
  );
}
