/**
 * TEAM ACCESS TESTS — Amendments §49–§50, tested at the API layer.
 *
 * Scoring screens and every /api/coder/* route must be closed to accounts
 * whose only teams are other teams (a Narratives-only enumerator), whatever
 * the client sends; leaving a team keeps the history and takes effect on
 * the next request.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog, userTeams, users } from "@/db/schema";
import { GET as getQueue } from "@/app/api/coder/videos/route";
import { setTeamMembership } from "@/lib/db/admin";
import {
  canAccessNarratives,
  canAccessScoring,
  homePathFor,
} from "@/lib/teams";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: [] as string[],
  emails: [
    "teamtest-narr@example.org",
    "teamtest-score@example.org",
    "teamtest-none@example.org",
    "teamtest-admin@example.org",
  ],
  pairLabels: [] as string[],
};

const mockedAuth = vi.mocked(auth);
const ids: Record<string, string> = {};

function actAs(userId: string, role: "admin" | "coder" = "coder") {
  mockedAuth.mockResolvedValue({
    user: { id: userId, role, isChiefCoder: false, datasetScope: "test" },
    expires: "",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  for (const [key, email, role] of [
    ["narr", FIXTURE.emails[0], "coder"],
    ["score", FIXTURE.emails[1], "coder"],
    ["none", FIXTURE.emails[2], "coder"],
    ["admin", FIXTURE.emails[3], "admin"],
  ] as const) {
    const [u] = await db
      .insert(users)
      .values({ email, role, datasetScope: "test" })
      .returning({ id: users.id });
    ids[key] = u.id;
  }
  await db.insert(userTeams).values([
    { userId: ids.narr, team: "narratives" },
    { userId: ids.score, team: "scoring" },
  ]);
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("team rules (pure)", () => {
  it("admins pass every check", () => {
    expect(canAccessScoring("admin", [])).toBe(true);
    expect(canAccessNarratives("admin", [])).toBe(true);
  });
  it("closes scoring to accounts that belong only to other teams", () => {
    expect(canAccessScoring("coder", ["narratives"])).toBe(false);
    expect(canAccessScoring("coder", ["context_cards"])).toBe(false);
    expect(canAccessScoring("coder", ["narratives", "scoring"])).toBe(true);
    // pre-teams coder accounts keep access
    expect(canAccessScoring("coder", [])).toBe(true);
  });
  it("needs explicit membership for Narratives", () => {
    expect(canAccessNarratives("coder", [])).toBe(false);
    expect(canAccessNarratives("coder", ["scoring"])).toBe(false);
    expect(canAccessNarratives("coder", ["narratives"])).toBe(true);
  });
  it("sends each person to their own home", () => {
    expect(homePathFor("admin", [])).toBe("/admin/narratives");
    expect(homePathFor("coder", ["narratives"])).toBe("/narratives");
    expect(homePathFor("coder", ["narratives", "scoring"])).toBe("/narratives");
    expect(homePathFor("coder", ["scoring"])).toBe("/scoring");
    expect(homePathFor("coder", ["context_cards"])).toBe("/no-access");
  });
});

describe("scoring API is closed to Narratives-only accounts", () => {
  it("refuses a Narratives-only enumerator with 403", async () => {
    actAs(ids.narr);
    const res = await getQueue();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "no_scoring_access" });
  });

  it("serves a Scoring-team coder, a pre-teams coder, and an admin", async () => {
    for (const [key, role] of [
      ["score", "coder"],
      ["none", "coder"],
      ["admin", "admin"],
    ] as const) {
      actAs(ids[key], role);
      const res = await getQueue();
      expect(res.status, key).toBe(200);
    }
  });

  it("still answers 401 when signed out", async () => {
    mockedAuth.mockResolvedValue(null as never);
    const res = await getQueue();
    expect(res.status).toBe(401);
  });
});

describe("team membership history", () => {
  it("leaving a team keeps the row and takes effect on the next request", async () => {
    // The scoring coder joins Narratives, then leaves Scoring.
    await setTeamMembership(ids.admin, ids.score, "narratives", true);
    await setTeamMembership(ids.admin, ids.score, "scoring", false);

    actAs(ids.score);
    expect((await getQueue()).status).toBe(403);

    const rows = await db
      .select()
      .from(userTeams)
      .where(and(eq(userTeams.userId, ids.score), eq(userTeams.team, "scoring")));
    expect(rows).toHaveLength(1);
    expect(rows[0].removedAt).not.toBeNull();
    expect(rows[0].removedBy).toBe(ids.admin);

    const audits = await db
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.subjectId, ids.score));
    expect(audits.map((a) => a.action).sort()).toEqual(["team_joined", "team_left"]);

    // Rejoining opens a NEW active row; history is preserved.
    await setTeamMembership(ids.admin, ids.score, "scoring", true);
    expect((await getQueue()).status).toBe(200);
    const all = await db
      .select()
      .from(userTeams)
      .where(and(eq(userTeams.userId, ids.score), eq(userTeams.team, "scoring")));
    expect(all).toHaveLength(2);
  });

  it("is idempotent", async () => {
    const before = await db.select().from(userTeams).where(eq(userTeams.userId, ids.narr));
    await setTeamMembership(ids.admin, ids.narr, "narratives", true);
    const after = await db.select().from(userTeams).where(eq(userTeams.userId, ids.narr));
    expect(after).toHaveLength(before.length);
  });
});
