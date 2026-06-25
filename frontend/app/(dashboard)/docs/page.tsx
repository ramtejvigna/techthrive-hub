import Link from "next/link";

import { ContentEmptyState } from "@/components/layout/content-empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { getAllDocs } from "@/lib/content-loader";
import { formatDate } from "@/lib/utils";

export default async function DocsPage() {
  const docs = await getAllDocs();

  return (
    <>
      <PageHeader
        title="Docs"
        description="Product guides and knowledge base content."
      />
      <section className="px-6 pb-10 md:px-8">
        {docs.length === 0 ? (
          <ContentEmptyState
            title="No docs yet"
            description="Create your first guide in Sanity Studio to publish it here."
            actionLabel="+ open_studio()"
            actionHref="/studio"
          />
        ) : (
          <div className="space-y-4">
            {docs.map((doc) => (
              <article key={doc.slug} className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold text-[var(--foreground)]">
                    <Link href={`/docs/${doc.slug}`} className="hover:underline">
                      {doc.title}
                    </Link>
                  </h2>
                  <span className="text-xs text-[var(--muted)]">{formatDate(doc.publishedAt)}</span>
                </div>
                {doc.description ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">{doc.description}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
