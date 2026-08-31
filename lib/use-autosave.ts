"use client";
/**
 * Debounced autosave with an offline-safe local mirror (CLAUDE.md: every
 * text input autosaves locally and syncs when the connection returns;
 * losing two hours of notes is unacceptable).
 *
 * Behaviour:
 * - every change is mirrored to localStorage IMMEDIATELY (survives a crash
 *   or dropped connection);
 * - the server save runs debounced (default 800 ms);
 * - failures mark status "offline" and retry when the browser regains
 *   connectivity (and on the next change);
 * - the mirror is cleared after a confirmed server save.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "offline";

export function useAutosave<T>(opts: {
  value: T;
  storageKey: string;
  save: (value: T) => Promise<void>;
  delay?: number;
  enabled?: boolean;
}) {
  const { value, storageKey, save, delay = 800, enabled = true } = opts;
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const first = useRef(true);
  const latest = useRef(value);
  const saveRef = useRef(save);
  useEffect(() => {
    latest.current = value;
    saveRef.current = save;
  });

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
    try {
      await saveRef.current(latest.current);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* storage unavailable — ignore */
      }
      setStatus("saved");
      setSavedAt(new Date());
    } catch {
      setStatus("offline");
    }
  }, [storageKey]);

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ value, at: Date.now() }),
      );
    } catch {
      /* storage unavailable — server save still runs */
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, delay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value), enabled]);

  // When the connection returns, push whatever is pending.
  useEffect(() => {
    const onOnline = () => {
      if (status === "offline") void flush();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [status, flush]);

  return { status, savedAt, flush };
}

/** Read a locally-mirrored draft newer than the given server timestamp. */
export function readLocalDraft<T>(
  storageKey: string,
  serverUpdatedAt: string | Date | null,
): T | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value: T; at: number };
    const serverMs = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0;
    return parsed.at > serverMs ? parsed.value : null;
  } catch {
    return null;
  }
}
