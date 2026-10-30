"use client";

import { CanvasCard } from "@/components/canvas/canvas-card";
import { CanvasIcon } from "@/components/icons/nav-icons";
import { SearchIcon } from "@/components/kanban/jira-icons";
import { PAGE_CONTAINER, PageHeader } from "@/components/layout/page-header";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { queryKeys, useCanvases, useProjects } from "@/lib/queries";
import type { CanvasListItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SEARCH_DEBOUNCE_MS = 250;

export default function CanvasHomePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [project, setProject] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: canvases = null } = useCanvases(searchTerm, project);
  const { data: projects = [] } = useProjects();

  // Only send a search once typing pauses; clearing the box applies at once.
  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(query.trim()), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(handle);
  }, [query]);

  async function handleCreate() {
    setCreating(true);
    try {
      const canvas = await api.createCanvas(project ? { project } : {});
      void queryClient.invalidateQueries({ queryKey: queryKeys.canvases.lists() });
      router.push(`/canvas/${canvas.id}`);
    } catch {
      setCreating(false);
    }
  }

  async function handleDelete(canvas: CanvasListItem) {
    if (!confirm(`Delete "${canvas.title}"? This can't be undone.`)) return;
    await api.deleteCanvas(canvas.id);
    // Drop it from every cached search, not just the one on screen.
    queryClient.setQueriesData<CanvasListItem[]>({ queryKey: queryKeys.canvases.lists() }, (prev) =>
      prev?.filter((item) => item.id !== canvas.id),
    );
  }

  const filtering = query.trim().length > 0 || project !== "";

  return (
    <>
      <PageHeader
        title="Canvas"
        description="Sketch architectures, mind maps and flows."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              aria-label="Filter by project"
              className="h-10 max-w-48 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm text-[var(--foreground)] outline-none focus:border-[var(--border-strong)]"
            >
              <option value="">All projects</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Search canvases</span>
              <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search canvases"
                className="h-10 w-full rounded-full border border-[var(--border)] bg-[var(--surface)] pl-10 pr-4 text-sm text-[var(--foreground)] outline-none transition-colors placeholder:text-[var(--muted-light)] focus:border-[var(--border-strong)]"
              />
            </label>
          </div>
        }
      />

      <div className={cn(PAGE_CONTAINER, "pb-12")}>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          <li>
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="panel-ink group flex h-full min-h-56 w-full flex-col items-start justify-end gap-3 p-5 text-left transition-opacity hover:opacity-95 disabled:cursor-wait disabled:opacity-70"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ink-fg)] text-[var(--ink)] transition-transform group-hover:scale-105">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <span>
                <span className="block text-base font-semibold">
                  {creating ? "Creating..." : "New canvas"}
                </span>
                <span className="block text-xs text-[var(--ink-muted)]">Start from a blank page</span>
              </span>
            </button>
          </li>

          {canvases === null
            ? Array.from({ length: 3 }).map((_, i) => (
                <li key={i}>
                  <Skeleton className="h-56 rounded-[22px]" />
                </li>
              ))
            : canvases.map((canvas, index) => (
                <motion.li
                  key={canvas.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                >
                  <CanvasCard
                    canvas={canvas}
                    actions={
                      <DropdownMenu>
                        <DropdownMenuTrigger variant="ghost" aria-label={`Options for ${canvas.title}`} />
                        <DropdownMenuContent className="min-w-[160px]">
                          <DropdownMenuItem onClick={() => router.push(`/canvas/${canvas.id}`)}>
                            Open
                          </DropdownMenuItem>
                          {canvas.is_owner && (
                            <DropdownMenuItem destructive onClick={() => handleDelete(canvas)}>
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  />
                </motion.li>
              ))}
        </ul>

        {canvases?.length === 0 && (
          <div className="panel mt-4 flex flex-col items-center justify-center border-dashed py-16 text-center">
            <CanvasIcon className="h-8 w-8 text-[var(--muted-light)]" />
            <p className="mt-3 text-sm text-[var(--muted)]">
              {filtering ? "No canvases match." : "No canvases yet. Start one with New canvas."}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
