/**
 * ADMIN database client — full access, including video_provenance and
 * gold_scores. Import this ONLY from admin-facing code paths.
 *
 * Coder-facing route handlers must never import this module; they use the
 * whitelisted query layer in lib/db/coder.ts, which connects with the
 * restricted DATABASE_URL_CODER role (§3 of docs/03-data-model.md).
 * A lint rule enforcing the import boundary ships with the first coder route.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { hardenSslMode } from "@/lib/pg-url";

const pool = new Pool({
  connectionString: hardenSslMode(process.env.DATABASE_URL),
  max: 5,
});

export const db = drizzle(pool, { schema });
export { schema };
