"use client";

import { useAnalyticsRealtime } from "@/lib/queries";
import { formatCount } from "./format";

/** Refreshes itself while open; a failure here shouldn't disturb the rest of the page. */
export function LivePanel({ siteId }: { siteId: string }) {
  const { data, isError } = useAnalyticsRealtime(siteId);

  return (
    <section className="panel-ink flex min-w-0 flex-col p-5">
      <div className="flex items-center gap-2">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <h2 className="text-sm font-semibold">Live now</h2>
      </div>

      {isError ? (
        <p className="mt-4 text-sm text-[var(--ink-muted)]">Live data isn&apos;t available right now.</p>
      ) : (
        <>
          <p className="mt-4 text-5xl font-semibold tabular-nums tracking-tight">
            {data ? formatCount(data.active_users) : "–"}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-muted)]">users in the last 30 minutes</p>

          {data && data.pages.length > 0 && (
            <ol className="mt-5 space-y-2 border-t border-white/10 pt-4">
              {data.pages.map((page) => (
                <li key={page.label} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span className="truncate" title={page.label}>
                    {page.label}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-muted)]">
                    {formatCount(page.value)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
