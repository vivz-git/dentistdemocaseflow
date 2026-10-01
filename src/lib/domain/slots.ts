import type { DemoState, SlotOption } from "./types";
import { HOUR, MINUTE, minutesOfDay, zonedParts, zonedTimeToUtc, localDayAt } from "./time";

export interface FindSlotsInput {
  appointmentTypeId: string;
  providerId: string;
  now: Date;
  count?: number;
  perDayLimit?: number;
  /** Space offered times ~2 hours apart (patient offers). Staff pickers show every time. */
  spread?: boolean;
  patientId?: string;
  excludeAppointmentId?: string;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Returns a human-readable conflict reason, or null if the slot can be booked.
 * Checked again at booking time so a stale offer can never double-book a chair.
 */
export function findConflict(
  state: DemoState,
  slot: SlotOption,
  opts: { patientId?: string; excludeAppointmentId?: string; now?: Date } = {},
): string | null {
  const { settings } = state;
  const start = new Date(slot.start).getTime();
  const end = new Date(slot.end).getTime();
  const buffer = settings.booking.bufferMin * MINUTE;

  if (!(end > start)) return "The appointment end time must be after its start time.";
  if (opts.now && start < opts.now.getTime()) return "That time has already passed.";

  const provider = settings.providers.find((p) => p.id === slot.providerId);
  if (!provider || !provider.active) return "That provider is not available for booking.";

  const tz = settings.clinic.timezone;
  const p = zonedParts(start, tz);
  const hours = settings.workingHours[p.weekday];
  if (!hours?.open) return "The clinic is closed on that day.";
  const startMin = p.hour * 60 + p.minute;
  const endMin = startMin + (end - start) / MINUTE;
  if (startMin < minutesOfDay(hours.start) || endMin > minutesOfDay(hours.end)) return "That time is outside clinic hours.";
  if (hours.breakStart && hours.breakEnd) {
    if (overlaps(startMin, endMin, minutesOfDay(hours.breakStart), minutesOfDay(hours.breakEnd)))
      return "That time overlaps the clinic break.";
  }

  for (const appt of state.appointments) {
    if (appt.status !== "booked" || appt.id === opts.excludeAppointmentId) continue;
    const aStart = new Date(appt.start).getTime();
    const aEnd = new Date(appt.end).getTime();
    if (appt.providerId === slot.providerId && overlaps(start, end, aStart - buffer, aEnd + buffer)) {
      return "That time was just taken. Please choose another slot.";
    }
    if (opts.patientId && appt.patientId === opts.patientId && overlaps(start, end, aStart, aEnd)) {
      return "The patient already has an appointment at that time.";
    }
  }
  return null;
}

export function findSlots(state: DemoState, input: FindSlotsInput): SlotOption[] {
  const { settings } = state;
  const tz = settings.clinic.timezone;
  const type = settings.appointmentTypes.find((t) => t.id === input.appointmentTypeId);
  if (!type) return [];
  const count = input.count ?? settings.booking.slotsOffered;
  const perDay = input.perDayLimit ?? 1;
  const earliest = input.now.getTime() + settings.booking.minNoticeHours * HOUR;
  const latest = localDayAt(input.now, tz, settings.booking.horizonDays + 1).getTime();
  const result: SlotOption[] = [];

  for (let d = 0; d <= settings.booking.horizonDays && result.length < count; d++) {
    const day = localDayAt(input.now, tz, d);
    const p = zonedParts(day, tz);
    const hours = settings.workingHours[p.weekday];
    if (!hours?.open) continue;
    let taken = 0;
    const startMin = minutesOfDay(hours.start);
    const endMin = minutesOfDay(hours.end);
    for (let m = startMin; m + type.durationMin <= endMin; m += settings.booking.slotIntervalMin) {
      if (taken >= perDay || result.length >= count) break;
      const start = zonedTimeToUtc(p.year, p.month, p.day, Math.floor(m / 60), m % 60, tz);
      if (start.getTime() < earliest || start.getTime() >= latest) continue;
      const slot: SlotOption = {
        start: start.toISOString(),
        end: new Date(start.getTime() + type.durationMin * MINUTE).toISOString(),
        providerId: input.providerId,
        appointmentTypeId: type.id,
      };
      if (findConflict(state, slot, { patientId: input.patientId, excludeAppointmentId: input.excludeAppointmentId })) continue;
      result.push(slot);
      taken++;
      // Spread offers across the day rather than offering back-to-back times.
      if (input.spread !== false) m += 120 - settings.booking.slotIntervalMin;
    }
  }
  return result;
}
