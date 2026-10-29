/**
 * Auth.js v5 configuration (ADR 0001: email one-time codes, our own
 * PostgreSQL tables, no third-party identity provider).
 *
 * Flow: coder enters their work email → signIn callback refuses unknown or
 * deactivated accounts BEFORE any email is sent (no self-signup, no user
 * auto-creation) → a 6-digit code is emailed → entering it establishes a
 * database session. Since ADR 0003 the everyday sign-in is email + PIN
 * (app/api/pin-signin), which creates the same kind of database session;
 * this email-code flow remains as the admin fallback at /signin/email.
 * Sessions: 2 h idle, 12 h absolute (ADR 0003).
 */
import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/db/schema";
import { canSignIn, generateSignInCode } from "@/lib/auth-policy";
import { sendSignInCode } from "@/lib/email";
import { capSessionExpiry } from "@/lib/db/pin-auth";
import { SESSION_IDLE_MS } from "@/lib/pin";

const baseAdapter = DrizzleAdapter(db, {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: {
    ...baseAdapter,
    // Activity extends a session by the idle window, but never past 12
    // hours after it began (ADR 0003: lent devices, short sessions).
    async updateSession(session) {
      const expires = session.expires
        ? await capSessionExpiry(session.sessionToken, session.expires)
        : session.expires;
      return baseAdapter.updateSession!({ ...session, expires });
    },
  },
  session: {
    strategy: "database",
    // ADR 0003: 2 hours without activity ends a session (sliding; the
    // editor's autosave counts as activity), 12 hours ends it regardless.
    maxAge: SESSION_IDLE_MS / 1000,
    updateAge: 5 * 60,
  },
  trustHost: true,
  providers: [
    {
      id: "email-code",
      type: "email",
      name: "Email code",
      from: process.env.EMAIL_FROM ?? "dev@localhost",
      maxAge: 15 * 60, // codes expire in 15 minutes
      generateVerificationToken: generateSignInCode,
      sendVerificationRequest: async ({ identifier, token }) => {
        await sendSignInCode(identifier, token);
      },
      options: {},
    },
  ],
  callbacks: {
    // No self-signup: unknown emails get no code and no user row.
    async signIn({ user }) {
      if (!user.email) return false;
      try {
        // Explicit columns: never depends on grants beyond what any role has,
        // and a database problem logs loudly instead of looking like an
        // unknown email.
        const rows = await db
          .select({ isActive: users.isActive })
          .from(users)
          .where(eq(users.email, user.email.toLowerCase()))
          .limit(1);
        return canSignIn(rows[0]);
      } catch (e) {
        console.error(
          "signIn callback: database lookup failed (check DATABASE_URL):",
          e instanceof Error ? e.message : e,
        );
        return false;
      }
    },
    // Expose role and account facts to server components via the session.
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.role = user.role;
      session.user.isChiefCoder = user.isChiefCoder;
      session.user.datasetScope = user.datasetScope;
      session.user.uiMode = user.uiMode;
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
