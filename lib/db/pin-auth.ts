/**
 * PIN sign-in (Amendment §53, ADR 0003). Uses the admin client: PIN
 * hashes and login attempts are never reachable from coder-facing code.
 *
 * A successful sign-in creates an ordinary Auth.js database session (same
 * `sessions` table, same cookie), so every existing `auth()` check works
 * unchanged. Sessions end after 2 hours idle and 12 hours in all.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, loginAttempts, pinCredentials, sessions, users } from "@/db/schema";
import {
  DUMMY_HASH,
  generatePin,
  hashPin,
  IP_MAX_FAILURES,
  IP_WINDOW_MS,
  isPinFormat,
  isWeakPin,
  lockAfterFailure,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  verifyPin,
} from "@/lib/pin";

export function hashIp(ip: string): string {
  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? "clobs"}:${ip}`)
    .digest("hex")
    .slice(0, 32);
}

export type PinSignInResult =
  | { ok: true; userId: string; sessionToken: string; expires: Date }
  | { ok: false; reason: "invalid" | "locked" | "hard_locked" | "throttled"; lockedUntil?: Date };

async function recordAttempt(ipHash: string, userId: string | null, success: boolean, reason: string) {
  await db.insert(loginAttempts).values({ ipHash, userId, success, reason });
}

/**
 * Check an email + PIN. Unknown or deactivated emails and wrong PINs give
 * the same answer ("invalid"), after the same scrypt work, so the screen
 * never reveals who has an account.
 */
export async function signInWithPin(input: { email: string; pin: string; ip: string }): Promise<PinSignInResult> {
  const ipHash = hashIp(input.ip || "unknown");
  const now = new Date();

  const [{ n: recentFailures }] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ipHash, ipHash),
        eq(loginAttempts.success, false),
        gt(loginAttempts.occurredAt, new Date(now.getTime() - IP_WINDOW_MS)),
      ),
    );
  if (Number(recentFailures) >= IP_MAX_FAILURES) {
    await recordAttempt(ipHash, null, false, "throttled");
    return { ok: false, reason: "throttled" };
  }

  const email = input.email.trim().toLowerCase();
  const [row] = await db
    .select({ id: users.id, isActive: users.isActive, cred: pinCredentials })
    .from(users)
    .leftJoin(pinCredentials, eq(pinCredentials.userId, users.id))
    .where(eq(users.email, email))
    .limit(1);

  const usable = row && row.isActive && row.cred;
  if (!usable || !isPinFormat(input.pin)) {
    await verifyPin("0000", DUMMY_HASH); // equal work either way
    await recordAttempt(ipHash, row?.id ?? null, false, !row ? "unknown_email" : !row.isActive ? "inactive" : !row.cred ? "no_pin" : "bad_format");
    return { ok: false, reason: "invalid" };
  }
  const cred = row.cred!;
  if (cred.lockedAt) {
    await recordAttempt(ipHash, row.id, false, "hard_locked");
    return { ok: false, reason: "hard_locked" };
  }
  if (cred.lockedUntil && cred.lockedUntil > now) {
    await recordAttempt(ipHash, row.id, false, "locked");
    return { ok: false, reason: "locked", lockedUntil: cred.lockedUntil };
  }

  const good = await verifyPin(input.pin, cred.pinHash);
  if (!good) {
    const failed = cred.failedCount + 1;
    const lock = lockAfterFailure(failed, now);
    await db
      .update(pinCredentials)
      .set({ failedCount: failed, lockedUntil: lock.lockedUntil, lockedAt: lock.hardLock ? now : null })
      .where(eq(pinCredentials.userId, row.id));
    await recordAttempt(ipHash, row.id, false, "wrong_pin");
    if (lock.hardLock) return { ok: false, reason: "hard_locked" };
    if (lock.lockedUntil) return { ok: false, reason: "locked", lockedUntil: lock.lockedUntil };
    return { ok: false, reason: "invalid" };
  }

  await db
    .update(pinCredentials)
    .set({ failedCount: 0, lockedUntil: null, lastSuccessAt: now })
    .where(eq(pinCredentials.userId, row.id));
  await recordAttempt(ipHash, row.id, true, "ok");
  const sessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_IDLE_MS);
  await db.insert(sessions).values({ sessionToken, userId: row.id, expires, createdAt: now });
  return { ok: true, userId: row.id, sessionToken, expires };
}

/**
 * Cap a session's new expiry at 12 hours after it began (used by the
 * Auth.js adapter whenever it extends a session on activity).
 */
export async function capSessionExpiry(sessionToken: string, expires: Date): Promise<Date> {
  const [s] = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.sessionToken, sessionToken))
    .limit(1);
  if (!s) return expires;
  const cap = new Date(s.createdAt.getTime() + SESSION_ABSOLUTE_MS);
  return expires > cap ? cap : expires;
}

/** Admin: give someone a new random PIN (shown once). Unlocks the account. */
export async function setPinForUser(actorId: string, userId: string): Promise<{ ok: true; pin: string } | { ok: false; error: string }> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return { ok: false, error: "No such account." };
  const pin = generatePin();
  const pinHash = await hashPin(pin);
  await db
    .insert(pinCredentials)
    .values({ userId, pinHash, setBy: actorId })
    .onConflictDoUpdate({
      target: pinCredentials.userId,
      set: { pinHash, setBy: actorId, setAt: new Date(), failedCount: 0, lockedUntil: null, lockedAt: null },
    });
  await db.insert(auditLog).values({ actorId, action: "pin_set", subjectTable: "users", subjectId: userId, details: {} });
  return { ok: true, pin };
}

/** Anyone signed in: change their own PIN, proving the current one. */
export async function changeOwnPin(
  userId: string,
  currentPin: string,
  newPin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isPinFormat(newPin)) return { ok: false, error: "The new code must be exactly 4 digits." };
  if (isWeakPin(newPin)) return { ok: false, error: "That code is too easy to guess. Avoid repeated or consecutive digits." };
  const [cred] = await db.select().from(pinCredentials).where(eq(pinCredentials.userId, userId)).limit(1);
  if (!cred || !(await verifyPin(currentPin, cred.pinHash))) return { ok: false, error: "Your current code is not correct." };
  await db
    .update(pinCredentials)
    .set({ pinHash: await hashPin(newPin), setBy: userId, setAt: new Date(), failedCount: 0, lockedUntil: null })
    .where(eq(pinCredentials.userId, userId));
  await db.insert(auditLog).values({ actorId: userId, action: "pin_changed", subjectTable: "users", subjectId: userId, details: {} });
  return { ok: true };
}

export interface PinStatus {
  hasPin: boolean;
  locked: "temporary" | "hard" | null;
}

export async function getPinStatusMap(): Promise<Record<string, PinStatus>> {
  const rows = await db.select().from(pinCredentials);
  const now = new Date();
  return Object.fromEntries(
    rows.map((r) => [
      r.userId,
      {
        hasPin: true,
        locked: r.lockedAt ? "hard" : r.lockedUntil && r.lockedUntil > now ? "temporary" : null,
      },
    ]),
  );
}
