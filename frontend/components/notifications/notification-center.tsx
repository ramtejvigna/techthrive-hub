"use client";

import { Avatar } from "@/components/kanban/jira-icons";
import { useNotificationSocket } from "@/components/notifications/use-notification-socket";
import { api } from "@/lib/api";
import { isAuthenticated } from "@/lib/auth";
import { queryKeys, useNotifications } from "@/lib/queries";
import type { AppNotification, NotificationKind, NotificationList } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const PANEL_WIDTH = 380;

const TOAST_DURATION_MS = 6000;
const MAX_TOASTS = 3;

const KIND_LABELS: Record<NotificationKind, string> = {
  card_assigned: "Assigned",
  card_comment: "Comment",
  card_status: "Status",
  mention: "Mention",
  project_added: "Project",
  project_removed: "Project",
};

function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days}d ago` : formatDateTime(iso);
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path strokeLinecap="round" d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function NotificationItem({
  notification,
  onOpen,
  compact = false,
}: {
  notification: AppNotification;
  onOpen: (notification: AppNotification) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(notification)}
      className={cn(
        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-hover)]",
        !notification.read && !compact && "bg-[var(--accent-light)]/40",
      )}
    >
      <Avatar email={notification.actor?.email ?? null} size={28} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--accent)]">
            {KIND_LABELS[notification.kind]}
          </span>
          <span className="truncate text-xs font-medium text-[var(--foreground)]">
            {notification.title}
          </span>
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-[var(--muted)]">
          {notification.message}
        </span>
        {!compact && (
          <span className="mt-1 block font-mono text-[10px] text-[var(--muted-light)]">
            {timeAgo(notification.created_at)}
          </span>
        )}
      </span>
      {!notification.read && !compact && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-label="Unread" />
      )}
    </button>
  );
}

const subscribeNothing = () => () => {};

/** The bell is only for signed-in users; the sidebar also renders on public pages. */
export function NotificationCenter() {
  const signedIn = useSyncExternalStore(subscribeNothing, isAuthenticated, () => false);
  return signedIn ? <NotificationCenterInner /> : null;
}

function NotificationCenterInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 72, left: 12 });

  function togglePanel() {
    // Drop down below the bell, right-aligned to it and kept inside the viewport.
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 24);
      setPanelPosition({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      });
    }
    setOpen((value) => !value);
  }

  const showToast = useCallback((notification: AppNotification) => {
    setToasts((prev) => [notification, ...prev].slice(0, MAX_TOASTS));
    setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== notification.id)),
      TOAST_DURATION_MS,
    );
  }, []);

  const socketStatus = useNotificationSocket(showToast);
  const { data } = useNotifications({ poll: socketStatus !== "open" });
  const notifications = data?.results ?? [];
  const unreadCount = data?.unread_count ?? 0;

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function markReadLocally(ids: string[] | "all") {
    queryClient.setQueryData<NotificationList>(queryKeys.notifications, (prev) => {
      if (!prev) return prev;
      let changed = 0;
      const results = prev.results.map((item) => {
        if (item.read || (ids !== "all" && !ids.includes(item.id))) return item;
        changed += 1;
        return { ...item, read: true };
      });
      return {
        results,
        unread_count: ids === "all" ? 0 : Math.max(0, prev.unread_count - changed),
      };
    });
  }

  function openNotification(notification: AppNotification) {
    setOpen(false);
    setToasts((prev) => prev.filter((toast) => toast.id !== notification.id));
    if (!notification.read) {
      markReadLocally([notification.id]);
      void api.markNotificationRead(notification.id).catch(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
      });
    }
    router.push(notification.url);
  }

  function markAllRead() {
    markReadLocally("all");
    void api.markAllNotificationsRead().catch(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
    });
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={togglePanel}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:text-[var(--foreground)]"
      >
        <BellIcon className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {createPortal(
        <>
          <AnimatePresence>
            {open && (
              <motion.div
                ref={panelRef}
                style={{ top: panelPosition.top, left: panelPosition.left }}
                role="dialog"
                aria-label="Notifications"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="fixed z-[100] flex max-h-[75vh] w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[18px] border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--foreground)]">Notifications</p>
                    <p className="font-mono text-[10px] text-[var(--muted)]">
                      {socketStatus === "open" ? "live" : "refreshing every minute"}
                    </p>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={markAllRead}
                      className="text-xs font-medium text-[var(--accent)] hover:underline"
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                {notifications.length === 0 ? (
                  <p className="px-4 py-10 text-center font-mono text-xs text-[var(--muted)]">
                    You&apos;re all caught up.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)] overflow-y-auto">
                    {notifications.map((notification) => (
                      <li key={notification.id}>
                        <NotificationItem notification={notification} onOpen={openNotification} />
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[340px] flex-col gap-2" aria-live="polite">
            <AnimatePresence>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 24 }}
                  className="pointer-events-auto overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-xl"
                >
                  <NotificationItem notification={toast} onOpen={openNotification} compact />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
