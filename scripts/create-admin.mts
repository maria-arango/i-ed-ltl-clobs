/**
 * Create (or repair) an admin account. There is no self-signup; this is how
 * the first admin gets in, and how a locked-out admin is reactivated.
 *
 * Usage: npm run admin:create -- --email maria@example.org --name "María"
 * Runs with Node's built-in TypeScript support; no build step.
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.ts";

config({ path: ".env.local" });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();

if (!email || !email.includes("@")) {
  console.error(
    'Usage: npm run admin:create -- --email someone@example.org --name "Full Name"',
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });

const existing = await db.query.users.findFirst({
  where: eq(schema.users.email, email),
});

if (existing) {
  await db
    .update(schema.users)
    .set({ role: "admin", isActive: true, deactivatedAt: null })
    .where(eq(schema.users.id, existing.id));
  console.log(`Updated existing account ${email} → admin, active.`);
} else {
  await db.insert(schema.users).values({
    email,
    name: name ?? null,
    role: "admin",
    datasetScope: "live",
  });
  console.log(`Created admin account for ${email}.`);
}

await db.insert(schema.auditLog).values({
  action: "admin_account_created_or_updated",
  subjectTable: "users",
  subjectId: email,
  details: { via: "scripts/create-admin.mts" },
});

await pool.end();
