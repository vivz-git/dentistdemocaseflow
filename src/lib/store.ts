"use client";

/**
 * Demo repository: the whole CaseFlow state lives in the browser (localStorage),
 * so the demo runs with no backend and no credentials. Every mutation goes through
 * the pure domain engine on a cloned draft, then replaces state atomically.
 *
 * A production deployment would replace this with a server-side repository
 * (PostgreSQL) behind authenticated API routes — see docs/PRODUCTION.md.
 */
import { create } from "zustand";
import { SCHEMA_VERSION, seedDemo } from "@/lib/demo/seed";
import { DomainError } from "@/lib/domain/engine";
import { TransitionError } from "@/lib/domain/status";
import type { DemoState } from "@/lib/domain/types";

const STORAGE_KEY = "caseflow-demo-state";

export interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
}

export type ActResult<T> = { ok: true; value: T } | { ok: false; error: string };

interface Store {
  state: DemoState | null;
  /** Wall-clock milliseconds, refreshed every 30 s and after each action. */
  clock: number;
  storageAvailable: boolean;
  toasts: Toast[];
  init: () => void;
  reset: () => void;
  act: <T>(fn: (draft: DemoState, now: Date) => T, success?: string | ((value: T) => string)) => ActResult<T>;
  advanceClock: (ms: number) => void;
  notify: (tone: Toast["tone"], message: string) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

function load(): { state: DemoState | null; storage: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: null, storage: true };
    const parsed = JSON.parse(raw) as DemoState;
    if (parsed?.schemaVersion !== SCHEMA_VERSION) return { state: null, storage: true };
    return { state: parsed, storage: true };
  } catch {
    return { state: null, storage: false };
  }
}

function save(state: DemoState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked (private mode). The demo keeps working in memory.
  }
}

export function demoNow(state: DemoState | null) {
  return new Date(Date.now() + (state?.clockOffsetMs ?? 0));
}

export const useStore = create<Store>((set, get) => ({
  state: null,
  clock: 0,
  storageAvailable: true,
  toasts: [],

  init: () => {
    if (get().state) return;
    const { state, storage } = load();
    const next = state ?? seedDemo(new Date());
    if (!state) save(next);
    set({ state: next, storageAvailable: storage, clock: Date.now() });
    window.setInterval(() => set({ clock: Date.now() }), 30_000);
  },

  reset: () => {
    const next = seedDemo(new Date());
    save(next);
    set({ state: next, clock: Date.now() });
    get().notify("info", "Demo data reset to the original SmileCare story.");
  },

  act: (fn, success) => {
    const current = get().state;
    if (!current) return { ok: false, error: "Demo is still loading." };
    const draft = structuredClone(current);
    try {
      const value = fn(draft, demoNow(current));
      save(draft);
      set({ state: draft, clock: Date.now() });
      if (success) get().notify("success", typeof success === "function" ? success(value) : success);
      return { ok: true, value };
    } catch (err) {
      const message =
        err instanceof DomainError || err instanceof TransitionError
          ? err.message
          : "Something went wrong. The demo state was not changed.";
      if (!(err instanceof DomainError || err instanceof TransitionError)) console.error(err);
      get().notify("error", message);
      return { ok: false, error: message };
    }
  },

  advanceClock: (ms) => {
    const current = get().state;
    if (!current) return;
    const next = { ...current, clockOffsetMs: current.clockOffsetMs + ms };
    save(next);
    set({ state: next, clock: Date.now() });
  },

  notify: (tone, message) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, tone, message }] }));
    window.setTimeout(() => get().dismiss(id), tone === "error" ? 7000 : 4500);
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Non-null demo state for components rendered inside <DemoGate>. */
export function useDemoState(): DemoState {
  const state = useStore((s) => s.state);
  if (!state) throw new Error("useDemoState must be used inside <DemoGate>.");
  return state;
}

/** Demo "now": wall clock plus any demo-clock advance. Pure during render. */
export function useNow(): Date {
  const clock = useStore((s) => s.clock);
  const offset = useStore((s) => s.state?.clockOffsetMs ?? 0);
  return new Date(clock + offset);
}

export function useAct() {
  return useStore((s) => s.act);
}
