import { respond } from "@/lib/domain/assistant";
import type {
  AssistantProvider,
  BookingProvider,
  ImportedPlan,
  Integrations,
  MessagingProvider,
  PracticeManagementProvider,
} from "./types";

let simulatedCounter = 0;

/** Simulated messaging. Nothing leaves the browser. */
export const demoMessaging: MessagingProvider = {
  id: "demo-messaging",
  label: "Simulated messaging (demo)",
  simulated: true,
  send() {
    simulatedCounter += 1;
    return { status: "delivered", providerMessageId: `sim-${simulatedCounter}`, simulated: true };
  },
};

/** Uses CaseFlow's in-app calendar. A real adapter would write to the PMS calendar. */
export const demoBooking: BookingProvider = {
  id: "demo-booking",
  label: "CaseFlow demo calendar",
  simulated: true,
  confirm(slot) {
    return { ok: true, externalId: `cal-${slot.providerId}-${slot.start}` };
  },
};

const IMPORT_POOL: ImportedPlan[] = [
  { firstName: "Neha", lastName: "Bhatt", phone: "+91 90000 10101", email: "neha.bhatt@example.com", categoryId: "cat_crown", providerId: "prov_rao", estimatedValue: 14000, summary: "Crown discussed at review visit.", presentedDaysAgo: 1 },
  { firstName: "Siddharth", lastName: "Jain", phone: "+91 90000 10102", email: "siddharth.jain@example.com", categoryId: "cat_aligner", providerId: "prov_thomas", estimatedValue: 185000, summary: "Aligner consultation follow-up.", presentedDaysAgo: 2 },
  { firstName: "Lakshmi", lastName: "Pillai", phone: "+91 90000 10103", email: "lakshmi.pillai@example.com", categoryId: "cat_implant", providerId: "prov_rao", estimatedValue: 52000, summary: "Implant consultation follow-up.", presentedDaysAgo: 1 },
  { firstName: "Aditya", lastName: "Ghosh", phone: "+91 90000 10104", email: "aditya.ghosh@example.com", categoryId: "cat_whitening", providerId: "prov_iqbal", estimatedValue: 16000, summary: "Whitening discussed.", presentedDaysAgo: 3 },
  { firstName: "Fatima", lastName: "Khan", phone: "+91 90000 10105", email: "fatima.khan@example.com", categoryId: "cat_bridge", providerId: "prov_rao", estimatedValue: 38000, summary: "Bridge plan discussed.", presentedDaysAgo: 2 },
  { firstName: "Varun", lastName: "Sinha", phone: "+91 90000 10106", email: "varun.sinha@example.com", categoryId: "cat_rct", providerId: "prov_mehta", estimatedValue: 9000, summary: "Root canal appointment to be scheduled.", presentedDaysAgo: 1 },
];

/** Simulated practice-management import. Returns synthetic plans only. */
export const demoPms: PracticeManagementProvider = {
  id: "demo-pms",
  label: "Simulated practice-management import",
  simulated: true,
  fetchUnscheduledPlans(batch) {
    const start = (batch * 3) % IMPORT_POOL.length;
    return [0, 1, 2].map((i) => IMPORT_POOL[(start + i) % IMPORT_POOL.length]);
  },
};

/** Rule-based assistant restricted to configured clinic knowledge. No external AI call. */
export const demoAssistant: AssistantProvider = {
  id: "demo-assistant",
  label: "Rule-based assistant (demo)",
  simulated: true,
  respond,
};

export const demoIntegrations: Integrations = {
  messaging: demoMessaging,
  booking: demoBooking,
  pms: demoPms,
  assistant: demoAssistant,
};
