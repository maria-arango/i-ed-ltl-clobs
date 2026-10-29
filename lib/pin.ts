/**
 * Personal 4-digit PINs (Amendment §53, ADR 0003) — pure helpers so the
 * rules can be unit-tested: format, weak-PIN refusal, scrypt hashing and
 * the lockout schedule.
 */
import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

export const PIN_LENGTH = 4;
/** Failures in a row before the first temporary lock. */
export const LOCK_AFTER = 5;
/** Failures in a row that lock the account until an admin resets the PIN. */
export const HARD_LOCK_AFTER = 10;
export const FIRST_LOCK_MINUTES = 15;

export function isPinFormat(pin: unknown): pin is string {
  return typeof pin === "string" && new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** Easily guessed PINs are refused: one repeated digit, runs, and pairs. */
export function isWeakPin(pin: string): boolean {
  if (!isPinFormat(pin)) return true;
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return true; // 0000, 1111
  const up = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const down = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);
  if (up || down) return true; // 1234, 9876, 8901
  if (pin.slice(0, 2) === pin.slice(2)) return true; // 1212, 6969
  return false;
}

/** A random PIN that is not weak (cryptographically random). */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
    if (!isWeakPin(pin)) return pin;
  }
}

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function scryptAsync(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(pin, salt, KEYLEN, { N, r: R, p: P }, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** "scrypt$N$r$p$<salt>$<hash>" (base64url). */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pin, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  const key = await scryptAsync(pin, salt);
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to verify against for unknown emails, so timing reveals nothing. */
export const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * What a failure does to the account: nothing until 5 in a row, then a
 * 15-minute lock doubling with each further failure, then at 10 in a row a
 * lock that only an admin PIN reset lifts (NIST SP 800-63B-4 §3.2.2 bound
 * is 100; this is far stricter).
 */
export function lockAfterFailure(failedCount: number, now: Date): { lockedUntil: Date | null; hardLock: boolean } {
  if (failedCount >= HARD_LOCK_AFTER) return { lockedUntil: null, hardLock: true };
  if (failedCount >= LOCK_AFTER) {
    const minutes = FIRST_LOCK_MINUTES * 2 ** (failedCount - LOCK_AFTER);
    return { lockedUntil: new Date(now.getTime() + minutes * 60_000), hardLock: false };
  }
  return { lockedUntil: null, hardLock: false };
}

/** Session lifetimes (ADR 0003). */
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;

/** Per-IP throttle: failed attempts allowed per window before 429. */
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const IP_MAX_FAILURES = 20;
