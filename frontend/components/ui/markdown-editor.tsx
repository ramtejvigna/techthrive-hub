"use client";

import { Avatar } from "@/components/kanban/jira-icons";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  EditorContent,
  Extension,
  useEditor,
  type Editor,
  type Extensions,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useMemo, useRef, useState } from "react";

/** `@someone@example.com`, matching the backend's mention syntax. */
const MENTION_RE = /(?<![\w@.])@[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const EMAIL_LIKE_RE = /^(mailto:)?[^\s@/]+@[^\s@/]+$/i;
const MAX_MENTION_SUGGESTIONS = 6;

/** Styles mentions as chips without changing the stored Markdown. */
const MentionHighlight = Extension.create({
  name: "mentionHighlight",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("mentionHighlight"),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const match of node.text.matchAll(MENTION_RE)) {
                const from = pos + (match.index ?? 0);
                decorations.push(
                  Decoration.inline(from, from + match[0].length, { class: "mention" }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/*
 * Rich text that is stored as Markdown. Typing Markdown syntax formats as you
 * type ("- " → bullet list, "1. " → numbered list, "# " → heading,
 * "[ ] " → checklist, **bold**, `code`, "> " → quote), and the saved value is
 * still plain Markdown, so older plain-text content loads unchanged.
 */

function buildExtensions({
  placeholder,
  readOnly = false,
  checkableTasks = false,
}: { placeholder?: string; readOnly?: boolean; checkableTasks?: boolean } = {}): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      // The trailing empty paragraph lets you click below a list to keep typing,
      // but in read-only views it's just blank space.
      trailingNode: readOnly ? false : undefined,
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
        // Emails stay plain text so "@name@domain" mentions survive as typed.
        shouldAutoLink: (url) => !EMAIL_LIKE_RE.test(url),
      },
    }),
    MentionHighlight,
    TaskList,
    TaskItem.configure({
      nested: true,
      // In a read-only view this only keeps the box ticked; MarkdownView updates the document.
      ...(checkableTasks ? { onReadOnlyChecked: () => true } : {}),
    }),
    // `breaks` keeps single newlines from older plain-text content as line breaks.
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
  ];
}

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** Called on Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  /** Called on Escape. */
  onCancel?: () => void;
  /** People who can be @mentioned; typing "@" suggests them. */
  mentionCandidates?: User[];
  "aria-label"?: string;
}

interface MentionQuery {
  query: string;
  from: number;
  to: number;
}

/** The "@query" being typed right before the cursor, if any. */
function findMentionQuery(editor: Editor): MentionQuery | null {
  const { selection } = editor.state;
  if (!selection.empty) return null;
  const { $from } = selection;
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const match = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (!match) return null;
  return { query: match[1], from: $from.pos - match[1].length - 1, to: $from.pos };
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  autoFocus = false,
  className,
  onSubmit,
  onCancel,
  mentionCandidates,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!mention || !mentionCandidates?.length) return [];
    const query = mention.query.toLowerCase();
    return mentionCandidates
      .filter((user) => user.email.toLowerCase().includes(query))
      .slice(0, MAX_MENTION_SUGGESTIONS);
  }, [mention, mentionCandidates]);

  // ProseMirror's key handler is registered once, so it reads these refs.
  const mentionRef = useRef({ mention, suggestions, index: mentionIndex });
  useEffect(() => {
    mentionRef.current = { mention, suggestions, index: mentionIndex };
  }, [mention, suggestions, mentionIndex]);
  const candidatesRef = useRef(mentionCandidates);
  useEffect(() => {
    candidatesRef.current = mentionCandidates;
  }, [mentionCandidates]);

  function trackMention(current: Editor) {
    const next = candidatesRef.current?.length ? findMentionQuery(current) : null;
    if (next?.query !== mentionRef.current.mention?.query) setMentionIndex(0);
    setMention(next);
  }

  function insertMention(current: Editor, target: MentionQuery, user: User) {
    current
      .chain()
      .focus()
      .insertContentAt({ from: target.from, to: target.to }, `@${user.email} `)
      .run();
    setMention(null);
  }

  const editor = useEditor({
    extensions: buildExtensions({ placeholder }),
    content: value,
    contentType: "markdown",
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: "md-content min-h-[4.5rem] px-3.5 py-2.5 outline-none",
        role: "textbox",
        "aria-multiline": "true",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
      handleKeyDown: (_view, event) => {
        const active = mentionRef.current;
        if (active.mention && active.suggestions.length > 0) {
          const count = active.suggestions.length;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            setMentionIndex((active.index + step + count) % count);
            return true;
          }
          if ((event.key === "Enter" || event.key === "Tab") && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            const user = active.suggestions[Math.min(active.index, count - 1)];
            if (editorRef.current) insertMention(editorRef.current, active.mention, user);
            return true;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setMention(null);
            return true;
          }
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmit) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        if (event.key === "Escape" && onCancel) {
          event.preventDefault();
          onCancel();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.isEmpty ? "" : current.getMarkdown());
      trackMention(current);
    },
    onSelectionUpdate: ({ editor: current }) => trackMention(current),
    onBlur: () => setMention(null),
  });
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Follow external resets (e.g. clearing the comment box after posting).
  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getMarkdown();
    if (value !== current) {
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, value]);

  return (
    <div
      className={cn(
        "relative rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] text-sm text-[var(--foreground)] transition-all focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/15",
        className,
      )}
    >
      <EditorContent editor={editor} />
      {mention && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="absolute left-0 top-full z-30 mt-1 w-full max-w-xs overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1 shadow-lg"
        >
          {suggestions.map((user, index) => (
            <li
              key={user.id}
              role="option"
              aria-selected={index === mentionIndex}
              // Keep the editor focused so the selection isn't lost on click.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setMentionIndex(index)}
              onClick={() => editor && insertMention(editor, mention, user)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                index === mentionIndex && "bg-[var(--surface-hover)]",
              )}
            >
              <Avatar email={user.email} size={20} />
              <span className="truncate">{user.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MarkdownView({
  value,
  className,
  onChange,
}: {
  value: string;
  className?: string;
  /** When set, checklist boxes can be ticked and the updated Markdown is reported here. */
  onChange?: (markdown: string) => void;
}) {
  const editor = useEditor({
    extensions: buildExtensions({ readOnly: true, checkableTasks: Boolean(onChange) }),
    content: value,
    contentType: "markdown",
    editable: false,
    immediatelyRender: false,
    editorProps: { attributes: { class: "md-content outline-none" } },
    onUpdate: ({ editor: current }) => onChange?.(current.getMarkdown()),
  });

  // A read-only editor only lets a checklist box *look* ticked, so apply the
  // change to the document here; that fires onUpdate, which reports it. This
  // is a native listener because ProseMirror creates these checkboxes, and
  // React's onChange never fires for inputs it didn't render.
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !editor || !onChange) return;

    function handleChange(event: Event) {
      const target = event.target;
      if (!editor || !(target instanceof HTMLInputElement) || target.type !== "checkbox") return;
      // Task items render as <li data-checked>; the node-type check below confirms it.
      const item = target.closest("li[data-checked]");
      if (!item) return;
      const pos = editor.view.posAtDOM(item, 0) - 1;
      const node = editor.state.doc.nodeAt(pos);
      if (node?.type.name !== "taskItem") return;
      editor.view.dispatch(
        editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: target.checked }),
      );
    }

    container.addEventListener("change", handleChange);
    return () => container.removeEventListener("change", handleChange);
  }, [editor, onChange]);

  useEffect(() => {
    if (editor && !editor.isDestroyed && value !== editor.getMarkdown()) {
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    }
  }, [editor, value]);

  // Until the editor mounts on the client, show the raw text so there's no layout jump.
  if (!editor) {
    return <div className={cn("whitespace-pre-wrap text-sm", className)}>{value}</div>;
  }
  return (
    <div ref={containerRef}>
      <EditorContent editor={editor} className={cn("text-sm", className)} />
    </div>
  );
}

export function MarkdownHint() {
  return (
    <p className="font-mono text-[10px] text-[var(--muted-light)]">
      Markdown: <code>-</code> list · <code>1.</code> numbered · <code>[ ]</code> checklist ·{" "}
      <code>#</code> heading · <code>**bold**</code> · <code>`code`</code> · <code>&gt;</code> quote ·{" "}
      <code>@</code> mention
    </p>
  );
}
