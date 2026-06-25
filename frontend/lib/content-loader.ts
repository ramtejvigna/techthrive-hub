// Content loader that uses Sanity if configured, otherwise falls back to markdown
import { getAllDocs as getAllDocsFromMarkdown, getDocBySlug as getDocBySlugFromMarkdown } from "./content";
import { getAllDocs as getAllDocsFromSanity, getDocBySlug as getDocBySlugFromSanity } from "./sanity-content";
import { getAllPlans as getAllPlansFromMarkdown, getPlanBySlug as getPlanBySlugFromMarkdown } from "./content";
import { getAllPlans as getAllPlansFromSanity, getPlanBySlug as getPlanBySlugFromSanity } from "./sanity-content";

const useSanity = Boolean(
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
  process.env.NEXT_PUBLIC_SANITY_DATASET
);

export async function getAllDocs() {
  if (useSanity) {
    try {
      return await getAllDocsFromSanity();
    } catch (error) {
      console.error("Failed to fetch from Sanity, falling back to markdown:", error);
      return await getAllDocsFromMarkdown();
    }
  }
  return await getAllDocsFromMarkdown();
}

export async function getDocBySlug(slug: string) {
  if (useSanity) {
    try {
      return await getDocBySlugFromSanity(slug);
    } catch (error) {
      console.error("Failed to fetch from Sanity, falling back to markdown:", error);
      return await getDocBySlugFromMarkdown(slug);
    }
  }
  return await getDocBySlugFromMarkdown(slug);
}

export async function getAllPlans() {
  if (useSanity) {
    try {
      return await getAllPlansFromSanity();
    } catch (error) {
      console.error("Failed to fetch from Sanity, falling back to markdown:", error);
      return await getAllPlansFromMarkdown();
    }
  }
  return await getAllPlansFromMarkdown();
}

export async function getPlanBySlug(slug: string) {
  if (useSanity) {
    try {
      return await getPlanBySlugFromSanity(slug);
    } catch (error) {
      console.error("Failed to fetch from Sanity, falling back to markdown:", error);
      return await getPlanBySlugFromMarkdown(slug);
    }
  }
  return await getPlanBySlugFromMarkdown(slug);
}
