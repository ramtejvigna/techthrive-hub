import type { AnalyticsRow } from "@/lib/types";
import { formatCount } from "./format";

/** A top-10 list: labels stay readable at any length, and bars show the share of the leader. */
export function RankList({
  title,
  metric,
  rows,
}: {
  title: string;
  metric: string;
  rows: AnalyticsRow[];
}) {
  const max = rows[0]?.value || 1;

  return (
    <section className="panel flex min-w-0 flex-col p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-[11px] text-[var(--muted)]">{metric}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--muted)]">No data for this period.</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="truncate" title={row.label}>
                  {row.label}
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--muted)]">
                  {formatCount(row.value)}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-[var(--surface-subtle)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)]"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
