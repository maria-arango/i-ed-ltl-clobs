// Vitest setup: load .env.local like Next.js does (CI provides real env
// variables instead; config() is a no-op when the file is absent).
import { config } from "dotenv";

config({ path: ".env.local" });
