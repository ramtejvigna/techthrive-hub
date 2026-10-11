"use client";

import { api } from "@/lib/api";
import { queryKeys } from "@/lib/queries";
import type { AppNotification, NotificationList, NotificationSocketMessage } from "@/lib/types";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

const MAX_RETRY_DELAY_MS = 30_000;
const NOTIFICATION_CACHE_LIMIT = 50;

export type SocketStatus = "connecting" | "open" | "closed" | "unavailable";

/**
 * Keeps a WebSocket open for live notifications while the tab is visible.
 *
 * The socket is only a doorbell: notifications are stored server-side and
 * listed over REST. A new one is added to the query cache and the data it
 * affects is refreshed. After a reconnect the list is refetched to catch
 * anything sent while disconnected. Hidden tabs close the socket so an idle
 * tab doesn't keep reconnecting (and keep the database awake).
 */
export function useNotificationSocket(onNotification: (notification: AppNotification) => void) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SocketStatus>("connecting");
  const onNotificationRef = useRef(onNotification);

  useEffect(() => {
    onNotificationRef.current = onNotification;
  }, [onNotification]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let stopped = false;
    let connectedBefore = false;

    async function connect() {
      if (stopped || socket || document.visibilityState !== "visible") return;
      setStatus("connecting");
      let target: { url: string | null; ticket: string | null };
      try {
        target = await api.getNotificationSocketTicket();
      } catch {
        scheduleReconnect();
        return;
      }
      if (stopped || socket) return;
      if (!target.url || !target.ticket) {
        setStatus("unavailable");
        return;
      }

      const separator = target.url.includes("?") ? "&" : "?";
      const ws = new WebSocket(`${target.url}${separator}ticket=${encodeURIComponent(target.ticket)}`);
      socket = ws;
      ws.onopen = () => {
        attempts = 0;
        setStatus("open");
        // The first load fetches the list anyway; later connects catch up.
        if (connectedBefore) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.notifications });
        }
        connectedBefore = true;
      };
      ws.onmessage = (event) => {
        let message: NotificationSocketMessage;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type !== "notification") return;
        addToCache(queryClient, message.notification);
        refreshAffectedData(queryClient, message.notification);
        onNotificationRef.current(message.notification);
      };
      ws.onclose = () => {
        if (socket === ws) socket = null;
        setStatus("closed");
        scheduleReconnect();
      };
    }

    function scheduleReconnect() {
      if (stopped || document.visibilityState !== "visible") return;
      clearTimeout(retryTimer);
      const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempts);
      attempts += 1;
      retryTimer = setTimeout(() => void connect(), delay);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        clearTimeout(retryTimer);
        attempts = 0;
        void connect();
      } else {
        clearTimeout(retryTimer);
        socket?.close();
      }
    }

    void connect();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      socket?.close();
    };
  }, [queryClient]);

  return status;
}

function addToCache(queryClient: QueryClient, notification: AppNotification) {
  queryClient.setQueryData<NotificationList>(queryKeys.notifications, (prev) => {
    if (!prev) return prev;
    if (prev.results.some((item) => item.id === notification.id)) return prev;
    return {
      results: [notification, ...prev.results].slice(0, NOTIFICATION_CACHE_LIMIT),
      unread_count: prev.unread_count + (notification.read ? 0 : 1),
    };
  });
}

/** Someone else changed something this user can see; refresh it if it's on screen. */
function refreshAffectedData(queryClient: QueryClient, notification: AppNotification) {
  if (notification.card_id) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.boards.cardComments(notification.card_id),
    });
  }
  if (notification.board_id) {
    void queryClient.invalidateQueries({ queryKey: queryKeys.boards.detail(notification.board_id) });
  }
  if (notification.project_id) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.projects.detail(notification.project_id),
    });
  }
  if (notification.kind === "project_added" || notification.kind === "project_removed") {
    // A project (and maybe its board) appeared or disappeared for this user.
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.boards.list() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  }
}
