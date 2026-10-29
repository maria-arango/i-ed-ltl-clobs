# ADR 0003 — Sign-in with email + 4-digit PIN

- **Status:** accepted (María, 2026-10-28; docs/PLAN.md decision D1, §5-bis)
- **Supersedes:** the email-code-only sign-in of ADR 0001 for everyday use. That flow stays in the
  code as an admin fallback.

## Context

Enumerators came from ODK, where they picked their name and typed a 4-digit code. That code was
their enumerator ID, so it identified them but authenticated nobody (STATUS §6.2). Tablets and
laptops are lent between enumerators, so per-device registration would invite submissions under
the wrong person. Narratives describe minors, so access must be personal and attributable.

## Options considered

PLAN §5 compares them in full:
- email code plus a 30-day session: fails on shared devices;
- name + PIN only: publishes the roster and can be guessed from anywhere;
- device registration + PIN: rejected because devices are lent;
- passkeys: one device lock is shared by everyone using the device.

## Decision

**Email address + personal 4-digit PIN** on every sign-in.

- PINs are issued by admins and can be reset. They are never the ODK ID, never trivial, and stored
  as salted `scrypt` hashes.
- Lockout: 5 failures lock the account for 15 minutes (doubling each round); 10 consecutive failures
  lock it until an admin reset. A per-IP throttle is added on top.
- Sessions: 2 hours idle, 12 hours absolute, `HttpOnly` + `Secure` cookies. The signed-in name is
  always on screen.

## Deviation from NIST SP 800-63B-4, stated plainly

NIST requires a memorised secret used as the only factor to be at least 15 characters (§3.1.1.2).
A 4-digit PIN does not meet that. The study team accepts the deviation for usability on shared
devices, with these compensating controls:

- lockout well inside NIST's 100-attempt bound (§3.2.2) and per-IP throttling;
- short sessions;
- no public roster;
- server-side authorisation on every request;
- an audit trail of who submitted what, when and from which kind of device.

## Consequences

- Day-to-day sign-in matches the ODK habit.
- No email provider is needed for enumerators.
- Someone who learns a colleague's PIN can act as them. This is mitigated by personal PINs,
  lockout and audit. Admins should hand PINs out privately.

## Update 2026-10-29 (Amendment §56)

María chose the eight Narratives enumerators' ODK codes as their initial PINs. That reverses the
"never the ODK ID" rule above for those accounts, and she accepts the risk that a colleague who
knows someone's ODK code can sign in as them. Recommended mitigation: each enumerator changes their
PIN under **Change PIN** after first signing in.
