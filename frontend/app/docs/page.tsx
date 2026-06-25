import Link from "next/link";

import { getAllDocs } from "@/lib/content-loader";
import { formatDate } from "@/lib/utils";

export default async function DocsPage() {
  const docs = await getAllDocs();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10 md:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Docs</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Product guides and knowledge base content.
        </p>
      </header>

      <section className="space-y-4">
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
      </section>
    </main>
  );
}
