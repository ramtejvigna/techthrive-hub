"use client";

import { DocsIcon, HomeIcon, PlansIcon } from "@/components/icons/nav-icons";
import { ThemeToggleCompact } from "@/components/theme-toggle-compact";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, SVGProps } from "react";

const links: {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  match: (pathname: string) => boolean;
}[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: HomeIcon,
    match: (pathname) => pathname.startsWith("/dashboard"),
  },
  {
    href: "/docs",
    label: "Docs",
    icon: DocsIcon,
    match: (pathname) => pathname.startsWith("/docs"),
  },
  {
    href: "/plans",
    label: "Plans",
    icon: PlansIcon,
    match: (pathname) => pathname.startsWith("/plans"),
  },
];

export function ContentNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-3 md:px-8">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="tech-frame flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-light)] ring-1 ring-[var(--accent)]/20">
            <span className="font-mono text-[10px] font-bold text-[var(--accent)]">TT</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-[var(--foreground)]">
            TechThrive
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = link.match(pathname);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-fg)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]",
                )}
              >
                <Icon className={cn("h-4 w-4", active && "text-[var(--accent)]")} />
                <span className="hidden sm:inline">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <ThemeToggleCompact />
      </div>
    </header>
  );
}
