import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { getAllDocs, getDocBySlug } from "@/lib/content-loader";
import { portableTextClassName } from "@/lib/portable-text-styles";
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
    <>
      <PageHeader
        title={doc.title}
        description={doc.description || formatDate(doc.publishedAt)}
        actions={
          <Link
            href="/docs"
            className="font-mono text-xs uppercase tracking-wide text-[var(--accent)] hover:underline"
          >
            Back to docs
          </Link>
        }
      />
      <article className="mx-auto w-full px-6 pb-10 md:px-8">
        <div
          className={`p-6 ${portableTextClassName}`}
          dangerouslySetInnerHTML={{ __html: doc.html }}
        />
      </article>
    </>
  );
}
