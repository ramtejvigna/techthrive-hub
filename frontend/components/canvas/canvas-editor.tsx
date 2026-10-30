"use client";

import { CanvasIcon, ProjectsIcon } from "@/components/icons/nav-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiError, api } from "@/lib/api";
import { queryKeys, useProjects } from "@/lib/queries";
import type { Canvas, CanvasScene } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
  getNonDeletedElements,
  getSceneVersion,
  getTextFromElements,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./canvas-editor.css";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict";
type CanvasPatch = Parameters<typeof api.updateCanvas>[1];
type ExcalidrawProps = ComponentProps<typeof Excalidraw>;
type HandleChange = NonNullable<ExcalidrawProps["onChange"]>;
type Elements = Parameters<HandleChange>[0];
type ExcalidrawApi = Parameters<NonNullable<ExcalidrawProps["excalidrawAPI"]>>[0];

const AUTOSAVE_DELAY_MS = 1500;
const THUMBNAIL_SIZE = 480;
// Matches MAX_THUMBNAIL_BYTES on the backend.
const MAX_THUMBNAIL_LENGTH = 256 * 1024;

// The app owns the theme, and images wait on file storage (scenes are JSON).
const UI_OPTIONS: ExcalidrawProps["UIOptions"] = {
  canvasActions: { toggleTheme: false },
  tools: { image: false },
};

const STATUS_STYLES: Record<SaveStatus, { label: string; dot: string }> = {
  saved: { label: "Saved", dot: "bg-emerald-500" },
  pending: { label: "Unsaved", dot: "bg-amber-500" },
  saving: { label: "Saving...", dot: "bg-amber-500 animate-pulse" },
  error: { label: "Not saved", dot: "bg-red-500" },
  conflict: { label: "Not saved", dot: "bg-red-500" },
};

async function renderThumbnail(scene: CanvasScene): Promise<string | undefined> {
  const elements = (scene.elements ?? []) as Elements;
  if (elements.length === 0) return "";
  try {
    const blob = await exportToBlob({
      elements,
      appState: {
        exportBackground: true,
        viewBackgroundColor: scene.appState?.viewBackgroundColor,
      },
      files: null,
      mimeType: "image/png",
      maxWidthOrHeight: THUMBNAIL_SIZE,
    });
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return dataUrl.length <= MAX_THUMBNAIL_LENGTH ? dataUrl : undefined;
  } catch {
    // A missing preview is no reason to fail the save.
    return undefined;
  }
}

export function CanvasEditor({ canvas }: { canvas: Canvas }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { data: projects = [] } = useProjects();
  const [title, setTitle] = useState(canvas.title);
  const [project, setProject] = useState(canvas.project);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState(canvas.updated_at);
  const [copying, setCopying] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [initialData] = useState<ExcalidrawProps["initialData"]>(() => ({
    elements: (canvas.scene.elements ?? []) as Elements,
    appState: canvas.scene.appState,
    scrollToContent: true,
  }));

  const excalidraw = useRef<ExcalidrawApi | null>(null);
  // The scene as of the last change, to tell real edits from pans and selections.
  const sceneHash = useRef<string | null>(null);
  const baseVersion = useRef(canvas.version);
  const conflicted = useRef(false);
  const discarding = useRef(false);

  // Saves are serialized through a promise chain so an older request can
  // never land after (and overwrite) a newer one.
  const pending = useRef<CanvasPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    chain.current = chain.current.then(async () => {
      const payload = pending.current;
      if (conflicted.current || Object.keys(payload).length === 0) return;
      pending.current = {};
      setStatus("saving");
      try {
        const body = { ...payload };
        if (payload.scene) {
          body.base_version = baseVersion.current;
          const thumbnail = await renderThumbnail(payload.scene);
          if (thumbnail !== undefined) body.thumbnail = thumbnail;
        }
        const saved = await api.updateCanvas(canvas.id, body);
        baseVersion.current = saved.version;
        setLastSavedAt(saved.updated_at);
        setSaveError(null);
        // Titles and previews in the canvas lists are now out of date.
        void queryClient.invalidateQueries({ queryKey: queryKeys.canvases.lists() });
        setStatus(Object.keys(pending.current).length ? "pending" : "saved");
      } catch (err) {
        // Keep the failed changes so the next edit (or retry) sends them again.
        pending.current = { ...payload, ...pending.current };
        if (err instanceof ApiError && err.status === 409) {
          conflicted.current = true;
          setStatus("conflict");
        } else {
          setSaveError(err instanceof ApiError && err.status === 400 ? err.message : null);
          setStatus("error");
        }
      }
    });
    return chain.current;
  }, [canvas.id, queryClient]);

  const queue = useCallback(
    (patch: CanvasPatch) => {
      pending.current = { ...pending.current, ...patch };
      if (conflicted.current) return;
      setStatus("pending");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  const handleChange = useCallback<HandleChange>(
    (elements, appState) => {
      if (appState.isLoading) return;

      // Images can arrive by paste, drop or a loaded file, so catch them here.
      const live = getNonDeletedElements(elements);
      if (live.some((element) => element.type === "image")) {
        excalidraw.current?.updateScene({
          elements: elements.filter((element) => element.type !== "image"),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        excalidraw.current?.setToast({ message: "Images aren't supported on canvases yet." });
        return;
      }

      const hash = `${getSceneVersion(elements)}:${appState.viewBackgroundColor}`;
      if (sceneHash.current === null) {
        sceneHash.current = hash;
        return;
      }
      if (hash === sceneHash.current) return;
      sceneHash.current = hash;

      queue({
        scene: {
          elements: live,
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
        },
        scene_text: getTextFromElements(live),
      });
    },
    [queue],
  );

  // Flush on unmount (e.g. navigating back to the canvas list).
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (status !== "saved" && !discarding.current) event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [status]);

  useEffect(() => {
    document.title = `${title || "Untitled canvas"} · Canvas`;
  }, [title]);

  function handleReload() {
    discarding.current = true;
    window.location.reload();
  }

  async function handleSaveCopy() {
    setCopying(true);
    try {
      const scene = pending.current.scene ?? canvas.scene;
      const copy = await api.createCanvas({
        title: `${title || "Untitled canvas"} (copy)`,
        project,
        scene,
        scene_text: pending.current.scene_text ?? canvas.scene_text,
        thumbnail: (await renderThumbnail(scene)) ?? "",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.canvases.lists() });
      discarding.current = true;
      router.push(`/canvas/${copy.id}`);
    } catch {
      setCopying(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${title || "Untitled canvas"}"? This can't be undone.`)) return;
    pending.current = {};
    if (timer.current) clearTimeout(timer.current);
    await api.deleteCanvas(canvas.id);
    void queryClient.invalidateQueries({ queryKey: queryKeys.canvases.lists() });
    router.push("/canvas");
  }

  const handleExcalidrawApi = useCallback((instance: ExcalidrawApi) => {
    excalidraw.current = instance;
  }, []);

  const editorMenus = useMemo(
    () => (
      <>
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.CommandPalette />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Item onSelect={() => setTheme(isDark ? "light" : "dark")}>
            {isDark ? "Light mode" : "Dark mode"}
          </MainMenu.Item>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
        <WelcomeScreen>
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>
              <CanvasIcon className="h-10 w-10 text-[var(--accent)]" />
            </WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>
              Sketch an architecture, a mind map or a flow
            </WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItem
                icon={<CanvasIcon />}
                onSelect={() =>
                  excalidraw.current?.updateScene({
                    appState: { openDialog: { name: "ttd", tab: "mermaid" } },
                  })
                }
              >
                Import from Mermaid
              </WelcomeScreen.Center.MenuItem>
              <WelcomeScreen.Center.MenuItemLoadScene />
              <WelcomeScreen.Center.MenuItemHelp />
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
        </WelcomeScreen>
      </>
    ),
    [isDark, setTheme],
  );

  const optionsMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Canvas options" />
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => router.push("/canvas")}>All canvases</DropdownMenuItem>
        {canvas.is_owner && (
          <DropdownMenuItem destructive onClick={handleDelete}>
            Delete canvas
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const controls = (
    <div className="flex items-center gap-1.5">
      <label
        title={
          canvas.is_owner
            ? "Sharing with a project lets its members edit this canvas"
            : "Only the canvas owner can change this"
        }
        className="flex h-9 items-center gap-1.5 rounded-[0.625rem] border border-[var(--border)] bg-[var(--surface)] pl-2.5 pr-1 text-[var(--muted)] shadow-sm transition-colors hover:border-[var(--border-strong)]"
      >
        <ProjectsIcon className="h-4 w-4 shrink-0" />
        <select
          value={project ?? ""}
          onChange={(e) => {
            const next = e.target.value || null;
            setProject(next);
            queue({ project: next });
            void flush();
          }}
          disabled={!canvas.is_owner}
          aria-label="Project"
          className="w-28 truncate bg-transparent text-sm text-[var(--foreground)] outline-none disabled:opacity-70 2xl:w-36"
        >
          <option value="">No project</option>
          {project && !projects.some((item) => item.id === project) && (
            <option value={project}>{canvas.project_name}</option>
          )}
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => setFocusMode((current) => !current)}
        aria-label={focusMode ? "Exit focus mode" : "Focus mode"}
        title={focusMode ? "Exit focus mode" : "Focus mode"}
        className="flex h-9 w-9 items-center justify-center rounded-[0.625rem] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] shadow-sm transition-colors hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d={focusMode ? "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" : "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"}
          />
        </svg>
      </button>
      {optionsMenu}
    </div>
  );

  const statusStyle = STATUS_STYLES[status];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-2 pb-2 pt-1 md:px-3 md:pb-3">
      {/* Focus mode covers the app rather than using browser fullscreen, which
          would hide Excalidraw's dialogs: they render on document.body. */}
      <div
        className={cn(
          "canvas-stage isolate flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]",
          focusMode
            ? "fixed inset-0 z-40"
            : "relative rounded-[1.375rem] border border-[var(--border)] shadow-[var(--panel-shadow)]",
        )}
      >
        {/* Sits in the canvas's top-left gap on wide screens; a plain row otherwise. */}
        <div className="z-[5] flex shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--surface)] p-1.5 xl:absolute xl:left-[4.25rem] xl:top-4 xl:h-9 xl:rounded-[0.625rem] xl:border xl:p-0 xl:pl-1 xl:pr-3 xl:shadow-sm">
          <Link
            href="/canvas"
            aria-label="All canvases"
            title="All canvases"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              queue({ title: e.target.value });
            }}
            onBlur={() => {
              if (!title.trim()) setTitle("Untitled canvas");
              void flush();
            }}
            aria-label="Canvas title"
            placeholder="Untitled canvas"
            maxLength={255}
            className="min-w-20 flex-1 truncate rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium text-[var(--foreground)] outline-none [field-sizing:content] hover:bg-[var(--surface-hover)] focus:border-[var(--accent)] xl:max-w-44 xl:flex-none 2xl:max-w-64"
          />
          <span
            role="status"
            aria-live="polite"
            className="ml-1 flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted)]"
            title={status === "saved" ? `Last saved ${new Date(lastSavedAt).toLocaleString()}` : undefined}
          >
            <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", statusStyle.dot)} />
            {statusStyle.label}
          </span>
          <div className="ml-auto md:hidden">{optionsMenu}</div>
        </div>

        <div className="relative min-h-0 flex-1">
          <Excalidraw
            excalidrawAPI={handleExcalidrawApi}
            initialData={initialData}
            onChange={handleChange}
            theme={isDark ? "dark" : "light"}
            name={title || "Untitled canvas"}
            UIOptions={UI_OPTIONS}
            renderTopRightUI={(isMobile) => (isMobile ? null : controls)}
          >
            {editorMenus}
          </Excalidraw>
        </div>

        {(status === "conflict" || (status === "error" && saveError)) && (
          <div
            role="alert"
            className="panel-ink absolute bottom-20 left-1/2 z-[5] flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap items-center gap-3 px-4 py-2.5 text-sm"
          >
            {status === "conflict" ? (
              <>
                <span>Someone else changed this canvas. Your latest edits aren&apos;t saved.</span>
                <button type="button" onClick={handleSaveCopy} disabled={copying} className="chip">
                  {copying ? "Saving copy..." : "Save my version as a copy"}
                </button>
                <button type="button" onClick={handleReload} className="chip">
                  Reload their version
                </button>
              </>
            ) : (
              <span>{saveError}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
