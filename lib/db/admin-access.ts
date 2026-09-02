/**
 * Access requests (Amendment §35): the public sign-in page collects a name
 * and email; an admin grants training or live access, or declines. A
 * request NEVER creates an account by itself — no self-signup, ever.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accessRequests, auditLog, users } from "@/db/schema";
import { addTrainee } from "@/lib/db/admin-training";

/** Public entry point. Always answers the same, never leaks whether an
 *  account or request exists (no user enumeration). */
export async function submitAccessRequest(fullName: string, email: string) {
  const name = fullName.trim();
  const clean = email.trim().toLowerCase();
  if (!name || name.length > 120) return;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) return;

  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, clean));
  if (existingUser) return; // they can already sign in

  try {
    await db.insert(accessRequests).values({ fullName: name, email: clean });
  } catch {
    // A pending request already exists (unique index) — same outcome.
  }
}

export interface AccessRequestRow {
  id: string;
  fullName: string;
  email: string;
  requestedAt: Date;
}

export async function listPendingRequests(): Promise<AccessRequestRow[]> {
  return db
    .select({
      id: accessRequests.id,
      fullName: accessRequests.fullName,
      email: accessRequests.email,
      requestedAt: accessRequests.requestedAt,
    })
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"))
    .orderBy(desc(accessRequests.requestedAt));
}

export async function decideAccessRequest(
  actorId: string,
  requestId: string,
  decision: "approved_training" | "approved_live" | "declined",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [request] = await db
    .select({
      id: accessRequests.id,
      fullName: accessRequests.fullName,
      email: accessRequests.email,
      status: accessRequests.status,
    })
    .from(accessRequests)
    .where(eq(accessRequests.id, requestId));
  if (!request || request.status !== "pending") {
    return { ok: false, error: "That request is no longer pending." };
  }

  if (decision === "approved_training") {
    const r = await addTrainee(actorId, request.email, request.fullName);
    if (!r.ok) {
      // The ACCOUNT is what the decision grants; a failed pack assignment
      // (empty gold set, transient error) is recoverable from the Training
      // screen. Only refuse when the account itself was not created.
      const [created] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, request.email));
      if (!created) return r;
    }
  } else if (decision === "approved_live") {
    await db.insert(users).values({
      email: request.email,
      name: request.fullName,
      role: "coder",
      datasetScope: "live",
    });
  }

  await db
    .update(accessRequests)
    .set({ status: decision, decidedBy: actorId, decidedAt: new Date() })
    .where(
      and(eq(accessRequests.id, requestId), eq(accessRequests.status, "pending")),
    );
  await db.insert(auditLog).values({
    actorId,
    action: `access_request_${decision}`,
    subjectTable: "access_requests",
    subjectId: requestId,
    details: { email: request.email },
  });
  return { ok: true };
}

/** Count for the Team screen header. */
export async function countPendingRequests(): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(accessRequests)
    .where(eq(accessRequests.status, "pending"));
  return Number(row.n);
}
