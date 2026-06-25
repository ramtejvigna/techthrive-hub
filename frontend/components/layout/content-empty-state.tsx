import Link from "next/link";

interface ContentEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}

export function ContentEmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: ContentEmptyStateProps) {
  return (
    <div className="tech-frame flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface)] py-20 text-center">
      <p className="mt-2 text-lg font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-1 max-w-sm font-mono text-xs text-[var(--muted)]">{description}</p>
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="btn-tech mt-6 inline-flex items-center justify-center rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-wider"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
