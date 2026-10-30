"use client";

import {
  CanvasIcon,
  DocsIcon,
  HomeIcon,
  KanbanIcon,
  LogoutIcon,
  PlansIcon,
  ProjectsIcon,
} from "@/components/icons/nav-icons";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { api } from "@/lib/api";
import { useCurrentUser, useDashboardSummary } from "@/lib/queries";
import type { DashboardSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore, type ComponentType, type SVGProps } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  match: (pathname: string) => boolean;
  count?: (summary: DashboardSummary) => number;
};

const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: HomeIcon,
    match: (pathname) => pathname === "/dashboard",
  },
  {
    href: "/dashboard/projects",
    label: "Projects",
    icon: ProjectsIcon,
    match: (pathname) => pathname.startsWith("/dashboard/projects"),
    count: (summary) => summary.active_projects,
  },
  {
    href: "/dashboard/kanban",
    label: "Kanban",
    icon: KanbanIcon,
    match: (pathname) => pathname.startsWith("/dashboard/kanban"),
    count: (summary) => summary.total_boards,
  },
  {
    href: "/docs",
    label: "Docs",
    icon: DocsIcon,
    match: (pathname) => pathname.startsWith("/docs"),
  },
  {
    href: "/canvas",
    label: "Canvas",
    icon: CanvasIcon,
    match: (pathname) => pathname.startsWith("/canvas"),
  },
  {
    href: "/plans",
    label: "Plans",
    icon: PlansIcon,
    match: (pathname) => pathname.startsWith("/plans"),
  },
];

export function initialsFor(email: string | undefined): string {
  if (!email) return "TT";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase();
}

function subscribeToClock(onTick: () => void) {
  const timer = setInterval(onTick, 15_000);
  return () => clearInterval(timer);
}

const readClock = () =>
  new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function Clock() {
  const time = useSyncExternalStore(subscribeToClock, readClock, () => "--:--");

  return (
    <span className="chip hidden font-mono tabular-nums lg:inline-flex">
      <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
      {time}
    </span>
  );
}

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: summary } = useDashboardSummary();
  const { data: user } = useCurrentUser();

  async function handleLogout() {
    await api.logout();
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="z-30 shrink-0 pt-4 xl:pl-16">
      {/* Same max width and gutters as page content so the edges line up. */}
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 md:grid-cols-[1fr_auto_1fr] md:px-6">
        <Link href="/dashboard" className="flex items-center gap-2.5 justify-self-start">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ink)] ring-1 ring-white/10 font-mono text-xs font-bold text-[var(--ink-fg)]">
            TT
          </span>
          <span className="hidden leading-tight sm:block">
            <span className="block text-sm font-semibold tracking-tight">TechThrive</span>
            <span className="block text-[11px] text-[var(--muted)]">Workspace</span>
          </span>
        </Link>

        <nav className="no-scrollbar flex min-w-0 max-w-full justify-self-center items-center gap-1 overflow-x-auto rounded-full bg-[var(--ink)] p-1.5 shadow-[0_8px_24px_-10px_rgba(17,18,22,0.5)]">
          {navItems.map((item) => {
            const active = item.match(pathname);
            const count = summary && item.count ? item.count(summary) : 0;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                  active
                    ? "text-[var(--ink)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink-fg)]",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="top-nav-active"
                    className="absolute inset-0 rounded-full bg-[var(--ink-fg)]"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="relative h-4 w-4 md:hidden" />
                <span className="relative hidden md:inline">{item.label}</span>
                {count > 0 && (
                  <span className="relative flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 font-mono text-[10px] font-semibold text-white">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 justify-self-end">
          <Clock />
          <NotificationCenter />
          <span
            title={user?.email}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-xs font-semibold text-[var(--foreground)]"
          >
            {initialsFor(user?.email)}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
