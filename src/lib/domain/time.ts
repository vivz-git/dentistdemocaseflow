/**
 * Timezone-aware helpers built on Intl so the app works for any clinic timezone
 * without a date library.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let f = partsFormatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    partsFormatterCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function zonedParts(date: Date | string | number, timeZone: string): ZonedParts {
  const d = new Date(date);
  const parts = partsFormatter(timeZone).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

function offsetAt(utcMs: number, timeZone: string) {
  const p = zonedParts(utcMs, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(utcMs / MINUTE) * MINUTE;
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetAt(guess, timeZone);
  const second = guess - offsetAt(first, timeZone);
  return new Date(second);
}

export function parseHm(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

export function minutesOfDay(hm: string) {
  const { h, m } = parseHm(hm);
  return h * 60 + m;
}

/** Start of the clinic-local day containing `date`, plus `addDays`, at hh:mm local. */
export function localDayAt(date: Date | string, timeZone: string, addDays: number, hm = "00:00"): Date {
  const p = zonedParts(date, timeZone);
  const { h, m } = parseHm(hm);
  // Use UTC noon arithmetic to step calendar days safely.
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  base.setUTCDate(base.getUTCDate() + addDays);
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, m, timeZone);
}

export function endOfLocalDay(date: Date | string, timeZone: string) {
  return new Date(localDayAt(date, timeZone, 1).getTime() - 1);
}

export function isSameLocalDay(a: Date | string, b: Date | string, timeZone: string) {
  const pa = zonedParts(a, timeZone);
  const pb = zonedParts(b, timeZone);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** True if the local time of `date` is inside the quiet window (which may wrap midnight). */
export function inQuietHours(date: Date | string, timeZone: string, start: string, end: string) {
  const p = zonedParts(date, timeZone);
  const now = p.hour * 60 + p.minute;
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  if (s === e) return false;
  return s < e ? now >= s && now < e : now >= s || now < e;
}

/** Next moment the quiet window ends, on or after `date`. */
export function nextQuietHoursEnd(date: Date | string, timeZone: string, end: string): Date {
  const today = localDayAt(date, timeZone, 0, end);
  return today.getTime() > new Date(date).getTime() ? today : localDayAt(date, timeZone, 1, end);
}

export function addMs(date: Date | string, ms: number) {
  return new Date(new Date(date).getTime() + ms);
}

export function iso(date: Date | string | number) {
  return new Date(date).toISOString();
}

export function daysBetween(a: Date | string, b: Date | string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / DAY;
}
