"use client";

import type { AnalyticsDay } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState, type PointerEvent } from "react";
import { formatCount, formatDay } from "./format";

type Series = "users" | "sessions" | "views";

const SERIES: { key: Series; label: string }[] = [
  { key: "users", label: "Users" },
  { key: "sessions", label: "Sessions" },
  { key: "views", label: "Views" },
];

const TICKS = 4;
const PLOT_HEIGHT = 220;

/** The smallest 1/2/5×10ⁿ top value at or above `max`, so axis labels stay round. */
function niceMax(max: number) {
  if (max <= TICKS) return TICKS;
  const step = max / TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const nice = [1, 2, 5, 10].find((option) => option * magnitude >= step) ?? 10;
  return nice * magnitude * TICKS;
}

/** One measure over time. Switching tabs replaces the line rather than adding a second axis. */
export function TrendChart({ daily }: { daily: AnalyticsDay[] }) {
  const [series, setSeries] = useState<Series>("users");
  const [hovered, setHovered] = useState<number | null>(null);

  const label = SERIES.find((item) => item.key === series)?.label;
  const values = daily.map((day) => day[series]);
  const top = niceMax(Math.max(...values, 0));
  const last = values.length - 1;
  const xPercent = (index: number) => (index / last) * 100;
  const yPercent = (value: number) => 100 - (value / top) * 100;
  const line = values.map((value, index) => `${xPercent(index)},${yPercent(value)}`).join(" ");

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setHovered(Math.round(((event.clientX - box.left) / box.width) * last));
  }

  const point = hovered === null ? null : daily[hovered];

  return (
    <section className="panel flex min-w-0 flex-col p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{label} per day</h2>
        <div className="flex gap-1" role="group" aria-label="Metric">
          {SERIES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={series === item.key}
              onClick={() => setSeries(item.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                series === item.key
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {daily.length < 2 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">Not enough data for this period yet.</p>
      ) : (
        <div className="mt-5 flex gap-3">
          <div
            aria-hidden
            className="flex w-9 shrink-0 flex-col justify-between text-right font-mono text-[10px] leading-none text-[var(--muted)]"
            style={{ height: PLOT_HEIGHT }}
          >
            {Array.from({ length: TICKS + 1 }, (_, index) => (
              <span key={index}>{formatCount(top - (top / TICKS) * index)}</span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div
              className="relative touch-none"
              style={{ height: PLOT_HEIGHT }}
              onPointerMove={handlePointerMove}
              onPointerLeave={() => setHovered(null)}
            >
              {Array.from({ length: TICKS + 1 }, (_, index) => (
                <span
                  key={index}
                  className="absolute inset-x-0 h-px bg-[var(--border)]"
                  style={{ top: `${(index / TICKS) * 100}%` }}
                />
              ))}

              {/* Stretched to the box; non-scaling-stroke keeps the line 2px at any width. */}
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full overflow-visible"
                aria-hidden
              >
                <polyline
                  points={line}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {point && hovered !== null && (
                <>
                  <span
                    className="absolute inset-y-0 w-px bg-[var(--border-strong)]"
                    style={{ left: `${xPercent(hovered)}%` }}
                  />
                  <span
                    className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]"
                    style={{ left: `${xPercent(hovered)}%`, top: `${yPercent(point[series])}%` }}
                  />
                  <div
                    className={cn(
                      "pointer-events-none absolute top-2 z-10 whitespace-nowrap rounded-lg bg-[var(--ink)] px-2.5 py-1.5 text-[var(--ink-fg)]",
                      // Flip at the halfway point so it never runs off the right edge.
                      hovered > last / 2 ? "-translate-x-full -ml-2" : "ml-2",
                    )}
                    style={{ left: `${xPercent(hovered)}%` }}
                  >
                    <p className="text-[11px] text-[var(--ink-muted)]">{formatDay(point.date)}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {point[series].toLocaleString()} {label?.toLowerCase()}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div
              aria-hidden
              className="mt-2 flex justify-between font-mono text-[10px] text-[var(--muted)]"
            >
              <span>{formatDay(daily[0].date)}</span>
              <span>{formatDay(daily[Math.floor(last / 2)].date)}</span>
              <span>{formatDay(daily[last].date)}</span>
            </div>
          </div>

          <table className="sr-only">
            <caption>{label} per day</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">{label}</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((day) => (
                <tr key={day.date}>
                  <td>{formatDay(day.date)}</td>
                  <td>{day[series]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
