"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CalendarBlank,
  ChartLineUp,
  ChatsCircle,
  CheckCircle,
  ClipboardText,
  ClockCounterClockwise,
  FastForward,
  GearSix,
  Info,
  List,
  ListChecks,
  MegaphoneSimple,
  Play,
  Repeat,
  SquaresFour,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { endOfLocalDay, DAY, localDayAt } from "@/lib/domain/time";
import { dueFollowUps, runDueFollowUps } from "@/lib/domain/engine";
import { formatDateTime } from "@/lib/domain/format";
import { useNow, useStore } from "@/lib/store";

export { useNow };
import { Button, Dialog } from "./ui";

function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden className="shrink-0">
        <rect width="24" height="24" rx="6" fill="var(--color-brand)" />
        <path d="M7 15.5c2.2 0 3-1.6 3.8-3.5S12.6 8.5 15 8.5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <circle cx="16.5" cy="15.5" r="1.9" fill="#bfe3da" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">CaseFlow</span>
    </span>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  count?: number;
  tone?: "warn" | "neutral";
}

function useNav(): NavItem[][] {
  const state = useStore((s) => s.state);
  const now = useNow();
  {
    if (!state) return [];
    const needsHuman = state.cases.filter((c) => c.status === "needs_human").length;
    const unread = state.cases.filter((c) => c.unread).length;
    const due = dueFollowUps(state, endOfLocalDay(now, state.settings.clinic.timezone)).length;
    const pending = state.cases.filter((c) => c.status === "pending").length;
    return [
      [
        { href: "/", label: "Dashboard", icon: <SquaresFour size={18} /> },
        { href: "/plans", label: "Treatment Plans", icon: <ClipboardText size={18} />, count: pending || undefined, tone: "neutral" },
        { href: "/cases", label: "Cases", icon: <ListChecks size={18} />, count: needsHuman || undefined, tone: "warn" },
        { href: "/conversations", label: "Conversations", icon: <ChatsCircle size={18} />, count: unread || undefined, tone: "warn" },
        { href: "/follow-ups", label: "Follow-ups", icon: <Repeat size={18} />, count: due || undefined, tone: "neutral" },
        { href: "/campaigns", label: "Campaigns", icon: <MegaphoneSimple size={18} /> },
        { href: "/appointments", label: "Appointments", icon: <CalendarBlank size={18} /> },
      ],
      [
        { href: "/analytics", label: "Analytics", icon: <ChartLineUp size={18} /> },
        { href: "/settings", label: "Settings", icon: <GearSix size={18} /> },
      ],
    ];
  }
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = useNav();
  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {groups.map((group, gi) => (
        <ul key={gi} className="flex flex-col gap-0.5">
          {group.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm no-underline transition-colors duration-150",
                    active ? "bg-surface font-semibold text-ink shadow-card" : "text-ink-2 hover:bg-line/60 hover:text-ink",
                  )}
                >
                  <span className={active ? "text-brand" : "text-muted"}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className={clsx(
                        "tnum min-w-5 rounded-md px-1.5 text-center text-[11.5px] font-semibold",
                        item.tone === "warn" ? "bg-warn-soft text-[#8a4b04]" : "bg-line/80 text-ink-2",
                      )}
                    >
                      {item.count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const state = useStore((s) => s.state);
  if (!state) return null;
  return (
    <div className="border-t border-line pt-3 text-[12.5px]">
      <p className="font-medium text-ink">{state.settings.clinic.name}</p>
      <p className="text-muted">
        {state.settings.staff.currentUser} · {state.settings.staff.role}
      </p>
    </div>
  );
}

function DemoControls() {
  const state = useStore((s) => s.state);
  const act = useStore((s) => s.act);
  const advanceClock = useStore((s) => s.advanceClock);
  const reset = useStore((s) => s.reset);
  const notify = useStore((s) => s.notify);
  const now = useNow();
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!state) return null;

  const runScheduler = () => {
    const r = act((d, n) => runDueFollowUps(d, n));
    if (r.ok) {
      const { sent, held, closed, blocked } = r.value;
      const parts = [
        `${sent} follow-up${sent === 1 ? "" : "s"} sent`,
        held ? `${held} held for quiet hours` : "",
        closed ? `${closed} closed with no response` : "",
        blocked ? `${blocked} stopped (no consent)` : "",
      ].filter(Boolean);
      notify(sent || closed ? "success" : "info", `Scheduler ran: ${parts.join(", ")}.`);
    }
  };

  /** Jump to 10:00 clinic time tomorrow, so the scheduler runs inside sending hours. */
  const advance = () => {
    const target = localDayAt(now, state.settings.clinic.timezone, 1, "10:00");
    advanceClock(target.getTime() - now.getTime());
    // Run the scheduler at the new demo time.
    window.setTimeout(runScheduler, 0);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-warn/30 bg-warn-soft px-2.5 text-[12.5px] font-semibold text-[#7a4304] hover:border-warn/50"
      >
        <span className="tracking-wide uppercase">Demo mode</span>
        <span className="hidden font-medium text-[#8a4b04] sm:inline">· {formatDateTime(now, state.settings)}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Demo controls"
          className="absolute right-0 z-40 mt-2 w-[min(340px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-4 shadow-pop"
        >
          <p className="text-sm font-semibold">Demo controls</p>
          <p className="mt-1 text-[12.5px] text-muted">
            All patients are synthetic. Messages are simulated — nothing is sent. In production the scheduler runs on the
            server every few minutes.
          </p>
          <div className="mt-3 rounded-lg bg-subtle px-3 py-2 text-[13px]">
            <span className="text-muted">Demo clock </span>
            <span className="tnum font-medium">{formatDateTime(now, state.settings)}</span>
            {state.clockOffsetMs > 0 && (
              <span className="text-muted"> (advanced {(state.clockOffsetMs / DAY).toFixed(1)} days)</span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <Button variant="primary" icon={<Play size={16} weight="fill" />} onClick={runScheduler}>
              Run scheduler now
            </Button>
            <Button icon={<FastForward size={16} />} onClick={advance}>
              Advance to tomorrow, 10:00
            </Button>
            <Button variant="ghost" icon={<ClockCounterClockwise size={16} />} onClick={() => setConfirmReset(true)}>
              Reset demo data
            </Button>
          </div>
        </div>
      )}
      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset demo data?"
        description="Restores the original SmileCare Dental story. Changes you made in this browser will be lost."
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>Keep my changes</Button>
            <Button
              variant="primary"
              onClick={() => {
                reset();
                setConfirmReset(false);
                setOpen(false);
              }}
            >
              Reset demo
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Use this before a fresh walkthrough.</p>
      </Dialog>
    </div>
  );
}

function Toaster() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className="animate-toast pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-[13px] shadow-pop"
        >
          <span className="mt-px">
            {t.tone === "success" ? (
              <CheckCircle size={18} weight="fill" className="text-brand" />
            ) : t.tone === "error" ? (
              <WarningCircle size={18} weight="fill" className="text-danger" />
            ) : (
              <Info size={18} weight="fill" className="text-info" />
            )}
          </span>
          <p className="flex-1 text-ink">{t.message}</p>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="-m-1 rounded p-1 text-muted hover:text-ink">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function MobileNav() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="-ml-1 rounded-lg p-1.5 text-ink-2 hover:bg-rail lg:hidden"
      >
        <List size={22} />
      </button>
      <dialog
        ref={ref}
        onClose={() => setOpen(false)}
        onClick={(e) => e.target === ref.current && setOpen(false)}
        className="m-0 h-dvh max-h-dvh w-[280px] max-w-[85vw] border-r border-line bg-rail p-0 backdrop:bg-ink/30"
      >
        {open && (
          <div className="flex h-full flex-col gap-5 p-4">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="rounded-lg p-1.5 text-muted hover:bg-line">
                <X size={18} />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
            <div className="mt-auto">
              <SidebarFooter />
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-rail px-3 py-4 lg:flex">
        <Link href="/" className="px-2 no-underline">
          <Logo />
        </Link>
        <NavList />
        <div className="mt-auto px-2">
          <SidebarFooter />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/90 px-4 backdrop-blur-sm sm:px-6">
          <MobileNav />
          <Link href="/" className="no-underline lg:hidden">
            <Logo />
          </Link>
          <p className="hidden text-[13px] text-muted lg:block">Recover treatment patients haven&apos;t scheduled yet.</p>
          <div className="ml-auto">
            <DemoControls />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1320px] min-w-0 px-4 py-5 sm:px-6 sm:py-7">
          {children}
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export function DemoGate({ children }: { children: ReactNode }) {
  const state = useStore((s) => s.state);
  const init = useStore((s) => s.init);
  useEffect(() => init(), [init]);
  if (!state) {
    return (
      <div className="mx-auto w-full max-w-[1320px] px-4 py-7 sm:px-6" aria-busy="true" aria-label="Loading demo">
        <div className="skeleton h-7 w-56" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24" />
          ))}
        </div>
        <div className="skeleton mt-6 h-72" />
      </div>
    );
  }
  return <>{children}</>;
}
