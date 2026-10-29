/**
 * LIVE-SAVING FAILURE CASES — Amendment §52, ADR 0002.
 *
 * The sync engine runs against the real IndexedDB store (on
 * fake-indexeddb), an in-memory server with the API's revision rules, and
 * fake timers, so each case is deterministic:
 *   - going offline mid-edit
 *   - closing the tab (cleanly, and abruptly after the device write)
 *   - session expiry
 *   - two tabs open at once (tab lock + server revision check)
 * The API's own behaviour is covered in narratives-api.test.ts.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdbStore, createTabLock, type LockManagerLike } from "@/lib/narratives/browser";
import {
  clearSyncedDrafts,
  SyncEngine,
  unsyncedDrafts,
  type DraftState,
  type SavePayload,
  type ServerCopy,
  type SyncStatus,
  type Transport,
  type TransportResult,
} from "@/lib/narratives/sync-engine";
import type { PMNode } from "@/lib/narratives/doc";

/* ---- an in-memory server with the API's rules -------------------- */

class FakeServer {
  revision = 0;
  state: DraftState;
  submitted = false;
  mode: "online" | "offline" | "signed_out" = "online";
  conflictCopies: SavePayload[] = [];
  saves = 0;
  constructor(initial: DraftState) {
    this.state = initial;
  }
  copy(): ServerCopy {
    return { ...JSON.parse(JSON.stringify(this.state)), revision: this.revision, readOnly: this.submitted };
  }
  transport(): Transport {
    return {
      save: async (_id, p): Promise<TransportResult> => {
        if (this.mode === "offline") return { kind: "offline" };
        if (this.mode === "signed_out") return { kind: "signed_out" };
        if (this.submitted) {
          this.conflictCopies.push(p);
          return { kind: "submitted" };
        }
        if (p.baseRevision !== this.revision) {
          this.conflictCopies.push(p);
          return { kind: "conflict", serverRevision: this.revision };
        }
        this.saves++;
        this.revision++;
        this.state = { doc: p.doc, answers: p.answers, comments: p.comments };
        return { kind: "ok", revision: this.revision, savedAt: new Date().toISOString() };
      },
    };
  }
}

const docWith = (text: string): PMNode => ({
  type: "doc",
  content: [{ type: "paragraph", attrs: { variant: null }, content: [{ type: "text", text }] }],
});
const st = (text: string, accuracy?: string): DraftState => ({
  doc: docWith(text),
  answers: accuracy ? { accuracy } : {},
  comments: [],
});
const textOf = (s: DraftState | null) => s?.doc.content?.[0].content?.[0].text;

let dbCounter = 0;
let store: ReturnType<typeof createIdbStore>;

beforeEach(() => {
  // Fake only the clock the engine uses; fake-indexeddb schedules its own
  // work with setImmediate, which must stay real.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  store = createIdbStore(`test-narratives-${++dbCounter}`);
});
afterEach(() => {
  vi.useRealTimers();
});

/** Let fake-indexeddb finish its (real-time) work. */
async function settle() {
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
}
/** Advance the fake clock in small steps, letting IndexedDB settle between. */
async function advance(ms: number) {
  await settle();
  for (let t = 0; t < ms; t += 100) {
    await vi.advanceTimersByTimeAsync(Math.min(100, ms - t));
    await settle();
  }
}
async function settledGet(key: string) {
  await settle();
  return store.get(key);
}

function engine(server: FakeServer, opts: { clientId?: string; statuses?: SyncStatus[]; userId?: string } = {}) {
  return new SyncEngine({
    userId: opts.userId ?? "user-a",
    assignmentId: "asg-1",
    clientId: opts.clientId ?? "tab-1",
    store,
    transport: server.transport(),
    clock: { setTimeout, clearTimeout, now: () => Date.now() },
    onStatus: (s) => opts.statuses?.push(s),
  });
}

/* ---- the cases ----------------------------------------------------- */

describe("going offline mid-edit", () => {
  it("keeps every edit on the device, retries, and lands the final text when back online", async () => {
    const server = new FakeServer(st("original"));
    const statuses: SyncStatus[] = [];
    const e = engine(server, { statuses });
    await e.init(server.copy());

    e.update(st("edit 1"));
    await advance(2500);
    expect(server.state.doc).toEqual(docWith("edit 1"));

    server.mode = "offline";
    for (let i = 2; i <= 6; i++) {
      e.update(st(`edit ${i}`, `answer ${i}`));
      await advance(700);
    }
    await advance(5000);
    expect(e.currentStatus).toBe("offline");
    // The device holds exactly what is on screen.
    const onDevice = await settledGet(e.key);
    expect(textOf(onDevice!)).toBe("edit 6");
    expect(onDevice!.answers.accuracy).toBe("answer 6");
    expect(onDevice!.localSeq).toBeGreaterThan(onDevice!.syncedSeq);
    expect(server.state.doc).toEqual(docWith("edit 1"));

    server.mode = "online";
    e.online();
    await advance(100);
    expect(server.state.doc).toEqual(docWith("edit 6"));
    expect(server.state.answers.accuracy).toBe("answer 6");
    expect(e.currentStatus).toBe("saved");
    expect(e.dirty).toBe(false);
    expect(statuses).toContain("offline");
  });

  it("retries on its own with backoff even without an 'online' event", async () => {
    const server = new FakeServer(st("original"));
    const e = engine(server);
    await e.init(server.copy());
    server.mode = "offline";
    e.update(st("offline text"));
    await advance(3000);
    expect(e.currentStatus).toBe("offline");
    server.mode = "online";
    await advance(10000);
    expect(server.state.doc).toEqual(docWith("offline text"));
    expect(e.currentStatus).toBe("saved");
  });

  it("does not drop edits made while a save is in flight", async () => {
    const server = new FakeServer(st("original"));
    const slow = server.transport();
    const e = new SyncEngine({
      userId: "user-a",
      assignmentId: "asg-1",
      clientId: "tab-1",
      store,
      transport: {
        save: async (id, p) => {
          await new Promise((r) => setTimeout(r, 1500));
          return slow.save(id, p);
        },
      },
      clock: { setTimeout, clearTimeout, now: () => Date.now() },
    });
    await e.init(server.copy());
    e.update(st("first"));
    await advance(2100); // save of "first" starts
    e.update(st("second")); // typed during the flight
    await advance(6000);
    expect(server.state.doc).toEqual(docWith("second"));
    expect(e.dirty).toBe(false);
  });
});

describe("closing the tab", () => {
  it("cleanly: the draft written on close is restored and saved by the next tab", async () => {
    const server = new FakeServer(st("original"));
    server.mode = "offline"; // nothing reaches the server before the close
    const e1 = engine(server);
    await e1.init(server.copy());
    e1.update(st("typed before closing"));
    await e1.destroy(); // pagehide

    server.mode = "online";
    const e2 = engine(server, { clientId: "tab-2" });
    const init = await e2.init(server.copy());
    expect(init.source).toBe("device");
    expect(textOf((init as { state: DraftState }).state)).toBe("typed before closing");
    await advance(100);
    expect(server.state.doc).toEqual(docWith("typed before closing"));
  });

  it("abruptly (battery died): anything older than one second is already on the device", async () => {
    const server = new FakeServer(st("original"));
    server.mode = "offline";
    const e1 = engine(server);
    await e1.init(server.copy());
    e1.update(st("a"));
    await advance(300);
    e1.update(st("ab"));
    await advance(1100); // max-wait elapsed; then the device dies — no destroy()

    server.mode = "online";
    const e2 = engine(server, { clientId: "tab-2" });
    const init = await e2.init(server.copy());
    expect(init.source).toBe("device");
    expect(textOf((init as { state: DraftState }).state)).toBe("ab");
  });
});

describe("session expiry", () => {
  it("keeps the edits, says so, and saves them after signing in again", async () => {
    const server = new FakeServer(st("original"));
    const e = engine(server);
    await e.init(server.copy());
    server.mode = "signed_out";
    e.update(st("written while signed out"));
    await advance(3000);
    expect(e.currentStatus).toBe("signed_out");
    await advance(60_000);
    expect(server.saves).toBe(0); // no hammering while signed out
    expect(textOf((await settledGet(e.key))!)).toBe("written while signed out");

    server.mode = "online";
    e.resume();
    await advance(100);
    expect(server.state.doc).toEqual(docWith("written while signed out"));
    expect(e.currentStatus).toBe("saved");
  });

  it("restores the edits after a reload and sign-in on the same device", async () => {
    const server = new FakeServer(st("original"));
    const e1 = engine(server);
    await e1.init(server.copy());
    server.mode = "signed_out";
    e1.update(st("unsaved at expiry"));
    await advance(3000);
    // the person reloads, signs in, opens the narrative again
    server.mode = "online";
    const e2 = engine(server);
    const init = await e2.init(server.copy());
    expect(init.source).toBe("device");
    await advance(100);
    expect(server.state.doc).toEqual(docWith("unsaved at expiry"));
  });

  it("never shows one person's draft to another on a lent device", async () => {
    const server = new FakeServer(st("original"));
    server.mode = "offline";
    const a = engine(server, { userId: "user-a" });
    await a.init(server.copy());
    a.update(st("A's private work"));
    await a.destroy();
    const b = engine(server, { userId: "user-b" });
    const init = await b.init(server.copy());
    expect(init.source).toBe("server");
    expect(await unsyncedDrafts(store, "user-a")).toHaveLength(1);
    expect(await unsyncedDrafts(store, "user-b")).toHaveLength(0);
  });

  it("sign-out clears only drafts that reached the server", async () => {
    const server = new FakeServer(st("original"));
    const e = engine(server);
    await e.init(server.copy());
    e.update(st("synced"));
    await advance(2500);
    expect(await clearSyncedDrafts(store, "user-a")).toBe(1);
    expect(await settledGet(e.key)).toBeUndefined();
  });
});

describe("two tabs open at once", () => {
  it("lets exactly one tab edit; taking over makes the other read-only", async () => {
    const locks = fakeLockManager();
    const lost: string[] = [];
    const t1 = createTabLock("narrative:asg-1", () => lost.push("t1"), locks);
    const t2 = createTabLock("narrative:asg-1", () => lost.push("t2"), locks);
    expect(await t1.acquire()).toBe(true);
    expect(await t2.acquire()).toBe(false);
    await t2.takeOver();
    await advance(0);
    expect(t2.held).toBe(true);
    expect(t1.held).toBe(false);
    expect(lost).toEqual(["t1"]);
  });

  it("never overwrites silently: a stale tab gets a conflict and its version is kept", async () => {
    const server = new FakeServer(st("original"));
    const s1: SyncStatus[] = [];
    const tab1 = engine(server, { clientId: "tab-1", statuses: s1 });
    const tab2 = engine(server, { clientId: "tab-2", userId: "user-a-other-profile" });
    await tab1.init(server.copy());
    await tab2.init(server.copy());

    tab2.update(st("from tab 2"));
    await advance(2500);
    expect(server.state.doc).toEqual(docWith("from tab 2"));

    tab1.update(st("from tab 1"));
    await advance(2500);
    expect(tab1.currentStatus).toBe("conflict");
    expect(server.state.doc).toEqual(docWith("from tab 2")); // not overwritten
    expect(server.conflictCopies.map((c) => textOf(c))).toContain("from tab 1"); // kept

    // The person chooses this tab's version: it continues on top of the
    // newer server revision (the server keeps tab 2's version in history).
    const resolved = await tab1.resolveConflict("device", server.copy());
    expect(textOf(resolved)).toBe("from tab 1");
    expect(server.state.doc).toEqual(docWith("from tab 1"));
    expect(tab1.currentStatus).toBe("saved");
  });

  it("offers the choice on load when this device's draft is older than the server", async () => {
    const server = new FakeServer(st("original"));
    server.mode = "offline";
    const phone = engine(server, { clientId: "phone" });
    await phone.init(server.copy());
    phone.update(st("phone edits"));
    await phone.destroy();
    // meanwhile the laptop saved
    server.mode = "online";
    server.revision = 5;
    server.state = st("laptop edits");
    const again = engine(server, { clientId: "phone" });
    const init = await again.init(server.copy());
    expect(init.source).toBe("conflict");
    const resolved = await again.resolveConflict("server", server.copy());
    expect(textOf(resolved)).toBe("laptop edits");
    expect(again.dirty).toBe(false);
  });
});

describe("submitted narratives", () => {
  it("turn the editor read-only and keep the device copy on the server", async () => {
    const server = new FakeServer(st("original"));
    const e = engine(server);
    await e.init(server.copy());
    server.submitted = true;
    e.update(st("after submit"));
    await advance(2500);
    expect(e.currentStatus).toBe("read_only");
    expect(server.conflictCopies.map((c) => textOf(c))).toContain("after submit");
  });
});

/* ---- a fake Web Locks manager --------------------------------------- */

function fakeLockManager(): LockManagerLike {
  const held = new Map<string, { abort: (e: Error) => void }>();
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const grant = () => {
          held.set(name, {
            abort: (e) => {
              held.delete(name);
              reject(e);
            },
          });
          Promise.resolve(callback({ name })).then(
            (v) => {
              if (held.get(name)) held.delete(name);
              resolve(v);
            },
            reject,
          );
        };
        const current = held.get(name);
        if (current && options.steal) {
          current.abort(Object.assign(new Error("stolen"), { name: "AbortError" }));
          grant();
        } else if (current && options.ifAvailable) {
          Promise.resolve(callback(null)).then(resolve, reject);
        } else if (!current) {
          grant();
        }
      });
    },
  };
}
