# ADR 0004 — Hosting stays on Vercel + Neon for the Narratives work

- **Status:** accepted (María, 2026-10-28; docs/PLAN.md decision D5)

## Context

The IRB/DAT preference is to avoid third-party services. A Harvard-hosted server, or a Harvard
cloud account configured for Level 3 data, takes months to obtain; the Harvard Cloud Program
(consolidated AWS billing) needs a HUIT customer account and a billing code, and leaves Level 3
configuration to the account owner. The narrative review cannot wait that long.

## Decision

- **Keep Vercel (app) and Neon (Postgres).** Narrative data goes into the same database.
- **Remove every other runtime service from the enumerator path.** Sign-in becomes email + PIN
  (ADR 0003), so Resend is only an optional admin fallback.
- No analytics, error reporting or AI calls on any page (addendum §1).
- Word files are generated on demand, so no file-storage service is added.

## Consequences

- Third parties holding data stay at exactly two: Vercel (in transit) and Neon (at rest).
- The move to Harvard hosting remains a `pg_dump` plus a container image away. ADR 0001's
  Dockerfile is still owed if that day comes.
- **Recommended follow-up:** a nightly export into the Harvard Google Drive, so that a copy of the
  data sits on Harvard-controlled storage.
