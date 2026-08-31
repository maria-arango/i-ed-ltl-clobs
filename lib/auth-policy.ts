/**
 * Sign-in policy, kept pure so it can be unit-tested (CLAUDE.md testing
 * floor: blinding and access rules need tests).
 *
 * There is NO self-signup: accounts are created by an admin on the Team
 * screen. An email that is not already a row in `users` must never receive
 * a code and must never cause a user row to be created — the Auth.js
 * signIn callback runs this check BEFORE any email is sent.
 */

export interface SignInCandidate {
  isActive: boolean;
}

/** True only for an existing, active account. Null/undefined = unknown email. */
export function canSignIn(user: SignInCandidate | null | undefined): boolean {
  if (!user) return false;
  return user.isActive === true;
}

/** Six-digit one-time code, cryptographically random, never starting with 0. */
export function generateSignInCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(100000 + (buf[0] % 900000));
}
