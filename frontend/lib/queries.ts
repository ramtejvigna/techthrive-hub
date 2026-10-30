import { ApiError, api } from "./api";
import type { SdlcPhaseKey } from "./types";
import {
  QueryClient,
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";

// Hierarchical keys: invalidating a prefix (e.g. queryKeys.boards.all) covers
// every list and detail beneath it.
export const queryKeys = {
  me: ["me"] as const,
  notifications: ["notifications"] as const,
  userSearch: {
    all: ["users", "search"] as const,
    query: (query: string, projectId?: string) =>
      [...queryKeys.userSearch.all, projectId ?? null, query] as const,
  },
  dashboard: ["dashboard"] as const,
  projects: {
    all: ["projects"] as const,
    list: () => [...queryKeys.projects.all, "list"] as const,
    detail: (id: string) => [...queryKeys.projects.all, "detail", id] as const,
    milestoneComments: (projectId: string, milestoneId: string) =>
      [...queryKeys.projects.all, "detail", projectId, "milestones", milestoneId, "comments"] as const,
    phaseUpdates: (projectId: string, phaseKey: SdlcPhaseKey) =>
      [...queryKeys.projects.all, "detail", projectId, "phases", phaseKey, "updates"] as const,
  },
  boards: {
    all: ["boards"] as const,
    list: () => [...queryKeys.boards.all, "list"] as const,
    detail: (id: string) => [...queryKeys.boards.all, "detail", id] as const,
    cardComments: (cardId: string) => [...queryKeys.boards.all, "cards", cardId, "comments"] as const,
  },
  docs: {
    all: ["docs"] as const,
    lists: () => [...queryKeys.docs.all, "list"] as const,
    list: (query: string) => [...queryKeys.docs.lists(), query] as const,
    detail: (id: string) => [...queryKeys.docs.all, "detail", id] as const,
  },
  canvases: {
    all: ["canvases"] as const,
    lists: () => [...queryKeys.canvases.all, "list"] as const,
    list: (query: string, project: string) =>
      [...queryKeys.canvases.lists(), query, project] as const,
    detail: (id: string) => [...queryKeys.canvases.all, "detail", id] as const,
  },
};

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (404, 403, ...) won't succeed on retry; only retry once
        // on network/server errors.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 1,
      },
    },
  });
}

export function useCurrentUser() {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.me, staleTime: Infinity });
}

/** Without a live socket, check for new notifications this often. */
const NOTIFICATION_POLL_MS = 60_000;

/**
 * The latest notifications and the unread count. While the WebSocket is
 * connected it pushes new ones into this cache, so polling is only a
 * fallback for when realtime is off or the socket is down.
 */
export function useNotifications({ poll }: { poll: boolean }) {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: api.getNotifications,
    refetchInterval: poll ? NOTIFICATION_POLL_MS : false,
  });
}

/** The backend ignores searches shorter than this. */
export const USER_SEARCH_MIN_LENGTH = 2;

/** Accounts whose email contains `query`, minus people already on `projectId`. */
export function useUserSearch(query: string, projectId?: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: queryKeys.userSearch.query(trimmed.toLowerCase(), projectId),
    queryFn: () => api.searchUsers(trimmed, projectId),
    enabled: trimmed.length >= USER_SEARCH_MIN_LENGTH,
    placeholderData: keepPreviousData,
  });
}

export function useDashboardSummary() {
  // Almost every mutation changes the summary, so refresh it on each visit.
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: api.getDashboardSummary,
    staleTime: 0,
  });
}

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects.list(), queryFn: api.getProjects });
}

export function useProject(id: string) {
  return useQuery({ queryKey: queryKeys.projects.detail(id), queryFn: () => api.getProject(id) });
}

export function useMilestoneComments(projectId: string, milestoneId: string) {
  return useQuery({
    queryKey: queryKeys.projects.milestoneComments(projectId, milestoneId),
    queryFn: () => api.getMilestoneComments(projectId, milestoneId),
  });
}

export function usePhaseUpdates(projectId: string, phaseKey: SdlcPhaseKey) {
  return useQuery({
    queryKey: queryKeys.projects.phaseUpdates(projectId, phaseKey),
    queryFn: () => api.getPhaseUpdates(projectId, phaseKey),
  });
}

export function useBoards() {
  return useQuery({ queryKey: queryKeys.boards.list(), queryFn: api.getBoards });
}

export function useBoard(id: string) {
  return useQuery({ queryKey: queryKeys.boards.detail(id), queryFn: () => api.getBoard(id) });
}

export function useCardComments(cardId: string) {
  return useQuery({
    queryKey: queryKeys.boards.cardComments(cardId),
    queryFn: () => api.getCardComments(cardId),
  });
}

export function useDocs(query: string) {
  return useQuery({
    queryKey: queryKeys.docs.list(query),
    queryFn: () => api.getDocs(query),
    // Keep showing the previous results while a new search loads.
    placeholderData: keepPreviousData,
  });
}

export function useCanvases(query = "", project = "") {
  return useQuery({
    queryKey: queryKeys.canvases.list(query, project),
    queryFn: () => api.getCanvases(query, project),
    // Keep showing the previous results while a new search loads.
    placeholderData: keepPreviousData,
  });
}

export function useCanvas(id: string) {
  return useQuery({
    queryKey: queryKeys.canvases.detail(id),
    queryFn: () => api.getCanvas(id),
    // The editor only reads the canvas once, as its initial scene, so it must
    // never start from a cached copy that predates the last autosave.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useDoc(id: string) {
  return useQuery({
    queryKey: queryKeys.docs.detail(id),
    queryFn: () => api.getDoc(id),
    // The editor only reads the doc once, as its initial content, so it must
    // never start from a cached copy that predates the last autosave.
    staleTime: 0,
    gcTime: 0,
  });
}
