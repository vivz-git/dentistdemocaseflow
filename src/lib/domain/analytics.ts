import { campaignStats, dueFollowUps } from "./engine";
import { CASE_STATUSES, isOpen } from "./status";
import { DAY, endOfLocalDay, localDayAt, zonedParts } from "./time";
import type { Case, CaseStatus, DemoState } from "./types";

const isBooked = (c: Case) => c.status === "scheduled" || c.status === "completed";

export function planValue(s: DemoState, c: Case) {
  return s.plans.find((p) => p.id === c.planId)?.estimatedValue ?? 0;
}

export function computeMetrics(s: DemoState, now: Date) {
  const counts = Object.fromEntries(CASE_STATUSES.map((st) => [st, 0])) as Record<CaseStatus, number>;
  for (const c of s.cases) counts[c.status]++;

  const presented = s.plans.length;
  const started = s.cases.filter((c) => c.followUpStartedAt);
  const engaged = started.filter((c) => c.engagedAt);
  const scheduledFunnel = engaged.filter(isBooked);
  const completedFunnel = engaged.filter((c) => c.status === "completed");
  const booked = s.cases.filter(isBooked);
  const recovered = s.cases.filter((c) => c.recovered && isBooked(c));
  const recoveredValue = recovered.reduce((sum, c) => sum + planValue(s, c), 0);
  const openCases = s.cases.filter((c) => isOpen(c.status));
  const openValue = openCases.reduce((sum, c) => sum + planValue(s, c), 0);

  const scheduleDays = recovered
    .map((c) => {
      const plan = s.plans.find((p) => p.id === c.planId);
      return plan && c.scheduledAt ? (new Date(c.scheduledAt).getTime() - new Date(plan.presentedAt).getTime()) / DAY : null;
    })
    .filter((x): x is number => x !== null);

  const due = dueFollowUps(s, endOfLocalDay(now, s.settings.clinic.timezone));
  const overdue = due.filter((c) => new Date(c.sequence.nextStepAt!) <= now);

  const reactivated = s.cases.filter((c) => c.sequence.kind === "reactivation" && c.sequence.startedAt);

  return {
    counts,
    presented,
    followUpStarted: started.length,
    engaged: engaged.length,
    scheduledFunnel: scheduledFunnel.length,
    completedFunnel: completedFunnel.length,
    booked: booked.length,
    scheduledRate: presented ? booked.length / presented : 0,
    engagementRate: started.length ? engaged.length / started.length : 0,
    followUpConversion: started.length ? scheduledFunnel.length / started.length : 0,
    recovered: recovered.length,
    recoveredValue,
    openValue,
    avgDaysToSchedule: scheduleDays.length ? scheduleDays.reduce((a, b) => a + b, 0) / scheduleDays.length : null,
    followUpsDue: due.length,
    followUpsOverdue: overdue.length,
    unread: s.cases.filter((c) => c.unread).length,
    reactivation: {
      contacted: reactivated.length,
      engaged: reactivated.filter((c) =>
        s.messages.some((m) => m.caseId === c.id && m.sender === "patient" && m.at >= c.sequence.startedAt!),
      ).length,
      booked: reactivated.filter(isBooked).length,
      value: reactivated.filter(isBooked).reduce((sum, c) => sum + planValue(s, c), 0),
    },
  };
}

export type Metrics = ReturnType<typeof computeMetrics>;

/** Weekly trend for the last `weeks` weeks, clinic-local Monday starts. */
export function weeklyTrend(s: DemoState, now: Date, weeks = 12) {
  const tz = s.settings.clinic.timezone;
  const p = zonedParts(now, tz);
  const mondayOffset = (p.weekday + 6) % 7;
  const thisMonday = localDayAt(now, tz, -mondayOffset);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = localDayAt(thisMonday, tz, -7 * (weeks - 1 - i));
    const end = localDayAt(start, tz, 7);
    return { start, end, presented: 0, scheduled: 0, recovered: 0, recoveredValue: 0 };
  });
  const find = (iso?: string) => {
    if (!iso) return undefined;
    const t = new Date(iso).getTime();
    return buckets.find((b) => t >= b.start.getTime() && t < b.end.getTime());
  };
  for (const plan of s.plans) {
    const b = find(plan.presentedAt);
    if (b) b.presented++;
  }
  for (const c of s.cases) {
    if (!isBooked(c)) continue;
    const b = find(c.scheduledAt);
    if (!b) continue;
    b.scheduled++;
    if (c.recovered) {
      b.recovered++;
      b.recoveredValue += planValue(s, c);
    }
  }
  return buckets.map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
}

export function categoryBreakdown(s: DemoState) {
  return s.settings.categories
    .map((cat) => {
      const plans = s.plans.filter((p) => p.categoryId === cat.id);
      const cases = plans.map((p) => s.cases.find((c) => c.id === p.caseId)!).filter(Boolean);
      const booked = cases.filter(isBooked);
      const recovered = booked.filter((c) => c.recovered);
      return {
        id: cat.id,
        name: cat.name,
        presented: plans.length,
        scheduled: booked.length,
        recovered: recovered.length,
        open: cases.filter((c) => isOpen(c.status)).length,
        recoveredValue: recovered.reduce((sum, c) => sum + planValue(s, c), 0),
        openValue: cases.filter((c) => isOpen(c.status)).reduce((sum, c) => sum + planValue(s, c), 0),
        scheduledRate: plans.length ? booked.length / plans.length : 0,
      };
    })
    .filter((x) => x.presented > 0)
    .sort((a, b) => b.presented - a.presented);
}

/** Which follow-up step preceded the patient's first reply and the booking. */
export function stepPerformance(s: DemoState) {
  const steps = s.settings.followUp.steps;
  const rows = steps.map((st) => ({ id: st.id, label: st.label, dayOffset: st.dayOffset, sent: 0, firstReplies: 0, bookings: 0 }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const m of s.messages) {
    if (m.stepId && byId.has(m.stepId)) byId.get(m.stepId)!.sent++;
  }
  for (const c of s.cases) {
    if (c.sequence.kind !== "standard") continue;
    const msgs = s.messages.filter((m) => m.caseId === c.id);
    const firstReply = msgs.find((m) => m.sender === "patient");
    const stepBefore = (iso: string) =>
      [...msgs].reverse().find((m) => m.stepId && byId.has(m.stepId) && m.at <= iso)?.stepId;
    if (firstReply) {
      const id = stepBefore(firstReply.at);
      if (id) byId.get(id)!.firstReplies++;
    }
    if (c.recovered && isBooked(c) && c.scheduledAt) {
      const id = stepBefore(c.scheduledAt);
      if (id) byId.get(id)!.bookings++;
    }
  }
  return rows;
}

export function reactivationPerformance(s: DemoState) {
  return s.campaigns
    .filter((c) => c.kind === "reactivation" && c.launchedAt)
    .map((c) => ({ id: c.id, name: c.name, launchedAt: c.launchedAt!, ...campaignStats(s, c.id)! }));
}

/** Demo calculation: value recovered in the window vs software cost for the same window. */
export function roiEstimate(s: DemoState, now: Date, days = 90) {
  const since = now.getTime() - days * DAY;
  const value = s.cases
    .filter((c) => c.recovered && isBooked(c) && c.scheduledAt && new Date(c.scheduledAt).getTime() >= since)
    .reduce((sum, c) => sum + planValue(s, c), 0);
  const cost = s.settings.roi.monthlySoftwareCost * (days / 30);
  return { days, value, cost, multiple: cost > 0 ? value / cost : null };
}
