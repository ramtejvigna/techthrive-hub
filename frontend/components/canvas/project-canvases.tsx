"use client";

import { CanvasCard } from "@/components/canvas/canvas-card";
import { api } from "@/lib/api";
import { queryKeys, useCanvases } from "@/lib/queries";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectCanvases({ projectId }: { projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: canvases = [] } = useCanvases("", projectId);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    setCreating(true);
    try {
      const canvas = await api.createCanvas({ project: projectId });
      void queryClient.invalidateQueries({ queryKey: queryKeys.canvases.lists() });
      router.push(`/canvas/${canvas.id}`);
    } catch {
      setCreating(false);
    }
  }

  return (
    <section aria-label="Canvases" className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Canvases</h2>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          className="chip disabled:cursor-wait disabled:opacity-70"
        >
          {creating ? "Creating..." : "New canvas"}
        </button>
      </div>
      {canvases.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          No canvases yet. Sketch an architecture or mind map for this project.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
          {canvases.map((canvas) => (
            <li key={canvas.id}>
              <CanvasCard canvas={canvas} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
