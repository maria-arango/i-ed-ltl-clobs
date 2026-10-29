/**
 * PIN SIGN-IN — Amendment §53, ADR 0003.
 *
 *  - PINs: exactly 4 digits, weak PINs refused, stored as scrypt hashes.
 *  - Wrong PINs: 5 in a row lock the account for 15 minutes (doubling),
 *    10 in a row lock it until an admin sets a new PIN; a correct PIN is
 *    refused while locked.
 *  - Unknown, deactivated and PIN-less accounts answer exactly like a wrong
 *    PIN (no account enumeration).
 *  - A per-IP throttle stops guessing across many accounts.
 *  - Success creates an Auth.js database session (2 h idle) whose
 *    extensions are capped at 12 hours after it began.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts, pinCredentials, sessions, users } from "@/db/schema";
import {
  generatePin,
  hashPin,
  isPinFormat,
  isWeakPin,
  lockAfterFailure,
  SESSION_ABSOLUTE_MS,
  verifyPin,
} from "@/lib/pin";
import { capSessionExpiry, changeOwnPin, hashIp, setPinForUser, signInWithPin } from "@/lib/db/pin-auth";
import { POST as pinRoute } from "@/app/api/pin-signin/route";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: [] as string[],
  emails: ["pintest-admin@example.org", "pintest-a@example.org", "pintest-off@example.org", "pintest-nopin@example.org"],
  pairLabels: [] as string[],
};
const ids: Record<string, string> = {};
let pinA = "";

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
  const r = await setPinForUser(ids.admin, ids.a);
  if (!r.ok) throw new Error(r.error);
  pinA = r.pin;
  await setPinForUser(ids.admin, ids.off);
});
afterAll(cleanup);

describe("PIN rules (pure)", () => {
  it("accepts exactly four digits", () => {
    expect(isPinFormat("4821")).toBe(true);
    for (const bad of ["482", "48210", "48a1", "", 4821]) expect(isPinFormat(bad)).toBe(false);
  });
  it("refuses easily guessed PINs", () => {
    for (const weak of ["0000", "1111", "1234", "6789", "9876", "8901", "1212", "6969"]) expect(isWeakPin(weak), weak).toBe(true);
    for (const ok of ["4821", "7350", "2604"]) expect(isWeakPin(ok), ok).toBe(false);
  });
  it("generates only strong PINs", () => {
    for (let i = 0; i < 200; i++) expect(isWeakPin(generatePin())).toBe(false);
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
    const wrong = await signInWithPin({ email: FIXTURE.emails[1], pin: pinA === "4821" ? "7350" : "4821", ip: "203.0.113.7" });
    const unknown = await signInWithPin({ email: "nobody-here@example.org", pin: pinA, ip: "203.0.113.7" });
    const off = await signInWithPin({ email: FIXTURE.emails[2], pin: pinA, ip: "203.0.113.7" });
    const nopin = await signInWithPin({ email: FIXTURE.emails[3], pin: "4821", ip: "203.0.113.7" });
    for (const r of [wrong, unknown, off, nopin]) expect(r).toEqual({ ok: false, reason: "invalid" });
    // reset the wrong-PIN counter for the next test
    await setPinForUser(ids.admin, ids.a).then((r) => r.ok && (pinA = r.pin));
  });

  it("locks after 5 wrong PINs, refusing even the right one, until the lock ends", async () => {
    const wrongPin = pinA === "4821" ? "7350" : "4821";
    let last;
    for (let i = 0; i < 5; i++) last = await signInWithPin({ email: FIXTURE.emails[1], pin: wrongPin, ip: "203.0.113.8" });
    expect(last).toMatchObject({ ok: false, reason: "locked" });
    const right = await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "203.0.113.8" });
    expect(right).toMatchObject({ ok: false, reason: "locked" });
    // let the lock expire
    await db.update(pinCredentials).set({ lockedUntil: new Date(Date.now() - 1000) }).where(eq(pinCredentials.userId, ids.a));
    expect((await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "203.0.113.8" })).ok).toBe(true);
  });

  it("hard-locks at 10 in a row until an admin sets a new PIN", async () => {
    const wrongPin = pinA === "4821" ? "7350" : "4821";
    await db.update(pinCredentials).set({ failedCount: 9, lockedUntil: null }).where(eq(pinCredentials.userId, ids.a));
    expect(await signInWithPin({ email: FIXTURE.emails[1], pin: wrongPin, ip: "203.0.113.8" })).toMatchObject({ reason: "hard_locked" });
    expect(await signInWithPin({ email: FIXTURE.emails[1], pin: pinA, ip: "203.0.113.8" })).toMatchObject({ reason: "hard_locked" });
    const reset = await setPinForUser(ids.admin, ids.a);
    expect(reset.ok).toBe(true);
    if (reset.ok) pinA = reset.pin;
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

  it("lets a person change their own PIN only with the current one, refusing weak PINs", async () => {
    expect(await changeOwnPin(ids.a, pinA === "4821" ? "7350" : "4821", "2604")).toMatchObject({ ok: false });
    expect(await changeOwnPin(ids.a, pinA, "1234")).toMatchObject({ ok: false });
    expect(await changeOwnPin(ids.a, pinA, "2604")).toEqual({ ok: true });
    expect((await signInWithPin({ email: FIXTURE.emails[1], pin: "2604", ip: "203.0.113.8" })).ok).toBe(true);
    pinA = "2604";
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
      new Request("https://clobs.example/api/pin-signin", { method: "POST", body: JSON.stringify({ email: FIXTURE.emails[1], pin: "0000" }) }),
    );
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();
    expect(await bad.json()).toEqual({ reason: "invalid" });
  });
});
