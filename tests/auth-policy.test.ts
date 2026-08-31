/**
 * Sign-in policy (blinding-adjacent access rule, CLAUDE.md testing floor):
 * no self-signup — unknown emails never get a code, deactivated accounts
 * never get back in without an admin.
 */
import { describe, expect, it } from "vitest";
import { canSignIn, generateSignInCode } from "@/lib/auth-policy";

describe("canSignIn", () => {
  it("refuses an email with no account (no self-signup)", () => {
    expect(canSignIn(null)).toBe(false);
    expect(canSignIn(undefined)).toBe(false);
  });

  it("refuses a deactivated account", () => {
    expect(canSignIn({ isActive: false })).toBe(false);
  });

  it("allows an existing active account", () => {
    expect(canSignIn({ isActive: true })).toBe(true);
  });
});

describe("generateSignInCode", () => {
  it("is always exactly six digits and never starts with 0", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateSignInCode();
      expect(code).toMatch(/^[1-9]\d{5}$/);
    }
  });

  it("does not repeat immediately (sanity, not a randomness proof)", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateSignInCode()),
    );
    expect(codes.size).toBeGreaterThan(40);
  });
});
