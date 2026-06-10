"use client";

import { BoardHeader } from "@/components/kanban/board-header";
import { KanbanCardPreview } from "@/components/kanban/kanban-card";
import {
  KanbanColumn as KanbanColumnView,
  KanbanColumnPreview,
} from "@/components/kanban/kanban-column";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  findCard,
  moveCardInColumns,
  reorderColumns,
  resolveColumnId,
} from "@/lib/kanban-dnd";
import { getColumnTheme } from "@/lib/kanban-themes";
import type { Board, CardPriority, KanbanCard, KanbanColumn } from "@/lib/types";
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
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

interface KanbanBoardProps {
  boardId: string;
  onDeleteBoard?: () => void;
}

export function KanbanBoard({ boardId, onDeleteBoard }: KanbanBoardProps) {
  const [board, setBoard] = useState<Board | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [activeCard, setActiveCard] = useState<KanbanCard | null>(null);
  const [activeColumn, setActiveColumn] = useState<KanbanColumn | null>(null);
  const [loading, setLoading] = useState(true);
  const [addCardColumnId, setAddCardColumnId] = useState<string | null>(null);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [cardTitle, setCardTitle] = useState("");
  const [cardDescription, setCardDescription] = useState("");
  const [cardPriority, setCardPriority] = useState<CardPriority>("medium");
  const [cardDueDate, setCardDueDate] = useState("");
  const [editCard, setEditCard] = useState<KanbanCard | null>(null);
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
    loadBoard().finally(() => setLoading(false));
  }, [boardId]);

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

  async function handleAddCard(event: FormEvent) {
    event.preventDefault();
    if (!addCardColumnId || !cardTitle.trim()) return;

    await api.createCard({
      column: addCardColumnId,
      title: cardTitle.trim(),
      description: cardDescription,
      priority: cardPriority,
      due_date: cardDueDate || null,
    });

    resetCardForm();
    await loadBoard();
  }

  async function handleUpdateCard(event: FormEvent) {
    event.preventDefault();
    if (!editCard || !cardTitle.trim()) return;

    await api.updateCard(editCard.id, {
      title: cardTitle.trim(),
      description: cardDescription,
      priority: cardPriority,
      due_date: cardDueDate || null,
    });

    resetCardForm();
    await loadBoard();
  }

  async function handleDeleteCard() {
    if (!editCard || !confirm("Delete this card?")) return;
    await api.deleteCard(editCard.id);
    setEditCard(null);
    await loadBoard();
  }

  async function handleAddColumn(event: FormEvent) {
    event.preventDefault();
    if (!newColumnName.trim()) return;
    await api.createColumn(boardId, newColumnName.trim());
    setNewColumnName("");
    setAddColumnOpen(false);
    await loadBoard();
  }

  async function handleSaveTitle(title: string) {
    const updated = await api.updateBoard(boardId, { title });
    setBoard(updated);
  }

  async function handleDeleteColumn(columnId: string) {
    if (!confirm("Remove this bucket? Cards in it will be deleted.")) return;
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

  function resetCardForm() {
    setAddCardColumnId(null);
    setEditCard(null);
    setCardTitle("");
    setCardDescription("");
    setCardPriority("medium");
    setCardDueDate("");
  }

  function openEditCard(cardId: string) {
    const found = findCard(columns, cardId);
    if (!found) return;
    setEditCard(found.card);
    setCardTitle(found.card.title);
    setCardDescription(found.card.description || "");
    setCardPriority(found.card.priority || "medium");
    setCardDueDate(found.card.due_date || "");
  }

  function openAddCard(columnId: string) {
    resetCardForm();
    setAddCardColumnId(columnId);
  }

  if (loading) {
    return (
      <div className="px-6 pb-10 pt-8 md:px-8">
        <Skeleton className="mb-6 h-10 w-64" />
        <div className="flex gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-80 w-[272px] shrink-0 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <p className="px-6 py-10 text-sm text-red-500 md:px-8">Board not found.</p>
    );
  }

  const activeColumnForTheme = activeCard
    ? columns.find((column) => column.id === activeCard.column_id)
    : activeColumn ?? columns[0];
  const activeTheme = getColumnTheme(
    activeColumnForTheme ?? { id: "default", color: "#64748b" },
  );
  const totalCards = columns.reduce((n, c) => n + c.cards.length, 0);
  const columnIds = columns.map((col) => col.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-4 md:px-8">
      <BoardHeader
        title={board.title}
        columnCount={columns.length}
        cardCount={totalCards}
        linkedProjects={board.linked_projects}
        editingTitle={editingTitle}
        onStartEditTitle={() => setEditingTitle(true)}
        onCancelEditTitle={() => setEditingTitle(false)}
        onSaveTitle={handleSaveTitle}
        onAddBucket={() => setAddColumnOpen(true)}
        onDeleteBoard={onDeleteBoard}
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
              <div className="flex w-max min-h-full gap-3 pb-1 pr-1">
                <AnimatePresence mode="sync">
                  {columns.map((column, index) => (
                    <KanbanColumnView
                      key={column.id}
                      column={column}
                      index={index}
                      onAddCard={openAddCard}
                      onCardClick={openEditCard}
                      onColorChange={handleColumnColorChange}
                      onDeleteColumn={columns.length > 1 ? handleDeleteColumn : undefined}
                    />
                  ))}
                </AnimatePresence>
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
                theme={activeTheme}
                className="w-[248px] rotate-1 shadow-xl ring-2 ring-[var(--accent)]/15"
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

      <CardFormModal
        open={Boolean(addCardColumnId)}
        onClose={resetCardForm}
        title="New page"
        cardTitle={cardTitle}
        setCardTitle={setCardTitle}
        cardDescription={cardDescription}
        setCardDescription={setCardDescription}
        cardPriority={cardPriority}
        setCardPriority={setCardPriority}
        cardDueDate={cardDueDate}
        setCardDueDate={setCardDueDate}
        onSubmit={handleAddCard}
        submitLabel="Create"
      />

      <CardFormModal
        open={Boolean(editCard)}
        onClose={resetCardForm}
        title={editCard?.milestone_id ? "Project milestone" : "Edit page"}
        cardTitle={cardTitle}
        setCardTitle={setCardTitle}
        cardDescription={cardDescription}
        setCardDescription={setCardDescription}
        cardPriority={cardPriority}
        setCardPriority={setCardPriority}
        cardDueDate={cardDueDate}
        setCardDueDate={setCardDueDate}
        onSubmit={handleUpdateCard}
        submitLabel="Save"
        onDelete={editCard?.milestone_id ? undefined : handleDeleteCard}
        isMilestone={Boolean(editCard?.milestone_id)}
        projectName={editCard?.project_name}
      />

      <Modal
        open={addColumnOpen}
        onClose={() => setAddColumnOpen(false)}
        title="Add bucket"
      >
        <form onSubmit={handleAddColumn} className="space-y-4">
          <Input
            label="Bucket name"
            value={newColumnName}
            onChange={(e) => setNewColumnName(e.target.value)}
            placeholder="e.g. In review, Blocked..."
            required
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddColumnOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add bucket</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CardFormModal({
  open,
  onClose,
  title,
  cardTitle,
  setCardTitle,
  cardDescription,
  setCardDescription,
  cardPriority,
  setCardPriority,
  cardDueDate,
  setCardDueDate,
  onSubmit,
  submitLabel,
  onDelete,
  isMilestone,
  projectName,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  cardTitle: string;
  setCardTitle: (v: string) => void;
  cardDescription: string;
  setCardDescription: (v: string) => void;
  cardPriority: CardPriority;
  setCardPriority: (v: CardPriority) => void;
  cardDueDate: string;
  setCardDueDate: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel: string;
  onDelete?: () => void;
  isMilestone?: boolean;
  projectName?: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="space-y-4">
        {isMilestone && (
          <p className="rounded-lg bg-[var(--accent-light)] px-3 py-2 text-xs text-[var(--accent)]">
            Linked to {projectName || "project"} — drag between buckets to update status.
          </p>
        )}
        <Input label="Title" value={cardTitle} onChange={(e) => setCardTitle(e.target.value)} required />
        {!isMilestone && (
          <Textarea label="Description" value={cardDescription} onChange={(e) => setCardDescription(e.target.value)} rows={3} />
        )}
        {!isMilestone && (
          <Select label="Priority" value={cardPriority} onChange={(e) => setCardPriority(e.target.value as CardPriority)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        )}
        <Input label="Due date" type="date" value={cardDueDate} onChange={(e) => setCardDueDate(e.target.value)} />
        <div className={`flex ${onDelete ? "justify-between" : "justify-end"} gap-2`}>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>Delete</Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit">{submitLabel}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
