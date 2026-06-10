"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Board, Project, ProjectStatus } from "@/lib/types";
import { FormEvent, useState } from "react";

interface ProjectFormProps {
  initial?: Partial<Project>;
  boards?: Board[];
  onSubmit: (data: {
    name: string;
    description: string;
    status: ProjectStatus;
    due_date: string | null;
    board: string | null;
  }) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}

export function ProjectForm({
  initial,
  boards = [],
  onSubmit,
  onCancel,
  submitLabel = "Save",
}: ProjectFormProps) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [status, setStatus] = useState<ProjectStatus>(
    initial?.status || "planning",
  );
  const [dueDate, setDueDate] = useState(initial?.due_date || "");
  const [boardId, setBoardId] = useState(initial?.board || "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      await onSubmit({
        name,
        description,
        status,
        due_date: dueDate || null,
        board: boardId || null,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
      />
      <Select
        label="Status"
        value={status}
        onChange={(e) => setStatus(e.target.value as ProjectStatus)}
      >
        <option value="planning">Planning</option>
        <option value="active">Active</option>
        <option value="on_hold">On Hold</option>
        <option value="completed">Completed</option>
      </Select>
      <Input
        label="Due date"
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
      {boards.length > 0 && (
        <Select
          label="Linked board"
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
        >
          <option value="">None</option>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.title}
            </option>
          ))}
        </Select>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
