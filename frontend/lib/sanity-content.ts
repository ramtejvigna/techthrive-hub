import { escapeHTML, toHTML } from "@portabletext/to-html";
import { PortableTextBlock } from "sanity";

import { client } from "@/sanity/lib/client";
import { SanityDoc, SanityPlan } from "@/sanity/lib/types";

function portableTextToHtml(body: PortableTextBlock[]): string {
  return toHTML(body, {
    components: {
      types: {
        code: ({ value }) => {
          const language =
            typeof value.language === "string" ? ` class="language-${value.language}"` : "";
          const code = typeof value.code === "string" ? escapeHTML(value.code) : "";
          return `<pre><code${language}>${code}</code></pre>`;
        },
      },
    },
  });
}

export async function getAllDocs(): Promise<
  Array<{
    title: string;
    slug: string;
    description: string;
    tags: string[];
    publishedAt: string;
    html: string;
  }>
> {
  if (!client) {
    throw new Error("Sanity client not configured");
  }

  const docs: SanityDoc[] = await client.fetch(
    `*[_type == "doc"] | order(publishedAt desc) {
      _id,
      title,
      slug,
      description,
      tags,
      publishedAt,
      body
    }`,
  );

  return docs.map((doc) => ({
    title: doc.title,
    slug: doc.slug.current,
    description: doc.description || "",
    tags: doc.tags || [],
    publishedAt: doc.publishedAt,
    html: portableTextToHtml(doc.body),
  }));
}

export async function getDocBySlug(slug: string) {
  if (!client) {
    throw new Error("Sanity client not configured");
  }

  const doc: SanityDoc | null = await client.fetch(
    `*[_type == "doc" && slug.current == $slug][0] {
      _id,
      title,
      slug,
      description,
      tags,
      publishedAt,
      body
    }`,
    { slug },
  );

  if (!doc) return null;

  return {
    title: doc.title,
    slug: doc.slug.current,
    description: doc.description || "",
    tags: doc.tags || [],
    publishedAt: doc.publishedAt,
    html: portableTextToHtml(doc.body),
  };
}

export async function getAllPlans(): Promise<
  Array<{
    title: string;
    slug: string;
    status: "draft" | "planned" | "active" | "completed";
    summary: string;
    publishedAt: string;
    html: string;
  }>
> {
  if (!client) {
    throw new Error("Sanity client not configured");
  }

  const plans: SanityPlan[] = await client.fetch(
    `*[_type == "plan"] | order(publishedAt desc) {
      _id,
      title,
      slug,
      status,
      summary,
      publishedAt,
      body
    }`,
  );

  return plans.map((plan) => ({
    title: plan.title,
    slug: plan.slug.current,
    status: plan.status,
    summary: plan.summary || "",
    publishedAt: plan.publishedAt,
    html: portableTextToHtml(plan.body),
  }));
}

export async function getPlanBySlug(slug: string) {
  if (!client) {
    throw new Error("Sanity client not configured");
  }

  const plan: SanityPlan | null = await client.fetch(
    `*[_type == "plan" && slug.current == $slug][0] {
      _id,
      title,
      slug,
      status,
      summary,
      publishedAt,
      body
    }`,
    { slug },
  );

  if (!plan) return null;

  return {
    title: plan.title,
    slug: plan.slug.current,
    status: plan.status,
    summary: plan.summary || "",
    publishedAt: plan.publishedAt,
    html: portableTextToHtml(plan.body),
  };
}
