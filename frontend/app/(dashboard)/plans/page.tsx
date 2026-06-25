import Link from "next/link";

import { ContentEmptyState } from "@/components/layout/content-empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { getAllPlans } from "@/lib/content-loader";
import { formatDate } from "@/lib/utils";

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-zinc-500/15 text-zinc-300",
  planned: "bg-blue-500/15 text-blue-300",
  active: "bg-amber-500/15 text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-300",
};

export default async function PlansPage() {
  const plans = await getAllPlans();

  return (
    <>
      <PageHeader
        title="Plans"
        description="Public roadmap and implementation plans."
      />
      <section className="px-6 pb-10 md:px-8">
        {plans.length === 0 ? (
          <ContentEmptyState
            title="No plans yet"
            description="Add a roadmap or implementation plan in Sanity Studio to list it here."
            actionLabel="+ open_studio()"
            actionHref="/studio"
          />
        ) : (
          <div className="space-y-4">
            {plans.map((plan) => (
              <article key={plan.slug} className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    <Link href={`/plans/${plan.slug}`} className="hover:underline">
                      {plan.title}
                    </Link>
                  </h2>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase ${STATUS_STYLE[plan.status]}`}
                    >
                      {plan.status}
                    </span>
                    <span className="text-xs text-[var(--muted)]">{formatDate(plan.publishedAt)}</span>
                  </div>
                </div>
                {plan.summary ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">{plan.summary}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
