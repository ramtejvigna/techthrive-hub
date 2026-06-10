import type { KanbanCard, KanbanColumn } from "@/lib/types";
import { arrayMove } from "@dnd-kit/sortable";

export function findCard(columns: KanbanColumn[], cardId: string) {
  for (const column of columns) {
    const card = column.cards.find((item) => item.id === cardId);
    if (card) return { card, column };
  }
  return null;
}

export function resolveColumnId(columns: KanbanColumn[], overId: string): string | null {
  if (overId.startsWith("droppable-")) {
    return overId.slice("droppable-".length);
  }
  if (columns.some((col) => col.id === overId)) {
    return overId;
  }
  const viaCard = findCard(columns, overId);
  return viaCard?.column.id ?? null;
}

export function cloneColumns(columns: KanbanColumn[]): KanbanColumn[] {
  return columns.map((column) => ({
    ...column,
    cards: [...column.cards],
  }));
}

export function normalizeCardPositions(columns: KanbanColumn[]) {
  columns.forEach((column) => {
    column.cards.forEach((card, index) => {
      card.position = index;
      card.column_id = column.id;
    });
  });
}

/** Move a card between columns or within a column (used during drag and on drop). */
export function moveCardInColumns(
  columns: KanbanColumn[],
  activeId: string,
  overId: string,
): KanbanColumn[] | null {
  const source = findCard(columns, activeId);
  if (!source) return null;

  const targetColumnId = resolveColumnId(columns, overId);
  if (!targetColumnId) return null;

  const nextColumns = cloneColumns(columns);
  const sourceColumn = nextColumns.find((col) => col.id === source.column.id);
  const targetColumn = nextColumns.find((col) => col.id === targetColumnId);
  if (!sourceColumn || !targetColumn) return null;

  const activeIndex = sourceColumn.cards.findIndex((c) => c.id === activeId);
  if (activeIndex === -1) return null;

  if (source.column.id === targetColumnId) {
    const overCard = findCard(columns, overId);
    if (!overCard || overCard.column.id !== targetColumnId) {
      // Dropped on bucket body — position already set (e.g. after onDragOver).
      return nextColumns;
    }
    const overIndex = sourceColumn.cards.findIndex((c) => c.id === overId);
    if (overIndex === -1 || activeIndex === overIndex) {
      return null;
    }
    sourceColumn.cards = arrayMove(sourceColumn.cards, activeIndex, overIndex);
  } else {
    const [movedCard] = sourceColumn.cards.splice(activeIndex, 1);
    movedCard.column_id = targetColumn.id;

    let insertIndex = targetColumn.cards.length;
    const overCard = findCard(columns, overId);
    if (overCard && overCard.column.id === targetColumnId) {
      insertIndex = targetColumn.cards.findIndex((c) => c.id === overId);
    }
    targetColumn.cards.splice(insertIndex, 0, movedCard);
  }

  normalizeCardPositions(nextColumns);
  return nextColumns;
}

export function reorderColumns(
  columns: KanbanColumn[],
  activeId: string,
  overId: string,
): KanbanColumn[] | null {
  const oldIndex = columns.findIndex((col) => col.id === activeId);
  const newIndex = columns.findIndex((col) => col.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return null;
  }

  return arrayMove(columns, oldIndex, newIndex).map((col, index) => ({
    ...col,
    position: index,
  }));
}
