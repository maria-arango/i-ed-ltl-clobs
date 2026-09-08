import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Integration tests talk to a real PostgreSQL over TLS.
    testTimeout: 30000,
    hookTimeout: 60000,
    // One suite at a time. Suites share one database, and some production
    // rules are deliberately global (flagging a video gold assigns it to
    // EVERY active trainee), so parallel suites raced on each other's
    // fixtures (2026-09-07). Sequential costs ~1 minute and is deterministic.
    fileParallelism: false,
  },
});
