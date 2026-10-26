import Link from "next/link";
import type { ReactNode } from "react";

/** Shared max width + gutters; matches the top nav so page edges line up. */
export const PAGE_CONTAINER = "mx-auto w-full max-w-[1400px] px-4 md:px-6";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  /** Small chips rendered inline after the title. */
  tags?: ReactNode;
}

export function PageHeader({ title, description, actions, back, tags }: PageHeaderProps) {
  return (
    <header className={`${PAGE_CONTAINER} pb-5 pt-6`}>
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <Link href="/dashboard" className="transition-colors hover:text-[var(--foreground)]">
          TechThrive
        </Link>
        <span className="text-[var(--muted-light)]">/</span>
        {back && (
          <>
            <Link href={back.href} className="transition-colors hover:text-[var(--foreground)]">
              {back.label.replace(/^(back to|←)\s*/i, "")}
            </Link>
            <span className="text-[var(--muted-light)]">/</span>
          </>
        )}
        <span className="truncate text-[var(--foreground)]">{title}</span>
      </nav>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-[2.5rem]">
              {title}
            </h1>
            {tags && <div className="flex flex-wrap items-center gap-1.5">{tags}</div>}
          </div>
          {description && (
            <div className="mt-2 max-w-3xl text-sm text-[var(--muted)]">{description}</div>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
