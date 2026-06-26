"use client";

import {
  PRIORITY_STYLES,
  formatCardStatusLabel,
  type ColumnTheme,
} from "@/lib/kanban-themes";
import { useSortableClickHandler } from "@/lib/use-sortable-click";
import type { KanbanCard as KanbanCardType } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";

interface KanbanCardProps {
  card: KanbanCardType;
  theme: ColumnTheme;
  isCompletedColumn?: boolean;
  onClick?: () => void;
}

function CardBody({
  card,
  theme,
  isCompletedColumn = false,
}: {
  card: KanbanCardType;
  theme: ColumnTheme;
  isCompletedColumn?: boolean;
}) {
  const statusLabel = formatCardStatusLabel(card, isCompletedColumn, formatDate);
  const isOverdue = !isCompletedColumn && statusLabel?.includes("Past Due");
  const priority = card.priority || "medium";

  return (
    <>
      <div className="flex items-start gap-2">
        <svg
          className={cn("mt-0.5 h-3.5 w-3.5 shrink-0 opacity-40", theme.cardMuted)}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" d="M9 12h6m-6 4h6M7 4h7l3 3v13H7V4z" />
        </svg>
        <p className={cn("flex-1 text-sm font-medium leading-snug", theme.cardText)}>
          {card.title}
        </p>
      </div>

      {statusLabel && (
        <div className={cn("mt-2.5 flex items-center gap-1.5 text-xs", theme.cardMuted)}>
          <span
            className={cn(
              isOverdue && "font-medium text-rose-500",
              isCompletedColumn && "font-medium text-emerald-600",
            )}
          >
            {statusLabel}
          </span>
          {!isCompletedColumn ? (
            <span className="inline-block h-1 w-1 rounded-full bg-current opacity-50" />
          ) : null}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {card.milestone_id && (
          <span className="inline-block rounded-md bg-[var(--accent-light)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] ring-1 ring-[var(--accent)]/20">
            Milestone
          </span>
        )}
        {card.project_name && (
          <span className="inline-block max-w-[120px] truncate rounded-md bg-[var(--surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
            {card.project_name}
          </span>
        )}
        {!card.milestone_id && (
          <span
            className={cn(
              "inline-block rounded-md px-2 py-0.5 text-[11px] font-medium capitalize",
              PRIORITY_STYLES[priority],
            )}
          >
            {priority}
          </span>
        )}
      </div>
    </>
  );
}

export function KanbanCardPreview({
  card,
  theme,
  isCompletedColumn = false,
  className,
}: {
  card: KanbanCardType;
  theme: ColumnTheme;
  isCompletedColumn?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3.5 shadow-sm",
        theme.cardBg,
        theme.cardBorder,
        className,
      )}
    >
      <CardBody card={card} theme={theme} isCompletedColumn={isCompletedColumn} />
    </div>
  );
}

export function KanbanCardItem({ card, theme, isCompletedColumn = false, onClick }: KanbanCardProps) {
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={cn(
        "cursor-grab rounded-xl border p-3.5 shadow-sm transition-all duration-200 active:cursor-grabbing",
        theme.cardBg,
        theme.cardBorder,
        "hover:-translate-y-0.5 hover:shadow-md",
        isDragging && "pointer-events-none",
      )}
    >
      <CardBody card={card} theme={theme} isCompletedColumn={isCompletedColumn} />
    </motion.div>
  );
}
