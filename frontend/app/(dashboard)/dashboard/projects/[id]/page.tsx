"use client";

import { ProjectCanvases } from "@/components/canvas/project-canvases";
import { PageHeader } from "@/components/layout/page-header";
import { MilestoneList } from "@/components/projects/milestone-list";
import { PhasePanel } from "@/components/projects/phase-panel";
import { ProjectMembers } from "@/components/projects/project-members";
import { ProjectForm } from "@/components/projects/project-form";
import { SdlcCycle } from "@/components/projects/sdlc-cycle";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { api } from "@/lib/api";
import { queryKeys, useBoards, useCurrentUser, useProject } from "@/lib/queries";
import { SDLC_PHASE_BY_KEY } from "@/lib/sdlc";
import type {
  CurrentPhase,
  Milestone,
  Project,
  ProjectPhase,
  ProjectStatus,
  SdlcPhaseKey,
  User,
} from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STATUS_VARIANTS: Record<ProjectStatus, "default" | "success" | "warning" | "muted"> = {
  planning: "muted",
  active: "default",
  on_hold: "warning",
  completed: "success",
};

const BACK_TO_PROJECTS = { href: "/dashboard/projects", label: "Back to projects" };
const PANEL_TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const };

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const projectKey = queryKeys.projects.detail(params.id);
  const { data: project, isPending: loading } = useProject(params.id);
  const { data: boards = [] } = useBoards();
  const { data: currentUser = null } = useCurrentUser();
  const [editOpen, setEditOpen] = useState(false);
  const [milestonesOpen, setMilestonesOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  // No phase is open at first: the page shows just the SDLC cycle.
  const [selectedPhaseKey, setSelectedPhaseKey] = useState<SdlcPhaseKey | null>(null);

  // Esc closes the phase card, unless you're typing in it or a dialog is open
  // (the dialog handles Esc itself).
  const dialogOpen = editOpen || milestonesOpen || membersOpen;
  useEffect(() => {
    if (!selectedPhaseKey || dialogOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      setSelectedPhaseKey(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedPhaseKey, dialogOpen]);

  // Milestones show up as cards on a linked board, and project changes feed
  // the projects list and dashboard, so mark those stale too, without
  // refetching them now. Only the project itself is refetched.
  function markRelatedStale() {
    for (const queryKey of [queryKeys.projects.list(), queryKeys.boards.all, queryKeys.dashboard]) {
      void queryClient.invalidateQueries({ queryKey, refetchType: "none" });
    }
  }

  async function refreshProject() {
    markRelatedStale();
    await queryClient.invalidateQueries({ queryKey: projectKey });
  }

  async function handleUpdate(data: {
    name: string;
    description: string;
    current_phase: CurrentPhase;
    due_date: string | null;
    board: string | null;
  }) {
    await api.updateProject(params.id, data);
    setEditOpen(false);
    await refreshProject();
  }

  async function handleDelete() {
    if (!confirm("Delete this project?")) return;
    await api.deleteProject(params.id);
    queryClient.removeQueries({ queryKey: projectKey });
    markRelatedStale();
    router.push("/dashboard/projects");
  }

  async function handleCreateMilestone(data: {
    title: string;
    target_date: string | null;
    phase: string | null;
  }) {
    await api.createMilestone(params.id, data);
    await refreshProject();
  }

  async function handleToggleMilestone(milestone: Milestone) {
    await api.updateMilestone(params.id, milestone.id, {
      completed: !milestone.completed,
    });
    await refreshProject();
  }

  function handlePhaseUpdated(updated: ProjectPhase) {
    const previous = ((project?.phases ?? []) as ProjectPhase[]).find(
      (phase) => phase.key === updated.key,
    );
    queryClient.setQueryData<Project>(projectKey, (prev) =>
      prev && {
        ...prev,
        phases: ((prev.phases ?? []) as ProjectPhase[]).map((phase) =>
          phase.key === updated.key ? updated : phase,
        ),
      },
    );
    // Project status and current phase are derived from the phases server-side.
    if (updated.status !== previous?.status) {
      void refreshProject();
    }
  }

  function handleLeft() {
    queryClient.removeQueries({ queryKey: projectKey });
    markRelatedStale();
    router.push("/dashboard/projects");
  }

  async function handleDeleteMilestone(milestoneId: string) {
    await api.deleteMilestone(params.id, milestoneId);
    await refreshProject();
  }

  if (loading) {
    return (
      <>
        <PageHeader title="Project" back={BACK_TO_PROJECTS} />
        <div className="px-6 pb-10 font-mono text-sm text-[var(--muted)] md:px-8">
          loading...
        </div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <PageHeader title="Project" back={BACK_TO_PROJECTS} />
        <div className="px-6 pb-10 text-sm text-red-500 md:px-8">Project not found.</div>
      </>
    );
  }

  const phases = (project.phases ?? []) as ProjectPhase[];
  const mentionCandidates = [project.owner, ...(project.members ?? [])].filter(
    (user): user is User => Boolean(user) && user?.id !== currentUser?.id,
  );
  const milestones = project.milestones ?? [];
  const selectedPhase = phases.find((phase) => phase.key === selectedPhaseKey) ?? null;
  const overdue =
    Boolean(project.due_date) &&
    project.status !== "completed" &&
    new Date(`${project.due_date}T23:59:59`) < new Date();

  return (
    <div className="min-h-full bg-[radial-gradient(var(--border-strong)_1px,transparent_1px)] [background-size:22px_22px] px-6 pb-12 pt-6 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={BACK_TO_PROJECTS.href}
          className="group inline-flex items-center gap-1.5 font-mono text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent)]"
        >
          <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>
          {BACK_TO_PROJECTS.label}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Project actions" />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit project</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMilestonesOpen(true)}>
              Milestones ({milestones.length})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMembersOpen(true)}>
              Members ({(project.members?.length ?? 0) + 1})
            </DropdownMenuItem>
            {project.board_id && (
              <DropdownMenuItem onClick={() => router.push(`/dashboard/kanban/${project.board_id}`)}>
                Open board{project.board_title ? ` · ${project.board_title}` : ""}
              </DropdownMenuItem>
            )}
            {project.is_owner && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive onClick={handleDelete}>
                  Delete project
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <h1 className="mt-2 text-center text-4xl font-black tracking-tight text-[var(--foreground)] md:text-5xl">
        {project.name}
      </h1>

      <LayoutGroup>
        <div className="mt-8 flex flex-col items-center gap-8 xl:flex-row xl:items-start xl:justify-center xl:gap-10">
          {/* Centred on its own; slides left when a phase card opens beside it. */}
          <motion.div
            layout
            transition={PANEL_TRANSITION}
            className={cn(
              "w-full max-w-[560px] shrink-0 xl:sticky xl:top-6",
              selectedPhase && "xl:max-w-[500px]",
            )}
          >
            <SdlcCycle
              phases={phases}
              selectedKey={selectedPhaseKey}
              onSelect={(key) => setSelectedPhaseKey((current) => (current === key ? null : key))}
            />
            {!selectedPhase && (
              <p className="mt-4 text-center font-mono text-[11px] text-[var(--muted)]">
                Click a phase to see its details
              </p>
            )}
          </motion.div>

          <AnimatePresence mode="popLayout">
            {selectedPhase && (
              <motion.section
                key="phase-card"
                layout
                initial={{ opacity: 0, x: 48 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 48 }}
                transition={PANEL_TRANSITION}
                aria-label={`${SDLC_PHASE_BY_KEY[selectedPhase.key].label} phase`}
                className="relative flex max-h-[calc(100dvh-7rem)] w-full min-w-0 max-w-[600px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl shadow-black/5"
              >
                <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-6 py-4 pr-14">
                  <Badge variant={STATUS_VARIANTS[project.status]}>
                    {project.status.replace("_", " ")}
                  </Badge>
                  {project.due_date && (
                    <Badge variant={overdue ? "danger" : "muted"}>
                      {overdue ? "overdue · " : "due "}
                      {formatDate(project.due_date)}
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPhaseKey(null)}
                  aria-label="Close phase details"
                  title="Close (Esc)"
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
                >
                  ×
                </button>
                <div className="phase-card-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={selectedPhase.key}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <PhasePanel
                      projectId={params.id}
                      phase={selectedPhase}
                      milestones={milestones.filter(
                        (milestone) => milestone.phase === selectedPhase.id,
                      )}
                      currentUser={currentUser}
                      mentionCandidates={mentionCandidates}
                      onPhaseUpdated={handlePhaseUpdated}
                      onCreateMilestone={handleCreateMilestone}
                    />
                  </motion.div>
                </AnimatePresence>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </LayoutGroup>

      <ProjectCanvases projectId={params.id} />

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit project">
        <ProjectForm
          initial={project}
          boards={boards}
          canChangeBoard={Boolean(project.is_owner)}
          onSubmit={handleUpdate}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <Modal
        open={milestonesOpen}
        onClose={() => setMilestonesOpen(false)}
        title="Milestones"
        className="max-w-2xl"
      >
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <MilestoneList
            projectId={params.id}
            milestones={milestones}
            phases={phases}
            currentUser={currentUser}
            mentionCandidates={mentionCandidates}
            boardLinked={Boolean(project.board_id)}
            onCreate={handleCreateMilestone}
            onToggle={project.board_id ? undefined : handleToggleMilestone}
            onDelete={handleDeleteMilestone}
          />
        </div>
      </Modal>

      <Modal open={membersOpen} onClose={() => setMembersOpen(false)} title="Members">
        <p className="mb-4 text-sm text-[var(--muted)]">
          People on this project, who can also see its linked board.
        </p>
        <ProjectMembers
          project={project}
          currentUser={currentUser}
          onLeft={() => {
            setMembersOpen(false);
            handleLeft();
          }}
        />
      </Modal>
    </div>
  );
}
