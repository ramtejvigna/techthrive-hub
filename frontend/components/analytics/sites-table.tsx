import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsOverviewSite } from "@/lib/types";
import { ChangeLabel } from "./change-label";
import { formatCount, formatPercent } from "./format";

const numberCell = "px-4 py-3 text-right font-mono text-xs tabular-nums";
const headerCell = "px-4 py-3 text-right font-medium";

/** Every site side by side. Picking a row opens that site's full report. */
export function SitesTable({
  sites,
  onSelect,
}: {
  sites: AnalyticsOverviewSite[] | undefined;
  onSelect: (siteId: string) => void;
}) {
  if (!sites) return <Skeleton className="h-64 rounded-[22px]" />;

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-xs text-[var(--muted)]">
          <tr className="border-b border-[var(--border)]">
            <th scope="col" className="px-5 py-3 text-left font-medium">Site</th>
            <th scope="col" className={headerCell}>Users</th>
            <th scope="col" className={headerCell}>Change</th>
            <th scope="col" className={headerCell}>Sessions</th>
            <th scope="col" className={headerCell}>Views</th>
            <th scope="col" className={headerCell}>Engagement</th>
            <th scope="col" className={headerCell}>Key events</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((site) => (
            <tr key={site.id} className="border-b border-[var(--border)] last:border-0">
              <th scope="row" className="px-5 py-3 text-left font-medium">
                <button
                  type="button"
                  onClick={() => onSelect(site.id)}
                  className="text-left transition-colors hover:text-[var(--accent)]"
                >
                  {site.name}
                </button>
              </th>
              {site.totals && site.previous ? (
                <>
                  <td className={numberCell}>{formatCount(site.totals.users)}</td>
                  <td className="px-4 py-3 text-right text-xs text-[var(--muted)]">
                    <ChangeLabel current={site.totals.users} previous={site.previous.users} />
                  </td>
                  <td className={numberCell}>{formatCount(site.totals.sessions)}</td>
                  <td className={numberCell}>{formatCount(site.totals.views)}</td>
                  <td className={numberCell}>{formatPercent(site.totals.engagement_rate)}</td>
                  <td className={numberCell}>{formatCount(site.totals.key_events)}</td>
                </>
              ) : (
                <td colSpan={6} className="px-4 py-3 text-right text-xs text-[var(--muted)]">
                  {site.error}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
