// Vitest setup: load .env.local like Next.js does (CI provides real env
// variables instead; config() is a no-op when the file is absent).
import { config } from "dotenv";

config({ path: ".env.local" });

// Never run the suite against the live database (STATUS §9.5): .env.local
// holds the production Neon URL, so a bare `npm test` on a maintainer's
// machine would otherwise write fixtures into it. Use `npm run test:local`.
for (const name of ["DATABASE_URL", "DATABASE_URL_CODER"]) {
  if (/neon\.tech/i.test(process.env[name] ?? "")) {
    throw new Error(
      `${name} points at a neon.tech host. Tests only run against a local or CI database: use \`npm run test:local\`.`,
    );
  }
}
