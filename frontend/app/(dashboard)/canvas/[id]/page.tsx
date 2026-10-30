"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { useCanvas } from "@/lib/queries";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";

function EditorSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="min-h-0 w-full flex-1 rounded-xl" />
    </div>
  );
}

// Excalidraw can't render on the server, and is too heavy for any other route.
const CanvasEditor = dynamic(
  () => import("@/components/canvas/canvas-editor").then((mod) => mod.CanvasEditor),
  { ssr: false, loading: EditorSkeleton },
);

export default function CanvasPage() {
  const params = useParams<{ id: string }>();
  const { data: canvas, error: loadError } = useCanvas(params.id);
  const error = loadError
    ? loadError instanceof ApiError && loadError.status === 404
      ? "Canvas not found."
      : "Couldn't load this canvas."
    : null;

  if (error) {
    return (
      <div className="px-6 py-10 md:px-8">
        <p className="text-sm text-red-500">{error}</p>
        <Link href="/canvas" className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline">
          ← Back to canvases
        </Link>
      </div>
    );
  }

  if (!canvas) return <EditorSkeleton />;

  // Keyed by id so switching canvases never reuses another canvas's editor state.
  return <CanvasEditor key={canvas.id} canvas={canvas} />;
}
