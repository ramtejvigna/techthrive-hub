"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";

export type TimelineEventState = "done" | "overdue" | "upcoming";

export interface TimelineEvent {
  id: string;
  label: string;
  date: Date;
  state: TimelineEventState;
  href: string;
}

const DAY = 24 * 60 * 60 * 1000;
const DAYS_BEFORE = 7;
const DAYS_AFTER = 28;

const dotStyles: Record<TimelineEventState, string> = {
  done: "bg-emerald-400",
  overdue: "bg-orange-400",
  upcoming: "bg-[var(--accent)]",
};

/** Horizontal five-week strip of dated events with a "now" marker. */
export function TimelineStrip({ events }: { events: TimelineEvent[] }) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DAYS_BEFORE);
  const span = (DAYS_BEFORE + DAYS_AFTER) * DAY;
  const position = (date: Date) => ((date.getTime() - start.getTime()) / span) * 100;

  const visible = events.filter((event) => {
    const pct = position(event.date);
    return pct >= 0 && pct <= 100;
  });

  const ticks = Array.from({ length: 6 }, (_, week) => new Date(start.getTime() + week * 7 * DAY));
  const nowPct = position(now);

  return (
    <div className="pt-8">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--border-strong)]" />
        <div
          className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[var(--accent)]/60"
          style={{ width: `${nowPct}%` }}
        />

        {visible.map((event, index) => (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 + index * 0.04 }}
            className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position(event.date)}%` }}
          >
            <Link
              href={event.href}
              aria-label={event.label}
              className={cn(
                "block h-3 w-3 rounded-full ring-[3px] ring-[var(--surface)] transition-transform hover:scale-125",
                dotStyles[event.state],
              )}
            />
            <span className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--ink)] px-2 py-1 text-[11px] text-[var(--ink-fg)] opacity-0 transition-opacity group-hover:opacity-100">
              {event.label} ·{" "}
              {event.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </motion.div>
        ))}

        <div
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${nowPct}%` }}
        >
          <span className="block h-6 w-px bg-orange-500" />
          <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-orange-500 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white">
            Today
          </span>
        </div>
      </div>

      <div className="relative mt-3 h-4">
        {ticks.map((tick) => (
          <span
            key={tick.getTime()}
            className="absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-[var(--muted-light)] first:translate-x-0 last:-translate-x-full"
            style={{ left: `${position(tick)}%` }}
          >
            {tick.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        ))}
      </div>
    </div>
  );
}
