"use client";

import { MilestoneComments } from "@/components/projects/milestone-comments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_VARIANTS,
} from "@/lib/milestone-status";
import { SDLC_PHASE_BY_KEY } from "@/lib/sdlc";
import type { Milestone, ProjectPhase, User } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { FormEvent, useState } from "react";

interface MilestoneListProps {
  projectId: string;
  milestones: Milestone[];
  phases?: ProjectPhase[];
  currentUser: User | null;
  /** People who can be @mentioned in milestone comments. */
  mentionCandidates?: User[];
  boardLinked?: boolean;
  onCreate: (data: {
    title: string;
    target_date: string | null;
    phase: string | null;
  }) => Promise<void>;
  onToggle?: (milestone: Milestone) => Promise<void>;
  onDelete: (milestoneId: string) => Promise<void>;
}

export function MilestoneList({
  projectId,
  milestones,
  phases = [],
  currentUser,
  mentionCandidates,
  boardLinked = false,
  onCreate,
  onToggle,
  onDelete,
}: MilestoneListProps) {
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set());

  function toggleComments(milestoneId: string) {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) {
        next.delete(milestoneId);
      } else {
        next.add(milestoneId);
      }
      return next;
    });
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      await onCreate({
        title: title.trim(),
        target_date: targetDate || null,
        phase: phaseId || null,
      });
      setTitle("");
      setTargetDate("");
      setPhaseId("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* <MilestoneProgressFromList milestones={milestones} /> */}

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
        <Input
          label="New milestone"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Milestone title"
          className="min-w-[200px] flex-1"
        />
        <Input
          label="Target date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
        />
        {phases.length > 0 && (
          <Select
            label="Phase"
            value={phaseId}
            onChange={(e) => setPhaseId(e.target.value)}
          >
            <option value="">No phase</option>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.label}
              </option>
            ))}
          </Select>
        )}
        <Button type="submit" disabled={loading}>
          Add
        </Button>
      </form>

      <ul className="space-y-2">
        {milestones.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">No milestones yet.</li>
        ) : (
          milestones.map((milestone) => {
            const status = milestone.bucket_status || (milestone.completed ? "done" : "todo");

            const commentsOpen = expandedComments.has(milestone.id);
            const phaseMeta = phases.find((phase) => phase.id === milestone.phase);
            const phaseColor = phaseMeta ? SDLC_PHASE_BY_KEY[phaseMeta.key].color : null;

            return (
              <li
                key={milestone.id}
                className="rounded-lg border border-[var(--border)] px-3 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {!boardLinked && onToggle ? (
                      <input
                        type="checkbox"
                        checked={milestone.completed}
                        onChange={() => onToggle(milestone)}
                        className="h-4 w-4 shrink-0 rounded border-[var(--border-strong)] accent-[var(--accent)]"
                      />
                    ) : (
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                          status === "done"
                            ? "bg-emerald-500"
                            : status === "in_progress"
                              ? "bg-[var(--accent)]"
                              : "bg-[var(--surface-subtle)]"
                        }`}
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={
                            milestone.completed
                              ? "text-sm text-[var(--muted)] line-through"
                              : "text-sm font-medium text-[var(--foreground)]"
                          }
                        >
                          {milestone.title}
                        </span>
                        <Badge variant={MILESTONE_STATUS_VARIANTS[status]}>
                          {MILESTONE_STATUS_LABELS[status]}
                        </Badge>
                        {phaseMeta && phaseColor && (
                          <span
                            className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide"
                            style={{
                              color: phaseColor,
                              backgroundColor: `color-mix(in srgb, ${phaseColor} 12%, transparent)`,
                            }}
                          >
                            {phaseMeta.label}
                          </span>
                        )}
                      </div>
                      <span className="mt-0.5 block font-mono text-[10px] text-[var(--muted)]">
                        {formatDate(milestone.target_date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      onClick={() => toggleComments(milestone.id)}
                      className="text-xs"
                    >
                      {commentsOpen ? "Hide comments" : "Comments"}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => onDelete(milestone.id)}
                      className="text-red-600"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {commentsOpen && (
                  <div className="mt-3 pl-7">
                    <MilestoneComments
                      projectId={projectId}
                      milestoneId={milestone.id}
                      currentUser={currentUser}
                      mentionCandidates={mentionCandidates}
                    />
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
