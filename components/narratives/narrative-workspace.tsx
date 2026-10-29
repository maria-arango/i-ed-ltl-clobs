"use client";
/**
 * The narrative editor (Amendments §51–§52): a white page on a grey canvas,
 * a small toolbar (Undo, Redo, Red, Black, Strikethrough, Comment), comments
 * in the right margin, the template's reflection questions, a link to the
 * video, and a save status that is always visible.
 *
 * Saving: every change goes to the SyncEngine (lib/narratives/sync-engine),
 * which writes IndexedDB within ~250 ms and the server within seconds. Only
 * the tab holding the Web Lock edits; another tab is read-only until the
 * person chooses "Edit here instead".
 */
import Link from "next/link";
import { MessageSquarePlus, Redo2, Strikethrough, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Node as PMNodeType } from "@tiptap/pm/model";
import {
  addCommentMark,
  commentAnchorPositions,
  commentsAt,
  isRedActive,
  narrativeEditorExtensions,
  removeCommentMark,
  removedOriginalChars,
  setActiveComment,
  setBlack,
  setRed,
  COMMENT_SHORTCUT_EVENT,
} from "./editor-extensions";
import { CommentsList, CommentsMargin, type CommentView } from "./comments-margin";
import { NxStatus } from "./nx-ui";
import type { NarrativeAnswers, NarrativeComment, PMNode } from "@/lib/narratives/doc";
import { answerFields, type NarrativeTemplate } from "@/lib/narratives/template";
import {
  createIdbStore,
  createTabLock,
  fetchTransport,
  requestPersistentStorage,
  type TabLock,
} from "@/lib/narratives/browser";
import { SyncEngine, type DraftRecord, type ServerCopy, type SyncStatus } from "@/lib/narratives/sync-engine";

export interface WorkspaceNarrative {
  assignmentId: string;
  orderNo: number;
  label: string;
  durationLabel: string | null;
  status: "not_started" | "in_progress" | "submitted" | "returned";
  videoUrl: string | null;
  revision: number;
  doc: PMNode;
  answers: NarrativeAnswers;
  comments: NarrativeComment[];
  updatedAt: string;
  template: NarrativeTemplate | null;
  readOnly: boolean;
}

type ReadOnlyReason = "submitted" | "other_tab" | null;

const STATUS_TEXT: Record<SyncStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  offline: "Offline – saved on this device",
  signed_out: "Signed out – saved on this device",
  conflict: "Needs your choice",
  read_only: "Read-only",
  error: "Not reaching the server – saved on this device, retrying",
};

function newId(): string {
  const r =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `c-${r}`;
}

const timeOf = (ms: number | null) =>
  ms ? new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";

function ToolbarButton({
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center gap-1.5 rounded px-2 text-[14px] font-medium ${
        pressed ? "bg-nx-accent-wash text-nx-accent" : "text-nx-text hover:bg-nx-sunken"
      } disabled:opacity-40`}
    >
      {children}
    </button>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button, textarea, a")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="nx-dialog-title"
        className="w-full max-w-[520px] rounded-md border border-nx-border bg-nx-surface p-5 shadow-lg"
      >
        <h2 id="nx-dialog-title" className="text-[18px] font-semibold">
          {title}
        </h2>
        <div className="mt-3 text-[15px] text-nx-text">{children}</div>
      </div>
    </div>
  );
}

export function NarrativeWorkspace({
  userId,
  userName,
  narrative,
}: {
  userId: string;
  userName: string;
  narrative: WorkspaceNarrative;
}) {
  const id = narrative.assignmentId;
  const [status, setStatus] = useState<SyncStatus>(narrative.readOnly ? "read_only" : "saved");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [readOnly, setReadOnly] = useState<ReadOnlyReason>(narrative.readOnly ? "submitted" : null);
  const [ready, setReady] = useState(narrative.readOnly);
  const [savedThisSession, setSavedThisSession] = useState(false);
  const [answers, setAnswers] = useState<NarrativeAnswers>(narrative.answers);
  const [comments, setComments] = useState<NarrativeComment[]>(narrative.comments);
  const [draftCommentId, setDraftCommentId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hideEvidence, setHideEvidence] = useState(false);
  const [deletedNote, setDeletedNote] = useState<number | null>(null);
  const [conflict, setConflict] = useState<{ device: DraftRecord | null; server: ServerCopy & { updatedAt?: string } } | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [wide, setWide] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [layout, setLayout] = useState<{ positions: Map<string, number>; excerpts: Map<string, string> }>({
    positions: new Map(),
    excerpts: new Map(),
  });
  const [, forceToolbar] = useState(0);

  const engineRef = useRef<SyncEngine | null>(null);
  const lockRef = useRef<TabLock | null>(null);
  const answersRef = useRef(answers);
  const commentsRef = useRef(comments);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastActivity = useRef(0);
  const template = narrative.template;
  const editable = !readOnly && ready && !conflict;

  /* ---- pushing state into the engine ------------------------------ */

  const pushNow = useCallback(() => {
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = null;
    const ed = editorRef.current;
    const engine = engineRef.current;
    if (!ed || !engine) return;
    engine.update({ doc: ed.getJSON() as PMNode, answers: answersRef.current, comments: commentsRef.current });
  }, []);

  /** Coalesce bursts of keystrokes (getJSON on a long document is not free). */
  const schedulePush = useCallback(() => {
    lastActivity.current = Date.now();
    if (pushTimer.current) return;
    pushTimer.current = setTimeout(pushNow, 150);
  }, [pushNow]);

  /* ---- the editor ------------------------------------------------- */

  const [extensions] = useState(() => narrativeEditorExtensions());
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: narrative.doc,
    editable: false,
    editorProps: {
      attributes: {
        "aria-label": "Narrative text",
        role: "textbox",
        "aria-multiline": "true",
        spellcheck: "true",
      },
      // Paste as plain text: formatting from elsewhere never enters the document.
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain");
        if (text === undefined) return false;
        view.dispatch(view.state.tr.insertText(text.replace(/\r\n?/g, "\n")));
        return true;
      },
      handleClick(view, pos) {
        const ids = commentsAt(view.state.doc, pos);
        const pick = ids[ids.length - 1] ?? null;
        setActiveId(pick);
        return false;
      },
    },
    onTransaction: ({ transaction }) => {
      forceToolbar((n) => n + 1);
      if (!transaction.docChanged) return;
      if (!transaction.getMeta("history$")) {
        const removed = removedOriginalChars(transaction.steps, transaction.docs);
        if (removed >= 15) setDeletedNote(removed);
      }
      schedulePush();
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  /* ---- engine + tab lock lifecycle ---------------------------------- */

  const startEngine = useCallback(
    async (server: ServerCopy) => {
      const ed = editorRef.current;
      if (!ed) return;
      const engine = new SyncEngine({
        userId,
        assignmentId: id,
        clientId: `tab-${newId().slice(2, 14)}`,
        store: createIdbStore(),
        transport: fetchTransport(),
        onStatus: (s, info) => {
          setStatus(s);
          setSavedAt(info.savedAt);
          if (s === "saved" && (engineRef.current?.baseRevision ?? 0) > narrative.revision) setSavedThisSession(true);
          if (s === "conflict" && engineRef.current?.state) {
            // A save was refused because the server moved on: fetch it and ask.
            void fetch(`/api/narratives/${id}`, { cache: "no-store" })
              .then((r) => (r.ok ? r.json() : null))
              .then((srv) => {
                if (srv) setConflict({ device: null, server: { ...srv, readOnly: srv.readOnly } });
              });
          }
        },
      });
      engineRef.current = engine;
      const init = await engine.init(server);
      if (init.source === "device") {
        ed.commands.setContent(init.state.doc, { emitUpdate: false });
        setAnswers(init.state.answers);
        answersRef.current = init.state.answers;
        setComments(init.state.comments);
        commentsRef.current = init.state.comments;
      } else if (init.source === "conflict") {
        setConflict({ device: init.device, server: init.server });
      }
      setReady(true);
    },
    [id, userId, narrative.revision],
  );

  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const server: ServerCopy = {
      revision: narrative.revision,
      doc: narrative.doc,
      answers: narrative.answers,
      comments: narrative.comments,
      readOnly: narrative.readOnly,
    };
    lastActivity.current = Date.now();
    void requestPersistentStorage().then(setPersisted);
    if (narrative.readOnly) return;
    const lock = createTabLock(`narrative:${id}`, () => {
      // Another tab took over: save what we have, then stop editing here.
      pushNow();
      void engineRef.current?.flushLocal();
      void engineRef.current?.syncNow();
      engineRef.current?.setReadOnly();
      setReadOnly("other_tab");
    });
    lockRef.current = lock;
    void lock.acquire().then(async (held) => {
      if (cancelled) return;
      if (!held) {
        setReadOnly("other_tab");
        setReady(true);
        return;
      }
      await startEngine(server);
    });
    return () => {
      cancelled = true;
      pushNow();
      void engineRef.current?.destroy();
      lock.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  /** "Edit here instead": take the lock, then load the freshest copy. */
  const takeOver = useCallback(async () => {
    const lock = lockRef.current;
    if (!lock) return;
    await lock.takeOver();
    await new Promise((r) => setTimeout(r, 800)); // let the other tab save
    const res = await fetch(`/api/narratives/${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const srv = await res.json();
    editorRef.current?.commands.setContent(srv.doc, { emitUpdate: false });
    setAnswers(srv.answers);
    answersRef.current = srv.answers;
    setComments(srv.comments);
    commentsRef.current = srv.comments;
    setReadOnly(null);
    if (engineRef.current) {
      await engineRef.current.resolveConflict("server", { ...srv, readOnly: false });
    } else {
      await startEngine({ ...srv, readOnly: false });
    }
  }, [id, startEngine]);

  /* ---- browser events: online, hide/close, focus, heartbeat --------- */

  useEffect(() => {
    const onOnline = () => engineRef.current?.online();
    const flush = () => {
      pushNow();
      void engineRef.current?.flushLocal();
      void engineRef.current?.syncNow();
    };
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      flush();
      if (lockRef.current?.held) {
        navigator.sendBeacon?.(`/api/narratives/${id}/sitting`, new Blob([JSON.stringify({ end: true })], { type: "application/json" }));
      }
    };
    const onPageHide = () => flush();
    const onFocus = async () => {
      if (engineRef.current?.currentStatus === "signed_out") {
        const r = await fetch("/api/narratives", { cache: "no-store" }).catch(() => null);
        if (r?.ok) engineRef.current?.resume();
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", onFocus);
    // Measured time: a heartbeat when the editor is ready, then every
    // minute while the page is visible and used in the last five minutes.
    const heartbeat = () => {
      if (!lockRef.current?.held || readOnly || !ready) return;
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivity.current > 5 * 60 * 1000) return;
      void fetch(`/api/narratives/${id}/sitting`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ storagePersisted: persisted, viewport: window.innerWidth }),
      }).catch(() => undefined);
    };
    heartbeat();
    const beat = setInterval(heartbeat, 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("focus", onFocus);
      clearInterval(beat);
    };
  }, [id, pushNow, persisted, readOnly, ready]);

  /* ---- layout: wide margin vs narrow panel, comment positions ------- */

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1180px)");
    const set = () => setWide(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);

  const recomputePositions = useCallback(() => {
    const ed = editorRef.current;
    const page = pageRef.current;
    if (!ed || !page || ed.isDestroyed) return;
    const base = page.getBoundingClientRect().top;
    const anchors = commentAnchorPositions(ed.state.doc as PMNodeType);
    const positions = new Map<string, number>();
    anchors.forEach((pos, cid) => {
      try {
        positions.set(cid, ed.view.coordsAtPos(pos).top - base);
      } catch {
        /* position not rendered */
      }
    });
    const excerpts = new Map<string, string>();
    ed.state.doc.descendants((node) => {
      if (!node.isText) return;
      for (const m of node.marks) {
        if (m.type.name !== "comment") continue;
        const prev = excerpts.get(m.attrs.commentId) ?? "";
        if (prev.length < 120) excerpts.set(m.attrs.commentId, (prev + node.text).slice(0, 120));
      }
    });
    setLayout({ positions, excerpts });
  }, []);

  useEffect(() => {
    if (!editor) return;
    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(recomputePositions);
    };
    schedule();
    editor.on("update", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      editor.off("update", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [editor, recomputePositions, hideEvidence, ready, comments.length, wide]);

  useEffect(() => {
    if (editor && !editor.isDestroyed) setActiveComment(editor, activeId);
  }, [editor, activeId]);

  /* ---- comments ---------------------------------------------------- */

  const commitComments = useCallback(
    (next: NarrativeComment[]) => {
      commentsRef.current = next;
      setComments(next);
      schedulePush();
    },
    [schedulePush],
  );

  const startComment = useCallback(() => {
    const ed = editorRef.current;
    if (!ed || !editable) return;
    if (ed.state.selection.empty) return;
    const cid = newId();
    addCommentMark(ed, cid);
    setDraftCommentId(cid);
    setActiveId(cid);
    if (!wide) setPanelOpen(true);
  }, [editable, wide]);
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onShortcut = () => startComment();
    dom.addEventListener(COMMENT_SHORTCUT_EVENT, onShortcut);
    return () => dom.removeEventListener(COMMENT_SHORTCUT_EVENT, onShortcut);
  }, [editor, startComment]);

  const saveComment = (cid: string, body: string) => {
    const now = new Date().toISOString();
    if (cid === draftCommentId) {
      commitComments([
        ...commentsRef.current,
        { id: cid, body, authorId: userId, authorName: userName, createdAt: now, updatedAt: now },
      ]);
      setDraftCommentId(null);
    } else {
      commitComments(commentsRef.current.map((c) => (c.id === cid ? { ...c, body, updatedAt: now } : c)));
    }
  };
  const cancelDraft = (cid: string) => {
    if (editorRef.current) removeCommentMark(editorRef.current, cid);
    setDraftCommentId(null);
    setActiveId(null);
  };
  const deleteComment = (cid: string) => {
    if (!window.confirm("Delete this comment?")) return;
    if (editorRef.current) removeCommentMark(editorRef.current, cid);
    commitComments(commentsRef.current.filter((c) => c.id !== cid));
    setActiveId(null);
  };
  const activate = (cid: string) => {
    setActiveId(cid);
    const ed = editorRef.current;
    const pos = ed ? commentAnchorPositions(ed.state.doc as PMNodeType).get(cid) : undefined;
    if (ed && pos !== undefined && !wide) {
      ed.commands.setTextSelection(pos);
      ed.commands.scrollIntoView();
      setPanelOpen(false);
    }
  };

  const commentViews: CommentView[] = useMemo(() => {
    const { positions, excerpts } = layout;
    const list: CommentView[] = comments.map((c) => ({
      ...c,
      excerpt: excerpts.get(c.id) ?? "",
      top: positions.get(c.id) ?? null,
      isDraft: false,
    }));
    if (draftCommentId) {
      list.push({
        id: draftCommentId,
        body: "",
        authorId: userId,
        authorName: userName,
        createdAt: "",
        updatedAt: "",
        excerpt: excerpts.get(draftCommentId) ?? "",
        top: positions.get(draftCommentId) ?? 0,
        isDraft: true,
      });
    }
    return list;
  }, [comments, layout, draftCommentId, userId, userName]);

  /* ---- answers ----------------------------------------------------- */

  const setAnswer = (key: string, value: string) => {
    const next = { ...answersRef.current, [key]: value };
    answersRef.current = next;
    setAnswers(next);
    schedulePush();
  };

  /* ---- conflict, submit ------------------------------------------- */

  const resolve = async (choice: "device" | "server") => {
    const engine = engineRef.current;
    if (!engine || !conflict) return;
    const state = await engine.resolveConflict(choice, conflict.server);
    editorRef.current?.commands.setContent(state.doc, { emitUpdate: false });
    answersRef.current = state.answers;
    setAnswers(state.answers);
    commentsRef.current = state.comments;
    setComments(state.comments);
    setConflict(null);
    if (conflict.server.readOnly && choice === "server") setReadOnly("submitted");
  };

  const fields = template ? answerFields(template) : [];
  const unanswered = fields.filter((f) => !(answers as Record<string, string | undefined>)[f.key]?.trim());
  const synced = status === "saved";

  const submit = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    setSubmitting(true);
    setSubmitError(null);
    pushNow();
    await engine.syncNow();
    if (engine.dirty || engine.currentStatus !== "saved") {
      setSubmitting(false);
      setSubmitError("Your latest changes have not reached the server yet. Check your connection and try again.");
      return;
    }
    const res = await fetch(`/api/narratives/${id}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseRevision: engine.baseRevision }),
    }).catch(() => null);
    setSubmitting(false);
    if (!res) {
      setSubmitError("Could not reach the server. Your work is safe on this device; try again when connected.");
      return;
    }
    if (res.ok) {
      await engine.markSubmitted();
      lockRef.current?.release();
      setReadOnly("submitted");
      setSubmitOpen(false);
      setJustSubmitted(true);
      return;
    }
    if (res.status === 409) setSubmitError("Some changes were still saving. Please press Submit again.");
    else if (res.status === 401) setSubmitError("You were signed out. Sign in again in a new tab, then submit.");
    else setSubmitError("The server refused the submission. Please tell the coordinators.");
  };

  /* ---- render ------------------------------------------------------ */

  const statusText =
    readOnly === "submitted"
      ? "Submitted – read-only"
      : readOnly === "other_tab"
        ? "Open in another tab – read-only here"
        : status === "saved" && savedAt
          ? `Saved ${timeOf(savedAt)}`
          : STATUS_TEXT[status];
  const statusTone =
    readOnly || status === "saved"
      ? "text-nx-muted"
      : status === "saving"
        ? "text-nx-muted"
        : status === "offline" || status === "error"
          ? "text-nx-warn"
          : "text-nx-danger";

  // Status tag: submitted wins; a save accepted in this session means in progress.
  const headerStatus =
    readOnly === "submitted"
      ? "submitted"
      : narrative.status === "not_started" && !savedThisSession
        ? "not_started"
        : narrative.status === "submitted"
          ? "submitted"
          : "in_progress";

  const commentProps = {
    comments: commentViews,
    activeId,
    canEdit: editable,
    userId,
    onActivate: activate,
    onSave: saveComment,
    onCancelDraft: cancelDraft,
    onDelete: deleteComment,
  };

  return (
    <div>
      {/* Header strip: back, title, video, save status, submit */}
      <div className="border-b border-nx-border bg-nx-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/narratives" className="text-[14px] font-medium text-nx-accent hover:underline">
            ← Narratives
          </Link>
          <h1 className="text-[17px] font-semibold">
            {narrative.label}
            {narrative.durationLabel && (
              <span className="ml-2 text-[14px] font-normal text-nx-muted">{narrative.durationLabel}</span>
            )}
          </h1>
          <NxStatus status={headerStatus} />
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <span role="status" aria-live="polite" className={`text-[14px] ${statusTone}`}>
              {statusText}
            </span>
            {narrative.videoUrl ? (
              <a
                href={narrative.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md border border-nx-border-strong bg-nx-surface px-3 py-1.5 text-[14px] font-medium hover:bg-nx-sunken"
              >
                Open video in a new tab
              </a>
            ) : (
              <span className="text-[14px] text-nx-muted">No video link yet</span>
            )}
            {!readOnly && (
              <button
                type="button"
                disabled={!ready || !!conflict}
                onClick={() => {
                  setSubmitError(null);
                  setSubmitOpen(true);
                }}
                className="rounded-md bg-nx-accent px-3.5 py-1.5 text-[14px] font-medium text-white hover:bg-nx-accent-hover disabled:opacity-50"
              >
                Submit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Banners */}
      <div className="mx-auto max-w-[1400px] space-y-2 px-4 pt-3 sm:px-6">
        {justSubmitted && (
          <div role="status" className="rounded-md border border-nx-success bg-nx-success-wash px-4 py-3 text-[14px]">
            Submitted. Thank you. It is now read-only; the coordinators can reopen it if anything needs changing.{" "}
            <Link href="/narratives" className="font-medium text-nx-accent underline">
              Back to your list
            </Link>
          </div>
        )}
        {status === "signed_out" && (
          <div role="alert" className="rounded-md border border-nx-danger bg-nx-danger-wash px-4 py-3 text-[14px]">
            You were signed out. <strong>Your work is saved on this device.</strong>{" "}
            <a href="/signin" target="_blank" rel="noopener" className="font-medium text-nx-accent underline">
              Sign in again
            </a>{" "}
            (opens a new tab), then come back here: saving resumes on its own.
          </div>
        )}
        {readOnly === "other_tab" && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-nx-border-strong bg-nx-surface px-4 py-3 text-[14px]">
            <span>This narrative is open in another tab or window. To avoid two versions, you can only read it here.</span>
            <button
              type="button"
              onClick={() => void takeOver()}
              className="rounded-md border border-nx-border-strong px-3 py-1 font-medium hover:bg-nx-sunken"
            >
              Edit here instead
            </button>
          </div>
        )}
        {deletedNote !== null && editable && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-nx-warn bg-nx-warn-wash px-4 py-3 text-[14px]">
            <span>
              You deleted {deletedNote} characters of the original AI text. The instructions ask you to keep it and
              strike through what is incorrect.
            </span>
            <button
              type="button"
              onClick={() => {
                editorRef.current?.commands.undo();
                setDeletedNote(null);
              }}
              className="rounded-md border border-nx-border-strong bg-nx-surface px-3 py-1 font-medium hover:bg-nx-sunken"
            >
              Undo
            </button>
            <button type="button" onClick={() => setDeletedNote(null)} className="font-medium text-nx-muted hover:underline">
              Dismiss
            </button>
          </div>
        )}
        {persisted === false && !readOnly && (
          <p className="text-[13px] text-nx-muted">
            This browser did not grant permanent storage. Your work is still saved on the server every few seconds.
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="sticky top-0 z-20 mt-3 border-y border-nx-border bg-nx-surface">
        <div
          role="toolbar"
          aria-label="Formatting"
          className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-1 px-4 py-1.5 sm:px-6"
        >
          <ToolbarButton label="Undo" shortcut="Ctrl+Z" disabled={!editable || !editor?.can().undo()} onClick={() => editor?.commands.undo()}>
            <Undo2 size={16} aria-hidden /> Undo
          </ToolbarButton>
          <ToolbarButton label="Redo" shortcut="Ctrl+Shift+Z" disabled={!editable || !editor?.can().redo()} onClick={() => editor?.commands.redo()}>
            <Redo2 size={16} aria-hidden /> Redo
          </ToolbarButton>
          <span className="mx-1 h-6 w-px bg-nx-border" aria-hidden />
          <ToolbarButton
            label="Red text"
            shortcut="Ctrl+Shift+R"
            pressed={!!editor && isRedActive(editor)}
            disabled={!editable}
            onClick={() => editor && setRed(editor)}
          >
            <span aria-hidden className="font-bold text-nx-red underline decoration-2">A</span> Red
          </ToolbarButton>
          <ToolbarButton
            label="Black text"
            pressed={!!editor && !isRedActive(editor)}
            disabled={!editable}
            onClick={() => editor && setBlack(editor)}
          >
            <span aria-hidden className="font-bold underline decoration-2">A</span> Black
          </ToolbarButton>
          <ToolbarButton
            label="Strikethrough"
            shortcut="Ctrl+Shift+X"
            pressed={!!editor?.isActive("strike")}
            disabled={!editable}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={16} aria-hidden /> Strikethrough
          </ToolbarButton>
          <ToolbarButton
            label="Comment on the selected text"
            shortcut="Ctrl+Alt+M"
            disabled={!editable || !editor || editor.state.selection.empty}
            onClick={startComment}
          >
            <MessageSquarePlus size={16} aria-hidden /> Comment
          </ToolbarButton>
          <span className="ml-auto" />
          <label className="flex items-center gap-2 px-2 text-[13px] text-nx-muted">
            <input type="checkbox" checked={hideEvidence} onChange={(e) => setHideEvidence(e.target.checked)} />
            Hide grey evidence codes
          </label>
          {!wide && (
            <ToolbarButton label="Show comments" pressed={panelOpen} onClick={() => setPanelOpen((v) => !v)}>
              Comments ({comments.length})
            </ToolbarButton>
          )}
        </div>
      </div>

      {/* Page + margin */}
      <div className="mx-auto flex max-w-[1400px] justify-center gap-6 px-2 py-6 sm:px-6">
        <div
          ref={pageRef}
          className="relative w-full max-w-[816px] rounded-sm border border-nx-border bg-nx-surface px-6 py-8 shadow-sm sm:px-[72px] sm:py-[64px]"
        >
          {template && (
            <section aria-label="Review questions" className="mb-8 text-[15px]">
              <h2 className="text-[22px] font-bold">
                {template.title}: {narrative.label}
              </h2>
              <p className="mt-2 text-[14px]">
                <strong>Reviewer:</strong> {userName}
                <br />
                <strong>Lesson length according to the narrative:</strong> {narrative.durationLabel ?? "unknown"}
              </p>
              <p className="mt-2 text-[14px] text-nx-muted">{template.checkNote}</p>
              <p className="mt-3 text-[14px]">
                <strong>{template.howToEditLabel}</strong> {template.howToEdit}
              </p>
              {fields.map((f) => (
                <div key={f.key} className="mt-5">
                  {f.title && <h3 className="text-[17px] font-bold">{f.title}</h3>}
                  {template.questions.find((q) => q.title === f.title && q.parts?.length) && (
                    <p className="mt-1 text-[14px] text-nx-muted">
                      {template.questions.find((q) => q.title === f.title)!.prompt}
                    </p>
                  )}
                  <label htmlFor={`answer-${f.key}`} className="mt-1 block text-[14px] text-nx-muted">
                    {f.prompt}
                  </label>
                  <textarea
                    id={`answer-${f.key}`}
                    value={(answers as Record<string, string | undefined>)[f.key] ?? ""}
                    readOnly={!editable}
                    onChange={(e) => setAnswer(f.key, e.target.value)}
                    rows={4}
                    className="mt-2 w-full resize-y rounded border border-nx-border-strong px-3 py-2 text-[15px] read-only:bg-nx-sunken"
                  />
                </div>
              ))}
              <p className="mt-5 text-[14px]">
                <strong>{template.timeLabel}</strong> measured by the platform while you work.
              </p>
              <p className="mt-8 text-[13px] font-bold text-nx-muted">{template.narrativeLabel}</p>
            </section>
          )}
          <div className={`nx-doc ${hideEvidence ? "nx-hide-evidence" : ""}`}>
            {!ready && <p className="text-nx-muted">Loading the narrative…</p>}
            <EditorContent editor={editor} />
          </div>
        </div>
        {wide && (
          <aside aria-label="Comments" className="relative w-[300px] shrink-0">
            <CommentsMargin {...commentProps} />
          </aside>
        )}
      </div>

      {/* Narrow screens: comments panel */}
      {!wide && panelOpen && (
        <aside
          aria-label="Comments"
          className="fixed inset-y-0 right-0 z-40 w-full max-w-[380px] overflow-y-auto border-l border-nx-border bg-nx-canvas p-4 shadow-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold">Comments</h2>
            <button type="button" onClick={() => setPanelOpen(false)} className="rounded-md border border-nx-border-strong px-3 py-1 text-[14px]">
              Close
            </button>
          </div>
          <CommentsList {...commentProps} />
        </aside>
      )}

      {conflict && (
        <Dialog title="Two versions of this narrative">
          <p>
            This narrative was also changed somewhere else (another device or tab). Choose which version to continue
            with. <strong>Nothing is lost:</strong> the other version is kept in the version history, and the
            coordinators can bring it back.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void resolve("device")}
              className="rounded-md bg-nx-accent px-3.5 py-2 text-left text-[14px] font-medium text-white hover:bg-nx-accent-hover"
            >
              Keep the version on this device
              {conflict.device && ` (last change ${timeOf(conflict.device.savedLocallyAt)})`}
            </button>
            <button
              type="button"
              onClick={() => void resolve("server")}
              className="rounded-md border border-nx-border-strong px-3.5 py-2 text-left text-[14px] font-medium hover:bg-nx-sunken"
            >
              Use the version saved from the other device
              {conflict.server.updatedAt && ` (saved ${timeOf(Date.parse(conflict.server.updatedAt))})`}
            </button>
          </div>
        </Dialog>
      )}

      {submitOpen && (
        <Dialog title="Submit this narrative?" onClose={() => !submitting && setSubmitOpen(false)}>
          <p>After submitting you cannot change it. The coordinators can reopen it if needed.</p>
          {unanswered.length > 0 && (
            <div className="mt-3 rounded-md border border-nx-warn bg-nx-warn-wash px-3 py-2 text-[14px]">
              Not answered yet:
              <ul className="mt-1 list-disc pl-5">
                {unanswered.map((f) => (
                  <li key={f.key}>{f.title ?? f.prompt.slice(0, 60)}</li>
                ))}
              </ul>
            </div>
          )}
          {!synced && <p className="mt-3 text-[14px] text-nx-muted">Waiting for your last changes to save…</p>}
          {submitError && (
            <p role="alert" className="mt-3 text-[14px] text-nx-danger">
              {submitError}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="rounded-md bg-nx-accent px-3.5 py-2 text-[14px] font-medium text-white hover:bg-nx-accent-hover disabled:opacity-50"
            >
              {submitting ? "Submitting…" : unanswered.length ? "Submit anyway" : "Submit"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setSubmitOpen(false)}
              className="rounded-md border border-nx-border-strong px-3.5 py-2 text-[14px] font-medium hover:bg-nx-sunken"
            >
              Keep working
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
