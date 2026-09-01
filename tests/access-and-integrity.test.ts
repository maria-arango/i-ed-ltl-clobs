/**
 * Round-6 integrity rules:
 *  - an EMPTY context card cannot be submitted (Amendment §33);
 *  - scores cannot be submitted with missing justifications (Amendment §32);
 *  - access requests (Amendment §35): public submission never creates a
 *    user, never reveals existing accounts, and admin decisions create the
 *    right kind of account exactly once.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accessRequests,
  assignmentRaters,
  assignments,
  pairMembers,
  pairs,
  users,
  videos,
} from "@/db/schema";
import {
  CoderError,
  ensureObservation,
  saveContextCard,
  saveScore,
  submitContextCard,
  submitObservation,
} from "@/lib/db/coder";
import {
  decideAccessRequest,
  listPendingRequests,
  submitAccessRequest,
} from "@/lib/db/admin-access";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-TEST-INTEG"],
  emails: [
    "integ-admin@example.org",
    "integ-coder@example.org",
    "integ-request@example.org",
    "integ-live@example.org",
  ],
  pairLabels: ["integ-pair", "training-integ-request@example.org"],
};

let adminId = "";
let coderId = "";
let videoId = "";

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  await db.delete(accessRequests).where(eq(accessRequests.email, "integ-request@example.org"));
  await db.delete(accessRequests).where(eq(accessRequests.email, "integ-live@example.org"));
  await db.delete(accessRequests).where(eq(accessRequests.email, "integ-coder@example.org"));
  const [admin] = await db
    .insert(users)
    .values({ email: "integ-admin@example.org", role: "admin" })
    .returning({ id: users.id });
  adminId = admin.id;
  const [coder] = await db
    .insert(users)
    .values({ email: "integ-coder@example.org", role: "coder", isChiefCoder: true })
    .returning({ id: users.id });
  coderId = coder.id;
  const [pair] = await db
    .insert(pairs)
    .values({ label: "integ-pair", dataset: "training" })
    .returning({ id: pairs.id });
  await db.insert(pairMembers).values([
    { pairId: pair.id, userId: coderId },
    { pairId: pair.id, userId: adminId },
  ]);
  const [video] = await db
    .insert(videos)
    .values({ displayCode: "V-TEST-INTEG", dataset: "training", status: "assigned" })
    .returning({ id: videos.id });
  videoId = video.id;
  const [assignment] = await db
    .insert(assignments)
    .values({ videoId, pairId: pair.id, waveNo: 1, dataset: "training" })
    .returning({ id: assignments.id });
  await db.insert(assignmentRaters).values([
    { assignmentId: assignment.id, userId: coderId, fillsContextCard: true },
  ]);
});

afterAll(async () => {
  await db.delete(accessRequests).where(eq(accessRequests.email, "integ-request@example.org"));
  await db.delete(accessRequests).where(eq(accessRequests.email, "integ-live@example.org"));
  await db.delete(accessRequests).where(eq(accessRequests.email, "integ-coder@example.org"));
  await purgeFixture(FIXTURE);
});

describe("card and score integrity", () => {
  it("an empty card cannot be submitted", async () => {
    await ensureObservation(coderId, videoId);
    await saveContextCard(coderId, videoId, { adults: [] });
    try {
      await submitContextCard(coderId, videoId);
      throw new Error("expected refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(CoderError);
      expect((e as CoderError).message).toMatch(/still needs/i);
      expect((e as CoderError).message).toMatch(/subject/i);
      expect((e as CoderError).message).toMatch(/adult/i);
    }
    // Filled in, it goes through.
    await saveContextCard(coderId, videoId, {
      subject: "Physics",
      composition: "mixed",
      approxCount: "38",
      adults: [{ adultNo: 1, role: "teacher", sex: "male", speaks: "yes" }],
    });
    const r = await submitContextCard(coderId, videoId);
    expect(r.submittedAt).toBeInstanceOf(Date);
  });

  it("scores cannot be submitted while justifications are missing", async () => {
    for (let i = 1; i <= 8; i++) {
      await saveScore(coderId, videoId, {
        itemNo: i,
        scoreNum: ((i - 1) % 4) + 1,
        justification: i === 5 ? null : `item ${i} evidence`,
      });
    }
    try {
      await submitObservation(coderId, videoId);
      throw new Error("expected refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(CoderError);
      expect((e as CoderError).message).toMatch(/justification/i);
      expect((e as CoderError).message).toMatch(/5/);
    }
    await saveScore(coderId, videoId, {
      itemNo: 5,
      scoreNum: 1,
      justification: "item 5 evidence",
    });
    const r = await submitObservation(coderId, videoId);
    expect(r.submittedAt).toBeInstanceOf(Date);
  });
});

describe("access requests", () => {
  it("stores a pending request, once, and never for existing accounts", async () => {
    await submitAccessRequest("Integration Tester", "integ-request@example.org");
    await submitAccessRequest("Integration Tester", "integ-request@example.org");
    // Existing account → silently no request.
    await submitAccessRequest("Already Here", "integ-coder@example.org");
    const pending = (await listPendingRequests()).filter((r) =>
      r.email.startsWith("integ-"),
    );
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      fullName: "Integration Tester",
      email: "integ-request@example.org",
    });
  });

  it("granting training access creates a trainee account", async () => {
    const [req] = (await listPendingRequests()).filter(
      (r) => r.email === "integ-request@example.org",
    );
    const r = await decideAccessRequest(adminId, req.id, "approved_training");
    expect(r.ok).toBe(true);
    const [u] = await db
      .select({ role: users.role, scope: users.datasetScope, name: users.name })
      .from(users)
      .where(eq(users.email, "integ-request@example.org"));
    expect(u).toMatchObject({ role: "coder", scope: "training", name: "Integration Tester" });
    // Decided requests cannot be decided twice.
    const again = await decideAccessRequest(adminId, req.id, "declined");
    expect(again.ok).toBe(false);
  });

  it("granting live access creates a live coder", async () => {
    await submitAccessRequest("Live Person", "integ-live@example.org");
    const [req] = (await listPendingRequests()).filter(
      (r) => r.email === "integ-live@example.org",
    );
    const r = await decideAccessRequest(adminId, req.id, "approved_live");
    expect(r.ok).toBe(true);
    const [u] = await db
      .select({ role: users.role, scope: users.datasetScope })
      .from(users)
      .where(eq(users.email, "integ-live@example.org"));
    expect(u).toMatchObject({ role: "coder", scope: "live" });
  });
});
