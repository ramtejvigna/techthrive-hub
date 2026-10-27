"use client";

import {
  Avatar,
  ClockIcon,
  CommentIcon,
  IssueTypeIcon,
  PriorityIcon,
} from "@/components/kanban/jira-icons";
import { labelColor, tintedChipStyle } from "@/lib/jira";
import { formatDueLabel } from "@/lib/kanban-themes";
import { useSortableClickHandler } from "@/lib/use-sortable-click";
import type { KanbanCard as KanbanCardType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";

interface KanbanCardProps {
  card: KanbanCardType;
  isCompletedColumn?: boolean;
  onClick?: () => void;
}

const CARD_CLASS =
  "rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-[0_1px_2px_rgba(17,18,22,0.06)]";

function CardBody({
  card,
  isCompletedColumn = false,
}: {
  card: KanbanCardType;
  isCompletedColumn?: boolean;
}) {
  const dueLabel = isCompletedColumn ? null : formatDueLabel(card.due_date);
  const overdue = dueLabel?.includes("Past Due") ?? false;
  const subtasksTotal = card.subtasks.length;
  const subtasksDone = card.subtasks.filter((item) => item.done).length;
  const hasChips =
    card.labels.length > 0 || Boolean(card.project_name) || Boolean(card.milestone_id) || Boolean(dueLabel);

  return (
    <>
      <p className="line-clamp-3 text-sm leading-snug text-[var(--foreground)]">{card.title}</p>

      {hasChips && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {card.project_name && (
            <span
              className="max-w-[140px] truncate rounded px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide"
              style={tintedChipStyle("#6e5dc6")}
              title={`Project: ${card.project_name}`}
            >
              {card.project_name}
            </span>
          )}
          {card.milestone_id && (
            <span className="rounded bg-[var(--accent-light)] px-1.5 py-px text-[11px] font-medium text-[var(--accent)]">
              Milestone
            </span>
          )}
          {card.labels.map((label) => (
            <span
              key={label}
              className="max-w-[120px] truncate rounded px-1.5 py-px text-[11px] font-medium"
              style={tintedChipStyle(labelColor(label))}
            >
              {label}
            </span>
          ))}
          {dueLabel && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium",
                overdue
                  ? "bg-red-500/15 text-red-500"
                  : "bg-[var(--surface-hover)] text-[var(--muted)]",
              )}
            >
              <ClockIcon className="h-3 w-3" />
              {dueLabel}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <IssueTypeIcon type={card.issue_type} />
        <span
          className={cn(
            "font-mono text-xs font-medium text-[var(--muted)]",
            isCompletedColumn && "line-through",
          )}
        >
          {card.issue_key}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {subtasksTotal > 0 && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-mono text-[11px]",
                subtasksDone === subtasksTotal ? "text-emerald-600" : "text-[var(--muted)]",
              )}
              title={`${subtasksDone} of ${subtasksTotal} subtasks done`}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <rect x="2" y="2" width="12" height="12" rx="3" />
                <path d="m5 8.2 2 2 4-4.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {subtasksDone}/{subtasksTotal}
            </span>
          )}
          {card.comment_count > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[11px] text-[var(--muted)]"
              title={`${card.comment_count} comment${card.comment_count === 1 ? "" : "s"}`}
            >
              <CommentIcon className="h-3.5 w-3.5" />
              {card.comment_count}
            </span>
          )}
          {card.story_points !== null && (
            <span
              className="min-w-[20px] rounded-full bg-[var(--surface-subtle)] px-1.5 text-center text-[11px] font-semibold text-[var(--foreground)]"
              title="Story points"
            >
              {card.story_points}
            </span>
          )}
          <PriorityIcon priority={card.priority} />
          <Avatar email={card.assignee_email} size={22} />
        </div>
      </div>
    </>
  );
}

export function KanbanCardPreview({
  card,
  isCompletedColumn = false,
  className,
}: {
  card: KanbanCardType;
  isCompletedColumn?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(CARD_CLASS, className)}>
      <CardBody card={card} isCompletedColumn={isCompletedColumn} />
    </div>
  );
}

export function KanbanCardItem({ card, isCompletedColumn = false, onClick }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: { type: "card", card } });

  const handleClick = useSortableClickHandler(isDragging, onClick);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        CARD_CLASS,
        "cursor-pointer transition-colors hover:bg-[var(--surface-hover)] active:cursor-grabbing",
        isDragging && "pointer-events-none",
      )}
    >
      <CardBody card={card} isCompletedColumn={isCompletedColumn} />
    </motion.div>
  );
}
