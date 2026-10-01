import { TEMPLATE_VARIABLES } from "./defaults";

export type TemplateVars = Record<(typeof TEMPLATE_VARIABLES)[number]["key"], string>;

const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;
const ALLOWED = new Set<string>(TEMPLATE_VARIABLES.map((v) => v.key));
export const REQUIRED_VARIABLES = ["patient_first_name", "clinic_name"] as const;

/**
 * Wording CaseFlow will not send. These create artificial urgency, pressure,
 * or clinical claims — none of which an administrative follow-up tool should make.
 */
const BLOCKED_PHRASES: { pattern: RegExp; reason: string }[] = [
  { pattern: /last chance/i, reason: "creates artificial urgency" },
  { pattern: /must (book|schedule|act)/i, reason: "pressures the patient" },
  { pattern: /(book|act|reply) (now|today) or/i, reason: "pressures the patient" },
  { pattern: /don'?t (delay|wait)/i, reason: "pressures the patient" },
  { pattern: /(hurry|limited time|only today|expires? (today|soon)|before it'?s too late)/i, reason: "creates artificial urgency" },
  { pattern: /(get|become|getting) worse/i, reason: "makes a clinical claim" },
  { pattern: /your (condition|tooth|teeth|gums?) will/i, reason: "makes a clinical claim" },
  { pattern: /(guarantee|painless|pain-free|risk-free|100% safe)/i, reason: "makes a clinical claim" },
];

const PRICING_HINT = /(₹|\$|£|rs\.?\s?\d|inr|discount|% off|offer)/i;

export interface TemplateValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
  placeholders: string[];
}

export function validateTemplate(body: string): TemplateValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = body ?? "";
  const placeholders: string[] = [];

  if (!text.trim()) {
    return { ok: false, errors: ["Message is empty. Write the message patients will receive."], warnings, placeholders };
  }

  if (text.length > 1000) errors.push(`Message is ${text.length} characters. Keep it under 1,000.`);
  else if (text.length > 600) warnings.push("Long messages are harder to read on a phone. Consider shortening.");

  // Malformed braces: anything left after removing well-formed placeholders.
  const stripped = text.replace(PLACEHOLDER, "");
  if (/[{}]/.test(stripped)) {
    errors.push("A placeholder is malformed. Use double braces, for example {{patient_first_name}}.");
  }

  for (const match of text.matchAll(PLACEHOLDER)) {
    const key = match[1];
    if (!key) {
      errors.push("An empty placeholder {{}} was found.");
      continue;
    }
    placeholders.push(key);
    if (!ALLOWED.has(key)) {
      errors.push(`{{${key}}} is not a supported placeholder.`);
    }
  }

  for (const req of REQUIRED_VARIABLES) {
    if (!placeholders.includes(req)) errors.push(`Missing required placeholder {{${req}}}.`);
  }

  for (const { pattern, reason } of BLOCKED_PHRASES) {
    const m = text.match(pattern);
    if (m) errors.push(`"${m[0]}" ${reason}. CaseFlow does not send pressure or clinical wording.`);
  }

  if (PRICING_HINT.test(text)) {
    warnings.push("This message mentions prices or offers. Only include figures the clinic has approved.");
  }

  return { ok: errors.length === 0, errors, warnings, placeholders };
}

export function renderTemplate(body: string, vars: Partial<TemplateVars>): string {
  return body.replace(PLACEHOLDER, (_, key: string) => {
    const value = vars[key as keyof TemplateVars];
    return value ?? `{{${key}}}`;
  });
}
