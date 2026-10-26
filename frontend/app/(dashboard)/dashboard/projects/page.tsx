"use client";

import { StatTile } from "@/components/dashboard/stat-tile";
import { ProjectsIcon } from "@/components/icons/nav-icons";
import { PAGE_CONTAINER, PageHeader } from "@/components/layout/page-header";
import { FadeIn } from "@/components/motion/fade-in";
import { PROJECT_STATUS_META, ProjectCard, isProjectOverdue } from "@/components/projects/project-card";
import { ProjectForm } from "@/components/projects/project-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { queryKeys, useBoards, useProjects } from "@/lib/queries";
import type { CurrentPhase, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type StatusFilter = ProjectStatus | "all";

const FILTERS: StatusFilter[] = ["all", "active", "planning", "on_hold", "completed"];

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const { data: projects = [], isPending: loading } = useProjects();
  const { data: boards = [] } = useBoards();
  const [modalOpen, setModalOpen] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");

  async function handleCreate(data: {
    name: string;
    description: string;
    current_phase: CurrentPhase;
    due_date: string | null;
    board: string | null;
  }) {
    await api.createProject(data);
    setModalOpen(false);
    // Linking a board changes that board's linked projects too.
    void queryClient.invalidateQueries({ queryKey: queryKeys.boards.all, refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard, refetchType: "none" });
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
  }

  const stats = useMemo(() => {
    const milestones = projects.reduce((n, p) => n + (p.milestone_count ?? 0), 0);
    const done = projects.reduce((n, p) => n + (p.completed_milestone_count ?? 0), 0);
    return {
      active: projects.filter((p) => p.status === "active").length,
      overdue: projects.filter(isProjectOverdue).length,
      milestones,
      done,
      completion: milestones ? Math.round((done / milestones) * 100) : 0,
      countFor: (status: StatusFilter) =>
        status === "all" ? projects.length : projects.filter((p) => p.status === status).length,
    };
  }, [projects]);

  const visible = filter === "all" ? projects : projects.filter((p) => p.status === filter);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Track lifecycles and milestones, and link boards to your work."
        actions={<Button onClick={() => setModalOpen(true)}>+ New project</Button>}
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
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-60 rounded-[22px]" />
              ))}
            </div>
          </>
        ) : projects.length === 0 ? (
          <FadeIn>
            <div className="panel flex flex-col items-center justify-center border-dashed py-20 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ink)] text-[var(--ink-fg)]">
                <ProjectsIcon className="h-5 w-5" />
              </span>
              <p className="mt-4 text-lg font-semibold">No projects yet</p>
              <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">
                Create your first project to start tracking its lifecycle and milestones.
              </p>
              <Button className="mt-6" onClick={() => setModalOpen(true)}>
                + New project
              </Button>
            </div>
          </FadeIn>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                tone="ink"
                label="Total projects"
                value={projects.length}
                icon={<ProjectsIcon className="h-3.5 w-3.5" />}
                note={`${stats.countFor("completed")} completed`}
              />
              <StatTile
                tone="tint"
                label="Active"
                value={stats.active}
                delay={0.04}
                icon={<span className="h-2 w-2 rounded-full bg-[var(--accent)]" />}
                note={`${stats.countFor("planning")} in planning`}
              />
              <StatTile
                label="Overdue"
                value={stats.overdue}
                delay={0.08}
                valueClassName={stats.overdue > 0 ? "text-orange-500" : undefined}
                icon={
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                }
                note="past their due date"
              />
              <StatTile
                label="Milestones done"
                value={
                  <>
                    {stats.completion}
                    <span className="text-xl text-[var(--muted-light)]">%</span>
                  </>
                }
                delay={0.12}
                icon={
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                  </svg>
                }
                note={`${stats.done} of ${stats.milestones} milestones`}
              />
            </div>

            <div className="no-scrollbar mt-6 flex gap-1.5 overflow-x-auto">
              {FILTERS.map((key) => {
                const active = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={active}
                    className={cn(
                      "chip shrink-0",
                      active && "border-transparent bg-[var(--ink)] text-[var(--ink-fg)] hover:text-[var(--ink-fg)]",
                    )}
                  >
                    {key !== "all" && (
                      <span className={cn("h-1.5 w-1.5 rounded-full", PROJECT_STATUS_META[key].dot)} />
                    )}
                    {key === "all" ? "All" : PROJECT_STATUS_META[key].label}
                    <span className={cn("font-mono text-[10px]", active ? "opacity-70" : "text-[var(--muted-light)]")}>
                      {stats.countFor(key)}
                    </span>
                  </button>
                );
              })}
            </div>

            {visible.length === 0 ? (
              <p className="panel mt-4 py-12 text-center text-sm text-[var(--muted)]">
                No {PROJECT_STATUS_META[filter as ProjectStatus].label.toLowerCase()} projects.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map((project, index) => (
                  <ProjectCard key={project.id} project={project} index={index} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New project"
      >
        <ProjectForm
          boards={boards}
          onSubmit={handleCreate}
          onCancel={() => setModalOpen(false)}
          submitLabel="Create project"
        />
      </Modal>
    </>
  );
}
