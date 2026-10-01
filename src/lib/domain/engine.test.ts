import { describe, expect, it } from "vitest";
import { seedDemo } from "@/lib/demo/seed";
import { computeMetrics, roiEstimate, stepPerformance } from "./analytics";
import { FALLBACK_REPLY, GUARDRAIL_REPLY, respond } from "./assistant";
import { defaultSettings } from "./defaults";
import {
  approveCampaign,
  bookAppointment,
  cancelAppointment,
  createCampaign,
  createPlan,
  DomainError,
  launchCampaign,
  offerSlots,
  patientAction,
  patientSelectSlot,
  patientText,
  reactivationEligibility,
  returnToAutomation,
  runDueFollowUps,
  simulateCampaignResponses,
  staffSendMessage,
  startFollowUp,
  takeOver,
  getCase,
  markLost,
  campaignStats,
  pauseCampaign,
  stopAutomation,
} from "./engine";
import { findConflict, findSlots } from "./slots";
import { canTransition } from "./status";
import { DAY, HOUR, localDayAt, zonedParts, zonedTimeToUtc } from "./time";
import type { DemoState } from "./types";

const TZ = "Asia/Kolkata";
// A fixed Wednesday, 11:00 IST — inside clinic hours and outside quiet hours.
const NOW = zonedTimeToUtc(2026, 9, 30, 11, 0, TZ);

function emptyState(): DemoState {
  return {
    schemaVersion: 1,
    seededAt: NOW.toISOString(),
    clockOffsetMs: 0,
    seq: 0,
    settings: defaultSettings(),
    patients: [],
    plans: [],
    cases: [],
    messages: [],
    events: [],
    notes: [],
    appointments: [],
    campaigns: [],
  };
}

function addCase(s: DemoState, overrides: Partial<Parameters<typeof createPlan>[1]> = {}) {
  return createPlan(
    s,
    {
      firstName: "Test",
      lastName: "Patient",
      phone: "+91 90000 00001",
      email: "test@example.com",
      preferredChannel: "whatsapp",
      automatedConsent: true,
      categoryId: "cat_crown",
      providerId: "prov_rao",
      estimatedValue: 12000,
      presentedAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
      summary: "Synthetic",
      ...overrides,
    },
    NOW,
  );
}

const lastMessage = (s: DemoState, caseId: string) => s.messages.filter((m) => m.caseId === caseId).at(-1)!;

describe("time helpers", () => {
  it("converts clinic wall time to UTC", () => {
    const d = zonedTimeToUtc(2026, 10, 1, 9, 30, TZ);
    expect(d.toISOString()).toBe("2026-10-01T04:00:00.000Z");
    const p = zonedParts(d, TZ);
    expect([p.hour, p.minute, p.weekday]).toEqual([9, 30, 4]);
  });
  it("handles DST zones", () => {
    const d = zonedTimeToUtc(2026, 7, 1, 9, 0, "Europe/London");
    expect(d.toISOString()).toBe("2026-07-01T08:00:00.000Z");
  });
});

describe("status machine", () => {
  it("blocks impossible transitions", () => {
    expect(canTransition("completed", "pending")).toBe(false);
    expect(canTransition("do_not_contact", "follow_up_active")).toBe(false);
    expect(canTransition("pending", "follow_up_active")).toBe(true);
  });
});

describe("follow-up engine", () => {
  it("starts a sequence, sends day 0 and schedules day 2", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    expect(c.status).toBe("follow_up_active");
    expect(c.automation.state).toBe("running");
    expect(c.sequence.sentCount).toBe(1);
    expect(new Date(c.sequence.nextStepAt!).getTime()).toBe(NOW.getTime() + 2 * DAY);
    const msg = lastMessage(s, c.id);
    expect(msg.sender).toBe("ai");
    expect(msg.body).toContain("Hi Test");
    expect(msg.body).toContain("SmileCare Dental Clinic");
    expect(msg.actions).toEqual(["book", "contact", "not_now", "stop"]);
  });

  it("refuses to start without automated-message consent", () => {
    const s = emptyState();
    const c = addCase(s, { automatedConsent: false });
    expect(() => startFollowUp(s, c.id, NOW)).toThrow(DomainError);
    expect(c.status).toBe("pending");
  });

  it("sends due steps, holds during quiet hours, and closes after the sequence", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    // 2 days later at 23:00 IST — quiet hours.
    const night = zonedTimeToUtc(2026, 10, 2, 23, 0, TZ);
    expect(runDueFollowUps(s, night).held).toBe(1);
    expect(c.sequence.sentCount).toBe(1);
    const morning = zonedTimeToUtc(2026, 10, 3, 9, 30, TZ);
    expect(runDueFollowUps(s, morning).sent).toBe(1);
    expect(c.sequence.sentCount).toBe(2);
    // Run through the rest of the sequence.
    for (let d = 1; d <= 20; d++) runDueFollowUps(s, new Date(morning.getTime() + d * DAY));
    expect(c.sequence.sentCount).toBe(4);
    expect(c.status).toBe("lost");
    expect(c.lostReason).toMatch(/No response/);
  });
});

describe("booking", () => {
  it("patient books from offered slots; case becomes Scheduled and recovered", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    patientAction(s, c.id, "book", new Date(NOW.getTime() + HOUR));
    expect(c.status).toBe("engaged");
    const offer = lastMessage(s, c.id);
    expect(offer.kind).toBe("slot_offer");
    expect(offer.slots!.length).toBeGreaterThan(0);
    for (const slot of offer.slots!) {
      expect(new Date(slot.start).getTime()).toBeGreaterThanOrEqual(NOW.getTime() + HOUR + 18 * HOUR);
      const p = zonedParts(slot.start, TZ);
      expect(p.weekday).not.toBe(0); // closed Sundays
    }
    const before = computeMetrics(s, NOW);
    patientSelectSlot(s, c.id, offer.slots![0], new Date(NOW.getTime() + 2 * HOUR));
    expect(c.status).toBe("scheduled");
    expect(c.recovered).toBe(true);
    expect(c.recoveredVia).toBe("follow_up");
    expect(c.automation.state).toBe("stopped");
    expect(s.appointments.filter((a) => a.status === "booked")).toHaveLength(1);
    expect(s.events.some((e) => e.caseId === c.id && e.type === "appointment_booked")).toBe(true);
    const after = computeMetrics(s, NOW);
    expect(after.recovered).toBe(before.recovered + 1);
    expect(after.recoveredValue).toBe(12000);
    expect(after.counts.scheduled).toBe(1);
  });

  it("prevents double-booking the same provider time", () => {
    const s = emptyState();
    const a = addCase(s);
    const b = addCase(s, { firstName: "Other" });
    const slot = findSlots(s, { appointmentTypeId: "at_crown", providerId: "prov_rao", now: NOW })[0];
    bookAppointment(s, a.id, slot, NOW, "staff");
    expect(findConflict(s, slot)).toMatch(/taken/);
    expect(() => bookAppointment(s, b.id, slot, NOW, "staff")).toThrow(/taken/);
    expect(b.status).toBe("pending");
    // A stale offer selected by a patient gets fresh options instead.
    startFollowUp(s, b.id, NOW);
    patientSelectSlot(s, b.id, slot, NOW);
    expect(b.status).toBe("engaged");
    expect(lastMessage(s, b.id).kind).toBe("slot_offer");
    expect(lastMessage(s, b.id).slots!.some((x) => x.start === slot.start)).toBe(false);
  });

  it("rejects bookings outside clinic hours", () => {
    const s = emptyState();
    const sunday = zonedTimeToUtc(2026, 10, 4, 10, 0, TZ);
    expect(
      findConflict(s, { start: sunday.toISOString(), end: new Date(sunday.getTime() + HOUR).toISOString(), providerId: "prov_rao", appointmentTypeId: "at_crown" }),
    ).toMatch(/closed/);
  });

  it("staff booking without follow-up is not counted as recovered; cancelling reopens the case", () => {
    const s = emptyState();
    const c = addCase(s);
    const slot = findSlots(s, { appointmentTypeId: "at_crown", providerId: "prov_rao", now: NOW })[0];
    const appt = bookAppointment(s, c.id, slot, NOW, "staff")!;
    expect(c.recovered).toBe(false);
    cancelAppointment(s, appt.id, "Patient unwell", NOW);
    expect(c.status).toBe("engaged");
    expect(c.appointmentId).toBeUndefined();
    expect(appt.status).toBe("cancelled");
  });
});

describe("guardrails", () => {
  const settings = defaultSettings();
  it.each([
    "Is this treatment right for me?",
    "Can I avoid this treatment?",
    "What treatment do I need?",
    "Will this hurt?",
    "What should I take?",
    "Can I do this instead?",
    "Do I really need this?",
    "Can this heal on its own?",
  ])("routes clinical question to staff: %s", (q) => {
    const d = respond({ text: q, settings });
    expect(d.intent).toBe("clinical");
    expect(d.reply).toBe(GUARDRAIL_REPLY);
    expect(d.handoffReason).toBeTruthy();
  });

  it("answers administrative questions from configured knowledge only", () => {
    expect(respond({ text: "Where can I park?", settings }).reply).toContain(settings.knowledge.parking);
    expect(respond({ text: "What are your opening hours?", settings }).reply).toContain("Mon–Fri");
    expect(respond({ text: "Do you take UPI?", settings }).reply).toContain("UPI");
    const cost = respond({ text: "How much will it cost?", settings });
    expect(cost.reply).toBe(FALLBACK_REPLY);
    const missing = defaultSettings();
    missing.knowledge.parking = "";
    expect(respond({ text: "Is there parking?", settings: missing }).reply).toBe(FALLBACK_REPLY);
    expect(respond({ text: "Do you do home visits for pets?", settings }).reply).toBe(FALLBACK_REPLY);
  });

  it("does not treat 'stop' inside a sentence as an opt-out", () => {
    expect(respond({ text: "When will the bleeding stop?", settings }).intent).toBe("clinical");
    expect(respond({ text: "STOP", settings }).intent).toBe("opt_out");
  });

  it("clinical question marks the case Needs Human and pauses automation", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    patientText(s, c.id, "Do I really need this or can it heal on its own?", NOW);
    expect(c.status).toBe("needs_human");
    expect(c.automation.state).toBe("paused");
    expect(lastMessage(s, c.id).body).toBe(GUARDRAIL_REPLY);
    // Further patient messages get no automated reply until staff respond.
    const count = s.messages.length;
    patientText(s, c.id, "Hello?", NOW);
    expect(s.messages.length).toBe(count + 1);
    expect(lastMessage(s, c.id).sender).toBe("patient");
    // Staff resolves and returns the case to automation.
    returnToAutomation(s, c.id, NOW);
    expect(c.status).toBe("engaged");
    expect(c.automation.state).toBe("running");
    expect(c.needsHumanReason).toBeUndefined();
  });

  it("assistant stays silent after staff take over", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    takeOver(s, c.id, NOW);
    patientText(s, c.id, "Is there parking?", NOW);
    expect(lastMessage(s, c.id).sender).toBe("patient");
  });
});

describe("opt-out", () => {
  it("stops automation and blocks every future message", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    patientText(s, c.id, "Stop", NOW);
    expect(c.status).toBe("do_not_contact");
    expect(c.automation.state).toBe("stopped");
    expect(lastMessage(s, c.id).sender).toBe("system");
    const sent = s.messages.length;
    for (let d = 1; d <= 15; d++) runDueFollowUps(s, new Date(NOW.getTime() + d * DAY));
    expect(s.messages.length).toBe(sent);
    expect(() => staffSendMessage(s, c.id, "Hello", NOW)).toThrow(/opted out/);
    expect(() => startFollowUp(s, c.id, NOW)).toThrow();
    expect(() => returnToAutomation(s, c.id, NOW)).toThrow();
  });
});

describe("deferral and reactivation", () => {
  it("Not now defers; the case becomes eligible later and a campaign re-engages it", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    patientAction(s, c.id, "not_now", NOW);
    expect(c.status).toBe("deferred");
    expect(c.deferredUntil).toBeTruthy();
    expect(reactivationEligibility(s, c, NOW).eligible).toBe(false);
    const later = new Date(NOW.getTime() + 50 * DAY);
    expect(reactivationEligibility(s, c, later).eligible).toBe(true);

    const camp = createCampaign(
      s,
      { name: "Check-in", kind: "reactivation", categoryIds: [], caseIds: [c.id], body: s.settings.templates.find((t) => t.id === "tpl_reactivation")!.body, channel: "whatsapp" },
      later,
    );
    expect(() => launchCampaign(s, camp.id, later)).toThrow(/approved/);
    approveCampaign(s, camp.id, "Kiran Joshi", later);
    launchCampaign(s, camp.id, later);
    expect(c.status).toBe("follow_up_active");
    expect(c.sequence.kind).toBe("reactivation");
    expect(lastMessage(s, c.id).body).toContain("you previously discussed treatment");
    patientAction(s, c.id, "book", later);
    patientSelectSlot(s, c.id, lastMessage(s, c.id).slots![0], later);
    expect(c.status).toBe("scheduled");
    expect(c.recoveredVia).toBe("reactivation");
    expect(campaignStats(s, camp.id)!.scheduled).toBe(1);
  });

  it("skips recipients who became ineligible before launch", () => {
    const s = emptyState();
    const c = addCase(s);
    startFollowUp(s, c.id, NOW);
    patientAction(s, c.id, "not_now", NOW);
    const later = new Date(NOW.getTime() + 50 * DAY);
    const camp = createCampaign(s, { name: "x", kind: "reactivation", categoryIds: [], caseIds: [c.id], body: s.settings.templates[4].body, channel: "sms" }, later);
    approveCampaign(s, camp.id, "Kiran", later);
    patientAction(s, c.id, "stop", later);
    const r = launchCampaign(s, camp.id, later);
    expect(r).toEqual({ sent: 0, skipped: 1 });
  });

  it("refuses to approve a campaign with an invalid message", () => {
    const s = emptyState();
    const c = addCase(s);
    const camp = createCampaign(s, { name: "x", kind: "follow_up", categoryIds: [], caseIds: [c.id], body: "Last chance {{patient_first_name}}!", channel: "sms" }, NOW);
    expect(() => approveCampaign(s, camp.id, "Kiran", NOW)).toThrow(/Fix the message/);
  });

  it("pausing a campaign pauses its running cases", () => {
    const s = emptyState();
    const c = addCase(s);
    const camp = createCampaign(s, { name: "x", kind: "follow_up", categoryIds: [], caseIds: [c.id], body: s.settings.templates[0].body, channel: "sms" }, NOW);
    approveCampaign(s, camp.id, "Kiran", NOW);
    launchCampaign(s, camp.id, NOW);
    pauseCampaign(s, camp.id, NOW);
    expect(getCase(s, c.id).automation.state).toBe("paused");
    expect(runDueFollowUps(s, new Date(NOW.getTime() + 3 * DAY)).sent).toBe(0);
  });
});

describe("demo seed", () => {
  const now = new Date();
  const s = seedDemo(now);

  it("tells a complete story", () => {
    expect(s.plans.length).toBeGreaterThanOrEqual(30);
    expect(s.patients.length).toBeGreaterThanOrEqual(20);
    const statuses = new Set(s.cases.map((c) => c.status));
    for (const st of ["pending", "follow_up_active", "engaged", "needs_human", "scheduled", "completed", "deferred", "lost", "do_not_contact"]) {
      expect(statuses.has(st as never)).toBe(true);
    }
    const m = computeMetrics(s, now);
    expect(m.recovered).toBeGreaterThan(0);
    expect(m.followUpsDue).toBeGreaterThan(0);
    expect(s.campaigns.length).toBeGreaterThan(0);
    expect(stepPerformance(s).some((r) => r.sent > 0)).toBe(true);
    expect(roiEstimate(s, now).value).toBeGreaterThan(0);
  });

  it("has no overlapping provider bookings", () => {
    const booked = s.appointments.filter((a) => a.status !== "cancelled");
    for (const a of booked) {
      for (const b of booked) {
        if (a === b || a.providerId !== b.providerId) continue;
        const overlap = new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("keeps every scheduled case linked to a booked appointment", () => {
    for (const c of s.cases.filter((x) => x.status === "scheduled")) {
      expect(s.appointments.find((a) => a.id === c.appointmentId)?.status).toBe("booked");
    }
  });

  it("has eligible deferred patients for reactivation", () => {
    expect(s.cases.filter((c) => reactivationEligibility(s, c, now).eligible).length).toBeGreaterThanOrEqual(3);
  });

  it("supports the critical manual flow on the seeded pending patient", () => {
    const d = structuredClone(s);
    const rahul = d.patients.find((p) => p.firstName === "Rahul")!;
    const c = d.cases.find((x) => x.patientId === rahul.id)!;
    expect(c.status).toBe("pending");
    startFollowUp(d, c.id, now);
    patientAction(d, c.id, "book", now);
    const offer = lastMessage(d, c.id);
    expect(offer.slots!.length).toBeGreaterThan(0);
    patientSelectSlot(d, c.id, offer.slots![0], now);
    expect(c.status).toBe("scheduled");
    expect(computeMetrics(d, now).recovered).toBe(computeMetrics(s, now).recovered + 1);
  });

  it("simulated campaign replies go through guardrails", () => {
    const d = structuredClone(s);
    const eligible = d.cases.filter((c) => reactivationEligibility(d, c, now).eligible);
    const camp = createCampaign(d, { name: "sim", kind: "reactivation", categoryIds: [], caseIds: eligible.map((c) => c.id), body: d.settings.templates[4].body, channel: "whatsapp" }, now);
    approveCampaign(d, camp.id, "Kiran", now);
    launchCampaign(d, camp.id, now);
    simulateCampaignResponses(d, camp.id, now);
    const stats = campaignStats(d, camp.id)!;
    expect(stats.sent).toBe(eligible.length);
    for (const c of d.cases.filter((x) => x.campaignId === camp.id && x.status === "needs_human")) {
      expect(c.needsHumanReason).toBeTruthy();
    }
  });
});

describe("misc", () => {
  it("lost requires a reason; stop automation clears next step", () => {
    const s = emptyState();
    const c = addCase(s);
    expect(() => markLost(s, c.id, " ", NOW)).toThrow();
    startFollowUp(s, c.id, NOW);
    stopAutomation(s, c.id, NOW);
    expect(c.sequence.nextStepAt).toBeUndefined();
    expect(runDueFollowUps(s, new Date(NOW.getTime() + 3 * DAY)).sent).toBe(0);
  });

  it("offers no slots outside the booking horizon", () => {
    const s = emptyState();
    const c = addCase(s);
    s.settings.booking.horizonDays = 0;
    s.settings.booking.minNoticeHours = 48;
    startFollowUp(s, c.id, NOW);
    expect(offerSlots(s, c, NOW)).toEqual([]);
    expect(c.status).toBe("needs_human");
  });

  it("local day helper steps calendar days in the clinic zone", () => {
    const d = localDayAt(NOW, TZ, 1, "09:30");
    const p = zonedParts(d, TZ);
    expect([p.day, p.hour, p.minute]).toEqual([1, 9, 30]);
  });
});
