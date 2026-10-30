/**
 * NIGHTLY COPY INTO THE HARVARD DRIVE — Amendment §58.
 *
 *  - The service-account JWT is correctly signed and scoped to Drive.
 *  - Uploads go into the configured folder, shared drives supported.
 *  - The cron endpoint refuses anyone without the Vercel cron secret.
 *  - The copy holds every assigned narrative as Word plus the narrative
 *    tables as data, with sid and tr_id in the manifest and the data
 *    (Amendment §61; Amendment B §6: both in every admin export and backup).
 *  - "Submitted in the last 24 hours" keeps only recent submissions.
 */
import { generateKeyPairSync, createVerify } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { db } from "@/lib/db";
import { narrativeAssignments, narratives, userTeams, users } from "@/db/schema";
import { getAccessToken, serviceAccountJwt, uploadToDrive } from "@/lib/backup/google-drive";
import {
  assignNarrative,
  buildNarrativesZip,
  buildNightlyBackup,
  confirmNarrativeImport,
  runNightlyBackup,
} from "@/lib/db/admin-narratives";
import { GET as cronRoute } from "@/app/api/cron/backup/route";
import { purgeFixture } from "./fixtures";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = {
  client_email: "backup-test@example.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

describe("Google Drive upload (mocked network)", () => {
  it("signs an RS256 JWT for the Drive scope", () => {
    const jwt = serviceAccountJwt(SA, 1_800_000_000);
    const [h, c, sig] = jwt.split(".");
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${c}`);
    expect(v.verify(publicKey, Buffer.from(sig, "base64url"))).toBe(true);
    const claims = JSON.parse(Buffer.from(c, "base64url").toString());
    expect(claims).toMatchObject({
      iss: SA.client_email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
  });

  it("exchanges the JWT for a token and uploads into the folder (shared drives)", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok-123" }), { status: 200 });
      return new Response(JSON.stringify({ id: "file-1", name: "x.zip" }), { status: 200 });
    }) as unknown as typeof fetch;
    const token = await getAccessToken(SA, fake);
    expect(token).toBe("tok-123");
    expect(String(calls[0].init.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
    const up = await uploadToDrive(token, "FOLDER-XYZ", { name: "x.zip", mimeType: "application/zip", data: new Uint8Array([1, 2, 3]) }, fake);
    expect(up).toEqual({ id: "file-1", name: "x.zip", bytes: 3 });
    expect(calls[1].url).toContain("uploadType=multipart");
    expect(calls[1].url).toContain("supportsAllDrives=true");
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe("Bearer tok-123");
    const body = (calls[1].init.body as Buffer).toString("latin1");
    expect(body).toContain('"parents":["FOLDER-XYZ"]');
    expect(body).toContain('"name":"x.zip"');
  });

  it("reports a refused upload instead of pretending", async () => {
    const fake = (async () => new Response("forbidden", { status: 403 })) as unknown as typeof fetch;
    await expect(uploadToDrive("t", "F", { name: "a", mimeType: "text/plain", data: new Uint8Array() }, fake)).rejects.toThrow(/403/);
  });
});

describe("cron endpoint", () => {
  it("is closed without the Vercel cron secret", async () => {
    const before = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;
    expect((await cronRoute(new Request("https://x/api/cron/backup"))).status).toBe(503);
    process.env.CRON_SECRET = "s3cret";
    expect((await cronRoute(new Request("https://x/api/cron/backup"))).status).toBe(401);
    expect((await cronRoute(new Request("https://x/api/cron/backup", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  });

  it("says plainly when the Drive copy is not configured", async () => {
    const r = await runNightlyBackup({ actorId: null, serviceAccountJson: undefined, folderId: undefined });
    expect(r).toMatchObject({ ok: false });
  });
});

/* ---- contents, on test-dataset narratives -------------------------- */

const FIXTURE = {
  displayCodes: [] as string[],
  emails: ["backuptest-admin@example.org", "backuptest-a@example.org"],
  pairLabels: [] as string[],
};
const BASE = readFileSync("db/seed/narratives/placeholder-99903_12.md", "utf8");
const ids: Record<string, string> = {};
let assignmentId = "";

beforeAll(async () => {
  await purgeFixture(FIXTURE);
  const [admin] = await db.insert(users).values({ email: FIXTURE.emails[0], role: "admin", datasetScope: "test" }).returning({ id: users.id });
  const [a] = await db.insert(users).values({ email: FIXTURE.emails[1], name: "Backup Tester", role: "coder", datasetScope: "test" }).returning({ id: users.id });
  ids.admin = admin.id;
  ids.a = a.id;
  await db.insert(userTeams).values({ userId: a.id, team: "narratives" });
  const r = await confirmNarrativeImport(admin.id, [{ name: "n.md", text: BASE.split("99903_12").join("99981_1") }], { dataset: "test" });
  if (!r.ok) throw new Error(r.error);
  const [n] = await db.select().from(narratives).where(eq(narratives.importedBy, admin.id));
  const asg = await assignNarrative(admin.id, { narrativeId: n.id, assigneeId: a.id, orderNo: 1, videoUrl: null });
  if (!asg.ok) throw new Error(asg.error);
  assignmentId = asg.assignmentId;
});
afterAll(() => purgeFixture(FIXTURE));

describe("backup contents", () => {
  it("holds every assigned narrative as Word plus the data, with sid and tr_id", async () => {
    const files = await buildNightlyBackup("test", new Date("2026-10-29T23:00:00Z"));
    expect(files.map((f) => f.name)).toEqual(["clobs-narratives_2026-10-29.zip", "clobs-narratives-data_2026-10-29.json.gz"]);
    const zip = await JSZip.loadAsync(files[0].data);
    const names = Object.keys(zip.files);
    expect(names).toContain("MANIFEST.csv");
    expect(names.some((n) => n.endsWith(".docx"))).toBe(true);
    const json = gunzipSync(Buffer.from(files[1].data)).toString();
    const data = JSON.parse(json);
    expect(data.assignments.some((x: { id: string }) => x.id === assignmentId)).toBe(true);
    expect(data.documents.length).toBeGreaterThan(0);
    expect(data.narratives.find((n: { lessonId: string }) => n.lessonId === "99981_1")).toBeTruthy();
    const manifest = (await zip.file("MANIFEST.csv")!.async("string")).replace(/^\uFEFF/, "").split("\r\n");
    expect(manifest[0].split(",").slice(0, 7)).toEqual(["file", "sid", "tr_id", "video_file", "video_link", "video_check", "format"]);
    const row = manifest.find((l) => l.includes(",99981_1,"))!;
    expect(row.split(",")[1]).toBe("99981");
    expect(row).toContain("not checked");
    expect(names.some((n) => /^01_99981_1_NARRATIVE_review_Backup\.docx$/.test(n))).toBe(true);
  });

  it("'submitted in the last 24 hours' keeps only recent submissions", async () => {
    const recent = await buildNarrativesZip(ids.admin, "submitted", "test", new Date(Date.now() - 24 * 3600 * 1000));
    expect(recent.count).toBe(0); // nothing submitted yet
    await db
      .update(narrativeAssignments)
      .set({ status: "submitted", submittedAt: new Date(), submittedRevision: 0 })
      .where(eq(narrativeAssignments.id, assignmentId));
    const after = await buildNarrativesZip(ids.admin, "submitted", "test", new Date(Date.now() - 24 * 3600 * 1000));
    expect(after.count).toBe(1);
    expect(after.filename).toMatch(/^narratives_submitted_last24h_/);
    const old = await buildNarrativesZip(ids.admin, "submitted", "test", new Date(Date.now() + 60_000));
    expect(old.count).toBe(0);
  });
});
