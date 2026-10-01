/**
 * Integration boundaries.
 *
 * CaseFlow's domain engine talks to the outside world only through these
 * interfaces. The demo ships simulated implementations (./demo.ts). Production
 * adapters (WhatsApp Business, SMS, email, practice-management systems, calendars,
 * LLM providers) would implement the same contracts and run server-side, where
 * credentials live. See docs/PRODUCTION.md.
 */
import type { Channel, SlotOption } from "@/lib/domain/types";
import type { AssistantDecision, RespondInput } from "@/lib/domain/assistant";

export interface OutboundMessage {
  to: { name: string; phone: string; email: string };
  channel: Channel;
  body: string;
  /** Interactive quick replies (WhatsApp buttons, SMS keywords, email links). */
  quickReplies?: string[];
}

export interface DeliveryResult {
  status: "sent" | "delivered" | "failed";
  providerMessageId: string;
  simulated: boolean;
}

/** WhatsApp Business / SMS / email gateway. */
export interface MessagingProvider {
  readonly id: string;
  readonly label: string;
  readonly simulated: boolean;
  send(message: OutboundMessage): DeliveryResult;
}

/** Calendar / practice-management booking. The demo uses CaseFlow's own calendar. */
export interface BookingProvider {
  readonly id: string;
  readonly label: string;
  readonly simulated: boolean;
  /** Called after CaseFlow validated the slot locally. A real adapter must re-validate remotely. */
  confirm(slot: SlotOption): { ok: true; externalId: string } | { ok: false; reason: string };
}

export interface ImportedPlan {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  categoryId: string;
  providerId: string;
  estimatedValue: number;
  summary: string;
  presentedDaysAgo: number;
}

/** Practice-management system: source of presented-but-unscheduled treatment plans. */
export interface PracticeManagementProvider {
  readonly id: string;
  readonly label: string;
  readonly simulated: boolean;
  fetchUnscheduledPlans(batch: number): ImportedPlan[];
}

/**
 * Administrative answering. Guardrails (opt-out, clinical detection) run in the
 * domain layer BEFORE this provider is called and cannot be overridden by it.
 */
export interface AssistantProvider {
  readonly id: string;
  readonly label: string;
  readonly simulated: boolean;
  respond(input: RespondInput): AssistantDecision;
}

export interface Integrations {
  messaging: MessagingProvider;
  booking: BookingProvider;
  pms: PracticeManagementProvider;
  assistant: AssistantProvider;
}
