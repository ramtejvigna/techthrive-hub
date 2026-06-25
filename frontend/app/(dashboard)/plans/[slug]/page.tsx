import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { getAllPlans, getPlanBySlug } from "@/lib/content-loader";
import { portableTextClassName } from "@/lib/portable-text-styles";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const plans = await getAllPlans();
  return plans.map((plan) => ({ slug: plan.slug }));
}

export default async function PlanDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const plan = await getPlanBySlug(slug);

  if (!plan) {
    notFound();
  }

  const description = [plan.summary, `${plan.status} · ${formatDate(plan.publishedAt)}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title={plan.title}
        description={description}
        actions={
          <Link
            href="/plans"
            className="font-mono text-xs uppercase tracking-wide text-[var(--accent)] hover:underline"
          >
            Back to plans
          </Link>
        }
      />
      <article className="mx-auto w-full px-6 pb-10 md:px-8">
        <div
          className={`p-6 ${portableTextClassName}`}
          dangerouslySetInnerHTML={{ __html: plan.html }}
        />
      </article>
    </>
  );
}
