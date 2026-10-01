"use client";

import clsx from "clsx";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowBendUpLeft,
  Checks,
  HandPalm,
  PaperPlaneRight,
  Pause,
  Robot,
  Stop,
  UserCircle,
} from "@phosphor-icons/react";
import { CHANNEL_LABEL } from "@/lib/domain/countries";
import {
  ACTION_LABEL,
  caseContext,
  markNeedsHuman,
  markRead,
  patientAction,
  patientSelectSlot,
  patientText,
  pauseAutomation,
  returnToAutomation,
  staffSendMessage,
  stopAutomation,
  takeOver,
} from "@/lib/domain/engine";
import { formatDateTime, formatSlot, formatTime } from "@/lib/domain/format";
import { isOpen } from "@/lib/domain/status";
import type { Case, CaseEvent, DemoState, Message, PatientAction } from "@/lib/domain/types";
import { useNow, useStore } from "@/lib/store";
import { ActorTag, AutomationIndicator } from "@/components/status";
import { Button, Dialog, Field, Input, Textarea } from "@/components/ui";

/** Event types shown inline in the conversation as system lines. */
const INLINE_EVENTS = new Set<CaseEvent["type"]>([
  "follow_up_started",
  "follow_up_scheduled",
  "follow_up_held",
  "automation_changed",
  "appointment_booked",
  "appointment_rescheduled",
  "appointment_cancelled",
  "handoff_created",
  "opted_out",
  "deferred",
  "campaign_added",
]);

type Item = { kind: "message"; at: string; m: Message } | { kind: "event"; at: string; e: CaseEvent };

function threadItems(s: DemoState, c: Case): Item[] {
  const items: Item[] = [
    ...s.messages.filter((m) => m.caseId === c.id).map((m) => ({ kind: "message" as const, at: m.at, m })),
    ...s.events
      .filter((e) => e.caseId === c.id && INLINE_EVENTS.has(e.type))
      .map((e) => ({ kind: "event" as const, at: e.at, e })),
  ];
  return items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind === "message" ? -1 : 1));
}

function eventText(s: DemoState, e: CaseEvent) {
  if (e.type === "follow_up_scheduled" && e.detail) return `${e.label} · ${formatDateTime(e.detail, s.settings)}`;
  if (e.type === "follow_up_held" && e.detail) return `${e.label} until ${formatDateTime(e.detail, s.settings)}`;
  if (e.type === "deferred" && e.detail?.startsWith("Reactivation eligible from ")) {
    return `Deferred · reactivation eligible from ${formatDateTime(e.detail.replace("Reactivation eligible from ", ""), s.settings)}`;
  }
  return e.detail && e.type !== "follow_up_started" && e.type !== "campaign_added" ? `${e.label} · ${e.detail}` : e.label;
}

export function ConversationPanel({ s, c, compactHeader }: { s: DemoState; c: Case; compactHeader?: boolean }) {
  const act = useStore((x) => x.act);
  const now = useNow();
  const { patient } = caseContext(s, c);
  const items = threadItems(s, c);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffReason, setHandoffReason] = useState("");
  const dnc = patient.consent.doNotContact;
  const auto = c.automation.state;
  const open = isOpen(c.status);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, c.id]);

  // Opening a conversation marks it read.
  useEffect(() => {
    if (c.unread) act((d) => markRead(d, c.id));
  }, [c.id, c.unread, act]);

  const latestOffer = [...s.messages].reverse().find((m) => m.caseId === c.id && m.kind === "slot_offer");
  const offerIsLatest = latestOffer && !s.messages.some((m) => m.caseId === c.id && m.at > latestOffer.at && m.sender !== "patient" && m.kind !== "slot_offer") && c.status !== "scheduled";

  return (
    <div className="flex min-h-0 flex-col">
      <div className={clsx("flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5", compactHeader && "py-2.5")}>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink">
            {CHANNEL_LABEL[patient.preferredChannel]} conversation
            <span className="ml-2 text-[12px] font-normal text-muted">Simulated — no real messages are sent</span>
          </p>
          <AutomationIndicator state={auto} />
          {c.automation.reason && auto !== "running" && <span className="ml-1.5 text-[12px] text-muted">· {c.automation.reason}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(auto === "running" || auto === "finished" || auto === "paused") && !dnc && (
            <Button size="sm" icon={<HandPalm size={15} />} onClick={() => act((d, n) => takeOver(d, c.id, n), "You're in control. CaseFlow will not reply automatically.")}>
              Take over
            </Button>
          )}
          {(auto === "staff" || auto === "paused" || (auto === "stopped" && open)) && !dnc && c.sequence.startedAt && c.status !== "deferred" && (
            <Button size="sm" icon={<Robot size={15} />} onClick={() => act((d, n) => returnToAutomation(d, c.id, n), "Returned to automation.")}>
              Return to automation
            </Button>
          )}
          {auto === "running" && (
            <Button size="sm" variant="ghost" icon={<Pause size={15} />} onClick={() => act((d, n) => pauseAutomation(d, c.id, n), "Automation paused.")}>
              Pause
            </Button>
          )}
          {open && c.status !== "needs_human" && (
            <Button size="sm" variant="ghost" icon={<UserCircle size={15} />} onClick={() => setHandoffOpen(true)}>
              Mark needs human
            </Button>
          )}
          {auto !== "stopped" && auto !== "not_started" && (
            <Button size="sm" variant="danger" icon={<Stop size={15} />} onClick={() => act((d, n) => stopAutomation(d, c.id, n), "Automation stopped. No further automated messages will be sent.")}>
              Stop automation
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="scroll-thin flex h-[min(560px,62dvh)] flex-col gap-3 overflow-y-auto bg-subtle/60 px-3 py-4 sm:px-5" aria-label="Message thread" role="log">
        {items.length === 0 && (
          <p className="m-auto max-w-[36ch] text-center text-[13px] text-muted">No messages yet. Start follow-up to send the first message, or write to the patient below.</p>
        )}
        {items.map((it) =>
          it.kind === "event" ? (
            <div key={it.e.id} className="flex items-center gap-2 px-2 text-[11.5px] text-muted">
              <span className="h-px flex-1 bg-line" />
              <span className="max-w-[80%] text-center">
                <span className="font-medium text-ink-2">{eventText(s, it.e)}</span> · {formatTime(it.e.at, s.settings)}
              </span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ) : (
            <Bubble key={it.m.id} s={s} m={it.m} />
          ),
        )}
      </div>

      <Composer s={s} c={c} offerSlots={offerIsLatest ? latestOffer?.slots : undefined} now={now} />

      <Dialog
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        title="Mark as needs human"
        description="Automation pauses and the case moves to the Needs Human queue."
        footer={
          <>
            <Button onClick={() => setHandoffOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const r = act((d, n) => markNeedsHuman(d, c.id, handoffReason.trim() || "Flagged by staff", n), "Case moved to Needs Human.");
                if (r.ok) {
                  setHandoffOpen(false);
                  setHandoffReason("");
                }
              }}
            >
              Mark needs human
            </Button>
          </>
        }
      >
        <Field label="Reason (shown to the team)" htmlFor="handoff-reason">
          <Input id="handoff-reason" value={handoffReason} onChange={(e) => setHandoffReason(e.target.value)} placeholder="e.g. Wants to discuss timing with Dr. Rao" />
        </Field>
      </Dialog>
    </div>
  );
}

function Bubble({ s, m }: { s: DemoState; m: Message }) {
  const inbound = m.sender === "patient";
  return (
    <div className={clsx("flex flex-col gap-1", inbound ? "items-start" : "items-end")}>
      <div className={clsx("flex items-center gap-1.5 text-[11.5px] text-muted", inbound ? "pl-1" : "pr-1")}>
        <ActorTag actor={m.sender} />
        {m.sender === "staff" && m.staffName && <span>{m.staffName}</span>}
        <span className="tnum">{formatDateTime(m.at, s.settings)}</span>
        {!inbound && m.delivery && (
          <span className="inline-flex items-center gap-0.5" title={`Simulated ${m.delivery}`}>
            <Checks size={13} /> {m.delivery === "delivered" ? "Delivered" : m.delivery}
          </span>
        )}
      </div>
      <div
        className={clsx(
          "max-w-[min(520px,88%)] rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap",
          inbound && "rounded-tl-md border border-line bg-surface text-ink",
          m.sender === "ai" && "rounded-tr-md bg-brand-soft text-brand-ink",
          m.sender === "staff" && "rounded-tr-md bg-info-soft text-[#123f87]",
          m.sender === "system" && "rounded-tr-md border border-line bg-rail text-ink-2",
        )}
      >
        {m.body}
        {m.slots && m.slots.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {m.slots.map((slot) => (
              <li key={slot.start} className="tnum rounded-lg bg-white/70 px-2.5 py-1.5 text-[13px] font-medium">
                {formatSlot(slot.start, s.settings)}
              </li>
            ))}
          </ul>
        )}
        {m.actions && m.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Quick replies offered to the patient">
            {m.actions.map((a) => (
              <span key={a} className="rounded-full border border-brand/25 bg-white/70 px-2.5 py-0.5 text-[12px] font-medium">
                {ACTION_LABEL[a]}
              </span>
            ))}
          </div>
        )}
      </div>
      {inbound && m.intent && <span className="pl-1 text-[11.5px] text-muted">Detected: {m.intent}</span>}
    </div>
  );
}

const SAMPLE_PROMPTS = [
  "Is there parking near the clinic?",
  "Do you offer EMI options?",
  "Will this hurt?",
  "Do I really need this treatment?",
  "How much will it cost?",
  "STOP",
];

function Composer({ s, c, offerSlots, now }: { s: DemoState; c: Case; offerSlots?: Message["slots"]; now: Date }) {
  const act = useStore((x) => x.act);
  const { patient } = caseContext(s, c);
  const dnc = patient.consent.doNotContact;
  const [mode, setMode] = useState<"staff" | "patient">(c.automation.state === "staff" ? "staff" : "patient");
  const [staffText, setStaffText] = useState("");
  const [patientDraft, setPatientDraft] = useState("");

  const sendStaff = (e: FormEvent) => {
    e.preventDefault();
    const r = act((d, n) => staffSendMessage(d, c.id, staffText, n), "Message sent (simulated). You now have control of this conversation.");
    if (r.ok) setStaffText("");
  };
  const sendPatient = (text: string) => {
    const r = act((d, n) => patientText(d, c.id, text, n));
    if (r.ok) setPatientDraft("");
  };
  const tap = (a: PatientAction) => act((d, n) => patientAction(d, c.id, a, n));

  return (
    <div className="border-t border-line bg-surface">
      <div role="tablist" aria-label="Composer" className="flex gap-1 border-b border-line px-3 pt-2 sm:px-4">
        {(
          [
            ["patient", "Simulate patient (demo)"],
            ["staff", "Reply as staff"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => setMode(key)}
            className={clsx(
              "-mb-px border-b-2 px-2.5 pb-2 text-[13px] font-medium",
              mode === key ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "staff" ? (
        <form onSubmit={sendStaff} className="flex flex-col gap-2 p-3 sm:p-4">
          {dnc ? (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">This patient opted out. CaseFlow blocks all outgoing messages. Call the clinic number if the patient contacts you.</p>
          ) : (
            <>
              <label htmlFor={`staff-${c.id}`} className="sr-only">
                Message to {patient.firstName}
              </label>
              <Textarea
                id={`staff-${c.id}`}
                value={staffText}
                onChange={(e) => setStaffText(e.target.value)}
                rows={2}
                className="min-h-16"
                placeholder={`Write to ${patient.firstName}…`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendStaff(e as unknown as FormEvent);
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-muted">Sending takes over the conversation from automation.</p>
                <Button type="submit" variant="primary" size="sm" icon={<PaperPlaneRight size={15} />} disabled={!staffText.trim()}>
                  Send
                </Button>
              </div>
            </>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <p className="text-[12px] text-muted">
            Play the patient to test the workflow. Replies go through the same guardrails a real patient message would.
          </p>
          {offerSlots && offerSlots.length > 0 && (
            <div>
              <p className="mb-1.5 text-[12.5px] font-medium text-ink-2">Patient chooses a time</p>
              <div className="flex flex-wrap gap-1.5">
                {offerSlots.map((slot) => (
                  <Button
                    key={slot.start}
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      act((d, n) => patientSelectSlot(d, c.id, slot, n), (appt) => (appt ? `Booked ${formatSlot(slot.start, s.settings)} — case is now Scheduled.` : "That time was taken. New times were offered."))
                    }
                  >
                    {formatSlot(slot.start, s.settings)}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1.5" aria-label="Patient quick replies">
            {(["book", "contact", "not_now", "stop"] as PatientAction[]).map((a) => (
              <Button key={a} size="sm" onClick={() => tap(a)} disabled={dnc && a !== "stop"} variant={a === "stop" ? "danger" : "secondary"}>
                {ACTION_LABEL[a]}
              </Button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (patientDraft.trim()) sendPatient(patientDraft);
            }}
            className="flex gap-2"
          >
            <label htmlFor={`pt-${c.id}`} className="sr-only">
              Patient message
            </label>
            <Input id={`pt-${c.id}`} value={patientDraft} onChange={(e) => setPatientDraft(e.target.value)} placeholder={`Type as ${patient.firstName}…`} />
            <Button type="submit" icon={<ArrowBendUpLeft size={15} />} disabled={!patientDraft.trim()}>
              Send
            </Button>
          </form>
          <div className="flex flex-wrap gap-1.5" aria-label="Example patient messages">
            {SAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => sendPatient(p)}
                className="rounded-full border border-line bg-subtle px-2.5 py-1 text-[12px] text-ink-2 hover:border-line-strong hover:bg-rail"
              >
                {p}
              </button>
            ))}
          </div>
          <p className="sr-only">Demo time {formatDateTime(now, s.settings)}</p>
        </div>
      )}
    </div>
  );
}
