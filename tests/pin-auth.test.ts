/**
 * PIN SIGN-IN — Amendment §53, ADR 0003.
 *
 *  - Codes: exactly 4 digits, set by an admin (the master team's code,
 *    Amendment §60), stored as scrypt hashes; nobody changes their own.
 *  - Wrong PINs: 5 in a row lock the account for 15 minutes (doubling),
 *    10 in a row lock it until an admin unlocks it (same code); a correct
 *    code is refused while locked.
 *  - Unknown, deactivated and PIN-less accounts answer exactly like a wrong
 *    PIN (no account enumeration).
 *  - A per-IP throttle stops guessing across many accounts.
 *  - Success creates an Auth.js database session (2 h idle) whose
 *    extensions are capped at 12 hours after it began.
 *  - The sign-in page offers the emailed code to admins and to accounts
 *    without a code, the 4-digit step to everyone else (unknown included).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts, pinCredentials, sessions, users } from "@/db/schema";
import {
  hashPin,
  isPinFormat,
  lockAfterFailure,
  SESSION_ABSOLUTE_MS,
  verifyPin,
} from "@/lib/pin";
import { capSessionExpiry, hashIp, setPinForUser, signInMethodFor, signInWithPin, unlockPin } from "@/lib/db/pin-auth";
import { POST as pinRoute } from "@/app/api/pin-signin/route";
import { POST as methodRoute } from "@/app/api/signin-method/route";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: [] as string[],
  emails: ["pintest-admin@example.org", "pintest-a@example.org", "pintest-off@example.org", "pintest-nopin@example.org"],
  pairLabels: [] as string[],
};
const ids: Record<string, string> = {};
// Test codes (invented). Codes are set by an admin, as the master team does.
const pinA = "1018";
const WRONG = "1019";

async function cleanup() {
  const us = await db.select({ id: users.id }).from(users).where(inArray(users.email, FIXTURE.emails));
  const uids = us.map((u) => u.id);
  if (uids.length) {
    await db.delete(sessions).where(inArray(sessions.userId, uids));
    await db.delete(loginAttempts).where(inArray(loginAttempts.userId, uids));
    await db.delete(pinCredentials).where(inArray(pinCredentials.userId, uids));
  }
  await db.delete(loginAttempts).where(inArray(loginAttempts.ipHash, [hashIp("203.0.113.7"), hashIp("203.0.113.8"), hashIp("198.51.100.1")]));
  await purgeFixture(FIXTURE);
}

beforeAll(async () => {
  await cleanup();
  for (const [key, email, role, active] of [
    ["admin", FIXTURE.emails[0], "admin", true],
    ["a", FIXTURE.emails[1], "coder", true],
    ["off", FIXTURE.emails[2], "coder", false],
    ["nopin", FIXTURE.emails[3], "coder", true],
  ] as const) {
    const [u] = await db.insert(users).values({ email, role, isActive: active, datasetScope: "test" }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const r = await setPinForUser(ids.admin, ids.a, pinA);
  if (!r.ok) throw new Error(r.error);
  await setPinForUser(ids.admin, ids.off, "1030");
});
afterAll(cleanup);

describe("PIN rules (pure)", () => {
  it("accepts exactly four digits", () => {
    expect(isPinFormat("4821")).toBe(true);
    for (const bad of ["482", "48210", "48a1", "", 4821]) expect(isPinFormat(bad)).toBe(false);
  });
  it("an admin can only set a 4-digit code", async () => {
    expect(await setPinForUser(ids.admin, ids.nopin, "123")).toMatchObject({ ok: false });
    expect(await setPinForUser(ids.admin, ids.nopin, "12a4")).toMatchObject({ ok: false });
  });
  it("stores a salted hash, never the PIN", async () => {
    const h1 = await hashPin("4821");
    const h2 = await hashPin("4821");
    expect(h1).not.toContain("4821");
    expect(h1).not.toBe(h2);
    expect(await verifyPin("4821", h1)).toBe(true);
    expect(await verifyPin("4822", h1)).toBe(false);
  });
  it("locks after 5, doubles, and hard-locks at 10", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    expect(lockAfterFailure(4, now)).toEqual({ lockedUntil: null, hardLock: false });
    expect(lockAfterFailure(5, now).lockedUntil?.toISOString()).toBe("2026-10-29T10:15:00.000Z");
    expect(lockAfterFailure(6, now).lockedUntil?.toISOString()).toBe("2026-10-29T10:30:00.000Z");
    expect(lockAfterFailure(10, now)).toEqual({ lockedUntil: null, hardLock: true });
  });
});

describe("signing in", () => {
  it("creates a 2-hour database session on the right PIN", async () => {
    const r = await signInWithPin({ email: " PINTEST-A@example.org ", pin: pinA, ip: "203.0.113.7" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [s] = await db.select().from(sessions).where(eq(sessions.sessionToken, r.sessionToken));
    expect(s.userId).toBe(ids.a);
    const hours = (s.expires.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThan(2.1);
  });

  it("answers unknown, deactivated and PIN-less accounts exactly like a wrong PIN", async () => {
    const wrong = await signInWithPin({ email: FIXTURE.emails[1], pin: WRONG, ip: "203.0.113.7" });
    const unknown = await signInWithPin({ email: "nobody-here@example.org", pin: pinA, ip: "203.0.113.7" });
    const off = await signInWithPin({ email: FIXTURE.emails[2], pin: pinA, ip: "203.0.113.7" });
    const nopin = await signInWithPin({ email: FIXTURE.emails[3], pin: "4821", ip: "203.0.113.7" });
    for (const r of [wrong, unknown, off, nopin]) expect(r).toEqual({ ok: false, reason: "invalid" });
    // reset the wrong-code counter for the next test
    await unlockPin(ids.admin, ids.a);
  });

  it("locks after 5 wrong PINs, refusing even the right one, until the lock ends", async () => {
    const wrongPin = WRONG;
    let last;
    for (let i = 0; i < 5; i++) last = await signInWithPin({ email: FIXTURE.emails[1], pin: wrongPin, ip: "203.0.113.8" });
    expect(last).toMatchObject({ ok: false, reason: "locked" });
    const right = await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "203.0.113.8" });
    expect(right).toMatchObject({ ok: false, reason: "locked" });
    // let the lock expire
    await db.update(pinCredentials).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(pinCredentials.userId, ids.a));
    expect((await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "203.0.113.8" })).ok).toBe(true);
  });

  it("hard-locks at 10 in a row until an admin unlocks it (same code)", async () => {
    const wrongPin = WRONG;
    await db.update(pinCredentials).set({ failedCount: 9, lockedUntil: null }).where(eq(pinCredentials.userId, ids.a));
    expect(await signInWithPin({ email: FIXTURE.emails[1], pin: wrongPin, ip: "203.0.113.8" })).toMatchObject({ reason: "hard_locked" });
    expect(await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "203.0.113.8" })).toMatchObject({ reason: "hard_locked" });
    expect(await unlockPin(ids.admin, ids.a)).toEqual({ ok: true });
    expect((await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "203.0.113.8" })).ok).toBe(true);
  });

  it("throttles an IP after 20 failures across accounts", async () => {
    let r;
    for (let i = 0; i < 21; i++) r = await signInWithPin({ email: `guess-${i}@example.org`, pin: "4821", ip: "198.51.100.1" });
    expect(r).toEqual({ ok: false, reason: "throttled" });
    // even a valid sign-in from that IP waits
    expect(await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "198.51.100.1" })).toEqual({ ok: false, reason: "throttled" });
  });

  it("caps session extensions at 12 hours after sign-in", async () => {
    const token = "pintest-cap-token";
    const began = new Date(Date.now() - 11 * 3_600_000);
    await db.insert(sessions).values({ sessionToken: token, userId: ids.a, expires: new Date(), createdAt: began });
    const capped = await capSessionExpiry(token, new Date(Date.now() + 2 * 3_600_000));
    expect(capped.getTime()).toBe(began.getTime() + SESSION_ABSOLUTE_MS);
    const early = new Date(Date.now() + 10 * 60_000);
    expect((await capSessionExpiry(token, early)).getTime()).toBe(early.getTime());
  });

});

describe("which second step the sign-in page shows", () => {
  it("emailed code for admins and accounts without a code; 4-digit step otherwise", async () => {
    expect(await signInMethodFor(FIXTURE.emails[0])).toBe("email-code"); // admin
    expect(await signInMethodFor(FIXTURE.emails[3])).toBe("email-code"); // coder, no code
    expect(await signInMethodFor(` ${FIXTURE.emails[1].toUpperCase()} `)).toBe("pin"); // has a code
    expect(await signInMethodFor("nobody-here@example.org")).toBe("pin"); // unknown: no hint
    expect(await signInMethodFor(FIXTURE.emails[2])).toBe("pin"); // deactivated
  });

  it("an admin keeps the emailed code even with a code set", async () => {
    await setPinForUser(ids.admin, ids.admin, "1001");
    expect(await signInMethodFor(FIXTURE.emails[0])).toBe("email-code");
  });

  it("the route answers with the method only", async () => {
    const res = await methodRoute(new Request("https://x/api/signin-method", { method: "POST", body: JSON.stringify({ email: FIXTURE.emails[1] }) }));
    expect(await res.json()).toEqual({ method: "pin" });
  });
});

describe("POST /api/pin-signin", () => {
  it("sets an HttpOnly session cookie on success and none on failure", async () => {
    const ok = await pinRoute(
      new Request("https://clobs.example/api/pin-signin", { method: "POST", body: JSON.stringify({ email: FIXTURE.emails[1], pin: pinA }) }),
    );
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Secure-authjs\.session-token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/);
    const bad = await pinRoute(
      new Request("https://clobs.example/api/pin-signin", { method: "POST", body: JSON.stringify({ email: FIXTURE.emails[1], pin: WRONG }) }),
    );
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();
    expect(await bad.json()).toEqual({ reason: "invalid" });
  });
});
