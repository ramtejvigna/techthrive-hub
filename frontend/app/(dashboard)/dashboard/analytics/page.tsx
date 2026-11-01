"use client";

import { ChangeLabel } from "@/components/analytics/change-label";
import { formatCount, formatDuration, formatPercent } from "@/components/analytics/format";
import { LivePanel } from "@/components/analytics/live-panel";
import { RankList } from "@/components/analytics/rank-list";
import { SetupSteps } from "@/components/analytics/setup-steps";
import { SitesTable } from "@/components/analytics/sites-table";
import { TrendChart } from "@/components/analytics/trend-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PAGE_CONTAINER, PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsOverview, useAnalyticsReport, useAnalyticsSites } from "@/lib/queries";
import type { AnalyticsRange, AnalyticsReport, AnalyticsTotals } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useState } from "react";

const ALL_SITES = "all";
const RANGES: { value: AnalyticsRange; label: string; days: number }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "28d", label: "28 days", days: 28 },
  { value: "90d", label: "90 days", days: 90 },
];

const TILES: {
  key: keyof AnalyticsTotals;
  label: string;
  format: (value: number) => string;
}[] = [
  { key: "users", label: "Users", format: formatCount },
  { key: "sessions", label: "Sessions", format: formatCount },
  { key: "views", label: "Page views", format: formatCount },
  { key: "engagement_rate", label: "Engagement rate", format: formatPercent },
  { key: "avg_session_seconds", label: "Avg. session", format: formatDuration },
  { key: "key_events", label: "Key events", format: formatCount },
];

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="panel flex flex-col items-center justify-center border-dashed py-16 text-center">
      <p className="max-w-md text-sm text-[var(--muted)]">{message}</p>
      <button type="button" onClick={onRetry} className="chip mt-4">
        Try again
      </button>
    </div>
  );
}

function ReportView({ siteId, report }: { siteId: string; report: AnalyticsReport }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {TILES.map((tile, index) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            value={tile.format(report.totals[tile.key])}
            icon={<span className="h-1.5 w-1.5 rounded-full bg-current" />}
            note={<ChangeLabel current={report.totals[tile.key]} previous={report.previous[tile.key]} />}
            tone={index === 0 ? "tint" : "panel"}
            delay={index * 0.03}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TrendChart daily={report.daily} />
        <LivePanel siteId={siteId} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <RankList title="Top pages" metric="Views" rows={report.pages} />
        <RankList title="Landing pages" metric="Sessions" rows={report.landing_pages} />
        <RankList title="Traffic sources" metric="Sessions" rows={report.channels} />
        <RankList title="Countries" metric="Users" rows={report.countries} />
        <RankList title="Devices" metric="Users" rows={report.devices} />
        <RankList title="Events" metric="Count" rows={report.events} />
      </div>

      {report.partial_data && (
        <p className="text-xs text-[var(--muted)]">
          Google hid or estimated some of this data, so small numbers may differ from the Google
          Analytics site.
        </p>
      )}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {TILES.map((tile) => (
          <Skeleton key={tile.key} className="h-32 rounded-[22px]" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-[22px]" />
    </div>
  );
}

export default function AnalyticsPage() {
  const [selectedSite, setSelectedSite] = useState<string | null>(null);
  const [range, setRange] = useState<AnalyticsRange>("28d");
  const { data: sites, error: sitesError, refetch: refetchSites } = useAnalyticsSites();

  // With one site there's nothing to compare, so go straight to its report.
  const siteId = selectedSite ?? (sites?.length === 1 ? sites[0].id : ALL_SITES);
  const showAll = siteId === ALL_SITES;

  const report = useAnalyticsReport(siteId, range, !showAll);
  const overview = useAnalyticsOverview(range, showAll && Boolean(sites?.length));
  const active = showAll ? overview : report;

  const days = RANGES.find((item) => item.value === range)?.days;
  const connected = Boolean(sites?.length);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          connected
            ? `Last ${days} full days, compared with the ${days} days before.`
            : "Website traffic from Google Analytics."
        }
        actions={
          connected && (
            <div className="flex flex-wrap items-center gap-2">
              {sites && sites.length > 1 && (
                <select
                  value={siteId}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  aria-label="Website"
                  className="h-10 max-w-48 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
                >
                  <option value={ALL_SITES}>All sites</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              )}
              <div
                role="group"
                aria-label="Date range"
                className="flex h-10 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1"
              >
                {RANGES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={range === item.value}
                    onClick={() => setRange(item.value)}
                    className={cn(
                      "h-full rounded-full px-3 text-xs font-medium transition-colors",
                      range === item.value
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "text-[var(--muted)] hover:text-[var(--foreground)]",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )
        }
      />

      <div className={cn(PAGE_CONTAINER, "pb-12")}>
        {sitesError ? (
          <ErrorPanel message={sitesError.message} onRetry={() => void refetchSites()} />
        ) : !sites ? (
          <ReportSkeleton />
        ) : !connected ? (
          <SetupSteps />
        ) : active.error ? (
          <ErrorPanel message={active.error.message} onRetry={() => void active.refetch()} />
        ) : showAll ? (
          <SitesTable sites={overview.data} onSelect={setSelectedSite} />
        ) : report.data ? (
          <ReportView siteId={siteId} report={report.data} />
        ) : (
          <ReportSkeleton />
        )}
      </div>
    </>
  );
}
