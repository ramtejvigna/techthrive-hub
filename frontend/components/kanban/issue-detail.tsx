"use client";

import { Avatar, IssueTypeIcon, PriorityIcon } from "@/components/kanban/jira-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MarkdownEditor, MarkdownHint, MarkdownView } from "@/components/ui/markdown-editor";
import { api } from "@/lib/api";
import { queryKeys, useCardComments, useProjects } from "@/lib/queries";
import { ISSUE_TYPES, PRIORITIES, labelColor, tintedChipStyle } from "@/lib/jira";
import { resolveColumnColor } from "@/lib/kanban-themes";
import type {
  CardComment,
  CardPriority,
  IssueType,
  KanbanCard,
  KanbanColumn,
  User,
} from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import { FormEvent, KeyboardEvent, ReactNode, useEffect, useState } from "react";

export type CardPatch = Parameters<typeof api.updateCard>[1];

interface IssueDetailProps {
  card: KanbanCard;
  boardKey: string;
  columns: KanbanColumn[];
  /** People the issue can be assigned to. */
  members: User[];
  currentUser: User | null;
  onClose: () => void;
  onUpdate: (patch: CardPatch) => Promise<void>;
  onDelete?: () => void;
  onCommentCountChange: (count: number) => void;
}

const FIELD_CLASS =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-[var(--foreground)] outline-none transition-colors hover:bg-[var(--surface-hover)] focus:border-[var(--accent)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--accent)]/15 disabled:cursor-not-allowed disabled:hover:bg-transparent";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 py-1.5">
      <span className="text-xs font-medium text-[var(--muted)]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function LabelsEditor({
  labels,
  onChange,
}: {
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function add() {
    const value = draft.trim().replace(/,$/, "");
    if (value && !labels.some((label) => label.toLowerCase() === value.toLowerCase())) {
      onChange([...labels, value]);
    }
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
    if (event.key === "Backspace" && !draft && labels.length > 0) {
      onChange(labels.slice(0, -1));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--surface-hover)]">
      {labels.map((label) => {
        return (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded px-1.5 py-px text-xs font-medium"
            style={tintedChipStyle(labelColor(label))}
          >
            {label}
            <button
              type="button"
              onClick={() => onChange(labels.filter((item) => item !== label))}
              aria-label={`Remove label ${label}`}
              className="opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </span>
        );
      })}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={add}
        placeholder={labels.length ? "" : "Add labels"}
        maxLength={30}
        aria-label="Add label"
        className="min-w-[80px] flex-1 bg-transparent px-1 py-0.5 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-light)]"
      />
    </div>
  );
}

function Comments({
  cardId,
  currentUser,
  mentionCandidates,
  onCountChange,
}: {
  cardId: string;
  currentUser: User | null;
  mentionCandidates: User[];
  onCountChange: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const { data: comments = [], isPending: loading } = useCardComments(cardId);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  function setComments(next: CardComment[]) {
    queryClient.setQueryData(queryKeys.boards.cardComments(cardId), next);
    onCountChange(next.length);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitComment();
  }

  async function submitComment() {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const comment = await api.createCardComment(cardId, trimmed);
      setComments([...comments, comment]);
      setBody("");
    } finally {
      setPosting(false);
    }
  }

  async function handleDelete(commentId: string) {
    await api.deleteCardComment(cardId, commentId);
    setComments(comments.filter((comment) => comment.id !== commentId));
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Comments</h3>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-3">
        <Avatar email={currentUser?.email ?? null} size={30} />
        <div className="flex-1 space-y-2">
          <MarkdownEditor
            value={body}
            onChange={setBody}
            placeholder="Add a comment... (@ to mention)"
            aria-label="Add a comment"
            mentionCandidates={mentionCandidates}
            onSubmit={() => void submitComment()}
          />
          {body.trim() && (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={posting} className="px-3 py-1.5 text-xs">
                Save
              </Button>
              <Button variant="ghost" onClick={() => setBody("")} className="px-3 py-1.5 text-xs">
                Cancel
              </Button>
              <MarkdownHint />
            </div>
          )}
        </div>
      </form>

      {loading ? (
        <p className="mt-4 text-xs text-[var(--muted)]">Loading comments...</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {[...comments].reverse().map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <Avatar email={comment.user.email} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-xs">
                  <span className="font-semibold text-[var(--foreground)]">{comment.user.email}</span>
                  <span className="ml-2 text-[var(--muted)]">{formatDateTime(comment.created_at)}</span>
                </p>
                <MarkdownView value={comment.body} className="mt-1 text-[var(--foreground)]" />
                {currentUser?.id === comment.user.id && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment.id)}
                    className="mt-1 text-xs font-medium text-[var(--muted)] hover:text-red-500"
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function IssueDetail({
  card,
  boardKey,
  columns,
  members,
  currentUser,
  onClose,
  onUpdate,
  onDelete,
  onCommentCountChange,
}: IssueDetailProps) {
  const [title, setTitle] = useState(card.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [description, setDescription] = useState(card.description);
  const [storyPoints, setStoryPoints] = useState(card.story_points?.toString() ?? "");
  const { data: projects = [] } = useProjects();
  const [error, setError] = useState<string | null>(null);

  const column = columns.find((col) => col.id === card.column_id);
  const mentionCandidates = members.filter((member) => member.id !== currentUser?.id);
  const isMilestone = Boolean(card.milestone_id);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function save(patch: CardPatch) {
    setError(null);
    try {
      await onUpdate(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save change.");
    }
  }

  function commitTitle() {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(card.title);
      return;
    }
    if (trimmed !== card.title) void save({ title: trimmed });
  }

  function commitStoryPoints() {
    const value = storyPoints.trim() === "" ? null : Number(storyPoints);
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      setStoryPoints(card.story_points?.toString() ?? "");
      return;
    }
    if (value !== card.story_points) void save({ story_points: value });
  }

  async function saveDescription() {
    await save({ description: description.trim() });
    setEditingDescription(false);
  }

  function cancelDescription() {
    setDescription(card.description);
    setEditingDescription(false);
  }

  const statusColor = column ? resolveColumnColor(column) : "#64748b";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 md:p-10">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`${card.issue_key} ${card.title}`}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-5xl rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl shadow-black/20"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-[var(--muted)]">
            <span className="font-mono text-xs">{boardKey}</span>
            <span aria-hidden>/</span>
            <IssueTypeIcon type={card.issue_type} />
            <span className="font-mono text-xs font-medium text-[var(--foreground)]">{card.issue_key}</span>
            {isMilestone && card.project_id && (
              <Link
                href={`/dashboard/projects/${card.project_id}`}
                className="ml-2 truncate rounded bg-[var(--accent-light)] px-1.5 py-px text-[11px] font-medium text-[var(--accent)] hover:underline"
              >
                Milestone · {card.project_name}
              </Link>
            )}
          </div>
          <div className="flex items-center gap-1">
            {onDelete && (
              <DropdownMenu>
                <DropdownMenuTrigger variant="ghost" aria-label="Issue actions" />
                <DropdownMenuContent className="min-w-[160px]">
                  <DropdownMenuItem destructive onClick={onDelete}>
                    Delete issue
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-lg text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
            >
              ×
            </button>
          </div>
        </div>

        {error && (
          <p className="mx-5 mt-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</p>
        )}

        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_300px] md:gap-8">
          {/* Main column */}
          <div className="min-w-0 space-y-6">
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
                if (e.key === "Escape") {
                  setTitle(card.title);
                  e.currentTarget.blur();
                }
              }}
              rows={1}
              maxLength={255}
              aria-label="Summary"
              className="w-full resize-none rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-semibold leading-snug text-[var(--foreground)] outline-none [field-sizing:content] hover:bg-[var(--surface-hover)] focus:border-[var(--accent)] focus:bg-[var(--surface)]"
            />

            <section>
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Description</h3>
              {editingDescription ? (
                <div className="mt-2 space-y-2">
                  <MarkdownEditor
                    autoFocus
                    value={description}
                    onChange={setDescription}
                    onSubmit={() => void saveDescription()}
                    onCancel={cancelDescription}
                    placeholder="Add a description..."
                    aria-label="Description"
                    mentionCandidates={mentionCandidates}
                    className="[&_.md-content]:min-h-[9rem]"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={saveDescription} className="px-3 py-1.5 text-xs">
                      Save
                    </Button>
                    <Button variant="ghost" onClick={cancelDescription} className="px-3 py-1.5 text-xs">
                      Cancel
                    </Button>
                    <MarkdownHint />
                  </div>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Edit description"
                  onClick={(e) => {
                    // Let links and checklist boxes in the rendered description work normally.
                    if ((e.target as HTMLElement).closest("a, input, label")) return;
                    setDescription(card.description);
                    setEditingDescription(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target === e.currentTarget) {
                      e.preventDefault();
                      setDescription(card.description);
                      setEditingDescription(true);
                    }
                  }}
                  className="mt-2 cursor-text rounded-md px-2 py-2 transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/30"
                >
                  {card.description ? (
                    <MarkdownView
                      value={card.description}
                      onChange={(markdown) => void save({ description: markdown })}
                      className="text-[var(--foreground)]"
                    />
                  ) : (
                    <p className="text-sm text-[var(--muted-light)]">Add a description...</p>
                  )}
                </div>
              )}
            </section>

            <Comments
              cardId={card.id}
              currentUser={currentUser}
              mentionCandidates={mentionCandidates}
              onCountChange={onCommentCountChange}
            />
          </div>

          {/* Sidebar */}
          <aside className="space-y-4">
            <select
              value={card.column_id}
              onChange={(e) => void save({ column: e.target.value })}
              aria-label="Status"
              className="h-9 rounded-md border-0 px-3 pr-8 text-sm font-semibold uppercase tracking-wide outline-none ring-1 focus:ring-2"
              style={{
                color: statusColor,
                backgroundColor: `color-mix(in srgb, ${statusColor} 15%, var(--surface))`,
                ["--tw-ring-color" as string]: `color-mix(in srgb, ${statusColor} 40%, transparent)`,
              }}
            >
              {columns.map((col) => (
                <option key={col.id} value={col.id}>
                  {col.name}
                </option>
              ))}
            </select>

            <div className="rounded-lg border border-[var(--border)]">
              <p className="border-b border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--foreground)]">
                Details
              </p>
              <div className="px-3 py-1">
                <DetailRow label="Assignee">
                  <div className="flex items-center gap-1 pl-2">
                    <Avatar email={card.assignee_email} size={24} />
                    <select
                      value={card.assignee ?? ""}
                      onChange={(e) =>
                        void save({ assignee: e.target.value ? Number(e.target.value) : null })
                      }
                      aria-label="Assignee"
                      className={FIELD_CLASS}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.email}
                          {member.id === currentUser?.id ? " (you)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </DetailRow>
                <DetailRow label="Priority">
                  <div className="flex items-center gap-1 pl-2">
                    <PriorityIcon priority={card.priority} />
                    <select
                      value={card.priority}
                      onChange={(e) => void save({ priority: e.target.value as CardPriority })}
                      aria-label="Priority"
                      className={FIELD_CLASS}
                    >
                      {PRIORITIES.map((priority) => (
                        <option key={priority.key} value={priority.key}>
                          {priority.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </DetailRow>
                <DetailRow label="Type">
                  <div className="flex items-center gap-1 pl-2">
                    <IssueTypeIcon type={card.issue_type} />
                    <select
                      value={card.issue_type}
                      onChange={(e) => void save({ issue_type: e.target.value as IssueType })}
                      aria-label="Issue type"
                      className={FIELD_CLASS}
                    >
                      {ISSUE_TYPES.map((type) => (
                        <option key={type.key} value={type.key}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </DetailRow>
                <DetailRow label="Story points">
                  <input
                    type="number"
                    min={0}
                    max={999}
                    inputMode="numeric"
                    value={storyPoints}
                    onChange={(e) => setStoryPoints(e.target.value)}
                    onBlur={commitStoryPoints}
                    onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                    placeholder="None"
                    aria-label="Story points"
                    className={FIELD_CLASS}
                  />
                </DetailRow>
                <DetailRow label="Labels">
                  <LabelsEditor labels={card.labels} onChange={(labels) => void save({ labels })} />
                </DetailRow>
                <DetailRow label="Due date">
                  <input
                    type="date"
                    value={card.due_date ?? ""}
                    onChange={(e) => void save({ due_date: e.target.value || null })}
                    aria-label="Due date"
                    className={FIELD_CLASS}
                  />
                </DetailRow>
                <DetailRow label="Project">
                  <select
                    value={card.project_id ?? ""}
                    onChange={(e) => void save({ project: e.target.value || null })}
                    disabled={isMilestone}
                    aria-label="Project"
                    title={isMilestone ? "Milestone ticket belong to their project" : undefined}
                    className={FIELD_CLASS}
                  >
                    <option value="">None</option>
                    {card.project_id && !projects.some((project) => project.id === card.project_id) && (
                      <option value={card.project_id}>{card.project_name}</option>
                    )}
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </DetailRow>
              </div>
            </div>

            <div className="space-y-0.5 px-1 font-mono text-[11px] text-[var(--muted)]">
              <p>Created {formatDateTime(card.created_at)}</p>
              <p>Updated {formatDateTime(card.updated_at)}</p>
            </div>
          </aside>
        </div>
      </motion.div>
    </div>
  );
}
