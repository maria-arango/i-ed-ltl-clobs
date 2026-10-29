/**
 * Live saving for the Narratives editor (Amendment §52, ADR 0002).
 *
 * Three layers protect the work: the device (IndexedDB, written within
 * ~250 ms of every change), the server working copy (synced within seconds
 * when online), and the server's version history.
 *
 * The engine is plain TypeScript with its storage, network and clock
 * injected, so every failure case — offline mid-edit, tab closed, session
 * expired, two tabs — is unit-tested without a browser.
 *
 * Rules:
 * - A device draft is keyed by <user id>:<assignment id>; a lent device
 *   never shows one person's draft to another.
 * - A draft is "dirty" while localSeq > syncedSeq. A dirty draft built on
 *   the server's current revision is the newest work and is restored;
 *   one built on an older revision is a conflict the person resolves.
 * - One save in flight at a time. Edits made during a save stay dirty and
 *   are sent next.
 * - 401 never discards anything: saving pauses until resume().
 */
import type { NarrativeAnswers, NarrativeComment, PMNode } from "./doc";

export interface DraftState {
  doc: PMNode;
  answers: NarrativeAnswers;
  comments: NarrativeComment[];
}

export interface DraftRecord extends DraftState {
  key: string;
  userId: string;
  assignmentId: string;
  baseRevision: number;
  localSeq: number;
  syncedSeq: number;
  savedLocallyAt: number;
}

export interface DraftStore {
  get(key: string): Promise<DraftRecord | undefined>;
  put(rec: DraftRecord): Promise<void>;
  delete(key: string): Promise<void>;
  listForUser(userId: string): Promise<DraftRecord[]>;
}

export type TransportResult =
  | { kind: "ok"; revision: number; savedAt: string }
  | { kind: "conflict"; serverRevision: number }
  | { kind: "submitted" }
  | { kind: "signed_out" }
  | { kind: "offline" }
  | { kind: "error"; status: number; message?: string };

export interface SavePayload extends DraftState {
  baseRevision: number;
  clientId: string;
}

export interface Transport {
  save(assignmentId: string, payload: SavePayload): Promise<TransportResult>;
}

export type SyncStatus =
  | "saved"
  | "saving"
  | "offline"
  | "signed_out"
  | "conflict"
  | "read_only"
  | "error";

export interface ServerCopy extends DraftState {
  revision: number;
  readOnly: boolean;
}

export interface Clock {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

const realClock: Clock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

export function draftKey(userId: string, assignmentId: string): string {
  return `${userId}:${assignmentId}`;
}

export interface EngineOptions {
  userId: string;
  assignmentId: string;
  clientId: string;
  store: DraftStore;
  transport: Transport;
  clock?: Clock;
  onStatus?: (status: SyncStatus, info: { savedAt: number | null; lastError?: string }) => void;
  localDebounceMs?: number;
  localMaxWaitMs?: number;
  syncDebounceMs?: number;
  syncMaxWaitMs?: number;
  backoffMs?: number[];
}

export type InitResult =
  | { source: "server" | "device"; state: DraftState }
  | { source: "conflict"; device: DraftRecord; server: ServerCopy };

export class SyncEngine {
  private o: Required<Omit<EngineOptions, "onStatus">> & Pick<EngineOptions, "onStatus">;
  private rec: DraftRecord | null = null;
  private status: SyncStatus = "saved";
  private savedAt: number | null = null;
  private localTimer: unknown = null;
  private localFirstPending: number | null = null;
  private syncTimer: unknown = null;
  private syncFirstPending: number | null = null;
  private inFlight: Promise<void> | null = null;
  private failures = 0;
  private paused: "signed_out" | "conflict" | "read_only" | null = null;
  private destroyed = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(opts: EngineOptions) {
    this.o = {
      clock: realClock,
      localDebounceMs: 250,
      localMaxWaitMs: 1000,
      syncDebounceMs: 2000,
      syncMaxWaitMs: 10000,
      backoffMs: [2000, 4000, 8000, 16000, 32000, 60000],
      ...opts,
    };
  }

  get key() {
    return draftKey(this.o.userId, this.o.assignmentId);
  }
  get currentStatus(): SyncStatus {
    return this.status;
  }
  get dirty(): boolean {
    return !!this.rec && this.rec.localSeq > this.rec.syncedSeq;
  }
  get baseRevision(): number | null {
    return this.rec?.baseRevision ?? null;
  }
  get state(): DraftState | null {
    return this.rec ? { doc: this.rec.doc, answers: this.rec.answers, comments: this.rec.comments } : null;
  }

  private setStatus(s: SyncStatus, lastError?: string) {
    this.status = s;
    this.o.onStatus?.(s, { savedAt: this.savedAt, lastError });
  }

  /** Decide what to show: the server copy, the device draft, or a conflict. */
  async init(server: ServerCopy): Promise<InitResult> {
    const draft = await this.o.store.get(this.key);
    const fresh = (): DraftRecord => ({
      key: this.key,
      userId: this.o.userId,
      assignmentId: this.o.assignmentId,
      doc: server.doc,
      answers: server.answers,
      comments: server.comments,
      baseRevision: server.revision,
      localSeq: 0,
      syncedSeq: 0,
      savedLocallyAt: this.o.clock.now(),
    });

    const dirty = !!draft && draft.localSeq > draft.syncedSeq;
    if (server.readOnly) {
      this.paused = "read_only";
      if (dirty) {
        // Keep the device copy, and send it once so the server keeps a
        // conflict copy of it (the save is refused with 423).
        this.rec = draft!;
        void this.o.transport.save(this.o.assignmentId, this.payload()).catch(() => undefined);
      } else {
        this.rec = fresh();
        await this.writeLocal();
      }
      this.setStatus("read_only");
      return { source: "server", state: server };
    }
    if (!draft || !dirty) {
      this.rec = fresh();
      await this.writeLocal();
      this.savedAt = this.o.clock.now();
      this.setStatus("saved");
      return { source: "server", state: server };
    }
    if (draft.baseRevision === server.revision) {
      // Unsynced work from a crash, a closed tab or an expired session.
      this.rec = draft;
      this.setStatus("saving");
      this.scheduleSync(0);
      return { source: "device", state: { doc: draft.doc, answers: draft.answers, comments: draft.comments } };
    }
    this.rec = draft;
    this.paused = "conflict";
    this.setStatus("conflict");
    return { source: "conflict", device: draft, server };
  }

  /** Every editor change lands here. */
  update(state: DraftState) {
    if (!this.rec || this.destroyed) return;
    if (this.paused === "read_only") return;
    this.rec = { ...this.rec, ...state, localSeq: this.rec.localSeq + 1 };
    this.scheduleLocal();
    if (!this.paused) {
      if (this.status !== "offline") this.setStatus("saving");
      this.scheduleSync();
    }
  }

  private scheduleLocal() {
    const now = this.o.clock.now();
    if (this.localFirstPending === null) this.localFirstPending = now;
    if (this.localTimer !== null) this.o.clock.clearTimeout(this.localTimer);
    const waited = now - this.localFirstPending;
    const delay = Math.max(0, Math.min(this.o.localDebounceMs, this.o.localMaxWaitMs - waited));
    this.localTimer = this.o.clock.setTimeout(() => void this.flushLocal(), delay);
  }

  /** Write the draft to the device now (also on tab hide / page close). */
  async flushLocal(): Promise<void> {
    if (this.localTimer !== null) this.o.clock.clearTimeout(this.localTimer);
    this.localTimer = null;
    this.localFirstPending = null;
    await this.writeLocal();
  }

  private writeLocal(): Promise<void> {
    if (!this.rec) return Promise.resolve();
    const snapshot = { ...this.rec, savedLocallyAt: this.o.clock.now() };
    // Serialise writes so an older snapshot never lands after a newer one.
    this.writeChain = this.writeChain.then(() => this.o.store.put(snapshot)).catch(() => undefined);
    return this.writeChain;
  }

  private scheduleSync(force?: number) {
    if (this.destroyed || this.paused) return;
    const now = this.o.clock.now();
    if (this.syncFirstPending === null) this.syncFirstPending = now;
    if (this.syncTimer !== null) this.o.clock.clearTimeout(this.syncTimer);
    const waited = now - this.syncFirstPending;
    const delay =
      force !== undefined ? force : Math.max(0, Math.min(this.o.syncDebounceMs, this.o.syncMaxWaitMs - waited));
    this.syncTimer = this.o.clock.setTimeout(() => void this.syncNow(), delay);
  }

  private payload(): SavePayload {
    const r = this.rec!;
    return {
      baseRevision: r.baseRevision,
      clientId: this.o.clientId,
      doc: r.doc,
      answers: r.answers,
      comments: r.comments,
    };
  }

  /** Push the draft to the server now (no-op when clean or paused). */
  async syncNow(): Promise<void> {
    if (this.syncTimer !== null) this.o.clock.clearTimeout(this.syncTimer);
    this.syncTimer = null;
    this.syncFirstPending = null;
    if (this.inFlight) return this.inFlight;
    if (!this.rec || !this.dirty || this.paused || this.destroyed) return;
    this.inFlight = this.doSync().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doSync(): Promise<void> {
    const sentSeq = this.rec!.localSeq;
    if (this.status !== "offline") this.setStatus("saving");
    let res: TransportResult;
    try {
      res = await this.o.transport.save(this.o.assignmentId, this.payload());
    } catch {
      res = { kind: "offline" };
    }
    if (this.destroyed) return;
    switch (res.kind) {
      case "ok": {
        this.failures = 0;
        this.rec = { ...this.rec!, baseRevision: res.revision, syncedSeq: sentSeq };
        this.savedAt = this.o.clock.now();
        await this.writeLocal();
        if (this.dirty) {
          this.setStatus("saving");
          this.scheduleSync();
        } else {
          this.setStatus("saved");
        }
        return;
      }
      case "conflict":
        this.paused = "conflict";
        this.setStatus("conflict");
        return;
      case "submitted":
        this.paused = "read_only";
        this.setStatus("read_only");
        return;
      case "signed_out":
        this.paused = "signed_out";
        this.setStatus("signed_out");
        return;
      case "offline":
      case "error": {
        const delay = this.o.backoffMs[Math.min(this.failures, this.o.backoffMs.length - 1)];
        this.failures += 1;
        this.setStatus(res.kind === "offline" ? "offline" : "error", res.kind === "error" ? res.message : undefined);
        // Jitter (±20 %) so many devices coming back online do not align.
        const jitter = 0.8 + (this.failures % 5) * 0.1;
        this.syncTimer = this.o.clock.setTimeout(() => void this.syncNow(), Math.round(delay * jitter));
        return;
      }
    }
  }

  /** The browser says we are online again: retry at once. */
  online() {
    if (this.status === "offline" || this.status === "error") {
      this.failures = 0;
      void this.syncNow();
    }
  }

  /** Signed back in (or session check passed): resume saving. */
  resume() {
    if (this.paused === "signed_out") {
      this.paused = null;
      this.failures = 0;
      if (this.dirty) void this.syncNow();
      else this.setStatus("saved");
    }
  }

  /**
   * After a conflict: continue from the server copy (the device version is
   * already kept on the server as a conflict copy) or from this device's
   * version (the server's version stays in its history).
   */
  async resolveConflict(choice: "device" | "server", server: ServerCopy): Promise<DraftState> {
    if (!this.rec) throw new Error("not initialised");
    if (choice === "server") {
      this.rec = {
        ...this.rec,
        doc: server.doc,
        answers: server.answers,
        comments: server.comments,
        baseRevision: server.revision,
        syncedSeq: this.rec.localSeq,
      };
      this.paused = server.readOnly ? "read_only" : null;
      await this.writeLocal();
      this.savedAt = this.o.clock.now();
      this.setStatus(server.readOnly ? "read_only" : "saved");
    } else {
      this.rec = { ...this.rec, baseRevision: server.revision, localSeq: this.rec.localSeq + 1 };
      this.paused = null;
      await this.writeLocal();
      this.setStatus("saving");
      await this.syncNow();
    }
    return { doc: this.rec.doc, answers: this.rec.answers, comments: this.rec.comments };
  }

  /** Another tab took over, or the narrative was submitted: stop editing. */
  setReadOnly() {
    this.paused = "read_only";
    this.setStatus("read_only");
  }

  /** Submitted successfully: the device copy is no longer needed. */
  async markSubmitted() {
    this.paused = "read_only";
    await this.o.store.delete(this.key).catch(() => undefined);
    this.setStatus("read_only");
  }

  /** Page is going away: make sure the device has the latest state. */
  async destroy(): Promise<void> {
    if (this.destroyed) return;
    if (this.localTimer !== null || this.dirty) await this.flushLocal();
    this.destroyed = true;
    if (this.syncTimer !== null) this.o.clock.clearTimeout(this.syncTimer);
  }
}

/* ------------------------------------------------------------------ */
/* Sign-out on a shared device                                         */
/* ------------------------------------------------------------------ */

/** Unsynced drafts this person still has on this device. */
export async function unsyncedDrafts(store: DraftStore, userId: string): Promise<DraftRecord[]> {
  return (await store.listForUser(userId)).filter((d) => d.localSeq > d.syncedSeq);
}

/** After a fully synced sign-out, remove this person's drafts from the device. */
export async function clearSyncedDrafts(store: DraftStore, userId: string): Promise<number> {
  const all = await store.listForUser(userId);
  let n = 0;
  for (const d of all) {
    if (d.localSeq <= d.syncedSeq) {
      await store.delete(d.key);
      n++;
    }
  }
  return n;
}
