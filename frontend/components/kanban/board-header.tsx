"use client";

import { Avatar, ChevronDownIcon, IssueTypeIcon, SearchIcon } from "@/components/kanban/jira-icons";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EMPTY_FILTERS,
  ISSUE_TYPES,
  RECENTLY_UPDATED_DAYS,
  hasActiveFilters,
  labelColor,
  type BoardFilters,
} from "@/lib/jira";
import type { IssueType, LinkedProject, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface BoardHeaderProps {
  title: string;
  boardKey: string;
  linkedProjects?: LinkedProject[];
  editingTitle: boolean;
  onStartEditTitle: () => void;
  onCancelEditTitle: () => void;
  onSaveTitle: (title: string) => Promise<void>;
  onCreateIssue: () => void;
  onAddColumn: () => void;
  onEditKey: () => void;
  onDeleteBoard?: () => void;
}

export function BoardHeader({
  title,
  boardKey,
  linkedProjects = [],
  editingTitle,
  onStartEditTitle,
  onCancelEditTitle,
  onSaveTitle,
  onCreateIssue,
  onAddColumn,
  onEditKey,
  onDeleteBoard,
}: BoardHeaderProps) {
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editingTitle) {
      setDraft(title);
    }
  }, [title, editingTitle]);

  useEffect(() => {
    if (editingTitle) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editingTitle]);

  async function commitTitle() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === title) {
      onCancelEditTitle();
      setDraft(title);
      return;
    }

    setSaving(true);
    try {
      await onSaveTitle(trimmed);
      onCancelEditTitle();
    } catch {
      setDraft(title);
      onCancelEditTitle();
    } finally {
      setSaving(false);
    }
  }

  function handleTitleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTitle();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(title);
      onCancelEditTitle();
    }
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="pb-4 pt-6"
    >
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
        <Link href="/dashboard" className="transition-colors hover:text-[var(--foreground)]">
          TechThrive
        </Link>
        <span className="text-[var(--muted-light)]" aria-hidden>/</span>
        <Link href="/dashboard/kanban" className="transition-colors hover:text-[var(--foreground)]">
          Boards
        </Link>
        <span className="text-[var(--muted-light)]" aria-hidden>/</span>
        <span className="truncate text-[var(--foreground)]">{title}</span>
      </nav>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] font-mono text-[11px] font-bold text-[var(--ink-fg)] ring-1 ring-white/10"
            aria-hidden
          >
            {boardKey.slice(0, 3)}
          </span>
          {editingTitle ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={handleTitleKeyDown}
              disabled={saving}
              maxLength={120}
              className="w-full max-w-xl rounded-md border border-[var(--accent)]/40 bg-[var(--surface)] px-2 py-0.5 text-3xl font-semibold tracking-tight text-[var(--foreground)] outline-none ring-2 ring-[var(--accent)]/20"
              aria-label="Board title"
            />
          ) : (
            <button
              type="button"
              onClick={onStartEditTitle}
              className="min-w-0 truncate rounded-md text-left text-3xl font-semibold tracking-tight text-[var(--foreground)] transition-colors hover:text-[var(--accent)]"
              title="Click to rename board"
            >
              {title}
            </button>
          )}
          <span className="chip shrink-0 py-1 font-mono text-[11px]">
            {boardKey}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={onCreateIssue}>
            + Create
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Board options" />
            <DropdownMenuContent>
              <DropdownMenuItem onClick={onStartEditTitle}>Rename board</DropdownMenuItem>
              <DropdownMenuItem onClick={onEditKey}>Change issue key</DropdownMenuItem>
              <DropdownMenuItem onClick={onAddColumn}>Add column</DropdownMenuItem>
              {onDeleteBoard && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onClick={onDeleteBoard}>
                    Delete board
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {linkedProjects.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--muted)]">
            Linked projects
          </span>
          {linkedProjects.map((project) => (
            <Link
              key={project.id}
              href={`/dashboard/projects/${project.id}`}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)] shadow-sm transition-colors hover:bg-[var(--accent-light)]"
            >
              {project.name}
            </Link>
          ))}
        </div>
      )}
    </motion.header>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
        active
          ? "border-transparent bg-[var(--ink)] text-[var(--ink-fg)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]",
      )}
    >
      {children}
    </button>
  );
}

function MultiSelectFilter<T extends string>({
  label,
  options,
  selected,
  onChange,
  renderOption,
}: {
  label: string;
  options: T[];
  selected: T[];
  onChange: (next: T[]) => void;
  renderOption: (option: T) => ReactNode;
}) {
  function toggle(option: T) {
    onChange(
      selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option],
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        variant="bare"
        aria-label={`Filter by ${label.toLowerCase()}`}
        className={cn(
          "h-8 gap-1 rounded-full border px-3 text-[13px] font-medium",
          selected.length > 0
            ? "border-transparent bg-[var(--ink)] text-[var(--ink-fg)]"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]",
        )}
      >
        {label}
        {selected.length > 0 && (
          <span className="rounded-full bg-[var(--accent)] px-1.5 text-[10px] font-semibold text-white">
            {selected.length}
          </span>
        )}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {options.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[var(--muted)]">Nothing to filter yet</p>
        ) : (
          options.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className="h-3.5 w-3.5 accent-[var(--accent)]"
              />
              {renderOption(option)}
            </label>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BoardToolbar({
  filters,
  onChange,
  currentUser,
  availableLabels,
  matchCount,
  totalCount,
}: {
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  currentUser: User | null;
  availableLabels: string[];
  matchCount: number;
  totalCount: number;
}) {
  const active = hasActiveFilters(filters);

  return (
    <div className="flex flex-wrap items-center gap-2 pb-4">
      <label className="relative">
        <span className="sr-only">Search this board</span>
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input
          type="search"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder="Search board"
          className="h-9 w-52 rounded-full border border-[var(--border)] bg-[var(--surface)] pl-8 pr-3 text-sm text-[var(--foreground)] outline-none transition-all placeholder:text-[var(--muted-light)] focus:w-64 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15"
        />
      </label>

      {currentUser && (
        <button
          type="button"
          onClick={() => onChange({ ...filters, onlyMine: !filters.onlyMine })}
          aria-pressed={filters.onlyMine}
          title={filters.onlyMine ? "Showing your tickets" : "Show only your tickets"}
          className={cn(
            "rounded-full transition-shadow",
            filters.onlyMine
              ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--background)]"
              : "hover:ring-2 hover:ring-[var(--border-strong)]",
          )}
        >
          <Avatar email={currentUser.email} size={30} />
        </button>
      )}

      <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden />

      <ToggleChip
        active={filters.onlyMine}
        onClick={() => onChange({ ...filters, onlyMine: !filters.onlyMine })}
      >
        Only my tickets
      </ToggleChip>
      <ToggleChip
        active={filters.recentlyUpdated}
        onClick={() => onChange({ ...filters, recentlyUpdated: !filters.recentlyUpdated })}
        title={`Updated in the last ${RECENTLY_UPDATED_DAYS} days`}
      >
        Recently updated
      </ToggleChip>
      <MultiSelectFilter<IssueType>
        label="Type"
        options={ISSUE_TYPES.map((type) => type.key)}
        selected={filters.types}
        onChange={(types) => onChange({ ...filters, types })}
        renderOption={(key) => (
          <span className="flex items-center gap-2">
            <IssueTypeIcon type={key} />
            {ISSUE_TYPES.find((type) => type.key === key)?.label}
          </span>
        )}
      />
      <MultiSelectFilter<string>
        label="Label"
        options={availableLabels}
        selected={filters.labels}
        onChange={(labels) => onChange({ ...filters, labels })}
        renderOption={(label) => (
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: labelColor(label) }} />
            {label}
          </span>
        )}
      />

      {active && (
        <>
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="h-8 rounded-full px-3 text-[13px] font-medium text-[var(--accent)] hover:bg-[var(--accent-light)]"
          >
            Clear filters
          </button>
          <span className="font-mono text-xs text-[var(--muted)]">
            {matchCount} of {totalCount} tickets
          </span>
        </>
      )}
    </div>
  );
}
