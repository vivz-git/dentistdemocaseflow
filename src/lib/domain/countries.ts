import type { Channel, CountryCode } from "./types";

export interface CountryProfile {
  code: CountryCode;
  name: string;
  currency: string;
  locale: string;
  timezone: string;
  phonePrefix: string;
  defaultChannel: Channel;
  /**
   * Pointers for the legal/privacy review a clinic must do before going live.
   * These are reminders, not compliance claims.
   */
  reviewNotes: string[];
}

export const COUNTRIES: Record<CountryCode, CountryProfile> = {
  IN: {
    code: "IN",
    name: "India",
    currency: "INR",
    locale: "en-IN",
    timezone: "Asia/Kolkata",
    phonePrefix: "+91",
    defaultChannel: "whatsapp",
    reviewNotes: [
      "Review the Digital Personal Data Protection Act, 2023 and its rules with counsel.",
      "SMS sending requires review of TRAI commercial-communication (DLT) requirements.",
      "WhatsApp Business messaging requires Meta template approval and opt-in records.",
    ],
  },
  AU: {
    code: "AU",
    name: "Australia",
    currency: "AUD",
    locale: "en-AU",
    timezone: "Australia/Sydney",
    phonePrefix: "+61",
    defaultChannel: "sms",
    reviewNotes: [
      "Review the Privacy Act 1988 and Australian Privacy Principles with counsel.",
      "Review the Spam Act 2003 for consent and unsubscribe requirements.",
      "Review AHPRA advertising guidance for any patient-facing wording.",
    ],
  },
  GB: {
    code: "GB",
    name: "United Kingdom",
    currency: "GBP",
    locale: "en-GB",
    timezone: "Europe/London",
    phonePrefix: "+44",
    defaultChannel: "sms",
    reviewNotes: [
      "Review UK GDPR and the Data Protection Act 2018 with counsel.",
      "Review PECR for electronic marketing and service messages.",
      "Review GDC and CQC expectations relevant to patient communication.",
    ],
  },
  US: {
    code: "US",
    name: "United States",
    currency: "USD",
    locale: "en-US",
    timezone: "America/New_York",
    phonePrefix: "+1",
    defaultChannel: "sms",
    reviewNotes: [
      "Review HIPAA obligations, including Business Associate Agreements with every vendor.",
      "Review TCPA consent rules and carrier 10DLC registration for SMS.",
      "Review applicable state privacy laws with counsel.",
    ],
  },
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
};
