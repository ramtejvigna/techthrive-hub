"use client";

import { KanbanBoard } from "@/components/kanban/kanban-board";
import { api } from "@/lib/api";
import { useParams, useRouter } from "next/navigation";

export default function KanbanBoardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this board and all its cards?")) return;
    await api.deleteBoard(params.id);
    router.push("/dashboard/kanban");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <KanbanBoard boardId={params.id} onDeleteBoard={handleDelete} />
    </div>
  );
}
