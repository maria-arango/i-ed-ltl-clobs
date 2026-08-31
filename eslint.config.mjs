import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Blinding boundary (docs/03-data-model.md §3): coder-facing code may
    // only reach the database through the restricted query layer.
    files: [
      "app/api/coder/**",
      "app/(coder)/**",
      "app/(shell)/videos/**",
      "app/(shell)/calibration/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "Coder-facing code must import from @/lib/db/coder (restricted role), never the admin client.",
            },
            {
              name: "@/db/schema",
              message:
                "Coder-facing code must not query tables directly; use @/lib/db/coder.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not application code:
    ".claude/**",
    ".reference/**",
    "scripts/**",
    "neon.ts",
  ]),
]);

export default eslintConfig;
