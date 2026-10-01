"use client";

import clsx from "clsx";
import { useMemo, useState } from "react";
import { findSlots } from "@/lib/domain/slots";
import { formatTime, formatWeekday } from "@/lib/domain/format";
import { zonedParts } from "@/lib/domain/time";
import type { DemoState, SlotOption } from "@/lib/domain/types";
import { Button, Dialog, Field, Select } from "@/components/ui";

/** Staff-side slot picker: real availability from the clinic calendar, grouped by day. */
export function SlotPickerDialog({
  open,
  onClose,
  s,
  now,
  title,
  description,
  appointmentTypeId,
  defaultProviderId,
  patientId,
  excludeAppointmentId,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  s: DemoState;
  now: Date;
  title: string;
  description?: string;
  appointmentTypeId: string;
  defaultProviderId: string;
  patientId?: string;
  excludeAppointmentId?: string;
  confirmLabel: string;
  onConfirm: (slot: SlotOption) => boolean;
}) {
  const [providerId, setProviderId] = useState(defaultProviderId);
  const [selected, setSelected] = useState<SlotOption | null>(null);
  const type = s.settings.appointmentTypes.find((t) => t.id === appointmentTypeId);

  const days = useMemo(() => {
    if (!open) return [];
    const slots = findSlots(s, {
      appointmentTypeId,
      providerId,
      now,
      patientId,
      excludeAppointmentId,
      count: 60,
      perDayLimit: 24,
      spread: false,
    });
    const groups = new Map<string, SlotOption[]>();
    for (const slot of slots) {
      const p = zonedParts(slot.start, s.settings.clinic.timezone);
      const key = `${p.year}-${p.month}-${p.day}`;
      groups.set(key, [...(groups.get(key) ?? []), slot]);
    }
    return [...groups.values()].slice(0, 6);
  }, [open, s, appointmentTypeId, providerId, now, patientId, excludeAppointmentId]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      title={title}
      description={description ?? `${type?.name} · ${type?.durationMin} minutes`}
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!selected}
            onClick={() => {
              if (selected && onConfirm(selected)) {
                setSelected(null);
                onClose();
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="Provider" htmlFor="slot-provider" className="mb-4 max-w-xs">
        <Select
          id="slot-provider"
          value={providerId}
          onChange={(e) => {
            setProviderId(e.target.value);
            setSelected(null);
          }}
        >
          {s.settings.providers
            .filter((p) => p.active)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.title}
              </option>
            ))}
        </Select>
      </Field>
      {days.length === 0 ? (
        <p className="rounded-lg bg-subtle px-4 py-6 text-center text-sm text-muted">
          No open times in the next {s.settings.booking.horizonDays} days for this provider. Try another provider.
        </p>
      ) : (
        <div className="flex flex-col gap-4" role="radiogroup" aria-label="Available times">
          {days.map((slots) => (
            <div key={slots[0].start}>
              <p className="mb-2 text-[13px] font-semibold text-ink">{formatWeekday(slots[0].start, s.settings)}</p>
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => {
                  const active = selected?.start === slot.start && selected.providerId === slot.providerId;
                  return (
                    <button
                      key={slot.start}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setSelected(slot)}
                      className={clsx(
                        "tnum h-8 rounded-lg border px-3 text-[13px] font-medium transition-colors duration-150",
                        active ? "border-brand bg-brand text-white" : "border-line-strong bg-surface text-ink hover:border-brand hover:text-brand",
                      )}
                    >
                      {formatTime(slot.start, s.settings)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-[12px] text-muted">
        Times respect clinic hours, breaks, {s.settings.booking.minNoticeHours}h minimum notice and existing bookings. Double-booking is blocked.
      </p>
    </Dialog>
  );
}
