import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";
import { hardenSslMode } from "./lib/pg-url";

// Next.js loads .env.local itself at runtime; drizzle-kit does not.
config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: hardenSslMode(process.env.DATABASE_URL)!,
  },
});
