import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";
import { unified } from "unified";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";

import type { DocEntry, PlanEntry, PlanStatus } from "@/lib/types";

const CONTENT_ROOT = path.join(process.cwd(), "content");
const DOCS_DIR = path.join(CONTENT_ROOT, "docs");
const PLANS_DIR = path.join(CONTENT_ROOT, "plans");

type BaseFrontmatter = {
  title: string;
  slug: string;
  publishedAt: string;
};

type DocsFrontmatter = BaseFrontmatter & {
  description?: string;
  tags?: string[];
};

type PlansFrontmatter = BaseFrontmatter & {
  status: PlanStatus;
  summary?: string;
};

async function markdownToHtml(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(file);
}

async function readMarkdownFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(dirPath, entry.name));
}

function sortByNewest<T extends { publishedAt: string }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export async function getAllDocs(): Promise<DocEntry[]> {
  const files = await readMarkdownFiles(DOCS_DIR);

  const docs = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf8");
      const { data, content } = matter(raw);
      const frontmatter = data as DocsFrontmatter;
      const html = await markdownToHtml(content);

      return {
        title: frontmatter.title,
        slug: frontmatter.slug,
        description: frontmatter.description ?? "",
        tags: frontmatter.tags ?? [],
        publishedAt: frontmatter.publishedAt,
        body: content,
        html,
      } satisfies DocEntry;
    }),
  );

  return sortByNewest(docs);
}

export async function getDocBySlug(slug: string): Promise<DocEntry | null> {
  const docs = await getAllDocs();
  return docs.find((doc) => doc.slug === slug) ?? null;
}

export async function getAllPlans(): Promise<PlanEntry[]> {
  const files = await readMarkdownFiles(PLANS_DIR);

  const plans = await Promise.all(
    files.map(async (filePath) => {
      const raw = await fs.readFile(filePath, "utf8");
      const { data, content } = matter(raw);
      const frontmatter = data as PlansFrontmatter;
      const html = await markdownToHtml(content);

      return {
        title: frontmatter.title,
        slug: frontmatter.slug,
        status: frontmatter.status,
        summary: frontmatter.summary ?? "",
        publishedAt: frontmatter.publishedAt,
        body: content,
        html,
      } satisfies PlanEntry;
    }),
  );

  return sortByNewest(plans);
}

export async function getPlanBySlug(slug: string): Promise<PlanEntry | null> {
  const plans = await getAllPlans();
  return plans.find((plan) => plan.slug === slug) ?? null;
}
