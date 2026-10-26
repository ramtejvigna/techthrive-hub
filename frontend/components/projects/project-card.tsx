"use client";

import { MilestoneProgressBar } from "@/components/projects/milestone-progress";
import { SDLC_PHASES, SDLC_PHASE_BY_KEY, getCurrentPhaseKey } from "@/lib/sdlc";
import type { Project, ProjectPhaseSummary, ProjectStatus } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; dot: string }> = {
  planning: { label: "Planning", dot: "bg-slate-400" },
  active: { label: "Active", dot: "bg-[var(--accent)]" },
  on_hold: { label: "On hold", dot: "bg-orange-400" },
  completed: { label: "Completed", dot: "bg-emerald-500" },
};

export function isProjectOverdue(project: Project) {
  if (!project.due_date || project.status === "completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(project.due_date) < today;
}

function PhaseStrip({ phases }: { phases: ProjectPhaseSummary[] }) {
  const statusByKey = new Map(phases.map((phase) => [phase.key, phase.status]));
  const currentKey = getCurrentPhaseKey(phases);
  const current = currentKey ? SDLC_PHASE_BY_KEY[currentKey] : null;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-[var(--muted)]">Lifecycle</span>
        {current && (
          <span className="font-medium" style={{ color: current.color }}>
            {current.number} · {current.label}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden>
        {SDLC_PHASES.map((phase) => {
          const status = statusByKey.get(phase.key) ?? "not_started";
          return (
            <span
              key={phase.key}
              title={`${phase.label}: ${status.replace("_", " ")}`}
              className="h-1.5 flex-1 rounded-full"
              style={{
                backgroundColor:
                  status === "not_started" ? "var(--surface-subtle)" : phase.color,
                opacity: status === "in_progress" ? 0.45 : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ProjectCard({
  project,
  index = 0,
}: {
  project: Project;
  index?: number;
}) {
  const milestoneCount = project.milestone_count ?? 0;
  const counts = {
    total: milestoneCount,
    todo: project.todo_milestone_count ?? 0,
    in_progress: project.in_progress_milestone_count ?? 0,
    done: project.done_milestone_count ?? project.completed_milestone_count ?? 0,
  };
  const percent = milestoneCount ? Math.round((counts.done / milestoneCount) * 100) : 0;
  const status = PROJECT_STATUS_META[project.status];
  const overdue = isProjectOverdue(project);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      className="h-full"
    >
      <Link
        href={`/dashboard/projects/${project.id}`}
        className="panel flex h-full flex-col p-5 transition-colors hover:border-[var(--border-strong)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="chip py-1 text-[11px]">
              <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
              {status.label}
            </span>
            {project.is_owner === false && (
              <span
                className="chip py-1 text-[11px]"
                title={`Shared by ${project.owner?.email ?? "another user"}`}
              >
                Shared
              </span>
            )}
          </div>
          <span
            className={cn(
              "text-[11px]",
              overdue ? "font-medium text-orange-500" : "text-[var(--muted)]",
            )}
          >
            {project.due_date ? `${overdue ? "Overdue · " : "Due "}${formatDate(project.due_date)}` : "No due date"}
          </span>
        </div>

        <h3 className="mt-4 text-lg font-semibold tracking-tight text-[var(--foreground)]">
          {project.name}
        </h3>
        {project.description && (
          <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{project.description}</p>
        )}

        <div className="mt-auto space-y-4 pt-5">
          {project.phases && project.phases.length > 0 && <PhaseStrip phases={project.phases} />}

          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
              <span className="text-[var(--muted)]">Milestones</span>
              <span className="font-semibold tabular-nums">
                {milestoneCount > 0 ? `${percent}%` : "—"}
              </span>
            </div>
            {milestoneCount > 0 ? (
              <MilestoneProgressBar counts={counts} showLegend={false} />
            ) : (
              <div className="h-1.5 rounded-full bg-[var(--surface-subtle)]" />
            )}
            <p className="mt-1.5 text-[11px] text-[var(--muted-light)]">
              {milestoneCount > 0
                ? `${counts.done} done · ${counts.in_progress} in progress · ${counts.todo} to do`
                : "No milestones yet"}
            </p>
          </div>
        </div>

        {project.board_title && (
          <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            Board · <span className="truncate text-[var(--foreground)]">{project.board_title}</span>
          </div>
        )}
      </Link>
    </motion.div>
  );
}
