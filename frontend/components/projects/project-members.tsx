"use client";

import { Avatar } from "@/components/kanban/jira-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { USER_SEARCH_MIN_LENGTH, queryKeys, useUserSearch } from "@/lib/queries";
import type { Project, User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, KeyboardEvent, useEffect, useId, useState } from "react";

const SEARCH_DEBOUNCE_MS = 200;

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-[var(--accent-light)] text-[var(--accent)]">
        {text.slice(index, index + query.length)}
      </mark>
      {text.slice(index + query.length)}
    </>
  );
}

interface ProjectMembersProps {
  project: Project;
  currentUser: User | null;
  /** Called after the current user removes themselves from the project. */
  onLeft: () => void;
}

export function ProjectMembers({ project, currentUser, onLeft }: ProjectMembersProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const { data: suggestions = [], isFetching: searching } = useUserSearch(searchTerm, project.id);
  const showSuggestions =
    suggestionsOpen && searchTerm.length >= USER_SEARCH_MIN_LENGTH && email.trim().length > 0;

  // Search once typing pauses rather than on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setSearchTerm(email.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [email]);

  const projectKey = queryKeys.projects.detail(project.id);
  const members = project.members ?? [];
  const isOwner = Boolean(project.is_owner);

  function setMembers(update: (members: User[]) => User[]) {
    queryClient.setQueryData<Project>(projectKey, (prev) =>
      prev && { ...prev, members: update(prev.members ?? []) },
    );
    // Membership decides who sees the linked board and can be assigned on it.
    void queryClient.invalidateQueries({ queryKey: queryKeys.boards.all, refetchType: "none" });
    // Searches leave out current members, so cached results are now wrong.
    queryClient.removeQueries({ queryKey: queryKeys.userSearch.all });
  }

  async function addMember(memberEmail: string) {
    const trimmed = memberEmail.trim();
    if (!trimmed || adding) return;
    setError(null);
    setSuggestionsOpen(false);
    setAdding(true);
    try {
      const member = await api.addProjectMember(project.id, trimmed);
      setMembers((prev) => [...prev.filter((user) => user.id !== member.id), member]);
      setEmail("");
      setSearchTerm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that person.");
    } finally {
      setAdding(false);
    }
  }

  function handleAdd(event: FormEvent) {
    event.preventDefault();
    const highlighted = showSuggestions ? suggestions[activeIndex] : undefined;
    void addMember(highlighted?.email ?? email);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!showSuggestions) {
      setSuggestionsOpen(true);
      return;
    }
    if (suggestions.length === 0) return;
    const step = event.key === "ArrowDown" ? 1 : -1;
    setActiveIndex((index) => (index + step + suggestions.length) % suggestions.length);
  }

  async function handleRemove(member: User) {
    const leaving = member.id === currentUser?.id;
    const prompt = leaving
      ? "Leave this project? You'll lose access to it and its board."
      : `Remove ${member.email} from this project? They'll lose access to its board too.`;
    if (!confirm(prompt)) return;
    await api.removeProjectMember(project.id, member.id);
    if (leaving) {
      onLeft();
      return;
    }
    setMembers((prev) => prev.filter((user) => user.id !== member.id));
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {project.owner && (
          <li className="flex items-center gap-3 px-3 py-2.5">
            <Avatar email={project.owner.email} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
              {project.owner.email}
            </span>
            <Badge variant="default">owner</Badge>
          </li>
        )}
        {members.map((member) => {
          const isSelf = member.id === currentUser?.id;
          return (
            <li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar email={member.email} size={28} />
              <span className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                {member.email}
                {isSelf && <span className="ml-1.5 text-xs text-[var(--muted)]">(you)</span>}
              </span>
              {(isOwner || isSelf) && (
                <Button
                  variant="ghost"
                  onClick={() => void handleRemove(member)}
                  className="shrink-0 px-2 py-1 text-xs text-red-600"
                >
                  {isSelf ? "Leave" : "Remove"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {members.length === 0 && (
        <p className="font-mono text-xs text-[var(--muted)]">
          {isOwner ? "Only you can see this project so far." : "No other members yet."}
        </p>
      )}

      {isOwner && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-start gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
                setSuggestionsOpen(true);
                setActiveIndex(-1);
              }}
              onKeyDown={handleSearchKeyDown}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setSuggestionsOpen(false)}
              placeholder="Search by email..."
              aria-label="Member email"
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSuggestions}
              aria-controls={listboxId}
              aria-activedescendant={
                showSuggestions && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined
              }
              error={error ?? undefined}
            />
            {showSuggestions && (
              <ul
                id={listboxId}
                role="listbox"
                aria-label="Matching users"
                className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
              >
                {suggestions.length === 0 ? (
                  <li className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                    {searching ? "Searching..." : "No matching users"}
                  </li>
                ) : (
                  suggestions.map((user, index) => (
                    <li
                      key={user.id}
                      id={`${listboxId}-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      // Keep focus in the input so blur doesn't close the list first.
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => void addMember(user.email)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-[var(--foreground)]",
                        index === activeIndex && "bg-[var(--surface-hover)]",
                      )}
                    >
                      <Avatar email={user.email} size={24} />
                      <span className="min-w-0 flex-1 truncate">
                        <HighlightMatch text={user.email} query={searchTerm} />
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <Button type="submit" disabled={adding || !email.trim()}>
            {adding ? "Adding..." : "Add member"}
          </Button>
        </form>
      )}
      {isOwner && (
        <p className="font-mono text-[10px] text-[var(--muted)]">
          Members can work on this project and see its linked board. They need an account first.
        </p>
      )}
    </div>
  );
}
