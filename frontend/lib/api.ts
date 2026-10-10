import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./auth";
import type {
  AuthTokens,
  Board,
  CardComment,
  DashboardSummary,
  Doc,
  DocListItem,
  KanbanCard,
  KanbanColumn,
  Milestone,
  MilestoneComment,
  PaginatedResponse,
  PhaseStatus,
  PhaseUpdate,
  Project,
  ProjectPhase,
  SdlcPhaseKey,
  User,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Concurrent 401s share one in-flight refresh instead of each sending its own.
let refreshInFlight: Promise<string | null> | null = null;

function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= requestNewAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function requestNewAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const response = await fetch(`${API_URL}/api/auth/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const data = (await response.json()) as { access: string };
  setTokens(data.access, refresh);
  return data.access;
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retry = true,
): Promise<T> {
  const token = getAccessToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetch<T>(path, options, false);
    }
    throw new ApiError("Unauthorized", 401);
  }

  if (!response.ok) {
    let message = "Request failed";
    try {
      const errorData = await response.json();
      // DRF field errors look like {"email": ["No account uses this email."]}.
      const firstFieldError = Object.values(errorData)
        .flat()
        .find((value) => typeof value === "string");
      message =
        errorData.detail ||
        errorData.non_field_errors?.[0] ||
        firstFieldError ||
        JSON.stringify(errorData);
    } catch {
      message = response.statusText;
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function unwrapList<T>(data: PaginatedResponse<T> | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data.results;
}

export const api = {
  register: (email: string, password: string) =>
    apiFetch<User>("/api/auth/register/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  login: async (email: string, password: string) => {
    const tokens = await apiFetch<AuthTokens>("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setTokens(tokens.access, tokens.refresh);
    return tokens;
  },

  logout: () =>
    apiFetch<void>("/api/auth/logout/", {
      method: "POST",
      body: JSON.stringify({ refresh: getRefreshToken() }),
    }).finally(clearTokens),

  me: () => apiFetch<User>("/api/auth/me/"),

  getDashboardSummary: () =>
    apiFetch<DashboardSummary>("/api/dashboard/summary/"),

  getProjects: async () => {
    const data = await apiFetch<PaginatedResponse<Project> | Project[]>(
      "/api/projects/",
    );
    return unwrapList(data);
  },

  getProject: (id: string) => apiFetch<Project>(`/api/projects/${id}/`),

  createProject: (payload: Partial<Project>) =>
    apiFetch<Project>("/api/projects/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateProject: (id: string, payload: Partial<Project>) =>
    apiFetch<Project>(`/api/projects/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteProject: (id: string) =>
    apiFetch<void>(`/api/projects/${id}/`, { method: "DELETE" }),

  searchUsers: (query: string, projectId?: string) => {
    const params = new URLSearchParams({ q: query });
    if (projectId) params.set("project", projectId);
    return apiFetch<User[]>(`/api/auth/users/?${params}`);
  },

  addProjectMember: (projectId: string, email: string) =>
    apiFetch<User>(`/api/projects/${projectId}/members/`, {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  removeProjectMember: (projectId: string, userId: number) =>
    apiFetch<void>(`/api/projects/${projectId}/members/${userId}/`, { method: "DELETE" }),

  getMilestones: async (projectId: string) => {
    const data = await apiFetch<PaginatedResponse<Milestone> | Milestone[]>(
      `/api/projects/${projectId}/milestones/`,
    );
    return unwrapList(data);
  },

  createMilestone: (
    projectId: string,
    payload: Partial<Milestone>,
  ) =>
    apiFetch<Milestone>(`/api/projects/${projectId}/milestones/`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateMilestone: (
    projectId: string,
    milestoneId: string,
    payload: Partial<Milestone>,
  ) =>
    apiFetch<Milestone>(
      `/api/projects/${projectId}/milestones/${milestoneId}/`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    ),

  deleteMilestone: (projectId: string, milestoneId: string) =>
    apiFetch<void>(
      `/api/projects/${projectId}/milestones/${milestoneId}/`,
      { method: "DELETE" },
    ),

  getMilestoneComments: async (projectId: string, milestoneId: string) => {
    const data = await apiFetch<PaginatedResponse<MilestoneComment> | MilestoneComment[]>(
      `/api/projects/${projectId}/milestones/${milestoneId}/comments/`,
    );
    return unwrapList(data);
  },

  createMilestoneComment: (
    projectId: string,
    milestoneId: string,
    body: string,
  ) =>
    apiFetch<MilestoneComment>(
      `/api/projects/${projectId}/milestones/${milestoneId}/comments/`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    ),

  deleteMilestoneComment: (
    projectId: string,
    milestoneId: string,
    commentId: string,
  ) =>
    apiFetch<void>(
      `/api/projects/${projectId}/milestones/${milestoneId}/comments/${commentId}/`,
      { method: "DELETE" },
    ),

  updatePhase: (
    projectId: string,
    phaseKey: SdlcPhaseKey,
    payload: { status?: PhaseStatus; notes?: string },
  ) =>
    apiFetch<ProjectPhase>(`/api/projects/${projectId}/phases/${phaseKey}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  getPhaseUpdates: async (projectId: string, phaseKey: SdlcPhaseKey) => {
    const data = await apiFetch<PaginatedResponse<PhaseUpdate> | PhaseUpdate[]>(
      `/api/projects/${projectId}/phases/${phaseKey}/updates/`,
    );
    return unwrapList(data);
  },

  createPhaseUpdate: (projectId: string, phaseKey: SdlcPhaseKey, body: string) =>
    apiFetch<PhaseUpdate>(`/api/projects/${projectId}/phases/${phaseKey}/updates/`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  deletePhaseUpdate: (projectId: string, phaseKey: SdlcPhaseKey, updateId: string) =>
    apiFetch<void>(
      `/api/projects/${projectId}/phases/${phaseKey}/updates/${updateId}/`,
      { method: "DELETE" },
    ),

  getDocs: async (query = "") => {
    const params = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const data = await apiFetch<PaginatedResponse<DocListItem> | DocListItem[]>(
      `/api/docs/${params}`,
    );
    return unwrapList(data);
  },

  getDoc: (id: string) => apiFetch<Doc>(`/api/docs/${id}/`),

  createDoc: (payload: Partial<Pick<Doc, "title" | "content" | "content_text">> = {}) =>
    apiFetch<Doc>("/api/docs/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateDoc: (id: string, payload: Partial<Pick<Doc, "title" | "content" | "content_text">>) =>
    apiFetch<Doc>(`/api/docs/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteDoc: (id: string) => apiFetch<void>(`/api/docs/${id}/`, { method: "DELETE" }),

  getBoards: async () => {
    const data = await apiFetch<PaginatedResponse<Board> | Board[]>(
      "/api/boards/",
    );
    return unwrapList(data);
  },

  getBoard: (id: string) => apiFetch<Board>(`/api/boards/${id}/`),

  createBoard: (payload: { title: string; project?: string | null }) =>
    apiFetch<Board>("/api/boards/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateBoard: (id: string, payload: Partial<Board>) =>
    apiFetch<Board>(`/api/boards/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteBoard: (id: string) =>
    apiFetch<void>(`/api/boards/${id}/`, { method: "DELETE" }),

  reorderBoard: (
    id: string,
    payload: {
      columns?: { id: string; position: number }[];
      cards?: { id: string; column_id: string; position: number }[];
    },
  ) =>
    apiFetch<Board>(`/api/boards/${id}/reorder/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  createColumn: (boardId: string, name: string) =>
    apiFetch<KanbanColumn>(`/api/boards/${boardId}/columns/`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  updateColumn: (
    boardId: string,
    columnId: string,
    payload: { name?: string; color?: string; wip_limit?: number | null },
  ) =>
    apiFetch<KanbanColumn>(`/api/boards/${boardId}/columns/${columnId}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteColumn: (boardId: string, columnId: string) =>
    apiFetch<void>(`/api/boards/${boardId}/columns/${columnId}/`, {
      method: "DELETE",
    }),

  createCard: (
    payload: Partial<
      Pick<
        KanbanCard,
        | "issue_type"
        | "description"
        | "priority"
        | "due_date"
        | "story_points"
        | "labels"
        | "assignee"
        | "project"
      >
    > & { column: string; title: string },
  ) =>
    apiFetch<KanbanCard>("/api/boards/cards/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateCard: (
    id: string,
    payload: Partial<
      Pick<
        KanbanCard,
        | "title"
        | "description"
        | "issue_type"
        | "priority"
        | "due_date"
        | "story_points"
        | "labels"
        | "assignee"
        | "column"
        | "project"
      >
    >,
  ) =>
    apiFetch<KanbanCard>(`/api/boards/cards/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteCard: (id: string) =>
    apiFetch<void>(`/api/boards/cards/${id}/`, { method: "DELETE" }),

  getCardComments: (cardId: string) =>
    apiFetch<CardComment[]>(`/api/boards/cards/${cardId}/comments/`),

  createCardComment: (cardId: string, body: string) =>
    apiFetch<CardComment>(`/api/boards/cards/${cardId}/comments/`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  deleteCardComment: (cardId: string, commentId: string) =>
    apiFetch<void>(`/api/boards/cards/${cardId}/comments/${commentId}/`, {
      method: "DELETE",
    }),
};
