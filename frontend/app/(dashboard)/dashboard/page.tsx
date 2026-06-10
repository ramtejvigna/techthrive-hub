"use client";

import { PageHeader } from "@/components/layout/page-header";
import { FadeIn } from "@/components/motion/fade-in";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { api } from "@/lib/api";
import type { DashboardSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DashboardHomePage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDashboardSummary()
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Overview"
        description="Real-time snapshot of your workspace."
      />
      <div className="space-y-6 px-6 pb-10 md:px-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        ) : summary ? (
          <>
            <FadeIn>
              <p className="font-mono text-xs text-[var(--muted)]">
                <span className="text-emerald-600">●</span> workspace.sync() →{" "}
                <span className="text-[var(--foreground)]">OK</span>
                <span className="mx-2 text-[var(--border-strong)]">·</span>
                {summary.total_projects} projects · {summary.total_boards} boards
              </p>
            </FadeIn>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Active projects"
                value={summary.active_projects}
                accent="blue"
                delay={0}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h10" />
                  </svg>
                }
              />
              <StatCard
                label="Overdue milestones"
                value={summary.overdue_milestones}
                accent="amber"
                delay={0.06}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                }
              />
              <StatCard
                label="Total projects"
                value={summary.total_projects}
                accent="cyan"
                delay={0.12}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
                  </svg>
                }
              />
              <StatCard
                label="Kanban boards"
                value={summary.total_boards}
                accent="emerald"
                delay={0.18}
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="3" y="4" width="5" height="16" rx="1" />
                    <rect x="10" y="4" width="5" height="10" rx="1" />
                    <rect x="17" y="4" width="4" height="14" rx="1" />
                  </svg>
                }
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <FadeIn delay={0.1}>
                <Card className="tech-frame">
                  <CardTitle>Activity log</CardTitle>
                  <CardDescription>Recent kanban card updates</CardDescription>
                  <ul className="mt-4 space-y-2">
                    {summary.recent_activity.length === 0 ? (
                      <li className="rounded-lg border border-dashed border-[var(--border)] py-8 text-center font-mono text-xs text-[var(--muted)]">
                        no events recorded
                      </li>
                    ) : (
                      summary.recent_activity.map((item, index) => (
                        <motion.li
                          key={item.id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 + index * 0.05 }}
                        >
                          <Link
                            href={`/dashboard/kanban/${item.board_id}`}
                            className="group flex items-start justify-between gap-4 rounded-lg border border-[var(--border)] px-3.5 py-3 transition-colors duration-150 hover:border-[var(--accent)]/40"
                          >
                            <div>
                              <p className="text-sm font-medium text-[var(--foreground)] group-hover:text-[var(--accent)]">
                                {item.title}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                                {item.board_title} / {item.column_name}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-[10px] text-[var(--muted-light)]">
                              {formatDateTime(item.updated_at)}
                            </span>
                          </Link>
                        </motion.li>
                      ))
                    )}
                  </ul>
                </Card>
              </FadeIn>

              <FadeIn delay={0.15}>
                <Card className="tech-frame">
                  <CardTitle>Integrations</CardTitle>
                  <CardDescription>External service connections</CardDescription>
                  <div className="mt-4 space-y-2">
                    {["Email", "YouTube", "Blog"].map((name, index) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3.5 py-3"
                      >
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 pl-3 text-sm font-medium">{name}</span>
                        <Badge variant="muted">offline</Badge>
                      </div>
                    ))}
                  </div>
                </Card>
              </FadeIn>
            </div>

            <div className="flex gap-6 pt-2">
              <Link
                href="/dashboard/projects"
                className="font-mono text-xs uppercase tracking-wider text-[var(--accent)] hover:underline"
              >
                → projects
              </Link>
              <Link
                href="/dashboard/kanban"
                className="font-mono text-xs uppercase tracking-wider text-[var(--accent)] hover:underline"
              >
                → kanban
              </Link>
            </div>
          </>
        ) : (
          <p className="font-mono text-sm text-red-500">ERR: failed to load dashboard</p>
        )}
      </div>
    </>
  );
}
