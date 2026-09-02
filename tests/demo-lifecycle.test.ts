/**
 * Demo self-service (Amendment §38): an admin creates their two demo
 * videos (calibration partner pre-seated) and can delete them again with
 * EVERYTHING attached — scores, notes, cards, calibration rows, the pair —
 * so demo work never occupies space and personal stats restart clean.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  calibrationSessions,
  observations,
  users,
  videos,
} from "@/db/schema";
import { createDemoVideos, resetMyDemo } from "@/lib/db/admin-training";
import { getMyCodingStats } from "@/lib/db/coder";
import { purgeFixture } from "./fixtures";

const FIXTURE = {
  displayCodes: ["V-DEMO-DEMOL-01", "V-DEMO-DEMOL-02"],
  emails: ["demolife-admin@example.org"],
  pairLabels: ["demo-demolife-admin@example.org"],
};

let adminId = "";

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [admin] = await db
    .insert(users)
    .values({ email: "demolife-admin@example.org", role: "admin" })
    .returning({ id: users.id });
  adminId = admin.id;
});

afterAll(async () => {
  await purgeFixture(FIXTURE);
});

describe("the demo lifecycle", () => {
  it("creates the two demo videos with the calibration partner seated", async () => {
    const r = await createDemoVideos(adminId);
    expect(r).toMatchObject({ ok: true, created: 2 });
    const vids = await db
      .select({ id: videos.id, code: videos.displayCode })
      .from(videos)
      .where(inArray(videos.displayCode, FIXTURE.displayCodes));
    expect(vids).toHaveLength(2);
    // The -02 session exists in the lobby with the placeholder pre-seated.
    const demo2 = vids.find((v) => v.code.endsWith("-02"))!;
    const [session] = await db
      .select({ status: calibrationSessions.status })
      .from(calibrationSessions)
      .where(eq(calibrationSessions.videoId, demo2.id));
    expect(session?.status).toBe("lobby");
    // Idempotent.
    const again = await createDemoVideos(adminId);
    expect(again).toMatchObject({ ok: true, created: 0 });
  });

  it("deletes the demo videos and every trace of them", async () => {
    const r = await resetMyDemo(adminId);
    expect(r).toMatchObject({ ok: true, removed: 2 });
    const vids = await db
      .select({ id: videos.id })
      .from(videos)
      .where(like(videos.displayCode, "V-DEMO-DEMOL-%"));
    expect(vids).toHaveLength(0);
    const obs = await db
      .select({ id: observations.id })
      .from(observations)
      .where(eq(observations.coderId, adminId));
    expect(obs).toHaveLength(0);
    // The personal dashboard restarts clean.
    const stats = await getMyCodingStats(adminId);
    expect(stats.submittedVideos).toBe(0);
    // A fresh set can be created again afterwards.
    const recreate = await createDemoVideos(adminId);
    expect(recreate).toMatchObject({ ok: true, created: 2 });
    await resetMyDemo(adminId);
  });
});
