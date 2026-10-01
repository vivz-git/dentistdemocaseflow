import type { ClinicSettings } from "./types";

/** Variables a message template may use. Anything else fails validation. */
export const TEMPLATE_VARIABLES = [
  { key: "patient_first_name", label: "Patient first name", example: "Priya" },
  { key: "clinic_name", label: "Clinic name", example: "SmileCare Dental Clinic" },
  { key: "treatment_name", label: "Treatment (patient wording)", example: "crown appointment" },
  { key: "provider_name", label: "Provider", example: "Dr. Ananya Rao" },
  { key: "clinic_phone", label: "Clinic phone", example: "+91 80 0000 1234" },
] as const;

export const PRACTICE_MANAGER = "Kiran Joshi";

export function defaultSettings(): ClinicSettings {
  return {
    clinic: {
      name: "SmileCare Dental Clinic",
      country: "IN",
      currency: "INR",
      locale: "en-IN",
      timezone: "Asia/Kolkata",
      address: "2nd Floor, 14 Lakeview Road, Indiranagar, Bengaluru 560038",
      phone: "+91 80 0000 1234",
      email: "frontdesk@smilecare.example",
    },
    workingHours: {
      0: { open: false, start: "09:30", end: "19:30" },
      1: { open: true, start: "09:30", end: "19:30", breakStart: "13:30", breakEnd: "14:30" },
      2: { open: true, start: "09:30", end: "19:30", breakStart: "13:30", breakEnd: "14:30" },
      3: { open: true, start: "09:30", end: "19:30", breakStart: "13:30", breakEnd: "14:30" },
      4: { open: true, start: "09:30", end: "19:30", breakStart: "13:30", breakEnd: "14:30" },
      5: { open: true, start: "09:30", end: "19:30", breakStart: "13:30", breakEnd: "14:30" },
      6: { open: true, start: "09:30", end: "17:30", breakStart: "13:30", breakEnd: "14:00" },
    },
    providers: [
      { id: "prov_rao", name: "Dr. Ananya Rao", title: "Prosthodontist", active: true },
      { id: "prov_mehta", name: "Dr. Vikram Mehta", title: "Endodontist", active: true },
      { id: "prov_thomas", name: "Dr. Sara Thomas", title: "Orthodontist", active: true },
      { id: "prov_iqbal", name: "Dr. Farhan Iqbal", title: "General dentist", active: true },
    ],
    appointmentTypes: [
      { id: "at_implant", name: "Implant consultation", durationMin: 45 },
      { id: "at_crown", name: "Crown appointment", durationMin: 60 },
      { id: "at_aligner", name: "Aligner scan and consultation", durationMin: 45 },
      { id: "at_veneers", name: "Veneer consultation", durationMin: 60 },
      { id: "at_rct", name: "Root canal appointment", durationMin: 90 },
      { id: "at_rehab", name: "Rehabilitation planning visit", durationMin: 60 },
      { id: "at_whitening", name: "Whitening session", durationMin: 60 },
      { id: "at_bridge", name: "Bridge appointment", durationMin: 60 },
    ],
    categories: [
      { id: "cat_implant", name: "Implant consultation follow-up", patientLabel: "implant consultation", appointmentTypeId: "at_implant", active: true },
      { id: "cat_crown", name: "Crown", patientLabel: "crown appointment", appointmentTypeId: "at_crown", active: true },
      { id: "cat_aligner", name: "Invisalign / aligner consultation", patientLabel: "aligner consultation", appointmentTypeId: "at_aligner", active: true },
      { id: "cat_veneers", name: "Veneers", patientLabel: "veneer consultation", appointmentTypeId: "at_veneers", active: true },
      { id: "cat_rct", name: "Root canal follow-up", patientLabel: "root canal appointment", appointmentTypeId: "at_rct", active: true },
      { id: "cat_rehab", name: "Full-mouth rehabilitation", patientLabel: "treatment planning visit", appointmentTypeId: "at_rehab", active: true },
      { id: "cat_whitening", name: "Whitening", patientLabel: "whitening appointment", appointmentTypeId: "at_whitening", active: true },
      { id: "cat_bridge", name: "Bridge", patientLabel: "bridge appointment", appointmentTypeId: "at_bridge", active: true },
    ],
    booking: {
      minNoticeHours: 18,
      horizonDays: 14,
      slotIntervalMin: 30,
      bufferMin: 0,
      slotsOffered: 4,
      allowPatientSelfBooking: true,
    },
    followUp: {
      steps: [
        { id: "step_d0", dayOffset: 0, label: "Initial follow-up", templateId: "tpl_initial" },
        { id: "step_d2", dayOffset: 2, label: "Reminder", templateId: "tpl_reminder" },
        { id: "step_d5", dayOffset: 5, label: "Helpful information", templateId: "tpl_helpful" },
        { id: "step_d10", dayOffset: 10, label: "Final check-in", templateId: "tpl_final" },
      ],
      autoCloseAfterDays: 7,
      defaultDeferDays: 45,
      reactivationReminderDays: 4,
      reactivationEligibleAfterDays: 30,
    },
    templates: [
      {
        id: "tpl_initial",
        name: "Initial follow-up",
        purpose: "Day 0 — first message after the plan was presented",
        body: "Hi {{patient_first_name}}, thank you for visiting {{clinic_name}}. {{provider_name}} discussed your {{treatment_name}} with you. If you would like to schedule it, you can choose a time below or contact the clinic with any questions.",
      },
      {
        id: "tpl_reminder",
        name: "Reminder",
        purpose: "Day 2 — gentle scheduling reminder",
        body: "Hi {{patient_first_name}}, a quick note from {{clinic_name}} about scheduling your {{treatment_name}}. You can pick a time below whenever it suits you.",
      },
      {
        id: "tpl_helpful",
        name: "Helpful information",
        purpose: "Day 5 — offer administrative help",
        body: "Hi {{patient_first_name}}, if you have questions about appointment times, payment options or directions to {{clinic_name}}, just reply here. For questions about the treatment itself, the clinic team will be happy to talk with you.",
      },
      {
        id: "tpl_final",
        name: "Final check-in",
        purpose: "Day 10 — last scheduled message in the sequence",
        body: "Hi {{patient_first_name}}, this is our last scheduled check-in from {{clinic_name}} about your {{treatment_name}}. If you would like to book later, reply here anytime or call {{clinic_phone}}.",
      },
      {
        id: "tpl_reactivation",
        name: "Reactivation",
        purpose: "Deferred patients who are now eligible for a check-in",
        body: "Hi {{patient_first_name}}, you previously discussed treatment with {{clinic_name}}. The clinic asked us to check whether you would still like to schedule an appointment. You can choose a time below or contact the clinic.",
      },
      {
        id: "tpl_reactivation_reminder",
        name: "Reactivation reminder",
        purpose: "Single reminder after a reactivation message",
        body: "Hi {{patient_first_name}}, checking in once more from {{clinic_name}}. If you would like to schedule, choose a time below. If not, no action is needed.",
      },
    ],
    knowledge: {
      bookingProcess:
        "You can choose a time from the options we send, or call the front desk. Once the appointment is booked you will receive a confirmation message.",
      paymentMethods: "UPI, debit and credit cards, net banking and cash.",
      financing:
        "EMI options are available on eligible credit cards through the card issuer. The front desk can explain the options at your visit.",
      parking: "Free basement parking for 6 cars in the building. Street parking is available on 12th Main Road.",
      cancellationPolicy:
        "Please let us know at least 24 hours before your appointment if you need to cancel or reschedule.",
      otherPolicies:
        "Please arrive 10 minutes early for your treatment visit and bring any previous dental records you have.",
    },
    faqs: [
      {
        id: "faq_weekend",
        question: "Do you have weekend appointments?",
        answer: "The clinic is open on Saturdays from 9:30 AM to 5:30 PM and closed on Sundays.",
        keywords: ["weekend", "saturday", "sunday"],
      },
      {
        id: "faq_companion",
        question: "Can I bring someone with me?",
        answer: "Yes, you are welcome to bring a family member or friend to your appointment.",
        keywords: ["bring someone", "family member", "accompany", "come with me", "bring my"],
      },
      {
        id: "faq_language",
        question: "Which languages does the front desk speak?",
        answer: "Our front desk team speaks English, Hindi, Kannada and Tamil.",
        keywords: ["language", "hindi", "kannada", "tamil"],
      },
      {
        id: "faq_access",
        question: "Is the clinic wheelchair accessible?",
        answer: "Yes. The clinic is on the 2nd floor and the building has lift access.",
        keywords: ["wheelchair", "lift", "elevator", "accessible", "stairs"],
      },
    ],
    notifications: {
      needsHumanAlert: true,
      bookingAlert: true,
      dailyDigest: true,
      digestTime: "09:00",
      alertEmail: "frontdesk@smilecare.example",
    },
    escalation: {
      escalateUnknownQuestions: true,
      escalateCostQuestions: true,
      extraClinicalKeywords: [],
      assignTo: "Meera Iyer",
    },
    consent: {
      requireAutomationConsent: true,
      quietHoursStart: "21:00",
      quietHoursEnd: "09:00",
      stopKeywords: ["stop", "unsubscribe", "opt out", "optout", "stop messages"],
    },
    channels: { default: "whatsapp", enabled: ["whatsapp", "sms", "email"] },
    roi: { monthlySoftwareCost: 15000 },
    staff: { currentUser: "Meera Iyer", role: "Front desk coordinator" },
  };
}
