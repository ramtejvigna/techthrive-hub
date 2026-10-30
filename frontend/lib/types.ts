import type { JSONContent } from "@tiptap/react";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";

export interface User {
  id: number;
  email: string;
}

export type MilestoneBucketStatus = "todo" | "in_progress" | "done";

export type SdlcPhaseKey =
  | "requirements"
  | "design"
  | "development"
  | "testing"
  | "deployment"
  | "maintenance";

export type PhaseStatus = "not_started" | "in_progress" | "done";

/** A phase key, or "completed" once every phase is done. */
export type CurrentPhase = SdlcPhaseKey | "completed";

export interface ProjectPhase {
  id: string;
  key: SdlcPhaseKey;
  label: string;
  order: number;
  status: PhaseStatus;
  notes: string;
  update_count: number;
  updated_at: string;
}

export interface ProjectPhaseSummary {
  key: SdlcPhaseKey;
  status: PhaseStatus;
}

export interface PhaseUpdate {
  id: string;
  kind: "note" | "status_change";
  body: string;
  user: User;
  created_at: string;
}

export interface Milestone {
  id: string;
  phase: string | null;
  title: string;
  target_date: string | null;
  bucket_status: MilestoneBucketStatus;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface MilestoneComment {
  id: string;
  body: string;
  user: User;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  current_phase: CurrentPhase | null;
  due_date: string | null;
  board: string | null;
  board_id: string | null;
  board_title?: string | null;
  owner?: User;
  /** Whether the viewer created the project (and so manages its members). */
  is_owner?: boolean;
  members?: User[];
  phases?: ProjectPhase[] | ProjectPhaseSummary[];
  milestones?: Milestone[];
  milestone_count?: number;
  completed_milestone_count?: number;
  todo_milestone_count?: number;
  in_progress_milestone_count?: number;
  done_milestone_count?: number;
  created_at: string;
  updated_at: string;
}

export type CardPriority = "lowest" | "low" | "medium" | "high" | "highest";

export type IssueType = "task" | "story" | "bug";

export interface ChecklistItem {
  text: string;
  done: boolean;
}

export interface KanbanCard {
  id: string;
  number: number | null;
  issue_key: string;
  issue_type: IssueType;
  title: string;
  description: string;
  objective: string;
  requirements: string;
  subtasks: ChecklistItem[];
  acceptance_criteria: ChecklistItem[];
  /** IDs of issues on the same board that must be done first. */
  dependencies: string[];
  priority: CardPriority;
  due_date: string | null;
  story_points: number | null;
  labels: string[];
  assignee: number | null;
  assignee_email: string | null;
  comment_count: number;
  column_entered_at: string | null;
  completed_at: string | null;
  position: number;
  column: string;
  column_id: string;
  project: string | null;
  project_id: string | null;
  project_name?: string | null;
  milestone: string | null;
  milestone_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  position: number;
  wip_limit: number | null;
  cards: KanbanCard[];
}

export interface CardComment {
  id: string;
  body: string;
  user: User;
  created_at: string;
  updated_at: string;
}

export interface LinkedProject {
  id: string;
  name: string;
  status: ProjectStatus;
}

export interface Board {
  id: string;
  title: string;
  key: string;
  project: string | null;
  project_id: string | null;
  linked_projects?: LinkedProject[];
  owner?: User;
  is_owner?: boolean;
  /** Everyone who can see the board (owner plus linked projects' members). */
  members?: User[];
  column_count?: number;
  card_count?: number;
  columns?: KanbanColumn[];
  created_at: string;
  updated_at: string;
}

export type NotificationKind =
  | "card_assigned"
  | "card_comment"
  | "card_status"
  | "mention"
  | "project_added"
  | "project_removed";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  actor: User | null;
  title: string;
  message: string;
  /** In-app path to open, e.g. /dashboard/kanban/<board>?issue=<card>. */
  url: string;
  project_id: string | null;
  board_id: string | null;
  card_id: string | null;
  read: boolean;
  created_at: string;
}

export interface NotificationList {
  results: AppNotification[];
  unread_count: number;
}

/** Sent over the WebSocket. */
export interface NotificationSocketMessage {
  type: "notification";
  notification: AppNotification;
}

export interface DashboardSummary {
  active_projects: number;
  overdue_milestones: number;
  total_boards: number;
  total_projects: number;
  recent_activity: {
    id: string;
    title: string;
    board_id: string;
    board_title: string;
    column_name: string;
    updated_at: string;
  }[];
}

export interface DocListItem {
  id: string;
  title: string;
  excerpt: string;
  created_at: string;
  updated_at: string;
}

/** Tiptap/ProseMirror document JSON; `{}` for a brand-new, never-edited doc. */
export type DocContent = JSONContent;

export interface Doc {
  id: string;
  title: string;
  content: DocContent;
  content_text: string;
  created_at: string;
  updated_at: string;
}

/** Excalidraw elements plus the app state worth keeping; `{}` for a new canvas. */
export interface CanvasScene {
  elements?: readonly unknown[];
  appState?: { viewBackgroundColor?: string };
}

export interface CanvasListItem {
  id: string;
  title: string;
  project: string | null;
  project_name: string | null;
  owner: User;
  is_owner: boolean;
  /** PNG data URL; empty until the canvas has something on it. */
  thumbnail: string;
  created_at: string;
  updated_at: string;
}

export interface Canvas extends CanvasListItem {
  scene: CanvasScene;
  scene_text: string;
  version: number;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ContentEntryBase {
  title: string;
  slug: string;
  publishedAt: string;
  body: string;
  html: string;
}

export type PlanStatus = "draft" | "planned" | "active" | "completed";

export interface PlanEntry extends ContentEntryBase {
  status: PlanStatus;
  summary: string;
}
