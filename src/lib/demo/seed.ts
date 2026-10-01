/**
 * Synthetic demo data for "SmileCare Dental Clinic".
 *
 * All names, phone numbers and values are fictional. The seed replays realistic
 * activity through the real workflow engine at historical timestamps, so every
 * message, status, appointment and metric is consistent with live behaviour.
 */
import { defaultSettings, PRACTICE_MANAGER } from "@/lib/domain/defaults";
import {
  approveCampaign,
  bookAppointment,
  completeAppointment,
  createCampaign,
  createPlan,
  launchCampaign,
  markLost,
  newId,
  patientAction,
  patientSelectSlot,
  patientText,
  runDueFollowUps,
  startFollowUp,
  addNote,
  caseContext,
  getCase,
  hashUnit,
  takeOver,
  staffSendMessage,
} from "@/lib/domain/engine";
import { findSlots } from "@/lib/domain/slots";
import { MINUTE, localDayAt, minutesOfDay, zonedParts, zonedTimeToUtc } from "@/lib/domain/time";
import type { DemoState } from "@/lib/domain/types";

export const SCHEMA_VERSION = 4;

type Scenario =
  | "pending"
  | "due_today"
  | "active"
  | "engaged_admin"
  | "nh_clinical"
  | "nh_contact"
  | "scheduled"
  | "scheduled_staff"
  | "completed"
  | "deferred_eligible"
  | "deferred_future"
  | "lost_no_response"
  | "lost_declined"
  | "dnc"
  | "reactivation";

interface Def {
  key: string;
  first: string;
  last: string;
  cat: string;
  prov: string;
  value: number;
  /** Days ago the plan was presented. */
  d: number;
  scenario: Scenario;
  /** Day (relative to presentation) follow-up started. */
  startAfter?: number;
  text?: string;
  noConsent?: boolean;
  slotIndex?: number;
  /** Day (relative to start) the patient replied. */
  replyAfter?: number;
  channel?: "whatsapp" | "sms" | "email";
  summary?: string;
}

const DEFS: Def[] = [
  // Pending — presented recently, nobody has followed up yet.
  { key: "rahul", first: "Rahul", last: "Verma", cat: "cat_crown", prov: "prov_rao", value: 12500, d: 2, scenario: "pending", summary: "Crown discussed for lower left molar. Patient wanted to check work schedule before booking." },
  { key: "sneha", first: "Sneha", last: "Kulkarni", cat: "cat_whitening", prov: "prov_iqbal", value: 15000, d: 1, scenario: "pending" },
  { key: "imran", first: "Imran", last: "Shaikh", cat: "cat_bridge", prov: "prov_rao", value: 42000, d: 4, scenario: "pending", noConsent: true, summary: "Bridge plan discussed. Patient has not given consent for automated messages — call only." },
  { key: "deepa", first: "Deepa", last: "Menon", cat: "cat_veneers", prov: "prov_rao", value: 96000, d: 3, scenario: "pending" },

  // Follow-up step due today.
  { key: "ritu", first: "Ritu", last: "Agarwal", cat: "cat_implant", prov: "prov_rao", value: 48000, d: 2, startAfter: 0, scenario: "due_today" },
  { key: "manoj", first: "Manoj", last: "Pillai", cat: "cat_rct", prov: "prov_mehta", value: 9500, d: 3, startAfter: 1, scenario: "due_today", channel: "sms" },
  { key: "ayesha", first: "Ayesha", last: "Siddiqui", cat: "cat_aligner", prov: "prov_thomas", value: 165000, d: 6, startAfter: 1, scenario: "due_today" },

  // Follow-up running, waiting on the patient.
  { key: "kavya", first: "Kavya", last: "Reddy", cat: "cat_rct", prov: "prov_mehta", value: 8500, d: 1, startAfter: 0, scenario: "active" },
  { key: "arjun", first: "Arjun", last: "Malhotra", cat: "cat_whitening", prov: "prov_iqbal", value: 18000, d: 4, startAfter: 1, scenario: "active" },
  { key: "harish", first: "Harish", last: "Gowda", cat: "cat_crown", prov: "prov_rao", value: 11000, d: 7, startAfter: 1, scenario: "active", channel: "sms" },

  // Engaged — asked an administrative question.
  { key: "pooja", first: "Pooja", last: "Banerjee", cat: "cat_implant", prov: "prov_rao", value: 55000, d: 6, startAfter: 1, replyAfter: 0, scenario: "engaged_admin", text: "Is there parking near the clinic?" },
  { key: "vikas", first: "Vikas", last: "Choudhary", cat: "cat_rehab", prov: "prov_rao", value: 420000, d: 9, startAfter: 1, replyAfter: 2, scenario: "engaged_admin", text: "Do you offer EMI options?" },

  // Needs a human.
  { key: "anjali", first: "Anjali", last: "Desai", cat: "cat_implant", prov: "prov_rao", value: 60000, d: 5, startAfter: 1, replyAfter: 0, scenario: "nh_clinical", text: "Do I really need an implant, or can I wait a few months?" },
  { key: "suresh", first: "Suresh", last: "Nambiar", cat: "cat_rct", prov: "prov_mehta", value: 10500, d: 4, startAfter: 1, replyAfter: 1, scenario: "nh_clinical", text: "Will the root canal hurt? What should I take before coming in?" },
  { key: "farah", first: "Farah", last: "Qureshi", cat: "cat_veneers", prov: "prov_rao", value: 110000, d: 8, startAfter: 1, replyAfter: 2, scenario: "nh_contact" },

  // Recovered — patient booked through the follow-up.
  { key: "nikhil", first: "Nikhil", last: "Saxena", cat: "cat_crown", prov: "prov_rao", value: 13500, d: 8, startAfter: 1, replyAfter: 5, scenario: "scheduled" },
  { key: "divya", first: "Divya", last: "Krishnan", cat: "cat_aligner", prov: "prov_thomas", value: 210000, d: 12, startAfter: 1, replyAfter: 10, scenario: "scheduled", slotIndex: 1 },
  { key: "rohit", first: "Rohit", last: "Bansal", cat: "cat_implant", prov: "prov_rao", value: 45000, d: 10, startAfter: 1, replyAfter: 6, scenario: "scheduled", slotIndex: 1 },
  { key: "shreya", first: "Shreya", last: "Mukherjee", cat: "cat_whitening", prov: "prov_iqbal", value: 14000, d: 6, startAfter: 0, replyAfter: 5, scenario: "scheduled" },
  { key: "abdul", first: "Abdul", last: "Rahman", cat: "cat_bridge", prov: "prov_rao", value: 36000, d: 11, startAfter: 1, replyAfter: 8, scenario: "scheduled", slotIndex: 2, channel: "sms" },
  { key: "gayatri", first: "Gayatri", last: "Hegde", cat: "cat_rehab", prov: "prov_rao", value: 380000, d: 13, startAfter: 1, replyAfter: 9, scenario: "scheduled_staff" },

  // Recovered and attended.
  { key: "sanjay", first: "Sanjay", last: "Patil", cat: "cat_crown", prov: "prov_rao", value: 12000, d: 45, startAfter: 1, replyAfter: 2, scenario: "completed" },
  { key: "lavanya", first: "Lavanya", last: "Subramanian", cat: "cat_rct", prov: "prov_mehta", value: 9000, d: 60, startAfter: 0, replyAfter: 0, scenario: "completed" },
  { key: "tarun", first: "Tarun", last: "Bhatia", cat: "cat_implant", prov: "prov_rao", value: 50000, d: 70, startAfter: 1, replyAfter: 5, scenario: "completed", slotIndex: 1 },
  { key: "neelam", first: "Neelam", last: "Chopra", cat: "cat_whitening", prov: "prov_iqbal", value: 16000, d: 38, startAfter: 1, replyAfter: 2, scenario: "completed" },

  // Deferred — now eligible for reactivation.
  { key: "priya", first: "Priya", last: "Nair", cat: "cat_aligner", prov: "prov_thomas", value: 175000, d: 55, startAfter: 1, replyAfter: 2, scenario: "deferred_eligible", text: "Not now, maybe after Diwali." },
  { key: "rajesh", first: "Rajesh", last: "Kumar", cat: "cat_veneers", prov: "prov_rao", value: 85000, d: 62, startAfter: 1, replyAfter: 0, scenario: "deferred_eligible" },
  { key: "smita", first: "Smita", last: "Kamath", cat: "cat_bridge", prov: "prov_rao", value: 40000, d: 70, startAfter: 1, replyAfter: 5, scenario: "deferred_eligible", text: "I'm busy with work this month, maybe later." },

  // Deferred — not yet eligible.
  { key: "aman", first: "Aman", last: "Gupta", cat: "cat_implant", prov: "prov_rao", value: 58000, d: 15, startAfter: 1, replyAfter: 2, scenario: "deferred_future" },
  { key: "ishita", first: "Ishita", last: "Sen", cat: "cat_aligner", prov: "prov_thomas", value: 190000, d: 20, startAfter: 1, replyAfter: 0, scenario: "deferred_future", text: "Next month would be better for me." },

  // Lost.
  { key: "prakash", first: "Prakash", last: "Yadav", cat: "cat_crown", prov: "prov_rao", value: 11500, d: 52, startAfter: 1, scenario: "lost_no_response", channel: "sms" },
  { key: "zoya", first: "Zoya", last: "Mirza", cat: "cat_whitening", prov: "prov_iqbal", value: 15500, d: 58, startAfter: 1, scenario: "lost_no_response" },
  { key: "kunal", first: "Kunal", last: "Shah", cat: "cat_implant", prov: "prov_rao", value: 52000, d: 30, startAfter: 1, replyAfter: 2, scenario: "lost_declined", text: "I've decided to go to a clinic closer to my office. Thanks for checking." },

  // Opted out.
  { key: "bhavna", first: "Bhavna", last: "Trivedi", cat: "cat_veneers", prov: "prov_rao", value: 92000, d: 10, startAfter: 1, replyAfter: 2, scenario: "dnc" },

  // Earlier reactivation campaign recipients (deferred months ago).
  { key: "arvind", first: "Arvind", last: "Shetty", cat: "cat_aligner", prov: "prov_thomas", value: 180000, d: 110, startAfter: 1, replyAfter: 2, scenario: "reactivation" },
  { key: "nisha", first: "Nisha", last: "Kapoor", cat: "cat_veneers", prov: "prov_rao", value: 98000, d: 104, startAfter: 1, replyAfter: 0, scenario: "reactivation" },
  { key: "gaurav", first: "Gaurav", last: "Mishra", cat: "cat_implant", prov: "prov_rao", value: 47000, d: 100, startAfter: 1, replyAfter: 2, scenario: "reactivation" },
  { key: "rekha", first: "Rekha", last: "Pandey", cat: "cat_crown", prov: "prov_rao", value: 13000, d: 96, startAfter: 1, replyAfter: 5, scenario: "reactivation" },
  { key: "mohit", first: "Mohit", last: "Arora", cat: "cat_bridge", prov: "prov_rao", value: 39000, d: 108, startAfter: 1, replyAfter: 0, scenario: "reactivation" },
];

/** Stable synthetic contact details. */
function contact(def: Def, i: number) {
  return {
    phone: `+91 90000 ${String(20101 + i * 7).padStart(5, "0")}`,
    email: `${def.first}.${def.last}`.toLowerCase().replace(/[^a-z.]/g, "") + "@example.com",
  };
}

function emptyState(now: Date): DemoState {
  return {
    schemaVersion: SCHEMA_VERSION,
    seededAt: now.toISOString(),
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

export function seedDemo(now: Date = new Date()): DemoState {
  const s = emptyState(now);
  const tz = s.settings.clinic.timezone;
  const caseOf = new Map<string, string>();
  const ops: { at: number; order: number; run: () => void }[] = [];
  let order = 0;
  const latest = now.getTime() - 5 * MINUTE;

  /** Clinic-local time `daysAgo` days before now, clamped to the past. */
  const t = (daysAgo: number, hm: string) => Math.min(localDayAt(now, tz, -daysAgo, hm).getTime(), latest);
  const op = (at: number, run: () => void) => ops.push({ at, order: order++, run });
  const id = (key: string) => caseOf.get(key)!;

  /** Patient picks an offered slot. `upcoming` prefers a time after the demo's "now". */
  const pickSlot = (key: string, at: Date, index = 0, upcoming = false) => {
    const offer = [...s.messages].reverse().find((m) => m.caseId === id(key) && m.kind === "slot_offer");
    let slots = offer?.slots ?? [];
    if (upcoming) {
      const future = slots.filter((x) => new Date(x.start).getTime() > now.getTime() + 3 * 60 * MINUTE);
      if (future.length) slots = future;
    }
    if (slots.length) patientSelectSlot(s, id(key), slots[Math.min(index, slots.length - 1)], at);
  };

  DEFS.forEach((def, i) => {
    const presented = def.d;
    const created = t(presented, "10:00");
    op(created, () => {
      const c = createPlan(
        s,
        {
          firstName: def.first,
          lastName: def.last,
          ...contact(def, i),
          preferredChannel: def.channel ?? "whatsapp",
          automatedConsent: !def.noConsent,
          categoryId: def.cat,
          providerId: def.prov,
          estimatedValue: def.value,
          presentedAt: new Date(created).toISOString(),
          summary: def.summary ?? "Treatment plan discussed at consultation. Patient did not schedule before leaving.",
          source: "demo_seed",
        },
        new Date(created),
      );
      caseOf.set(def.key, c.id);
    });
    if (def.scenario === "pending") return;

    const startDay = presented - (def.startAfter ?? 1);
    const startAt =
      def.scenario === "due_today"
        ? t(startDay, def.key === "ritu" ? "16:00" : def.key === "manoj" ? "12:30" : "15:00")
        : t(startDay, "10:30");
    op(startAt, () => startFollowUp(s, id(def.key), new Date(startAt), "staff"));

    const replyDay = startDay - (def.replyAfter ?? 0);
    const replyAt = t(replyDay, def.replyAfter === 0 ? "13:10" : "19:05");

    switch (def.scenario) {
      case "engaged_admin":
      case "nh_clinical":
      case "lost_declined":
      case "deferred_future":
        op(replyAt, () => {
          if (def.text) patientText(s, id(def.key), def.text, new Date(replyAt));
          else patientAction(s, id(def.key), "not_now", new Date(replyAt));
        });
        if (def.scenario === "lost_declined") {
          const closeAt = t(replyDay - 1, "10:05");
          op(closeAt, () => {
            takeOver(s, id(def.key), new Date(closeAt));
            staffSendMessage(s, id(def.key), "Thank you for letting us know, Kunal. You're always welcome back at SmileCare.", new Date(closeAt));
            markLost(s, id(def.key), "Patient chose a clinic closer to work", new Date(closeAt + MINUTE));
          });
        }
        if (def.key === "anjali") {
          const noteAt = t(replyDay, "13:40");
          op(noteAt, () => addNote(s, id("anjali"), "Asked Dr. Rao's assistant to call back — patient wants to talk through timing with the dentist.", new Date(noteAt)));
        }
        break;
      case "nh_contact":
        op(replyAt, () => patientAction(s, id(def.key), "contact", new Date(replyAt)));
        break;
      case "deferred_eligible":
        op(replyAt, () => {
          if (def.text) patientText(s, id(def.key), def.text, new Date(replyAt));
          else patientAction(s, id(def.key), "not_now", new Date(replyAt));
        });
        break;
      case "dnc":
        op(replyAt, () => patientText(s, id(def.key), "STOP", new Date(replyAt)));
        break;
      case "scheduled":
      case "completed":
        op(replyAt, () => {
          if (def.key === "divya") patientText(s, id(def.key), "Yes, I'd like to book. Are evenings possible?", new Date(replyAt));
          else patientAction(s, id(def.key), "book", new Date(replyAt));
          pickSlot(def.key, new Date(replyAt + 4 * MINUTE), def.slotIndex ?? 0, def.scenario === "scheduled");
        });
        break;
      case "scheduled_staff": {
        op(replyAt, () => patientText(s, id(def.key), "Can someone call me? I'd like to discuss the timing with the front desk.", new Date(replyAt)));
        const callAt = t(replyDay - 1, "11:20");
        op(callAt, () => {
          const c = getCase(s, id(def.key));
          takeOver(s, c.id, new Date(callAt));
          addNote(s, c.id, "Called patient. Prefers a morning appointment with Dr. Rao. Booked over the phone.", new Date(callAt));
          const { provider, appointmentType, patient } = caseContext(s, c);
          const slots = findSlots(s, { appointmentTypeId: appointmentType.id, providerId: provider.id, patientId: patient.id, now: new Date(callAt), count: 12 });
          const slot = slots.find((x) => new Date(x.start).getTime() > now.getTime() + 3 * 60 * MINUTE) ?? slots[0];
          if (slot) bookAppointment(s, c.id, slot, new Date(callAt + 2 * MINUTE), "staff");
        });
        break;
      }
      case "reactivation":
        // Patient deferred during the original follow-up.
        op(t(startDay - 2, "18:20"), () => patientAction(s, id(def.key), "not_now", new Date(t(startDay - 2, "18:20"))));
        break;
      default:
        break;
    }
  });

  // Reactivation campaign launched nine days ago.
  const campaignKeys = ["arvind", "nisha", "gaurav", "rekha", "mohit"];
  let campaignId = "";
  const draftAt = t(10, "16:00");
  op(draftAt, () => {
    const tpl = s.settings.templates.find((x) => x.id === "tpl_reactivation")!;
    const camp = createCampaign(
      s,
      {
        name: "Deferred patients — quarterly check-in",
        kind: "reactivation",
        categoryIds: [],
        caseIds: campaignKeys.map(id),
        body: tpl.body,
        channel: "whatsapp",
      },
      new Date(draftAt),
    );
    campaignId = camp.id;
    approveCampaign(s, camp.id, PRACTICE_MANAGER, new Date(draftAt + 40 * MINUTE));
  });
  const launchAt = t(9, "11:00");
  op(launchAt, () => launchCampaign(s, campaignId, new Date(launchAt)));
  const arvindAt = t(9, "12:15");
  op(arvindAt, () => {
    patientAction(s, id("arvind"), "book", new Date(arvindAt));
    pickSlot("arvind", new Date(arvindAt + 3 * MINUTE), 0);
  });
  const mohitAt = t(9, "15:40");
  op(mohitAt, () => patientText(s, id("mohit"), "Please stop messaging me.", new Date(mohitAt)));
  const gauravAt = t(8, "10:20");
  op(gauravAt, () => patientText(s, id("gaurav"), "Do you accept card payments?", new Date(gauravAt)));
  const nishaAt = t(8, "18:45");
  op(nishaAt, () => {
    patientAction(s, id("nisha"), "book", new Date(nishaAt));
    pickSlot("nisha", new Date(nishaAt + 5 * MINUTE), 0, true);
  });

  // Daily scheduler run at 18:30 clinic time, up to yesterday. Today's due items stay due.
  for (let day = 120; day >= 1; day--) {
    const at = t(day, "18:30");
    op(at, () => runDueFollowUps(s, new Date(at)));
  }

  ops.sort((a, b) => a.at - b.at || a.order - b.order);
  for (const o of ops) o.run();

  // Attended appointments: mark past bookings completed.
  for (const appt of s.appointments) {
    if (appt.status === "booked" && new Date(appt.end).getTime() < now.getTime() - 60 * MINUTE) {
      completeAppointment(s, appt.id, new Date(new Date(appt.end).getTime() + 30 * MINUTE));
    }
  }
  // Reading the inbox is part of the story: older replies have been seen by staff.
  for (const c of s.cases) {
    if (c.unread && c.lastPatientMessageAt && now.getTime() - new Date(c.lastPatientMessageAt).getTime() > 3 * 86400000) c.unread = false;
  }

  addPracticeCalendar(s, now);
  return s;
}

/** Fill provider calendars with existing (non-CaseFlow) bookings so slot offers look real. */
function addPracticeCalendar(s: DemoState, now: Date) {
  const tz = s.settings.clinic.timezone;
  for (let d = 0; d <= 21; d++) {
    const day = localDayAt(now, tz, d);
    const p = zonedParts(day, tz);
    const hours = s.settings.workingHours[p.weekday];
    if (!hours?.open) continue;
    for (const provider of s.settings.providers) {
      for (let m = minutesOfDay(hours.start); m + 60 <= minutesOfDay(hours.end); m += 60) {
        if (hashUnit(`${provider.id}:${p.year}-${p.month}-${p.day}:${m}`) > 0.48) continue;
        const start = zonedTimeToUtc(p.year, p.month, p.day, Math.floor(m / 60), m % 60, tz);
        const end = new Date(start.getTime() + 60 * MINUTE);
        const breakS = hours.breakStart ? minutesOfDay(hours.breakStart) : -1;
        const breakE = hours.breakEnd ? minutesOfDay(hours.breakEnd) : -1;
        if (m < breakE && breakS < m + 60) continue;
        const clash = s.appointments.some(
          (a) =>
            a.status === "booked" &&
            a.providerId === provider.id &&
            new Date(a.start).getTime() < end.getTime() &&
            start.getTime() < new Date(a.end).getTime(),
        );
        if (clash) continue;
        s.appointments.push({
          id: newId(s, "pms"),
          providerId: provider.id,
          appointmentTypeId: "at_crown",
          label: "Existing booking (practice calendar)",
          start: start.toISOString(),
          end: end.toISOString(),
          status: "booked",
          bookedBy: "pms",
          createdAt: now.toISOString(),
        });
      }
    }
  }
}
