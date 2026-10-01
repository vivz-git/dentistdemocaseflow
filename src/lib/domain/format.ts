import type { ClinicSettings } from "./types";

type Clinic = Pick<ClinicSettings, "clinic">;

export function formatMoney(value: number, s: Clinic, opts: { compact?: boolean } = {}) {
  const { locale, currency } = s.clinic;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: opts.compact ? "compact" : "standard",
  }).format(value);
}

export function formatNumber(value: number, s: Clinic) {
  return new Intl.NumberFormat(s.clinic.locale).format(value);
}

function fmt(date: Date | string, s: Clinic, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(s.clinic.locale, { timeZone: s.clinic.timezone, ...options }).format(new Date(date));
}

/** "Tue, 14 Oct, 10:30 am" */
export function formatSlot(date: Date | string, s: Clinic) {
  return fmt(date, s, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatDate(date: Date | string, s: Clinic) {
  return fmt(date, s, { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortDate(date: Date | string, s: Clinic) {
  return fmt(date, s, { day: "numeric", month: "short" });
}

export function formatDateTime(date: Date | string, s: Clinic) {
  return fmt(date, s, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function formatTime(date: Date | string, s: Clinic) {
  return fmt(date, s, { hour: "numeric", minute: "2-digit" });
}

export function formatWeekday(date: Date | string, s: Clinic) {
  return fmt(date, s, { weekday: "long", day: "numeric", month: "long" });
}

/** "in 2 days", "3 hours ago" */
export function formatRelative(date: Date | string, now: Date, s: Clinic) {
  const diff = new Date(date).getTime() - now.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(s.clinic.locale, { numeric: "auto" });
  const minutes = Math.round(diff / 60000);
  if (abs < 60 * 60000) return rtf.format(minutes, "minute");
  const hours = Math.round(diff / 3600000);
  if (abs < 24 * 3600000) return rtf.format(hours, "hour");
  const days = Math.round(diff / 86400000);
  if (abs < 30 * 86400000) return rtf.format(days, "day");
  return rtf.format(Math.round(days / 30), "month");
}
