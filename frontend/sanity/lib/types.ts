import { PortableTextBlock } from "sanity";

export interface SanityDoc {
  _id: string;
  _type: "doc";
  title: string;
  slug: { current: string };
  description?: string;
  tags?: string[];
  publishedAt: string;
  body: PortableTextBlock[];
}

export interface SanityPlan {
  _id: string;
  _type: "plan";
  title: string;
  slug: { current: string };
  status: "draft" | "planned" | "active" | "completed";
  summary?: string;
  publishedAt: string;
  body: PortableTextBlock[];
}
