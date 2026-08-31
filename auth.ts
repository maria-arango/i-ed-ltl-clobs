/**
 * Auth.js v5 configuration (ADR 0001: email one-time codes, our own
 * PostgreSQL tables, no third-party identity provider).
 *
 * Flow: coder enters their work email → signIn callback refuses unknown or
 * deactivated accounts BEFORE any email is sent (no self-signup, no user
 * auto-creation) → a 6-digit code is emailed → entering it establishes a
 * database session. Sessions are long-lived (30 days) on trusted devices
 * (addendum §2); admin screens add re-authentication at the screen level.
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: {
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60, // 30 days on trusted devices
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
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
});
