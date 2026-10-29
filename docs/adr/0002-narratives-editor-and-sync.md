# ADR 0002 — Narratives editor, storage and live sync

- **Status:** accepted (María, 2026-10-28; docs/PLAN.md decisions D3, D6, D7)
- **Scope:** the document editor enumerators use to correct AI narratives, how their work is stored,
  and how it is saved without loss.

## Context

Narrative reviewers correct a ~50–125 KB AI narrative against a video. The reviewed Word documents
(STATUS §8) use only red text, manual strikethrough and range-anchored Word comments. They use no
tracked changes, no comment replies and nothing resolved. Reviewers work on lent tablets and laptops
over unreliable connections. Losing work is the failure the brief forbids above all.

## Options

1. **Tiptap 3 open-source core (MIT, on ProseMirror)**, already used for coder notes.
2. Lexical or Slate (MIT): a second editor stack for a single maintainer.
3. CKEditor 5 or TinyMCE: comments and track changes are paid add-ons, and their clouds are third parties.
4. Real-time collaboration (Yjs/Hocuspocus, Tiptap Cloud, Liveblocks): unnecessary, because one
   person edits each narrative. Liveblocks and Tiptap Cloud are also third-party services.

## Decision

- **Editor:** Tiptap 3 open-source core plus `@tiptap/extension-text-style` (Color), all MIT.
  - Comments are our own `comment` mark (overlapping allowed) plus a comment list. They are laid
    out in the right margin by our own small component; `sidenotes` was considered and its extra
    state store is not needed.
  - No paid Tiptap features (Comments, Collaboration, Snapshots, Tracked changes, Conversion).
- **Storage:** standard Postgres tables, as below. No file storage; Word files are generated on
  demand from stored revisions.

  | Table | Holds |
  |---|---|
  | `narratives` | immutable imports |
  | `narrative_assignments` | who, order, video link, status |
  | `narrative_documents` | the working copy, with a `revision` counter |
  | `narrative_revisions` | append-only history |
  | `narrative_sittings` | measured time |

- **Sync:** full-document snapshots.
  - Every change goes to IndexedDB (debounced 250 ms), keyed by user and assignment.
  - `navigator.storage.persist()` is requested.
  - The device uploads gzip-compressed snapshots with the revision it was built on. The server
    applies them only if that revision is still current (optimistic concurrency) and otherwise
    answers 409, storing the refused version as a `conflict_copy`.
  - The Web Locks API allows one editing tab per device.
  - A 401 keeps everything and resumes after sign-in.
  - A database trigger refuses changes to a submitted document.
- **Export:** `docx` (MIT) writes red runs, `w:strike` runs and real Word comments. It never
  writes tracked changes.

## Consequences

- **Good.** One editor in the codebase. No third-party service. Every failure mode (offline, tab
  closed, session expired, two tabs) is handled by one tested module. Every saved state is
  recoverable from the server history.
- **Bad.** Snapshots are larger than step-based diffs. Gzip keeps a save to about 15–25 KB, which is
  acceptable. Step-based sync can come later if bandwidth bites.
- **Watch.** IndexedDB on a lent device holds that person's unsynced drafts until they sync. A
  fully synced sign-out removes them.
