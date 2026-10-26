"use client";

import { Sparkline } from "@/components/dashboard/sparkline";
import { TimelineStrip, type TimelineEvent } from "@/components/dashboard/timeline-strip";
import { KanbanIcon, ProjectsIcon } from "@/components/icons/nav-icons";
import { FadeIn } from "@/components/motion/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type { Board, DashboardSummary, Project, ProjectStatus, User } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

const DAY = 24 * 60 * 60 * 1000;

const STATUS_META: { key: ProjectStatus; label: string; color: string }[] = [
  { key: "planning", label: "Planning", color: "bg-slate-400" },
  { key: "active", label: "Active", color: "bg-[var(--accent)]" },
  { key: "on_hold", label: "On hold", color: "bg-orange-400" },
  { key: "completed", label: "Completed", color: "bg-emerald-500" },
];

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Best-effort first name from the email; null when it's too long to read as one. */
function firstName(email: string | undefined) {
  const local = email?.split("@")[0]?.split(/[._\-+\d]+/)[0];
  if (!local || local.length > 12) return null;
  return local[0].toUpperCase() + local.slice(1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Running total of items created per day over the last `days` days. */
function cumulativeSeries(dates: string[], days: number) {
  const today = startOfDay(new Date()).getTime();
  const times = dates.map((d) => new Date(d).getTime());
  return Array.from({ length: days }, (_, i) => {
    const end = today - (days - 1 - i) * DAY + DAY;
    return times.filter((t) => t < end).length;
  });
}

/** Count of events per day over the last `days` days. */
function dailySeries(dates: string[], days: number) {
  const today = startOfDay(new Date()).getTime();
  const counts = Array<number>(days).fill(0);
  for (const d of dates) {
    const offset = Math.floor((today - startOfDay(new Date(d)).getTime()) / DAY);
    if (offset >= 0 && offset < days) counts[days - 1 - offset] += 1;
  }
  return counts;
}

function isOverdue(project: Project, now: Date) {
  return Boolean(
    project.due_date && project.status !== "completed" && new Date(project.due_date) < startOfDay(now),
  );
}

function Highlight({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "orange" }) {
  return (
    <span className={tone === "orange" ? "text-orange-500" : "text-[var(--accent)]"}>{children}</span>
  );
}

function TileHeader({ icon, label, dark = false }: { icon: ReactNode; label: string; dark?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full",
          dark ? "bg-white/10 text-[var(--ink-fg)]" : "bg-[var(--surface)] text-[var(--muted)]",
        )}
      >
        {icon}
      </span>
      <span className={cn("text-xs font-medium", dark ? "text-[var(--ink-muted)]" : "text-[var(--muted)]")}>
        {label}
      </span>
    </div>
  );
}

export default function DashboardHomePage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getDashboardSummary().then(setSummary),
      api.getProjects().then(setProjects).catch(() => {}),
      api.getBoards().then(setBoards).catch(() => {}),
      api.me().then(setUser).catch(() => {}),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const derived = useMemo(() => {
    const now = new Date();
    const milestoneTotal = projects.reduce((n, p) => n + (p.milestone_count ?? 0), 0);
    const milestoneDone = projects.reduce((n, p) => n + (p.completed_milestone_count ?? 0), 0);
    const inProgress = projects.reduce((n, p) => n + (p.in_progress_milestone_count ?? 0), 0);
    const dated = projects.filter((p) => p.due_date && p.status !== "completed");
    const onTrack = dated.filter((p) => !isOverdue(p, now)).length;

    const events: TimelineEvent[] = [];
    for (const project of projects) {
      if (project.due_date) {
        events.push({
          id: `p-${project.id}`,
          label: project.name,
          date: new Date(project.due_date),
          state:
            project.status === "completed" ? "done" : isOverdue(project, now) ? "overdue" : "upcoming",
          href: `/dashboard/projects/${project.id}`,
        });
      }
      for (const milestone of project.milestones ?? []) {
        if (!milestone.target_date) continue;
        const date = new Date(milestone.target_date);
        events.push({
          id: `m-${milestone.id}`,
          label: `${project.name} · ${milestone.title}`,
          date,
          state: milestone.completed ? "done" : date < startOfDay(now) ? "overdue" : "upcoming",
          href: `/dashboard/projects/${project.id}`,
        });
      }
    }

    const dueThisWeek = events.filter((e) => {
      const diff = e.date.getTime() - startOfDay(now).getTime();
      return e.state === "upcoming" && diff >= 0 && diff < 7 * DAY;
    }).length;

    return {
      now,
      milestoneTotal,
      milestoneDone,
      inProgress,
      completion: milestoneTotal ? Math.round((milestoneDone / milestoneTotal) * 100) : 0,
      onTrackPct: dated.length ? Math.round((onTrack / dated.length) * 100) : 100,
      datedCount: dated.length,
      events,
      dueThisWeek,
      projectSeries: cumulativeSeries(projects.map((p) => p.created_at), 30),
      cardSeries: boards.map((b) => b.card_count ?? 0),
      totalCards: boards.reduce((n, b) => n + (b.card_count ?? 0), 0),
      activitySeries: dailySeries(summary?.recent_activity.map((a) => a.updated_at) ?? [], 14),
      statusCounts: STATUS_META.map((s) => ({
        ...s,
        count: projects.filter((p) => p.status === s.key).length,
      })),
      deliveryBars: projects
        .filter((p) => (p.milestone_count ?? 0) > 0)
        .slice(0, 14)
        .map((p) => ({
          id: p.id,
          name: p.name,
          total: p.milestone_count ?? 0,
          done: p.completed_milestone_count ?? 0,
        })),
    };
  }, [projects, boards, summary]);

  const name = firstName(user?.email);
  const dateLabel = derived.now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-6 md:px-6">
      {/* Title row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-[var(--muted)]">
            TechThrive <span className="text-[var(--muted-light)]">/</span>{" "}
            <span className="text-[var(--foreground)]">Dashboard</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-4">
            <h1 className="text-3xl font-semibold tracking-tight md:text-[2.5rem]">Dashboard</h1>
            <div className="flex flex-wrap gap-1.5">
              <Link href="/dashboard/projects" className="chip">
                <ProjectsIcon className="h-3.5 w-3.5" /> Projects
                {summary && (
                  <span className="rounded-full bg-orange-500 px-1.5 font-mono text-[10px] text-white">
                    {summary.total_projects}
                  </span>
                )}
              </Link>
              <Link href="/dashboard/kanban" className="chip">
                <KanbanIcon className="h-3.5 w-3.5" /> Boards
              </Link>
            </div>
          </div>
        </div>

        {summary && (
          <div className="panel flex items-center gap-4 px-4 py-2.5">
            <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--muted)]">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500" />
              synced
            </span>
            <div className="text-xs leading-tight">
              <p className="font-medium">{summary.active_projects} projects in flight</p>
              <p className="text-[var(--muted)]">
                {derived.inProgress} milestones in progress · {summary.overdue_milestones} late
              </p>
            </div>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
              <motion.div
                className="h-full rounded-full bg-orange-500"
                initial={{ width: 0 }}
                animate={{ width: `${derived.completion}%` }}
                transition={{ delay: 0.3, duration: 0.7 }}
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-[22px] lg:col-span-2" />
          <Skeleton className="h-64 rounded-[22px]" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-[22px]" />
          ))}
        </div>
      ) : !summary ? (
        <p className="mt-8 font-mono text-sm text-red-500">ERR: failed to load dashboard</p>
      ) : (
        <>
          {/* Hero + delivery */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <FadeIn className="panel flex flex-col p-6 md:p-7 lg:col-span-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-xl">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-orange-500">
                    {dateLabel}
                  </p>
                  <h2 className="mt-2 text-3xl font-medium tracking-tight md:text-4xl">
                    {greeting(derived.now)}
                    {name ? `, ${name}` : ""}.
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
                    <Highlight>{summary.active_projects} projects</Highlight> are in flight across{" "}
                    <Highlight>{summary.total_boards} boards</Highlight>, with{" "}
                    {derived.dueThisWeek} date{derived.dueThisWeek === 1 ? "" : "s"} coming up this week.
                    {summary.overdue_milestones > 0 && (
                      <>
                        {" "}
                        <Link href="/dashboard/projects" className="underline-offset-2 hover:underline">
                          <Highlight tone="orange">
                            {summary.overdue_milestones} milestone
                            {summary.overdue_milestones === 1 ? " needs" : "s need"} attention.
                          </Highlight>
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/dashboard/kanban"
                    className="rounded-full bg-[var(--ink)] px-4 py-2 text-xs font-medium text-[var(--ink-fg)] transition-opacity hover:opacity-85"
                  >
                    Open boards
                  </Link>
                  <Link href="/dashboard/projects" className="chip px-4 py-2">
                    Pipeline
                  </Link>
                </div>
              </div>
              <div className="mt-auto">
                <TimelineStrip events={derived.events} />
              </div>
            </FadeIn>

            <FadeIn delay={0.08} className="panel flex flex-col p-6">
              <div className="flex items-center justify-between">
                <TileHeader
                  label="Milestone delivery"
                  icon={
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                    </svg>
                  }
                />
                <span className="chip py-1 text-[11px]">{projects.length} projects</span>
              </div>
              <p className="mt-4 text-4xl font-semibold tabular-nums tracking-tight">
                {derived.completion}
                <span className="text-2xl text-[var(--muted-light)]">%</span>
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600">
                  {derived.milestoneDone} done
                </span>{" "}
                of {derived.milestoneTotal} milestones
              </p>

              <div className="mt-auto flex h-28 items-end gap-1.5 pt-6">
                {derived.deliveryBars.length === 0 ? (
                  <Link
                    href="/dashboard/projects"
                    className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] text-xs text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                  >
                    No milestones yet · add one to a project
                  </Link>
                ) : (
                  derived.deliveryBars.map((bar, index) => {
                    const max = Math.max(...derived.deliveryBars.map((b) => b.total));
                    return (
                      <Link
                        key={bar.id}
                        href={`/dashboard/projects/${bar.id}`}
                        title={`${bar.name}: ${bar.done}/${bar.total}`}
                        className="flex h-full flex-1 flex-col justify-end"
                      >
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${(bar.total / max) * 100}%` }}
                          transition={{ delay: 0.2 + index * 0.03, duration: 0.5 }}
                          className="flex flex-col justify-end overflow-hidden rounded-md bg-orange-300/60"
                        >
                          <div
                            className="bg-emerald-500/80"
                            style={{ height: `${(bar.done / bar.total) * 100}%` }}
                          />
                        </motion.div>
                      </Link>
                    );
                  })
                )}
              </div>
              <div className="mt-3 flex gap-4 text-[11px] text-[var(--muted)]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" /> Done
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-orange-300" /> Remaining
                </span>
              </div>
            </FadeIn>
          </div>

          {/* KPI tiles */}
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FadeIn delay={0.12} className="panel-ink flex flex-col p-5">
              <TileHeader dark label="Active projects" icon={<ProjectsIcon className="h-3.5 w-3.5" />} />
              <div className="mt-5 flex items-end justify-between gap-3">
                <p className="text-4xl font-semibold tabular-nums tracking-tight">{summary.active_projects}</p>
                <Sparkline values={derived.projectSeries} className="text-[var(--ink-fg)] opacity-80" />
              </div>
              <p className="mt-4 text-[11px] text-[var(--ink-muted)]">
                {summary.total_projects} total · growth over the last 30 days
              </p>
            </FadeIn>

            <FadeIn delay={0.16} className="flex flex-col rounded-[22px] bg-[var(--tint-blue)] p-5">
              <TileHeader label="Cards on boards" icon={<KanbanIcon className="h-3.5 w-3.5" />} />
              <div className="mt-5 flex items-end justify-between gap-3">
                <p className="text-4xl font-semibold tabular-nums tracking-tight">{derived.totalCards}</p>
                <Sparkline values={derived.cardSeries} className="text-[var(--tint-blue-fg)]" />
              </div>
              <p className="mt-4 text-[11px] text-[var(--tint-blue-fg)]">
                across {summary.total_boards} board{summary.total_boards === 1 ? "" : "s"}
              </p>
            </FadeIn>

            <FadeIn delay={0.2} className="panel flex flex-col p-5">
              <TileHeader
                label="Overdue milestones"
                icon={
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                }
              />
              <p
                className={cn(
                  "mt-5 text-4xl font-semibold tabular-nums tracking-tight",
                  summary.overdue_milestones > 0 && "text-orange-500",
                )}
              >
                {summary.overdue_milestones}
              </p>
              <div className="mt-auto pt-4">
                <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${derived.milestoneTotal ? (derived.milestoneDone / derived.milestoneTotal) * 100 : 0}%` }}
                  />
                  <div
                    className="bg-[var(--accent)]"
                    style={{ width: `${derived.milestoneTotal ? (derived.inProgress / derived.milestoneTotal) * 100 : 0}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                  {derived.milestoneDone} done · {derived.inProgress} in progress
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.24} className="panel flex flex-col p-5">
              <TileHeader
                label="On-time projects"
                icon={
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M15 7h6v6" />
                  </svg>
                }
              />
              <p className="mt-5 text-4xl font-semibold tabular-nums tracking-tight">
                {derived.onTrackPct}
                <span className="text-2xl text-[var(--muted-light)]">%</span>
              </p>
              <p className="mt-auto pt-4 text-[11px] text-[var(--muted)]">
                {derived.datedCount === 0
                  ? "no open projects with a due date"
                  : `of ${derived.datedCount} dated project${derived.datedCount === 1 ? "" : "s"} before their due date`}
              </p>
            </FadeIn>
          </div>

          {/* Activity + pipeline */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <FadeIn delay={0.28} className="panel p-6 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Recent activity</h3>
                  <p className="text-xs text-[var(--muted)]">Kanban card updates, last 14 days</p>
                </div>
                <div className="flex h-8 items-end gap-[3px]" aria-hidden>
                  {derived.activitySeries.map((count, i) => {
                    const max = Math.max(1, ...derived.activitySeries);
                    return (
                      <span
                        key={i}
                        className={cn(
                          "w-1.5 rounded-sm",
                          count ? "bg-[var(--accent)]" : "bg-[var(--surface-subtle)]",
                        )}
                        style={{ height: `${Math.max(12, (count / max) * 100)}%` }}
                      />
                    );
                  })}
                </div>
              </div>

              <ul className="mt-4 divide-y divide-[var(--border)]">
                {summary.recent_activity.length === 0 ? (
                  <li className="py-10 text-center font-mono text-xs text-[var(--muted)]">
                    no events recorded
                  </li>
                ) : (
                  summary.recent_activity.map((item, index) => (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + index * 0.04 }}
                    >
                      <Link
                        href={`/dashboard/kanban/${item.board_id}`}
                        className="group flex items-center gap-3 py-3"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-hover)] font-mono text-[10px] font-semibold text-[var(--muted)]">
                          {item.board_title.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium group-hover:text-[var(--accent)]">
                            {item.title}
                          </p>
                          <p className="truncate text-xs text-[var(--muted)]">
                            {item.board_title} · {item.column_name}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-[var(--muted-light)]">
                          {formatDateTime(item.updated_at)}
                        </span>
                      </Link>
                    </motion.li>
                  ))
                )}
              </ul>
            </FadeIn>

            <FadeIn delay={0.32} className="panel flex flex-col p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Project pipeline</h3>
                  <p className="text-xs text-[var(--muted)]">Projects by status</p>
                </div>
                <Link href="/dashboard/projects" className="chip py-1 text-[11px]">
                  View all
                </Link>
              </div>
              <div className="mt-6 space-y-4">
                {derived.statusCounts.map((status, index) => {
                  const max = Math.max(1, ...derived.statusCounts.map((s) => s.count));
                  return (
                    <div key={status.key}>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-[var(--muted)]">{status.label}</span>
                        <span className="font-semibold tabular-nums">{status.count}</span>
                      </div>
                      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]">
                        <motion.div
                          className={cn("h-full rounded-full", status.color)}
                          initial={{ width: 0 }}
                          animate={{ width: `${(status.count / max) * 100}%` }}
                          transition={{ delay: 0.35 + index * 0.06, duration: 0.6 }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-auto pt-6 text-[11px] text-[var(--muted)]">
                {summary.total_projects} projects · {summary.total_boards} boards
              </p>
            </FadeIn>
          </div>
        </>
      )}
    </div>
  );
}
