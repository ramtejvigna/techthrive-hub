"use client";

import { SdlcPhaseIcon } from "@/components/projects/sdlc-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor, MarkdownHint, MarkdownView } from "@/components/ui/markdown-editor";
import { api } from "@/lib/api";
import { queryKeys, usePhaseUpdates } from "@/lib/queries";
import {
  MILESTONE_STATUS_LABELS,
  MILESTONE_STATUS_VARIANTS,
} from "@/lib/milestone-status";
import { PHASE_STATUS_LABELS, SDLC_PHASE_BY_KEY } from "@/lib/sdlc";
import type {
  Milestone,
  PhaseStatus,
  PhaseUpdate,
  ProjectPhase,
  User,
} from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useRef, useState } from "react";

const STATUS_OPTIONS: PhaseStatus[] = ["not_started", "in_progress", "done"];

interface PhasePanelProps {
  projectId: string;
  phase: ProjectPhase;
  milestones: Milestone[];
  currentUser: User | null;
  /** People who can be @mentioned in updates. */
  mentionCandidates?: User[];
  onPhaseUpdated: (phase: ProjectPhase) => void;
  onCreateMilestone: (data: {
    title: string;
    target_date: string | null;
    phase: string;
  }) => Promise<void>;
}

export function PhasePanel({
  projectId,
  phase,
  milestones,
  currentUser,
  mentionCandidates,
  onPhaseUpdated,
  onCreateMilestone,
}: PhasePanelProps) {
  const meta = SDLC_PHASE_BY_KEY[phase.key];

  const [notesDraft, setNotesDraft] = useState(phase.notes);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const queryClient = useQueryClient();
  const updatesKey = queryKeys.projects.phaseUpdates(projectId, phase.key);
  const { data: updates = [], isPending: updatesLoading } = usePhaseUpdates(projectId, phase.key);
  const [updateBody, setUpdateBody] = useState("");
  const [postingUpdate, setPostingUpdate] = useState(false);

  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [addingMilestone, setAddingMilestone] = useState(false);

  const notesDirty = notesDraft !== phase.notes;

  // The phase card scrolls instead of growing; when a milestone is added,
  // bring it into view (the list is sorted by date, so it may not be last).
  const milestoneListRef = useRef<HTMLUListElement>(null);
  const knownMilestoneIds = useRef(new Set(milestones.map((milestone) => milestone.id)));
  useEffect(() => {
    const added = milestones.find((milestone) => !knownMilestoneIds.current.has(milestone.id));
    knownMilestoneIds.current = new Set(milestones.map((milestone) => milestone.id));
    if (!added) return;
    milestoneListRef.current
      ?.querySelector(`[data-milestone-id="${added.id}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [milestones]);

  async function handleStatusChange(status: PhaseStatus) {
    if (status === phase.status) return;
    setSavingStatus(true);
    try {
      const updated = await api.updatePhase(projectId, phase.key, { status });
      onPhaseUpdated(updated);
      // The server logs status changes as updates.
      await queryClient.invalidateQueries({ queryKey: updatesKey });
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      const updated = await api.updatePhase(projectId, phase.key, { notes: notesDraft });
      onPhaseUpdated(updated);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handlePostUpdate(event: FormEvent) {
    event.preventDefault();
    await postUpdate();
  }

  async function postUpdate() {
    const trimmed = updateBody.trim();
    if (!trimmed || postingUpdate) return;
    setPostingUpdate(true);
    try {
      const update = await api.createPhaseUpdate(projectId, phase.key, trimmed);
      queryClient.setQueryData<PhaseUpdate[]>(updatesKey, (prev = []) => [update, ...prev]);
      setUpdateBody("");
      onPhaseUpdated({ ...phase, update_count: phase.update_count + 1 });
    } finally {
      setPostingUpdate(false);
    }
  }

  async function handleDeleteUpdate(updateId: string) {
    await api.deletePhaseUpdate(projectId, phase.key, updateId);
    queryClient.setQueryData<PhaseUpdate[]>(updatesKey, (prev = []) =>
      prev.filter((u) => u.id !== updateId),
    );
    onPhaseUpdated({ ...phase, update_count: Math.max(0, phase.update_count - 1) });
  }

  async function handleAddMilestone(event: FormEvent) {
    event.preventDefault();
    const trimmed = milestoneTitle.trim();
    if (!trimmed) return;
    setAddingMilestone(true);
    try {
      await onCreateMilestone({ title: trimmed, target_date: null, phase: phase.id });
      setMilestoneTitle("");
    } finally {
      setAddingMilestone(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
            color: meta.color,
          }}
        >
          <SdlcPhaseIcon phase={phase.key} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="tech-label" style={{ color: meta.color }}>
            Phase {meta.number}
          </p>
          <h3 className="text-lg font-semibold tracking-tight text-[var(--foreground)]">
            {meta.label}
          </h3>
          <p className="mt-0.5 text-sm text-[var(--muted)]">{meta.description}</p>
        </div>
      </div>

      {/* Status */}
      <section className="space-y-2">
        <p className="tech-label">Status</p>
        <div
          role="radiogroup"
          aria-label="Phase status"
          className="inline-flex rounded-lg border border-[var(--border-strong)] bg-[var(--surface-muted)] p-1"
        >
          {STATUS_OPTIONS.map((status) => {
            const active = phase.status === status;
            return (
              <button
                key={status}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={savingStatus}
                onClick={() => handleStatusChange(status)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:cursor-wait",
                  active
                    ? "text-white shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]",
                )}
                style={
                  active
                    ? {
                        backgroundColor:
                          status === "done"
                            ? "#10b981"
                            : status === "in_progress"
                              ? meta.color
                              : "var(--muted-light)",
                      }
                    : undefined
                }
              >
                {PHASE_STATUS_LABELS[status]}
              </button>
            );
          })}
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="tech-label">Notes</p>
          {!notesDirty && phase.notes && (
            <span className="font-mono text-[10px] text-[var(--muted-light)]">
              saved {formatDateTime(phase.updated_at)}
            </span>
          )}
        </div>
        <MarkdownEditor
          value={notesDraft}
          onChange={setNotesDraft}
          onSubmit={() => notesDirty && void handleSaveNotes()}
          placeholder={`Decisions, links and context for ${meta.label.toLowerCase()}...`}
          aria-label={`${meta.label} notes`}
          className="[&_.md-content]:min-h-[7.5rem]"
        />
        {notesDirty && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleSaveNotes}
              disabled={savingNotes}
              className="px-3 py-1.5 text-xs"
            >
              {savingNotes ? "Saving..." : "Save notes"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setNotesDraft(phase.notes)}
              className="px-3 py-1.5 text-xs"
            >
              Discard
            </Button>
            <MarkdownHint />
          </div>
        )}
      </section>

      {/* Milestones */}
      <section className="space-y-2">
        <p className="tech-label">Milestones · {milestones.length}</p>
        {milestones.length > 0 && (
          <ul ref={milestoneListRef} className="space-y-1.5">
            {milestones.map((milestone) => {
              const status = milestone.bucket_status || (milestone.completed ? "done" : "todo");
              return (
                <li
                  key={milestone.id}
                  data-milestone-id={milestone.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      status === "done"
                        ? "bg-emerald-500"
                        : status === "in_progress"
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--surface-subtle)]",
                    )}
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      milestone.completed
                        ? "text-[var(--muted)] line-through"
                        : "text-[var(--foreground)]",
                    )}
                  >
                    {milestone.title}
                  </span>
                  {milestone.target_date && (
                    <span className="font-mono text-[10px] text-[var(--muted)]">
                      {formatDate(milestone.target_date)}
                    </span>
                  )}
                  <Badge variant={MILESTONE_STATUS_VARIANTS[status]}>
                    {MILESTONE_STATUS_LABELS[status]}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
        <form onSubmit={handleAddMilestone} className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <Input
              value={milestoneTitle}
              onChange={(e) => setMilestoneTitle(e.target.value)}
              placeholder={`Add a ${meta.label.toLowerCase()} milestone`}
            />
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={addingMilestone || !milestoneTitle.trim()}
            className="shrink-0"
          >
            Add
          </Button>
        </form>
      </section>

      {/* Updates */}
      <section className="space-y-3">
        <p className="tech-label">Updates · {phase.update_count}</p>
        <form onSubmit={handlePostUpdate} className="space-y-2">
          <MarkdownEditor
            value={updateBody}
            onChange={setUpdateBody}
            onSubmit={() => void postUpdate()}
            placeholder="Post an update on this phase... (@ to mention)"
            aria-label="Phase update"
            mentionCandidates={mentionCandidates}
          />
          <Button
            type="submit"
            className="px-3 py-1.5 text-xs"
            disabled={postingUpdate || !updateBody.trim()}
          >
            Post update
          </Button>
        </form>

        {updatesLoading ? (
          <p className="text-xs text-[var(--muted)]">Loading updates...</p>
        ) : updates.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">No updates yet.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-[var(--border)] pl-4">
            {updates.map((update) => (
              <li key={update.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface)]"
                  style={{
                    backgroundColor:
                      update.kind === "status_change" ? meta.color : "var(--border-strong)",
                  }}
                />
                {update.kind === "status_change" ? (
                  <p className="font-mono text-[11px] text-[var(--muted)]">
                    <span className="text-[var(--foreground)]">{update.user.email}</span> moved
                    status: {update.body}
                    <span className="ml-2 text-[var(--muted-light)]">
                      {formatDateTime(update.created_at)}
                    </span>
                  </p>
                ) : (
                  <div className="rounded-md bg-[var(--surface-muted)] px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-[var(--foreground)]">
                        {update.user.email}
                        <span className="ml-2 font-mono text-[10px] font-normal text-[var(--muted)]">
                          {formatDateTime(update.created_at)}
                        </span>
                      </p>
                      {currentUser?.id === update.user.id && (
                        <Button
                          variant="ghost"
                          onClick={() => handleDeleteUpdate(update.id)}
                          className="-my-1 shrink-0 px-2 py-1 text-xs text-red-600"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                    <MarkdownView value={update.body} className="mt-1 text-[var(--foreground)]" />
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
