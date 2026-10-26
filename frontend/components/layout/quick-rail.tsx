"use client";

import { DocsIcon, KanbanIcon, PlansIcon } from "@/components/icons/nav-icons";
import { api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";

const railButton =
  "group relative flex h-10 w-10 items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-white/10 hover:text-[var(--ink-fg)] disabled:opacity-50";

function RailTip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-[var(--ink)] px-2 py-1 text-[11px] font-medium text-[var(--ink-fg)] opacity-0 transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

function RailLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link href={href} aria-label={label} className={railButton}>
      {children}
      <RailTip label={label} />
    </Link>
  );
}

/** Floating vertical action rail pinned to the left edge (desktop only). */
export function QuickRail() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  // False during SSR/hydration so the theme icon doesn't mismatch.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [creating, setCreating] = useState(false);

  const isDark = mounted && resolvedTheme === "dark";

  async function handleNewDoc() {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    setCreating(true);
    try {
      const doc = await api.createDoc();
      router.push(`/docs/${doc.id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <motion.aside
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="fixed left-4 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-[var(--ink)] p-1.5 shadow-[0_12px_32px_-12px_rgba(17,18,22,0.6)] xl:flex"
    >
      <button
        type="button"
        onClick={handleNewDoc}
        disabled={creating}
        aria-label="New doc"
        className={cn(railButton, "bg-white/10 text-[var(--ink-fg)]")}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
        <RailTip label="New doc" />
      </button>
      <RailLink href="/dashboard/kanban" label="Boards">
        <KanbanIcon className="h-4 w-4" />
      </RailLink>
      <RailLink href="/docs" label="Docs">
        <DocsIcon className="h-4 w-4" />
      </RailLink>
      <RailLink href="/plans" label="Plans">
        <PlansIcon className="h-4 w-4" />
      </RailLink>
      <span className="my-1 h-px w-5 bg-white/10" />
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        className={railButton}
      >
        {isDark ? (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
        <RailTip label={isDark ? "Light mode" : "Dark mode"} />
      </button>
    </motion.aside>
  );
}
