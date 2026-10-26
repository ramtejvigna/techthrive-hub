"use client";

import { Sparkline } from "@/components/dashboard/sparkline";
import { StatTile } from "@/components/dashboard/stat-tile";
import { KanbanIcon, ProjectsIcon } from "@/components/icons/nav-icons";
import { PAGE_CONTAINER, PageHeader } from "@/components/layout/page-header";
import { FadeIn } from "@/components/motion/fade-in";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Board } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

function BoardCard({ board, index }: { board: Board; index: number }) {
  const columns = board.column_count ?? 0;
  const cards = board.card_count ?? 0;
  const linked = board.linked_projects ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="h-full"
    >
      <Link
        href={`/dashboard/kanban/${board.id}`}
        className="panel flex h-full flex-col p-5 transition-colors hover:border-[var(--border-strong)]"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] font-mono text-[11px] font-bold text-[var(--ink-fg)] ring-1 ring-white/10">
            {board.key.slice(0, 3)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">{board.title}</h3>
            <p className="text-[11px] text-[var(--muted)]">Updated {formatDate(board.updated_at)}</p>
          </div>
        </div>

        {/* One segment per workflow column; the last (done) column is green. */}
        <div className="mt-5 flex h-2 gap-1" aria-hidden>
          {columns === 0 ? (
            <span className="flex-1 rounded-full bg-[var(--surface-subtle)]" />
          ) : (
            Array.from({ length: Math.min(columns, 10) }).map((_, i, all) => (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-full",
                  i === all.length - 1 ? "bg-emerald-500" : "bg-[var(--accent)]",
                )}
                style={{ opacity: i === all.length - 1 ? 1 : 0.3 + (i / all.length) * 0.6 }}
              />
            ))
          )}
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs">
          <span>
            <span className="font-semibold tabular-nums">{cards}</span>{" "}
            <span className="text-[var(--muted)]">ticket{cards === 1 ? "" : "s"}</span>
          </span>
          <span>
            <span className="font-semibold tabular-nums">{columns}</span>{" "}
            <span className="text-[var(--muted)]">column{columns === 1 ? "" : "s"}</span>
          </span>
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
          {linked.length === 0 ? (
            <span className="text-[11px] text-[var(--muted-light)]">Not linked to a project</span>
          ) : (
            linked.map((project) => (
              <span key={project.id} className="chip py-0.5 text-[11px]">
                <ProjectsIcon className="h-3 w-3" />
                {project.name}
              </span>
            ))
          )}
        </div>
      </Link>
    </motion.div>
  );
}

export default function KanbanListPage() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadBoards() {
    const data = await api.getBoards();
    setBoards(data);
  }

  useEffect(() => {
    loadBoards().finally(() => setLoading(false));
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.createBoard({ title: title.trim() });
      setTitle("");
      setModalOpen(false);
      await loadBoards();
    } finally {
      setSaving(false);
    }
  }

  const stats = useMemo(() => {
    const cards = boards.reduce((n, b) => n + (b.card_count ?? 0), 0);
    return {
      cards,
      columns: boards.reduce((n, b) => n + (b.column_count ?? 0), 0),
      linked: boards.filter((b) => (b.linked_projects ?? []).length > 0).length,
      average: boards.length ? Math.round(cards / boards.length) : 0,
    };
  }, [boards]);

  return (
    <>
      <PageHeader
        title="Kanban"
        description="Organize work with drag-and-drop boards."
        actions={<Button onClick={() => setModalOpen(true)}>+ New board</Button>}
      />
      <div className={cn(PAGE_CONTAINER, "pb-12")}>
        {loading ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-[22px]" />
              ))}
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 rounded-[22px]" />
              ))}
            </div>
          </>
        ) : boards.length === 0 ? (
          <FadeIn>
            <div className="panel flex flex-col items-center justify-center border-dashed py-20 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-fg)]">
                <KanbanIcon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-lg font-semibold">No boards yet</p>
              <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                Create a board and it starts with a set of default columns.
              </p>
              <Button className="mt-6" onClick={() => setModalOpen(true)}>
                + New board
              </Button>
            </div>
          </FadeIn>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                tone="ink"
                label="Boards"
                value={boards.length}
                icon={<KanbanIcon className="h-3.5 w-3.5" />}
                note={`${stats.linked} linked to projects`}
              />
              <StatTile
                tone="tint"
                label="Tickets"
                value={stats.cards}
                delay={0.04}
                icon={
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <rect x="4" y="5" width="16" height="14" rx="2" />
                    <path strokeLinecap="round" d="M8 10h8M8 14h5" />
                  </svg>
                }
                aside={
                  <Sparkline
                    values={boards.map((b) => b.card_count ?? 0)}
                    width={96}
                    height={32}
                    className="text-[var(--tint-blue-fg)]"
                  />
                }
                note="across all boards"
              />
              <StatTile
                label="Columns"
                value={stats.columns}
                delay={0.08}
                icon={<KanbanIcon className="h-3.5 w-3.5" />}
                note="workflow stages in total"
              />
              <StatTile
                label="Avg. per board"
                value={stats.average}
                delay={0.12}
                icon={
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" />
                  </svg>
                }
                note="tickets on each board"
              />
            </div>

            <div className="mt-8 flex items-center justify-between">
              <h2 className="text-sm font-semibold">All boards</h2>
              <span className="text-xs text-[var(--muted)]">{boards.length} total</span>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {boards.map((board, index) => (
                <BoardCard key={board.id} board={board} index={index} />
              ))}
            </div>
          </>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New board"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Board title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            placeholder="Sprint planning, Content pipeline..."
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating..." : "Create board"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
