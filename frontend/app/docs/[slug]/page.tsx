import { notFound } from "next/navigation";

import { getAllDocs, getDocBySlug } from "@/lib/content";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  const docs = await getAllDocs();
  return docs.map((doc) => ({ slug: doc.slug }));
}

export default async function DocDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const doc = await getDocBySlug(slug);

  if (!doc) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10 md:px-8">
      <article className="rounded-xl border border-[var(--border)] p-6">
        <header className="mb-6 border-b border-[var(--border)] pb-4">
          <h1 className="text-2xl font-semibold text-[var(--foreground)]">{doc.title}</h1>
          <p className="mt-2 text-xs text-[var(--muted)]">{formatDate(doc.publishedAt)}</p>
          {doc.description ? (
            <p className="mt-2 text-sm text-[var(--muted)]">{doc.description}</p>
          ) : null}
        </header>
        <div
          className="space-y-3 text-sm leading-7 text-[var(--foreground)] [&_a]:text-[var(--accent)] [&_a]:underline [&_code]:rounded [&_code]:bg-[var(--surface-subtle)] [&_code]:px-1 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[var(--surface-subtle)] [&_pre]:p-3"
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
      </article>
    </main>
  );
}
