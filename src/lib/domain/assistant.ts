import type { ClinicSettings, DayHours, PatientAction } from "./types";

/**
 * The CaseFlow assistant.
 *
 * Two layers, in this order:
 *  1. Deterministic guardrails (opt-out, clinical-question detection). These always
 *     run first and are never delegated to a language model.
 *  2. Administrative answering, restricted to clinic-configured knowledge.
 *
 * The demo implementation of layer 2 is rule-based. A production LLM provider would
 * receive only the configured knowledge as context and must return either an answer
 * grounded in it or the fallback reply (see integrations/types.ts).
 */

export const GUARDRAIL_REPLY =
  "I can help with scheduling and general clinic information, but your dentist or clinic team should advise you about treatment questions. I'll flag this for the clinic team.";

export const FALLBACK_REPLY = "I don't have that information. I can have the clinic team help you.";

export type Intent =
  | "opt_out"
  | "clinical"
  | "admin"
  | "cost"
  | "not_now"
  | "book"
  | "contact"
  | "acknowledge"
  | "unknown";

export const INTENT_LABEL: Record<Intent, string> = {
  opt_out: "Opt-out request",
  clinical: "Clinical question",
  admin: "Administrative question",
  cost: "Cost question",
  not_now: "Not now",
  book: "Wants to book",
  contact: "Wants a call back",
  acknowledge: "Acknowledgement",
  unknown: "Unrecognised question",
};

export interface AssistantDecision {
  intent: Intent;
  /** Reply the assistant sends. Undefined when the assistant must stay silent. */
  reply?: string;
  topic?: string;
  offerSlots?: boolean;
  handoffReason?: string;
  optOut?: boolean;
  defer?: boolean;
  actions?: PatientAction[];
}

const CLINICAL_PATTERNS: RegExp[] = [
  /\bhurts?\b|\bhurting\b/,
  /\bpain(ful)?\b|\bpainkiller/,
  /\bsore\b|\bach(e|es|ing)\b/,
  /\bswell|\bswollen/,
  /\bbleed/,
  /\binfect/,
  /\bantibiotic|\bmedicine|\bmedication|\btablets?\b|\bibuprofen|\bparacetamol/,
  /what should i take/,
  /right for me/,
  /do i (really |actually )?need/,
  /\bneed (this|it|the treatment|treatment)\b/,
  /\bnecessary\b/,
  /\bavoid\b/,
  /\binstead\b/,
  /\balternative/,
  /\bheal/,
  /\bsafe\b|\bsafety\b/,
  /\brisks?\b|\brisky\b/,
  /side[- ]?effect/,
  /\bpregnan/,
  /\bdiabet|\bblood pressure|\ballerg/,
  /\bworse\b/,
  /(what|which) treatment/,
  /\brecommend/,
  /should i (get|do|have|go ahead|choose)/,
  /\bx-?rays?\b/,
  /\bnumb|\ban(a)?esthe/,
  /\brecover/,
  /can (i|it|this) (wait|be delayed|skip)/,
  /how long (will|does|do) (it|this|they|the \w+) last/,
  /\bdiagnos|\bsymptom/,
];

function hasAny(text: string, words: RegExp) {
  return words.test(text);
}

export function normalise(text: string) {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function isOptOut(text: string, settings: ClinicSettings): boolean {
  const t = normalise(text).replace(/[.!?]+$/g, "");
  const keywords = settings.consent.stopKeywords.map((k) => k.toLowerCase().trim());
  if (keywords.includes(t)) return true;
  return /\b(unsubscribe|opt[- ]?out|stop (messag|texting|sending|contacting|these)|don'?t (message|text|contact|send)|do not (message|text|contact|send)|no more messages|remove me)/.test(
    t,
  );
}

export function isClinicalQuestion(text: string, settings: ClinicSettings): boolean {
  const t = normalise(text);
  if (CLINICAL_PATTERNS.some((p) => p.test(t))) return true;
  return settings.escalation.extraClinicalKeywords.some((k) => k.trim() && t.includes(k.toLowerCase().trim()));
}

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatHm(hm: string) {
  const [hRaw, m] = hm.split(":").map(Number);
  const suffix = hRaw >= 12 ? "PM" : "AM";
  const h = hRaw % 12 === 0 ? 12 : hRaw % 12;
  return `${h}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** "Mon–Fri 9:30 AM–7:30 PM, Sat 9:30 AM–5:30 PM. Closed Sun." */
export function describeWorkingHours(hours: Record<number, DayHours>): string {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const groups: { days: number[]; key: string }[] = [];
  for (const d of order) {
    const h = hours[d];
    const key = h?.open ? `${formatHm(h.start)}–${formatHm(h.end)}` : "closed";
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(d);
    else groups.push({ days: [d], key });
  }
  const label = (days: number[]) =>
    days.length > 1 ? `${DAY_SHORT[days[0]]}–${DAY_SHORT[days[days.length - 1]]}` : DAY_SHORT[days[0]];
  const open = groups.filter((g) => g.key !== "closed").map((g) => `${label(g.days)} ${g.key}`);
  const closed = groups.filter((g) => g.key === "closed").map((g) => label(g.days));
  return `${open.join(", ")}.${closed.length ? ` Closed ${closed.join(", ")}.` : ""}`;
}

export interface AdminContext {
  settings: ClinicSettings;
  appointmentDurationMin?: number;
  appointmentTypeName?: string;
}

/**
 * Answer an administrative question using only clinic-configured information.
 * Returns null when the question is not recognised; `answer: null` when it is
 * recognised but the clinic has not configured that information.
 */
export function answerAdministrative(
  text: string,
  ctx: AdminContext,
): { topic: string; answer: string | null; intent: "admin" | "cost" } | null {
  const t = normalise(text);
  const { settings } = ctx;
  const k = settings.knowledge;
  const filled = (v: string) => (v && v.trim() ? v.trim() : null);

  const faq = settings.faqs.find((f) => f.keywords.some((kw) => kw.trim() && t.includes(kw.toLowerCase().trim())));
  if (faq) return { topic: `FAQ: ${faq.question}`, answer: filled(faq.answer), intent: "admin" };

  if (hasAny(t, /\b(emi|instal+ments?|financ\w*|loan|pay (later|monthly)|monthly payments?)\b/))
    return { topic: "Financing", answer: filled(k.financing), intent: "cost" };
  if (hasAny(t, /\b(price|prices|pricing|cost|costs|how much(?! time)|fee|fees|charges?|expensive|afford|quote|estimate)\b/))
    return { topic: "Cost", answer: null, intent: "cost" };
  if (hasAny(t, /\b(pay|payment|payments|upi|gpay|paytm|card|cards|cash|net ?banking)\b/))
    return { topic: "Payment methods", answer: filled(k.paymentMethods) && `Accepted payment methods: ${k.paymentMethods.trim()}`, intent: "admin" };
  if (hasAny(t, /\b(hours|timing|timings|opening|closing|open|closed|close)\b/))
    return { topic: "Opening hours", answer: `Our opening hours are ${describeWorkingHours(settings.workingHours)}`, intent: "admin" };
  if (hasAny(t, /\b(park|parking)\b/)) return { topic: "Parking", answer: filled(k.parking), intent: "admin" };
  if (hasAny(t, /\b(address|where|location|located|directions|map|reach you|find you)\b/))
    return {
      topic: "Address",
      answer: filled(settings.clinic.address) && `${settings.clinic.name} is at ${settings.clinic.address}.`,
      intent: "admin",
    };
  if (hasAny(t, /\b(phone|number|call you|contact number|email)\b/))
    return {
      topic: "Contact details",
      answer: `You can reach the front desk on ${settings.clinic.phone} or ${settings.clinic.email}.`,
      intent: "admin",
    };
  if (hasAny(t, /\b(cancel|cancellation|reschedul\w*|change my (appointment|booking))\b/))
    return { topic: "Cancellation policy", answer: filled(k.cancellationPolicy), intent: "admin" };
  if (hasAny(t, /how long|duration|how much time/))
    return {
      topic: "Appointment duration",
      answer: ctx.appointmentDurationMin
        ? `The ${ctx.appointmentTypeName?.toLowerCase() ?? "appointment"} is scheduled for about ${ctx.appointmentDurationMin} minutes.`
        : null,
      intent: "admin",
    };
  if (hasAny(t, /\b(arrive|arrival|records|documents|bring)\b/))
    return { topic: "Clinic policies", answer: filled(k.otherPolicies), intent: "admin" };
  if (hasAny(t, /how (do|can|should) i book|booking process|how to book/))
    return { topic: "Booking process", answer: filled(k.bookingProcess), intent: "admin" };
  return null;
}

const NOT_NOW = /\b(not now|not right now|later|next (week|month|year)|after (diwali|the holidays|my exams|\w+ months?)|busy|not ready|think about it|thinking about it|some other time|another time|not at the moment|maybe later|hold off|postpone)\b/;
const BOOK = /\b(book|booking|schedule|appointment|slot|slots|available|availability|come in)\b/;
const AFFIRM = /^(yes|yeah|yep|yup|sure|ok|okay|interested|i'?m interested|please|go ahead|sounds good)\b/;
const CONTACT = /\b(call me|call back|callback|phone me|speak (to|with)|talk (to|with)|someone (call|contact)|contact me|ring me)\b/;
const ACK = /^(thanks|thank you|thx|ty|ok thanks|okay thanks|noted|got it|great|cool)\b[.! ]*$/;

export interface RespondInput {
  text: string;
  settings: ClinicSettings;
  appointmentDurationMin?: number;
  appointmentTypeName?: string;
}

/** Decide how the assistant responds to a free-text patient message. */
export function respond(input: RespondInput): AssistantDecision {
  const { text, settings } = input;
  const t = normalise(text);
  const actions: PatientAction[] = ["book", "contact", "not_now", "stop"];

  if (!t) return { intent: "unknown" };

  if (isOptOut(text, settings)) {
    return {
      intent: "opt_out",
      optOut: true,
      reply: `You won't receive any more messages from ${settings.clinic.name} through this service. If you need anything, you can call ${settings.clinic.phone}.`,
    };
  }

  if (isClinicalQuestion(text, settings)) {
    return { intent: "clinical", reply: GUARDRAIL_REPLY, handoffReason: "Clinical question — needs the dentist or clinic team" };
  }

  const admin = answerAdministrative(text, input);
  if (admin) {
    if (admin.answer) {
      return { intent: admin.intent, topic: admin.topic, reply: `${admin.answer} Would you like to choose a time?`, actions };
    }
    const escalate =
      admin.intent === "cost" ? settings.escalation.escalateCostQuestions : settings.escalation.escalateUnknownQuestions;
    return {
      intent: admin.intent,
      topic: admin.topic,
      reply: FALLBACK_REPLY,
      handoffReason: escalate ? `${admin.topic} question — information not configured for the assistant` : undefined,
      actions: escalate ? undefined : actions,
    };
  }

  if (NOT_NOW.test(t)) {
    return {
      intent: "not_now",
      defer: true,
      reply: "No problem. We'll leave it there for now. You can message us whenever you're ready, or reply STOP if you'd prefer no further messages.",
    };
  }

  if (BOOK.test(t) || AFFIRM.test(t)) {
    return { intent: "book", offerSlots: true };
  }

  if (CONTACT.test(t)) {
    return {
      intent: "contact",
      reply: `Thanks — I've asked the clinic team to contact you. You can also call ${settings.clinic.phone}.`,
      handoffReason: "Patient asked the clinic to contact them",
    };
  }

  if (ACK.test(t)) {
    return { intent: "acknowledge", reply: "You're welcome. Reply here anytime if you'd like to schedule.", actions };
  }

  return {
    intent: "unknown",
    reply: FALLBACK_REPLY,
    handoffReason: settings.escalation.escalateUnknownQuestions ? "Question the assistant could not answer" : undefined,
    actions: settings.escalation.escalateUnknownQuestions ? undefined : actions,
  };
}
