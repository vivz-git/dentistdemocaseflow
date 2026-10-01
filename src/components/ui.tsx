"use client";

import clsx from "clsx";
import Link from "next/link";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "@phosphor-icons/react";

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)] hover:bg-brand-strong active:bg-brand-ink disabled:bg-line-strong disabled:text-white",
  secondary:
    "bg-surface text-ink border border-line-strong hover:bg-subtle hover:border-faint/50 active:bg-rail disabled:text-faint disabled:bg-surface",
  ghost: "text-ink-2 hover:bg-rail active:bg-line disabled:text-faint",
  quiet: "text-brand hover:bg-brand-soft active:bg-brand-soft disabled:text-faint",
  danger:
    "bg-surface text-danger border border-danger/30 hover:bg-danger-soft active:bg-danger-soft disabled:text-faint disabled:border-line",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export function ButtonLink({
  href,
  variant = "secondary",
  size = "md",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-lg font-medium whitespace-nowrap no-underline transition-colors duration-150",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  children,
  className,
  as: Tag = "section",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article" | "aside";
} & Record<string, unknown>) {
  return (
    <Tag className={clsx("rounded-[var(--radius-card)] border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
  id,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div className={clsx("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-5", className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:mb-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted no-underline hover:text-ink">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.01em] text-balance text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Badges and labels                                                   */
/* ------------------------------------------------------------------ */

export function Badge({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap",
        className ?? "bg-subtle text-ink-2",
      )}
    >
      {children}
    </span>
  );
}

/** Marks figures that are estimates or demo data — required on every financial number. */
export function DemoTag({ children = "Estimate" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex h-[18px] items-center rounded border border-warn/30 bg-warn-soft px-1 text-[10.5px] font-semibold tracking-wide text-warn uppercase">
      {children}
    </span>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-rail text-xs font-semibold text-ink-2",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-[46ch] text-[13px] text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

const control =
  "w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-faint transition-colors duration-150 hover:border-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-subtle disabled:text-faint aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(control, "h-9", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={clsx(control, "min-h-24 py-2 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(control, "h-9 cursor-pointer pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor: string;
  className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[12.5px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-[12.5px] text-muted">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          className={clsx(
            "inline-block size-4 rounded-full bg-white shadow-sm transition-transform duration-150",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented tabs                                                      */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; count?: number }[];
  label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="scroll-thin -mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={clsx(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
              active ? "bg-ink text-white" : "text-ink-2 hover:bg-rail",
            )}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={clsx("tnum rounded px-1 text-[11.5px]", active ? "bg-white/15" : "bg-rail text-muted")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog (native <dialog> for focus management and Esc handling)      */
/* ------------------------------------------------------------------ */

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        "m-auto max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] rounded-xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-ink/30",
        wide ? "max-w-2xl" : "max-w-lg",
      )}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-32px)] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md p-1 text-muted hover:bg-rail hover:text-ink">
              <X size={18} />
            </button>
          </div>
          <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Key/value list                                                      */
/* ------------------------------------------------------------------ */

export function Dl({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={clsx("grid grid-cols-[minmax(110px,auto)_1fr] gap-x-4 gap-y-2.5 text-[13px]", className)}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="text-muted">{it.label}</dt>
          <dd className="min-w-0 text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
