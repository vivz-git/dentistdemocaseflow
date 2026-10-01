"use client";

import clsx from "clsx";
import { useState, type ReactNode } from "react";

/**
 * Small hand-built charts. Marks follow one spec: thin bars (≤ 24px), 4px rounded
 * data-ends, hairline solid gridlines, text in ink tokens, hover tooltips, and a
 * table alternative where the chart is not already labelled.
 */

export interface FunnelStage {
  label: string;
  value: number;
  hint?: string;
}

/** Ordered stages, one hue; each bar shows count and conversion from the previous stage. */
export function Funnel({ stages, ariaLabel }: { stages: FunnelStage[]; ariaLabel: string }) {
  const max = Math.max(1, ...stages.map((s) => s.value));
  return (
    <ol aria-label={ariaLabel} className="flex flex-col gap-3">
      {stages.map((stage, i) => {
        const prev = i > 0 ? stages[i - 1].value : null;
        const rate = prev ? stage.value / prev : null;
        const pct = (stage.value / max) * 100;
        return (
          <li key={stage.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[180px_minmax(0,1fr)_96px]">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-ink">{stage.label}</p>
              {stage.hint && <p className="hidden truncate text-[12px] text-muted sm:block">{stage.hint}</p>}
            </div>
            <div className="order-3 col-span-2 h-5 sm:order-none sm:col-span-1" title={`${stage.label}: ${stage.value}`}>
              <div
                className="h-full rounded-r-[4px] transition-[width] duration-300"
                style={{
                  width: `${Math.max(pct, stage.value ? 1.5 : 0)}%`,
                  background: `color-mix(in oklab, var(--color-brand) ${100 - i * 14}%, #cfe7e1)`,
                }}
              />
            </div>
            <div className="text-right">
              <span className="text-[15px] font-semibold text-ink">{stage.value}</span>
              {rate !== null && (
                <span className="tnum ml-1.5 text-[12px] text-muted">{Math.round(rate * 100)}%</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface ColumnDatum {
  key: string;
  label: string;
  values: number[];
  tooltip: ReactNode;
}

/**
 * Grouped columns for up to two series on one axis (e.g. presented vs scheduled per week).
 */
export function GroupedColumns({
  data,
  series,
  height = 180,
  ariaLabel,
}: {
  data: ColumnDatum[];
  series: { name: string; color: string }[];
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => d.values));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  return (
    <figure aria-label={ariaLabel} className="m-0">
      {series.length > 1 && (
        <figcaption className="mb-3 flex flex-wrap gap-4 text-[12.5px] text-ink-2">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </figcaption>
      )}
      <div className="relative flex gap-2">
        <div className="tnum flex shrink-0 flex-col-reverse justify-between text-right text-[11px] text-faint" style={{ height }}>
          {ticks.map((t) => (
            <span key={t} className="leading-none">
              {t}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {ticks.map((t) => (
            <div key={t} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / top) * 100}%` }} />
          ))}
          <div className="absolute inset-0 flex items-end">
            {data.map((d, i) => (
              <div
                key={d.key}
                className="relative flex h-full flex-1 items-end justify-center gap-[2px]"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
                aria-label={`${d.label}: ${series.map((s, si) => `${s.name} ${d.values[si]}`).join(", ")}`}
              >
                {hover === i && <div aria-hidden className="absolute inset-y-0 inset-x-0.5 rounded bg-ink/[0.04]" />}
                {d.values.map((v, si) => (
                  <div
                    key={si}
                    className="relative w-full max-w-[14px] rounded-t-[4px]"
                    style={{ height: `${(v / top) * 100}%`, background: series[si].color, minHeight: v ? 2 : 0 }}
                  />
                ))}
                {hover === i && (
                  <div
                    role="tooltip"
                    className={clsx(
                      "pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[220px] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] shadow-pop",
                      i > data.length / 2 ? "right-0" : "left-0",
                    )}
                  >
                    {d.tooltip}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-7 flex text-[11px] text-faint">
        {data.map((d, i) => (
          <span key={d.key} className={clsx("flex-1 truncate pt-1.5 text-center", i % 2 === 1 && "max-sm:invisible")}>
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

/** Horizontal bars with a label column and value at the tip. Single series. */
export function BarList({
  rows,
  format,
  ariaLabel,
  color = "var(--color-brand)",
}: {
  rows: { key: string; label: ReactNode; value: number; secondary?: ReactNode }[];
  format: (v: number) => string;
  ariaLabel: string;
  color?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[minmax(140px,220px)_minmax(0,1fr)_auto]">
          <div className="min-w-0 truncate text-[13px] text-ink">{r.label}</div>
          <div className="order-3 col-span-2 h-3 sm:order-none sm:col-span-1">
            <div className="h-full rounded-r-[4px]" style={{ width: `${(r.value / max) * 100}%`, background: color, minWidth: r.value ? 3 : 0 }} />
          </div>
          <div className="tnum text-right text-[13px] font-medium text-ink">
            {format(r.value)}
            {r.secondary && <span className="ml-1.5 font-normal text-muted">{r.secondary}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
