"use client";

import { BoardHeader, BoardToolbar } from "@/components/kanban/board-header";
import { IssueDetail, type CardPatch } from "@/components/kanban/issue-detail";
import { KanbanCardPreview } from "@/components/kanban/kanban-card";
import {
  KanbanColumn as KanbanColumnView,
  KanbanColumnPreview,
} from "@/components/kanban/kanban-column";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { EMPTY_FILTERS, matchesFilters, type BoardFilters } from "@/lib/jira";
import {
  findCard,
  moveCardInColumns,
  reorderColumns,
  resolveColumnId,
} from "@/lib/kanban-dnd";
import { isCompletedColumn } from "@/lib/kanban-themes";
import type { Board, IssueType, KanbanCard, KanbanColumn, User } from "@/lib/types";
import {
  CollisionDetection,
  DndContext,
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface KanbanBoardProps {
  boardId: string;
  onDeleteBoard?: () => void;
}

type SettingsDialog =
  | { kind: "add-column" }
  | { kind: "wip"; columnId: string }
  | { kind: "key" }
  | null;

export function KanbanBoard({ boardId, onDeleteBoard }: KanbanBoardProps) {
  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumn | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [creatingInColumn, setCreatingInColumn] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<SettingsDialog>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const colorSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
  );

  const collisionDetection = useCallback<CollisionDetection>(
    (args) => {
      const activeType = args.active.data.current?.type;

      if (activeType === "column") {
        const columnContainers = args.droppableContainers.filter((container) =>
          columns.some((col) => col.id === container.id),
        );
        return closestCenter({ ...args, droppableContainers: columnContainers });
      }

      const cardContainers = args.droppableContainers.filter((container) => {
        const id = String(container.id);
        return (
          id.startsWith("droppable-") ||
          columns.some((col) => col.id === id) ||
          Boolean(findCard(columns, id))
        );
      });
      return closestCorners({ ...args, droppableContainers: cardContainers });
    },
    [columns],
  );

  async function loadBoard() {
    const data = await api.getBoard(boardId);
    setBoard(data);
    setColumns(data.columns || []);
  }

  useEffect(() => {
    Promise.all([loadBoard(), api.me().then(setCurrentUser)]).finally(() => setLoading(false));
  }, [boardId]);

  const visibleCardsByColumn = useMemo(() => {
    const map = new Map<string, KanbanCard[]>();
    for (const column of columns) {
      map.set(
        column.id,
        column.cards.filter((card) => matchesFilters(card, filters, currentUser?.id ?? null)),
      );
    }
    return map;
  }, [columns, filters, currentUser]);

  const availableLabels = useMemo(
    () =>
      [...new Set(columns.flatMap((column) => column.cards.flatMap((card) => card.labels)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [columns],
  );

  function handleDragStart(event: DragStartEvent) {
    const type = event.active.data.current?.type;
    const activeId = String(event.active.id);

    if (type === "column") {
      const column = columns.find((col) => col.id === activeId);
      if (column) setActiveColumn(column);
      return;
    }

    if (type === "card") {
      const found = findCard(columns, activeId);
      if (found) setActiveCard(found.card);
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const type = active.data.current?.type;
    if (type !== "card") return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const source = findCard(columns, activeId);
    const targetColumnId = resolveColumnId(columns, overId);
    if (!source || !targetColumnId || source.column.id === targetColumnId) {
      return;
    }

    const nextColumns = moveCardInColumns(columns, activeId, overId);
    if (nextColumns) {
      setColumns(nextColumns);
    }
  }

  function clearDragState() {
    setActiveCard(null);
    setActiveColumn(null);
  }

  async function persistColumnOrder(nextColumns: KanbanColumn[]) {
    try {
      const updated = await api.reorderBoard(boardId, {
        columns: nextColumns.map((col, index) => ({
          id: col.id,
          position: index,
        })),
      });
      setColumns(updated.columns || nextColumns);
    } catch {
      await loadBoard();
    }
  }

  async function persistCardOrder(nextColumns: KanbanColumn[]) {
    try {
      const updated = await api.reorderBoard(boardId, {
        cards: nextColumns.flatMap((column) =>
          column.cards.map((card) => ({
            id: card.id,
            column_id: column.id,
            position: card.position,
          })),
        ),
      });
      setColumns(updated.columns || nextColumns);
    } catch {
      await loadBoard();
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const type = active.data.current?.type;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : null;

    clearDragState();

    if (!overId) return;

    if (type === "column") {
      const targetColumnId = resolveColumnId(columns, overId);
      if (!targetColumnId) return;

      const nextColumns = reorderColumns(columns, activeId, targetColumnId);
      if (!nextColumns) return;

      setColumns(nextColumns);
      await persistColumnOrder(nextColumns);
      return;
    }

    if (type === "card") {
      const nextColumns = moveCardInColumns(columns, activeId, overId) ?? columns;
      setColumns(nextColumns);
      await persistCardOrder(nextColumns);
    }
  }

  function handleDragCancel(_event: DragCancelEvent) {
    clearDragState();
    void loadBoard();
  }

  function replaceCard(updated: KanbanCard) {
    setColumns((prev) =>
      prev.map((column) => ({
        ...column,
        cards: column.cards.map((card) =>
          card.id === updated.id ? { ...card, ...updated, comment_count: card.comment_count } : card,
        ),
      })),
    );
  }

  async function handleCreateIssue(columnId: string, title: string, issueType: IssueType) {
    const card = await api.createCard({ column: columnId, title, issue_type: issueType });
    setColumns((prev) =>
      prev.map((column) =>
        column.id === columnId ? { ...column, cards: [...column.cards, card] } : column,
      ),
    );
  }

  async function handleUpdateCard(cardId: string, patch: CardPatch) {
    const updated = await api.updateCard(cardId, patch);
    if (patch.column) {
      // Status changes move the card, so refetch to get the new ordering.
      await loadBoard();
    } else {
      replaceCard(updated);
    }
  }

  async function handleDeleteCard(cardId: string) {
    if (!confirm("Delete this issue? This can't be undone.")) return;
    await api.deleteCard(cardId);
    setOpenCardId(null);
    setColumns((prev) =>
      prev.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => card.id !== cardId),
      })),
    );
  }

  function handleCommentCountChange(cardId: string, count: number) {
    setColumns((prev) =>
      prev.map((column) => ({
        ...column,
        cards: column.cards.map((card) =>
          card.id === cardId ? { ...card, comment_count: count } : card,
        ),
      })),
    );
  }

  async function handleSaveTitle(title: string) {
    const updated = await api.updateBoard(boardId, { title });
    setBoard((prev) => (prev ? { ...prev, title: updated.title } : prev));
  }

  async function handleDeleteColumn(columnId: string) {
    if (!confirm("Delete this column? Tickets in it will be deleted.")) return;
    await api.deleteColumn(boardId, columnId);
    await loadBoard();
  }

  function handleColumnColorChange(columnId: string, color: string) {
    setColumns((prev) =>
      prev.map((column) => (column.id === columnId ? { ...column, color } : column)),
    );

    const timers = colorSaveTimers.current;
    if (timers[columnId]) {
      clearTimeout(timers[columnId]);
    }

    timers[columnId] = setTimeout(async () => {
      try {
        await api.updateColumn(boardId, columnId, { color });
      } catch {
        await loadBoard();
      }
    }, 350);
  }

  useEffect(() => {
    const timers = colorSaveTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  function openDialog(next: NonNullable<SettingsDialog>) {
    setDialogError(null);
    if (next.kind === "wip") {
      const column = columns.find((col) => col.id === next.columnId);
      setDialogValue(column?.wip_limit?.toString() ?? "");
    } else if (next.kind === "key") {
      setDialogValue(board?.key ?? "");
    } else {
      setDialogValue("");
    }
    setDialog(next);
  }

  async function handleDialogSubmit(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    setDialogError(null);
    try {
      if (dialog.kind === "add-column") {
        if (!dialogValue.trim()) return;
        await api.createColumn(boardId, dialogValue.trim());
        await loadBoard();
      } else if (dialog.kind === "wip") {
        const value = dialogValue.trim() === "" ? null : Number(dialogValue);
        if (value !== null && (!Number.isInteger(value) || value < 1)) {
          setDialogError("Enter a whole number of 1 or more, or leave it empty for no limit.");
          return;
        }
        await api.updateColumn(boardId, dialog.columnId, { wip_limit: value });
        setColumns((prev) =>
          prev.map((column) =>
            column.id === dialog.columnId ? { ...column, wip_limit: value } : column,
          ),
        );
      } else {
        await api.updateBoard(boardId, { key: dialogValue.trim().toUpperCase() });
        await loadBoard();
      }
      setDialog(null);
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (loading) {
    return (
      <div className="px-4 pb-10 pt-6 md:px-6">
        <Skeleton className="mb-3 h-4 w-40" />
        <Skeleton className="mb-6 h-9 w-72" />
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-[280px] shrink-0 rounded-[22px]" />
          ))}
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <p className="px-4 py-10 text-sm text-red-500 md:px-6">Board not found.</p>
    );
  }

  const activeColumnForCard = activeCard
    ? columns.find((column) => column.id === activeCard.column_id)
    : undefined;
  const activeCompletedColumn = activeColumnForCard
    ? isCompletedColumn(activeColumnForCard, columns)
    : false;
  const totalCards = columns.reduce((n, c) => n + c.cards.length, 0);
  const matchCount = [...visibleCardsByColumn.values()].reduce((n, cards) => n + cards.length, 0);
  const columnIds = columns.map((col) => col.id);
  const openCard = openCardId ? findCard(columns, openCardId)?.card ?? null : null;
  const wipColumn =
    dialog?.kind === "wip" ? columns.find((col) => col.id === dialog.columnId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 md:px-6">
      <BoardHeader
        title={board.title}
        boardKey={board.key}
        linkedProjects={board.linked_projects}
        editingTitle={editingTitle}
        onStartEditTitle={() => setEditingTitle(true)}
        onCancelEditTitle={() => setEditingTitle(false)}
        onSaveTitle={handleSaveTitle}
        onCreateIssue={() => columns[0] && setCreatingInColumn(columns[0].id)}
        onAddColumn={() => openDialog({ kind: "add-column" })}
        onEditKey={() => openDialog({ kind: "key" })}
        onDeleteBoard={onDeleteBoard}
      />

      <BoardToolbar
        filters={filters}
        onChange={setFilters}
        currentUser={currentUser}
        availableLabels={availableLabels}
        matchCount={matchCount}
        totalCount={totalCards}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.08 }}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={columnIds} strategy={horizontalListSortingStrategy}>
            <div className="kanban-board-scroll min-h-0 min-w-0 flex-1">
              <div className="flex w-max min-h-full items-start gap-3 pb-1 pr-1">
                <AnimatePresence mode="sync">
                  {columns.map((column, index) => (
                    <KanbanColumnView
                      key={column.id}
                      column={column}
                      allColumns={columns}
                      visibleCards={visibleCardsByColumn.get(column.id) ?? []}
                      index={index}
                      creating={creatingInColumn === column.id}
                      onOpenCreate={setCreatingInColumn}
                      onCloseCreate={() => setCreatingInColumn(null)}
                      onCreateIssue={handleCreateIssue}
                      onCardClick={setOpenCardId}
                      onColorChange={handleColumnColorChange}
                      onEditWipLimit={(columnId) => openDialog({ kind: "wip", columnId })}
                      onDeleteColumn={columns.length > 1 ? handleDeleteColumn : undefined}
                    />
                  ))}
                </AnimatePresence>
                <button
                  type="button"
                  onClick={() => openDialog({ kind: "add-column" })}
                  aria-label="Add column"
                  title="Add column"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--border-strong)] text-lg text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-light)] hover:text-[var(--accent)]"
                >
                  +
                </button>
              </div>
            </div>
          </SortableContext>

          <DragOverlay
            dropAnimation={{ duration: 200, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}
            style={{ cursor: "grabbing" }}
          >
            {activeCard ? (
              <KanbanCardPreview
                card={activeCard}
                isCompletedColumn={activeCompletedColumn}
                className="w-[264px] rotate-2 shadow-xl ring-2 ring-[var(--accent)]/25"
              />
            ) : activeColumn ? (
              <KanbanColumnPreview
                column={activeColumn}
                className="rotate-1 ring-2 ring-[var(--accent)]/15"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </motion.div>

      <AnimatePresence>
        {openCard && (
          <IssueDetail
            key={openCard.id}
            card={openCard}
            boardKey={board.key}
            columns={columns}
            currentUser={currentUser}
            onClose={() => setOpenCardId(null)}
            onUpdate={(patch) => handleUpdateCard(openCard.id, patch)}
            onDelete={openCard.milestone_id ? undefined : () => handleDeleteCard(openCard.id)}
            onCommentCountChange={(count) => handleCommentCountChange(openCard.id, count)}
          />
        )}
      </AnimatePresence>

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={
          dialog?.kind === "wip"
            ? `Column limit · ${wipColumn?.name ?? ""}`
            : dialog?.kind === "key"
              ? "Change issue key"
              : "Add column"
        }
      >
        <form onSubmit={handleDialogSubmit} className="space-y-4">
          {dialog?.kind === "wip" ? (
            <Input
              label="Maximum Tickets"
              type="number"
              min={1}
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              placeholder="No limit"
              autoFocus
            />
          ) : dialog?.kind === "key" ? (
            <Input
              label="Key"
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="e.g. TT"
              required
              autoFocus
            />
          ) : (
            <Input
              label="Column name"
              value={dialogValue}
              onChange={(e) => setDialogValue(e.target.value)}
              placeholder="e.g. In Review, Blocked..."
              required
              autoFocus
            />
          )}
          <p className="font-mono text-[11px] text-[var(--muted)]">
            {dialog?.kind === "wip"
              ? "The column turns red when it holds more tickets than this. Leave empty for no limit."
              : dialog?.kind === "key"
                ? `Every ticket on this board is renamed, e.g. ${dialogValue || "KEY"}-1. 2-10 letters or digits, starting with a letter.`
                : "New columns are added to the right of the board."}
          </p>
          {dialogError && <p className="text-xs text-red-500">{dialogError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
