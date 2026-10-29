/**
 * NARRATIVES API TESTS — Amendments §51–§54, ADR 0002, at the API layer.
 *
 * What must hold:
 *  - An enumerator sees only their own assignments, in order; anyone
 *    else's is a 404. Scoring-only accounts get 403, signed-out 401.
 *  - With "remove lesson IDs" the id is stored nowhere and never served;
 *    the restricted role physically cannot read lesson_id / source_text.
 *  - Saves are optimistic: a stale base revision is refused (409) and the
 *    refused version is KEPT as a conflict copy — never a silent overwrite.
 *  - An expired session (401) changes nothing on the server.
 *  - Submitted narratives are read-only through the API (423, copy kept)
 *    and in the database (trigger), until an admin reopens with a reason.
 *  - Reassignment preserves the earlier work and carries the document over.
 */
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { Pool } from "pg";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  narrativeAssignments,
  narrativeDocuments,
  narrativeRevisions,
  narratives,
  narrativeSittings,
  userTeams,
  users,
} from "@/db/schema";
import { GET as listRoute } from "@/app/api/narratives/route";
import { GET as getRoute } from "@/app/api/narratives/[assignmentId]/route";
import { PUT as saveRoute } from "@/app/api/narratives/[assignmentId]/document/route";
import { POST as submitRoute } from "@/app/api/narratives/[assignmentId]/submit/route";
import { POST as sittingRoute } from "@/app/api/narratives/[assignmentId]/sitting/route";
import {
  assignNarrative,
  confirmNarrativeImport,
  previewNarrativeImport,
  reassignNarrative,
  reopenNarrative,
  restoreRevision,
  listRevisions,
} from "@/lib/db/admin-narratives";
import type { PMNode } from "@/lib/narratives/doc";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: [] as string[],
  emails: [
    "narrtest-admin@example.org",
    "narrtest-a@example.org",
    "narrtest-b@example.org",
    "narrtest-scorer@example.org",
  ],
  pairLabels: [] as string[],
};

// Synthetic narratives with lesson ids unique to this suite.
const BASE = readFileSync("db/seed/narratives/placeholder-99903_12.md", "utf8");
const LESSON_KEEP = "99971_1";
const LESSON_REMOVE = "99972_2";
const LESSON_THIRD = "99973_3";
const fileFor = (id: string) => ({ name: `${id}.md`, text: BASE.split("99903_12").join(id) });

const mockedAuth = vi.mocked(auth);
const ids: Record<string, string> = {};
const asg: Record<string, string> = {};

function actAs(key: string | null, role: "admin" | "coder" = "coder") {
  if (!key) {
    mockedAuth.mockResolvedValue(null as never);
    return;
  }
  mockedAuth.mockResolvedValue({
    user: { id: ids[key], role, isChiefCoder: false, datasetScope: "test" },
    expires: "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

const params = (assignmentId: string) => ({ params: Promise.resolve({ assignmentId }) });

async function getDoc(assignmentId: string) {
  const res = await getRoute(new Request("http://t/api"), params(assignmentId));
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

async function save(assignmentId: string, body: Record<string, unknown>, gzip = false) {
  const json = JSON.stringify(body);
  const res = await saveRoute(
    new Request("http://t/api", {
      method: "PUT",
      body: gzip ? gzipSync(json) : json,
      headers: gzip ? { "x-body-encoding": "gzip" } : {},
    }),
    params(assignmentId),
  );
  return { status: res.status, body: await res.json() };
}

async function submit(assignmentId: string, baseRevision: number) {
  const res = await submitRoute(
    new Request("http://t/api", { method: "POST", body: JSON.stringify({ baseRevision }) }),
    params(assignmentId),
  );
  return { status: res.status, body: await res.json() };
}

/** The served doc with one red addition in the first body paragraph. */
function edited(doc: PMNode, words: string): PMNode {
  const d: PMNode = JSON.parse(JSON.stringify(doc));
  const p = d.content!.find((b) => b.type === "paragraph" && b.attrs?.variant === null && b.content?.length)!;
  p.content!.push({ type: "text", text: ` ${words}`, marks: [{ type: "textColor", attrs: { color: "red" } }] });
  return d;
}

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  for (const [key, email, role] of [
    ["admin", FIXTURE.emails[0], "admin"],
    ["a", FIXTURE.emails[1], "coder"],
    ["b", FIXTURE.emails[2], "coder"],
    ["scorer", FIXTURE.emails[3], "coder"],
  ] as const) {
    const [u] = await db
      .insert(users)
      .values({ email, name: `Test ${key}`, role, datasetScope: "test" })
      .returning({ id: users.id });
    ids[key] = u.id;
  }
  await db.insert(userTeams).values([
    { userId: ids.a, team: "narratives" },
    { userId: ids.b, team: "narratives" },
    { userId: ids.scorer, team: "scoring" },
  ]);

  const keep = await confirmNarrativeImport(ids.admin, [fileFor(LESSON_KEEP), fileFor(LESSON_THIRD)], {
    removeLessonIds: false,
    dataset: "test",
  });
  const removed = await confirmNarrativeImport(ids.admin, [fileFor(LESSON_REMOVE)], {
    removeLessonIds: true,
    dataset: "test",
  });
  if (!keep.ok || !removed.ok) throw new Error("import failed");
  const all = await db.select().from(narratives).where(eq(narratives.importedBy, ids.admin));
  const byLabel = (l: string) => all.find((n) => n.label === l)!;
  const removedRow = all.find((n) => n.lessonId === null)!;

  for (const [key, narrativeId, assignee, order] of [
    ["a2", byLabel(LESSON_KEEP).id, ids.a, 2],
    ["a1", removedRow.id, ids.a, 1],
    ["b1", byLabel(LESSON_THIRD).id, ids.b, 1],
  ] as const) {
    const r = await assignNarrative(ids.admin, {
      narrativeId,
      assigneeId: assignee,
      orderNo: order,
      videoUrl: "1wxGK6SwKbMAsRhLA6oeiMsWV_testtesttest",
    });
    if (!r.ok) throw new Error(r.error);
    asg[key] = r.assignmentId;
  }
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("import", () => {
  it("previews duplicates instead of importing twice", async () => {
    const rows = await previewNarrativeImport([fileFor(LESSON_KEEP)]);
    expect(rows[0].importable).toBe(false);
    expect(rows[0].duplicateOf).toMatch(/^N-\d{4}$/);
  });

  it("with 'remove lesson IDs' stores the id nowhere", async () => {
    const [row] = await db
      .select()
      .from(narratives)
      .where(and(eq(narratives.importedBy, ids.admin), eq(narratives.label, narratives.displayCode)));
    expect(row.lessonId).toBeNull();
    expect(row.sourceText).not.toContain(LESSON_REMOVE);
    expect(JSON.stringify(row.initialDoc)).not.toContain(LESSON_REMOVE);
  });
});

describe("access", () => {
  it("lists only the enumerator's own narratives, in order", async () => {
    actAs("a");
    const res = await listRoute();
    expect(res.status).toBe(200);
    const { narratives: list } = await res.json();
    expect(list.map((n: { assignmentId: string }) => n.assignmentId)).toEqual([asg.a1, asg.a2]);
    expect(list[0].videoUrl).toBe("https://drive.google.com/file/d/1wxGK6SwKbMAsRhLA6oeiMsWV_testtesttest/view");
  });

  it("serves another person's assignment as 404", async () => {
    actAs("a");
    expect((await getDoc(asg.b1)).status).toBe(404);
    expect((await save(asg.b1, { baseRevision: 0, clientId: "x", doc: {}, answers: {}, comments: [] })).status).toBe(404);
  });

  it("refuses scoring-only accounts (403) and signed-out requests (401)", async () => {
    actAs("scorer");
    expect((await listRoute()).status).toBe(403);
    actAs(null);
    expect((await listRoute()).status).toBe(401);
  });

  it("never serves a removed lesson id or admin-only fields", async () => {
    actAs("a");
    const { body } = await getDoc(asg.a1);
    const text = JSON.stringify(body);
    expect(text).not.toContain(LESSON_REMOVE);
    expect(text).not.toContain('"lessonId"');
    expect(text).not.toContain('"sourceText"');
  });

  it("the restricted role cannot read lesson_id or source_text at all", async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_CODER, max: 1 });
    try {
      await expect(pool.query("SELECT lesson_id FROM narratives LIMIT 1")).rejects.toThrow(/permission denied/);
      await expect(pool.query("SELECT source_text FROM narratives LIMIT 1")).rejects.toThrow(/permission denied/);
      await expect(pool.query("SELECT * FROM narratives LIMIT 1")).rejects.toThrow(/permission denied/);
    } finally {
      await pool.end();
    }
  });
});

describe("saving", () => {
  it("applies a save on the current revision and starts the narrative", async () => {
    actAs("a");
    const { body: n } = await getDoc(asg.a2);
    expect(n.revision).toBe(0);
    expect(n.status).toBe("not_started");
    const r = await save(asg.a2, {
      baseRevision: 0,
      clientId: "tab-1",
      doc: edited(n.doc, "first red words"),
      answers: { accuracy: "Mostly accurate." },
      comments: [],
    });
    expect(r.status).toBe(200);
    expect(r.body.revision).toBe(1);
    const after = (await getDoc(asg.a2)).body;
    expect(after.status).toBe("in_progress");
    expect(after.answers.accuracy).toBe("Mostly accurate.");
    expect(JSON.stringify(after.doc)).toContain("first red words");
  });

  it("accepts gzip-compressed bodies", async () => {
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    const r = await save(
      asg.a2,
      { baseRevision: n.revision, clientId: "tab-1", doc: edited(n.doc, "zipped"), answers: n.answers, comments: [] },
      true,
    );
    expect(r.status).toBe(200);
  });

  it("refuses a stale save (two tabs/devices) with 409 and keeps the refused version", async () => {
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    const r = await save(asg.a2, {
      baseRevision: n.revision - 1,
      clientId: "tab-2",
      doc: edited(n.doc, "STALE-TAB-SENTINEL"),
      answers: n.answers,
      comments: [],
    });
    expect(r.status).toBe(409);
    expect(r.body.serverRevision).toBe(n.revision);
    // not applied …
    expect(JSON.stringify((await getDoc(asg.a2)).body.doc)).not.toContain("STALE-TAB-SENTINEL");
    // … but kept
    const copies = await db
      .select()
      .from(narrativeRevisions)
      .where(and(eq(narrativeRevisions.assignmentId, asg.a2), eq(narrativeRevisions.kind, "conflict_copy")));
    expect(copies.some((c) => JSON.stringify(c.doc).includes("STALE-TAB-SENTINEL"))).toBe(true);
  });

  it("snapshots the previous state when another device takes over", async () => {
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    const before = await db.select().from(narrativeRevisions).where(eq(narrativeRevisions.assignmentId, asg.a2));
    const r = await save(asg.a2, {
      baseRevision: n.revision,
      clientId: "laptop-2",
      doc: edited(n.doc, "from the laptop"),
      answers: n.answers,
      comments: [],
    });
    expect(r.status).toBe(200);
    const after = await db.select().from(narrativeRevisions).where(eq(narrativeRevisions.assignmentId, asg.a2));
    const added = after.filter((x) => !before.some((y) => y.id === x.id));
    expect(added.some((x) => x.kind === "snapshot" && x.clientId === "tab-1")).toBe(true);
  });

  it("rejects documents the editor could not produce, changing nothing", async () => {
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    const r = await save(asg.a2, {
      baseRevision: n.revision,
      clientId: "laptop-2",
      doc: { type: "doc", content: [{ type: "image" }] },
      answers: {},
      comments: [],
    });
    expect(r.status).toBe(400);
    expect((await getDoc(asg.a2)).body.revision).toBe(n.revision);
  });

  it("attributes comments to the acting person, whatever the client claims", async () => {
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    const r = await save(asg.a2, {
      baseRevision: n.revision,
      clientId: "laptop-2",
      doc: n.doc,
      answers: n.answers,
      comments: [{ id: "comment-0001", body: "I did not hear this", authorId: ids.b, authorName: "Someone else" }],
    });
    expect(r.status).toBe(200);
    const c = (await getDoc(asg.a2)).body.comments[0];
    expect(c.authorId).toBe(ids.a);
    expect(c.authorName).toBe("Test a");
  });

  it("an expired session (401) changes nothing", async () => {
    actAs("a");
    const before = (await getDoc(asg.a2)).body;
    actAs(null);
    const r = await save(asg.a2, { baseRevision: before.revision, clientId: "x", doc: before.doc, answers: {}, comments: [] });
    expect(r.status).toBe(401);
    actAs("a");
    expect((await getDoc(asg.a2)).body.revision).toBe(before.revision);
  });
});

describe("submit, read-only, reopen", () => {
  it("refuses to submit while the device has unsaved changes", async () => {
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    expect((await submit(asg.a2, n.revision - 1)).status).toBe(409);
  });

  it("submits the current revision and becomes read-only (API and database)", async () => {
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    expect((await submit(asg.a2, n.revision)).status).toBe(200);
    const after = (await getDoc(asg.a2)).body;
    expect(after.readOnly).toBe(true);
    const late = await save(asg.a2, {
      baseRevision: n.revision,
      clientId: "laptop-2",
      doc: edited(n.doc, "LATE-SENTINEL"),
      answers: n.answers,
      comments: n.comments,
    });
    expect(late.status).toBe(423);
    const copies = await db
      .select()
      .from(narrativeRevisions)
      .where(and(eq(narrativeRevisions.assignmentId, asg.a2), eq(narrativeRevisions.kind, "conflict_copy")));
    expect(copies.some((c) => JSON.stringify(c.doc).includes("LATE-SENTINEL"))).toBe(true);
    // Even the admin connection cannot change a submitted document.
    const err = await db
      .update(narrativeDocuments)
      .set({ answers: {} })
      .where(eq(narrativeDocuments.assignmentId, asg.a2))
      .then(() => null, (e: unknown) => e as { message: string; cause?: { message?: string } });
    expect(String(err?.cause?.message ?? err?.message)).toMatch(/submitted and read-only/);
  });

  it("an admin reopens with a reason; editing works again", async () => {
    expect((await reopenNarrative(ids.admin, asg.a2, "")).ok).toBe(false);
    expect((await reopenNarrative(ids.admin, asg.a2, "Missed episode E12")).ok).toBe(true);
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    expect(n.readOnly).toBe(false);
    const r = await save(asg.a2, { baseRevision: n.revision, clientId: "laptop-2", doc: n.doc, answers: n.answers, comments: n.comments });
    expect(r.status).toBe(200);
    const [a] = await db.select().from(narrativeAssignments).where(eq(narrativeAssignments.id, asg.a2));
    expect(a.reopenCount).toBe(1);
  });

  it("version history restores as a new revision", async () => {
    const revs = await listRevisions(asg.a2);
    const first = revs.find((r) => r.kind === "import")!;
    const r = await restoreRevision(ids.admin, asg.a2, first.id);
    expect(r.ok).toBe(true);
    actAs("a");
    const n = (await getDoc(asg.a2)).body;
    expect(JSON.stringify(n.doc)).not.toContain("first red words");
    // the replaced version is still in history
    const all = await db.select().from(narrativeRevisions).where(eq(narrativeRevisions.assignmentId, asg.a2));
    expect(all.some((x) => JSON.stringify(x.doc).includes("from the laptop"))).toBe(true);
  });
});

describe("reassignment", () => {
  it("keeps the old assignment, carries the document, and moves access", async () => {
    actAs("b");
    const n = (await getDoc(asg.b1)).body;
    await save(asg.b1, { baseRevision: 0, clientId: "b-tab", doc: edited(n.doc, "B-WORK"), answers: {}, comments: [] });
    const r = await reassignNarrative(ids.admin, asg.b1, { assigneeId: ids.a, reason: "B is away" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [old] = await db.select().from(narrativeAssignments).where(eq(narrativeAssignments.id, asg.b1));
    expect(old.status).toBe("returned");
    expect(old.statusReason).toBe("B is away");
    actAs("b");
    expect((await getDoc(asg.b1)).status).toBe(404);
    actAs("a");
    const moved = (await getDoc(r.assignmentId)).body;
    expect(JSON.stringify(moved.doc)).toContain("B-WORK");
  });
});

describe("sittings (measured time)", () => {
  it("opens, heartbeats and ends a sitting", async () => {
    actAs("a");
    const post = (body: object) =>
      sittingRoute(new Request("http://t/api", { method: "POST", body: JSON.stringify(body) }), params(asg.a1));
    expect((await post({ storagePersisted: true })).status).toBe(200);
    expect((await post({ storagePersisted: true })).status).toBe(200);
    let rows = await db.select().from(narrativeSittings).where(eq(narrativeSittings.assignmentId, asg.a1));
    expect(rows).toHaveLength(1);
    expect(rows[0].storagePersisted).toBe(true);
    expect((await post({ end: true })).status).toBe(200);
    rows = await db.select().from(narrativeSittings).where(eq(narrativeSittings.assignmentId, asg.a1));
    expect(rows[0].endedAt).not.toBeNull();
  });
});
