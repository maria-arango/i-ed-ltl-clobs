/**
 * Browser adapters for the sync engine (ADR 0002): IndexedDB draft store,
 * the HTTP transport (gzip when the browser can), persistent storage, and
 * the one-editing-tab lock. Kept apart from sync-engine.ts so the engine
 * stays testable with fakes; the store and lock are also unit-tested
 * against fake-indexeddb and a fake LockManager.
 */
import { openDB, type IDBPDatabase } from "idb";
import type { DraftRecord, DraftStore, SavePayload, Transport, TransportResult } from "./sync-engine";

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

const DB_NAME = "clobs-narratives";
const DB_VERSION = 1;

/**
 * Two object stores: `drafts` (the latest record) and `previous` (the one
 * before it), so an interrupted write can never leave the device with
 * nothing.
 */
export function createIdbStore(dbName = DB_NAME): DraftStore {
  let dbp: Promise<IDBPDatabase> | null = null;
  const open = () =>
    (dbp ??= openDB(dbName, DB_VERSION, {
      upgrade(db) {
        const drafts = db.createObjectStore("drafts", { keyPath: "key" });
        drafts.createIndex("byUser", "userId");
        db.createObjectStore("previous", { keyPath: "key" });
      },
    }));
  return {
    async get(key) {
      const db = await open();
      return ((await db.get("drafts", key)) ?? (await db.get("previous", key))) as DraftRecord | undefined;
    },
    async put(rec) {
      const db = await open();
      const tx = db.transaction(["drafts", "previous"], "readwrite");
      const prev = await tx.objectStore("drafts").get(rec.key);
      if (prev) await tx.objectStore("previous").put(prev);
      await tx.objectStore("drafts").put(rec);
      await tx.done;
    },
    async delete(key) {
      const db = await open();
      const tx = db.transaction(["drafts", "previous"], "readwrite");
      await tx.objectStore("drafts").delete(key);
      await tx.objectStore("previous").delete(key);
      await tx.done;
    },
    async listForUser(userId) {
      const db = await open();
      return (await db.getAllFromIndex("drafts", "byUser", userId)) as DraftRecord[];
    },
  };
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function gzip(text: string): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

export function fetchTransport(base = "/api/narratives", fetchImpl: typeof fetch = fetch): Transport {
  return {
    async save(assignmentId: string, payload: SavePayload): Promise<TransportResult> {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return { kind: "offline" };
      const json = JSON.stringify(payload);
      const zipped = await gzip(json);
      let res: Response;
      try {
        res = await fetchImpl(`${base}/${assignmentId}/document`, {
          method: "PUT",
          body: zipped ?? json,
          headers: zipped
            ? { "content-type": "application/octet-stream", "x-body-encoding": "gzip" }
            : { "content-type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch {
        return { kind: "offline" };
      }
      if (res.ok) {
        const b = (await res.json()) as { revision: number; savedAt: string };
        return { kind: "ok", revision: b.revision, savedAt: b.savedAt };
      }
      if (res.status === 401) return { kind: "signed_out" };
      if (res.status === 409) {
        const b = (await res.json().catch(() => ({}))) as { serverRevision?: number };
        return { kind: "conflict", serverRevision: Number(b.serverRevision ?? -1) };
      }
      if (res.status === 423) return { kind: "submitted" };
      const b = (await res.json().catch(() => ({}))) as { error?: string };
      return { kind: "error", status: res.status, message: b.error };
    },
  };
}

/* ------------------------------------------------------------------ */
/* One editing tab per device                                          */
/* ------------------------------------------------------------------ */

/** The subset of the Web Locks API we use (injectable for tests). */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean },
    callback: (lock: unknown | null) => Promise<unknown> | unknown,
  ): Promise<unknown>;
}

export interface TabLock {
  /** True when this tab now holds the lock; false when another tab does. */
  acquire(): Promise<boolean>;
  /** Take the lock from another tab ("Edit here instead"). */
  takeOver(): Promise<void>;
  release(): void;
  readonly held: boolean;
}

/**
 * Web Locks: exactly one tab per device holds `narrative:<id>`. A tab whose
 * lock is stolen is told through onLost and turns read-only. Without Web
 * Locks every tab may edit; the server's revision check remains the guard.
 */
export function createTabLock(
  name: string,
  onLost: () => void,
  locks: LockManagerLike | undefined = typeof navigator !== "undefined"
    ? (navigator.locks as unknown as LockManagerLike | undefined)
    : undefined,
): TabLock {
  let releaseFn: (() => void) | null = null;
  let held = false;

  const hold = (lock: unknown | null, resolve: (v: boolean) => void) => {
    if (!lock) {
      resolve(false);
      return;
    }
    held = true;
    resolve(true);
    return new Promise<void>((r) => {
      releaseFn = () => {
        held = false;
        r();
      };
    });
  };

  const request = (opts: { ifAvailable?: boolean; steal?: boolean }) =>
    new Promise<boolean>((resolve) => {
      if (!locks) {
        held = true;
        resolve(true);
        return;
      }
      locks
        .request(name, opts, (lock) => hold(lock, resolve))
        .catch(() => {
          // Our lock was stolen by another tab.
          if (held) {
            held = false;
            releaseFn = null;
            onLost();
          }
          resolve(false);
        });
    });

  return {
    acquire: () => request({ ifAvailable: true }),
    async takeOver() {
      await request({ steal: true });
    },
    release() {
      releaseFn?.();
      releaseFn = null;
    },
    get held() {
      return held;
    },
  };
}
