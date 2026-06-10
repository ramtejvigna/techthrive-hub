"use client";

import { MilestoneProgressBar } from "@/components/projects/milestone-progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { Project, ProjectStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

const statusVariant: Record<ProjectStatus, "default" | "success" | "warning" | "muted"> = {
  planning: "muted",
  active: "default",
  on_hold: "warning",
  completed: "success",
};

const statusLabel: Record<ProjectStatus, string> = {
  planning: "planning",
  active: "active",
  on_hold: "on_hold",
  completed: "done",
};

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

  return (
    <Link href={`/dashboard/projects/${project.id}`}>
      <Card hover delay={index * 0.05} className="tech-frame">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{project.name}</CardTitle>
          <Badge variant={statusVariant[project.status]}>
            {statusLabel[project.status]}
          </Badge>
        </div>
        {project.description && (
          <CardDescription className="line-clamp-2 normal-case">
            {project.description}
          </CardDescription>
        )}

        <div className="mt-4">
          {milestoneCount > 0 ? (
            <MilestoneProgressBar counts={counts} showLegend />
          ) : (
            <p className="font-mono text-[10px] text-[var(--muted)]">No milestones yet</p>
          )}
        </div>

        <p className="mt-3 font-mono text-[10px] text-[var(--muted-light)]">
          due::{formatDate(project.due_date)}
        </p>
      </Card>
    </Link>
  );
}
