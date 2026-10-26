"use client";

import { StatTile } from "@/components/dashboard/stat-tile";
import { DocIcon } from "@/components/docs/doc-icons";
import { DocsIcon } from "@/components/icons/nav-icons";
import { SearchIcon } from "@/components/kanban/jira-icons";
import { PAGE_CONTAINER, PageHeader } from "@/components/layout/page-header";
import { FadeIn } from "@/components/motion/fade-in";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { queryKeys, useDocs } from "@/lib/queries";
import type { DocListItem } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const SEARCH_DEBOUNCE_MS = 250;
const WEEK = 7 * 24 * 60 * 60 * 1000;

function formatEdited(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return formatDate(iso);
}

export default function DocsHomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: docs = null } = useDocs(searchTerm);
  // Captured once so "edited this week" is stable across renders.
  const [loadedAt] = useState(() => Date.now());

  // Only send a search once typing pauses; clearing the box applies at once.
  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(query.trim()), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(handle);
  }, [query]);

  async function handleCreate() {
    setCreating(true);
    try {
      const doc = await api.createDoc();
      void queryClient.invalidateQueries({ queryKey: queryKeys.docs.lists() });
      router.push(`/docs/${doc.id}`);
    } catch {
      setCreating(false);
    }
  }

  async function handleDelete(doc: DocListItem) {
    if (!confirm(`Delete "${doc.title}"? This can't be undone.`)) return;
    await api.deleteDoc(doc.id);
    // Drop it from every cached search, not just the one on screen.
    queryClient.setQueriesData<DocListItem[]>({ queryKey: queryKeys.docs.lists() }, (prev) =>
      prev?.filter((item) => item.id !== doc.id),
    );
  }

  const stats = useMemo(() => {
    const list = docs ?? [];
    const latest = list.reduce<DocListItem | null>(
      (best, doc) => (!best || doc.updated_at > best.updated_at ? doc : best),
      null,
    );
    return {
      total: list.length,
      thisWeek: list.filter((d) => loadedAt - new Date(d.updated_at).getTime() < WEEK).length,
      latest,
    };
  }, [docs, loadedAt]);

  const searching = query.trim().length > 0;

  return (
    <>
      <PageHeader
        title="Docs"
        description="Write and share notes, specs and guides."
        actions={
          <label className="relative w-full sm:w-72">
            <span className="sr-only">Search documents</span>
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search docs"
              className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-light)] focus:border-[var(--border-strong)]"
            />
          </label>
        }
      />

      <div className={cn(PAGE_CONTAINER, "pb-12")}>
        {!searching && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <FadeIn className="h-full">
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="panel-ink group flex h-full w-full items-center gap-4 p-5 text-left transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--ink-fg)] text-[var(--ink)] transition-transform group-hover:scale-105">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                <span>
                  <span className="block text-base font-semibold">
                    {creating ? "Creating..." : "Blank document"}
                  </span>
                  <span className="block text-xs text-[var(--ink-muted)]">Start writing from scratch</span>
                </span>
              </button>
            </FadeIn>
            <StatTile
              tone="tint"
              label="Documents"
              value={docs === null ? "—" : stats.total}
              delay={0.04}
              icon={<DocsIcon className="h-3.5 w-3.5" />}
              note={`${stats.thisWeek} edited this week`}
            />
            <StatTile
              label="Last edited"
              value={
                <span className="block max-w-[14rem] truncate text-xl">
                  {stats.latest?.title ?? "—"}
                </span>
              }
              delay={0.08}
              icon={
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
              }
              note={stats.latest ? `Edited ${formatEdited(stats.latest.updated_at)}` : "Nothing yet"}
            />
          </div>
        )}

        <div className={cn("flex items-center justify-between", !searching && "mt-8")}>
          <h2 className="text-sm font-semibold">
            {searching ? `Results for "${query.trim()}"` : "Recent documents"}
          </h2>
          {docs && <span className="text-xs text-[var(--muted)]">{docs.length} shown</span>}
        </div>

        {docs === null ? (
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-[22px]" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="panel mt-3 flex flex-col items-center justify-center border-dashed py-16 text-center">
            <DocIcon className="h-10 w-8 opacity-80" />
            <p className="mt-3 text-sm text-[var(--muted)]">
              {searching
                ? "No documents match your search."
                : "No documents yet. Start one with a blank document above."}
            </p>
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            {docs.map((doc, index) => (
              <motion.li
                key={doc.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
                className="panel group relative transition-colors hover:border-[var(--border-strong)]"
              >
                <Link href={`/docs/${doc.id}`} className="block">
                  <div className="h-40 overflow-hidden rounded-t-[22px] bg-[var(--surface-muted)] px-5 pt-5">
                    <div className="h-full rounded-t-lg bg-[var(--surface)] px-3.5 py-3 shadow-sm transition-transform duration-200 group-hover:-translate-y-1">
                      <p className="line-clamp-[9] text-[7px] leading-[1.5] text-[var(--muted)]">
                        {doc.excerpt || " "}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 pb-4 pt-3">
                    <p className="truncate pr-7 text-sm font-semibold text-[var(--foreground)]">{doc.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
                      <DocIcon className="h-3.5 w-2.5 shrink-0" />
                      Edited {formatEdited(doc.updated_at)}
                    </p>
                  </div>
                </Link>
                <div className="absolute bottom-3 right-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger variant="ghost" aria-label={`Options for ${doc.title}`} />
                    <DropdownMenuContent className="min-w-[160px]">
                      <DropdownMenuItem onClick={() => router.push(`/docs/${doc.id}`)}>Open</DropdownMenuItem>
                      <DropdownMenuItem destructive onClick={() => handleDelete(doc)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
