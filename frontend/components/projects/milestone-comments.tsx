"use client";

import { Button } from "@/components/ui/button";
import { MarkdownEditor, MarkdownView } from "@/components/ui/markdown-editor";
import { api } from "@/lib/api";
import { queryKeys, useMilestoneComments } from "@/lib/queries";
import type { MilestoneComment, User } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";

interface MilestoneCommentsProps {
  projectId: string;
  milestoneId: string;
  currentUser: User | null;
  /** People who can be @mentioned. */
  mentionCandidates?: User[];
}

export function MilestoneComments({
  projectId,
  milestoneId,
  currentUser,
  mentionCandidates,
}: MilestoneCommentsProps) {
  const queryClient = useQueryClient();
  const commentsKey = queryKeys.projects.milestoneComments(projectId, milestoneId);
  const { data: comments = [], isPending: loading } = useMilestoneComments(projectId, milestoneId);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitComment();
  }

  async function submitComment() {
    const trimmed = body.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const comment = await api.createMilestoneComment(projectId, milestoneId, trimmed);
      queryClient.setQueryData<MilestoneComment[]>(commentsKey, (prev = []) => [...prev, comment]);
      setBody("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    await api.deleteMilestoneComment(projectId, milestoneId, commentId);
    queryClient.setQueryData<MilestoneComment[]>(commentsKey, (prev = []) =>
      prev.filter((c) => c.id !== commentId),
    );
  }

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-3">
      {loading ? (
        <p className="text-xs text-[var(--muted)]">Loading comments...</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-md bg-[var(--surface-subtle)] px-3 py-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--foreground)]">
                    {comment.user.email}
                  </p>
                  <MarkdownView value={comment.body} className="mt-1 text-[var(--foreground)]" />
                  <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                    {formatDateTime(comment.created_at)}
                  </p>
                </div>
                {currentUser?.id === comment.user.id && (
                  <Button
                    variant="ghost"
                    onClick={() => handleDelete(comment.id)}
                    className="shrink-0 text-xs text-red-600"
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="space-y-2">
        <MarkdownEditor
          value={body}
          onChange={setBody}
          onSubmit={() => void submitComment()}
          placeholder="Write a comment... (@ to mention)"
          aria-label="Write a comment"
          mentionCandidates={mentionCandidates}
          className="[&_.md-content]:min-h-[3rem]"
        />
        <Button
          type="submit"
          className="px-3 py-1.5 text-xs"
          disabled={submitting || !body.trim()}
        >
          Post comment
        </Button>
      </form>
    </div>
  );
}
