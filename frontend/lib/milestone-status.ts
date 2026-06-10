import type { Milestone, MilestoneBucketStatus } from "@/lib/types";

export const MILESTONE_STATUS_LABELS: Record<MilestoneBucketStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
};

export const MILESTONE_STATUS_VARIANTS: Record<
  MilestoneBucketStatus,
  "muted" | "default" | "success"
> = {
  todo: "muted",
  in_progress: "default",
  done: "success",
};

export interface MilestoneProgressCounts {
  total: number;
  todo: number;
  in_progress: number;
  done: number;
}

export function getMilestoneProgressCounts(
  milestones: Milestone[],
): MilestoneProgressCounts {
  return milestones.reduce(
    (counts, milestone) => {
      counts.total += 1;
      const status = milestone.bucket_status || (milestone.completed ? "done" : "todo");
      counts[status] += 1;
      return counts;
    },
    { total: 0, todo: 0, in_progress: 0, done: 0 },
  );
}

export function getMilestoneProgressPercent(counts: MilestoneProgressCounts): number {
  if (counts.total === 0) return 0;
  return Math.round((counts.done / counts.total) * 100);
}
