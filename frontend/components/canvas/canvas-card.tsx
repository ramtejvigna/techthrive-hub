import { CanvasIcon } from "@/components/icons/nav-icons";
import type { CanvasListItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

interface CanvasCardProps {
  canvas: CanvasListItem;
  /** Extra controls, pinned to the corner of the card. */
  actions?: ReactNode;
}

export function CanvasCard({ canvas, actions }: CanvasCardProps) {
  return (
    <div className="panel group relative h-full transition-colors hover:border-[var(--border-strong)]">
      <Link href={`/canvas/${canvas.id}`} className="block">
        <div className="flex h-40 items-center justify-center overflow-hidden rounded-t-[22px] bg-[var(--surface-muted)]">
          {canvas.thumbnail ? (
            // A data URL, and an <img> so nothing in it can run as a document.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={canvas.thumbnail}
              alt=""
              className="h-full w-full bg-white object-contain transition-transform duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <CanvasIcon className="h-8 w-8 text-[var(--muted-light)]" />
          )}
        </div>
        <div className="px-4 pb-4 pt-3">
          <p className="truncate pr-7 text-sm font-semibold text-[var(--foreground)]">{canvas.title}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
            {canvas.project_name ? `${canvas.project_name} · ` : ""}
            Edited {formatDate(canvas.updated_at)}
          </p>
        </div>
      </Link>
      {actions && <div className="absolute bottom-3 right-2">{actions}</div>}
    </div>
  );
}
