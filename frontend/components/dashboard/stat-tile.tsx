"use client";

import { FadeIn } from "@/components/motion/fade-in";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "ink" | "tint" | "panel";

const toneStyles: Record<Tone, { box: string; icon: string; label: string; note: string }> = {
  ink: {
    box: "panel-ink",
    icon: "bg-white/10 text-[var(--ink-fg)]",
    label: "text-[var(--ink-muted)]",
    note: "text-[var(--ink-muted)]",
  },
  tint: {
    box: "rounded-[22px] bg-[var(--tint-blue)]",
    icon: "bg-[var(--surface)] text-[var(--tint-blue-fg)]",
    label: "text-[var(--muted)]",
    note: "text-[var(--tint-blue-fg)]",
  },
  panel: {
    box: "panel",
    icon: "bg-[var(--surface)] text-[var(--muted)]",
    label: "text-[var(--muted)]",
    note: "text-[var(--muted)]",
  },
};

/** Compact KPI tile matching the dashboard's stat row. */
export function StatTile({
  label,
  value,
  icon,
  note,
  aside,
  tone = "panel",
  valueClassName,
  delay = 0,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  note?: ReactNode;
  /** Rendered to the right of the value (sparkline, mini bar...). */
  aside?: ReactNode;
  tone?: Tone;
  valueClassName?: string;
  delay?: number;
}) {
  const styles = toneStyles[tone];
  return (
    <FadeIn delay={delay} className={cn("flex flex-col p-5", styles.box)}>
      <div className="flex items-center gap-2">
        <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", styles.icon)}>
          {icon}
        </span>
        <span className={cn("text-xs font-medium", styles.label)}>{label}</span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <p className={cn("text-3xl font-semibold tabular-nums tracking-tight", valueClassName)}>{value}</p>
        {aside}
      </div>
      {note && <p className={cn("mt-3 text-[11px]", styles.note)}>{note}</p>}
    </FadeIn>
  );
}
