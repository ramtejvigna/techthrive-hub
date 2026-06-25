import Link from "next/link";

import { getAllPlans } from "@/lib/content";
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
    <main className="mx-auto w-full max-w-4xl px-6 py-10 md:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Plans</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Public roadmap and implementation plans managed in Decap CMS.
        </p>
      </header>

      <section className="space-y-4">
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
      </section>
    </main>
  );
}
