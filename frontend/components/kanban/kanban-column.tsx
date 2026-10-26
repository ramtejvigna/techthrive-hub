"use client";

import { ColumnColorPicker } from "@/components/kanban/column-color-picker";
import { IssueTypeIcon } from "@/components/kanban/jira-icons";
import { KanbanCardItem } from "@/components/kanban/kanban-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ISSUE_TYPES } from "@/lib/jira";
import { getColumnTheme, isCompletedColumn } from "@/lib/kanban-themes";
import { stopDragPropagation } from "@/lib/use-sortable-click";
import type { IssueType, KanbanCard, KanbanColumn as KanbanColumnType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { KeyboardEvent, useRef, useState } from "react";

const COLUMN_WIDTH = "w-[280px]";

interface KanbanColumnProps {
  column: KanbanColumnType;
  allColumns: KanbanColumnType[];
  /** Cards to render; may be a filtered subset of column.cards. */
  visibleCards: KanbanCard[];
  index: number;
  creating: boolean;
  onOpenCreate: (columnId: string) => void;
  onCloseCreate: () => void;
  onCreateIssue: (columnId: string, title: string, issueType: IssueType) => Promise<void>;
  onCardClick: (cardId: string) => void;
  onColorChange: (columnId: string, color: string) => void;
  onEditWipLimit: (columnId: string) => void;
  onDeleteColumn?: (columnId: string) => void;
}

function ColumnHeading({
  column,
  count,
  overLimit,
}: {
  column: KanbanColumnType;
  count: number;
  overLimit: boolean;
}) {
  return (
    <>
      <span className="truncate text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {column.name}
      </span>
      <span
        className={cn(
          "shrink-0 text-xs font-semibold",
          overLimit ? "text-red-500" : "text-[var(--muted-light)]",
        )}
      >
        {count}
      </span>
      {column.wip_limit !== null && (
        <span
          className={cn(
            "shrink-0 rounded px-1 font-mono text-[10px] font-medium uppercase",
            overLimit
              ? "bg-red-500/15 text-red-500"
              : "bg-[var(--surface-hover)] text-[var(--muted)]",
          )}
          title="Work-in-progress limit"
        >
          max {column.wip_limit}
        </span>
      )}
    </>
  );
}

export function KanbanColumnPreview({
  column,
  className,
}: {
  column: KanbanColumnType;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] shadow-lg",
        COLUMN_WIDTH,
        className,
      )}
    >
      <div className="flex items-center gap-2 px-3 py-3">
        <ColumnHeading column={column} count={column.cards.length} overLimit={false} />
      </div>
      <div className="min-h-[80px]" />
    </div>
  );
}

function InlineCreate({
  onSubmit,
  onClose,
}: {
  onSubmit: (title: string, issueType: IssueType) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [issueType, setIssueType] = useState<IssueType>("task");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const trimmed = title.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onSubmit(trimmed, issueType);
      // Jira keeps the composer open so several issues can be added in a row.
      setTitle("");
    } finally {
      setSaving(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="rounded-md border-2 border-[var(--accent)] bg-[var(--surface)] p-2 shadow-sm"
      onPointerDown={stopDragPropagation}
    >
      <textarea
        ref={inputRef}
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (!title.trim()) onClose();
        }}
        placeholder="What needs to be done?"
        rows={2}
        // readOnly rather than disabled: disabling would drop focus, and with it Escape/Enter.
        readOnly={saving}
        className="w-full resize-none bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted-light)]"
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Issue type">
          {ISSUE_TYPES.map((type) => (
            <button
              key={type.key}
              type="button"
              role="radio"
              aria-checked={issueType === type.key}
              title={type.label}
              // Keep focus in the textarea so blur doesn't close the composer.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setIssueType(type.key)}
              className={cn(
                "rounded p-1 transition-colors",
                issueType === type.key
                  ? "bg-[var(--accent-light)] ring-1 ring-[var(--accent)]/40"
                  : "opacity-50 hover:opacity-100",
              )}
            >
              <IssueTypeIcon type={type.key} className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] text-[var(--muted-light)]">
          {saving ? "creating..." : "enter ↵ to create"}
        </span>
      </div>
    </div>
  );
}

export function KanbanColumn({
  column,
  allColumns,
  visibleCards,
  index,
  creating,
  onOpenCreate,
  onCloseCreate,
  onCreateIssue,
  onCardClick,
  onColorChange,
  onEditWipLimit,
  onDeleteColumn,
}: KanbanColumnProps) {
  const theme = getColumnTheme(column);
  const completedColumn = isCompletedColumn(column, allColumns);
  const overLimit = column.wip_limit !== null && column.cards.length > column.wip_limit;
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column", column } });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `droppable-${column.id}`,
    data: { type: "column-drop", column },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setSortableRef}
      style={style}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "group flex shrink-0 flex-col rounded-[18px] border transition-colors",
        COLUMN_WIDTH,
        overLimit
          ? "border-red-500/30 bg-red-500/[0.06]"
          : "border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--panel-shadow)]",
        isOver && !isDragging && "border-[var(--accent)]/50",
        isDragging && "pointer-events-none",
      )}
    >
      <div
        className="flex cursor-grab touch-none items-center gap-2 px-3 pb-2 pt-3 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <div onPointerDown={stopDragPropagation} className="flex shrink-0">
          <ColumnColorPicker
            color={theme.color}
            onChange={(color) => onColorChange(column.id, color)}
          />
        </div>
        <ColumnHeading column={column} count={column.cards.length} overLimit={overLimit} />
        <div
          onPointerDown={stopDragPropagation}
          className="ml-auto opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <DropdownMenu>
            <DropdownMenuTrigger variant="ghost" aria-label={`${column.name} column options`} />
            <DropdownMenuContent className="min-w-[180px]">
              <DropdownMenuItem onClick={() => onOpenCreate(column.id)}>Create ticket</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditWipLimit(column.id)}>
                {column.wip_limit === null ? "Set column limit" : "Edit column limit"}
              </DropdownMenuItem>
              {onDeleteColumn && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onClick={() => onDeleteColumn(column.id)}>
                    Delete column
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        ref={setDroppableRef}
        className="flex min-h-[120px] flex-1 flex-col gap-1.5 px-2 pb-2"
      >
        <SortableContext items={visibleCards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {visibleCards.map((card) => (
              <KanbanCardItem
                key={card.id}
                card={card}
                isCompletedColumn={completedColumn}
                onClick={() => onCardClick(card.id)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>

        {creating ? (
          <InlineCreate
            onSubmit={(title, issueType) => onCreateIssue(column.id, title, issueType)}
            onClose={onCloseCreate}
          />
        ) : (
          <button
            type="button"
            onClick={() => onOpenCreate(column.id)}
            onPointerDown={stopDragPropagation}
            className={cn(
              "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium text-[var(--muted)] transition-all hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
              visibleCards.length > 0 &&
                "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
            )}
          >
            <span className="text-base leading-none">+</span>
            Create ticket
          </button>
        )}
      </div>
    </motion.div>
  );
}
