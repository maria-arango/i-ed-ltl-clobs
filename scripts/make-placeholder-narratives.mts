/**
 * Write the synthetic placeholder narratives (decision D7) into
 * db/seed/narratives/. Invented content only; safe to commit.
 *   node scripts/make-placeholder-narratives.mts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { makePlaceholderNarrative, PLACEHOLDERS } from "../lib/narratives/placeholder.ts";

mkdirSync("db/seed/narratives", { recursive: true });
for (const p of PLACEHOLDERS) {
  writeFileSync(`db/seed/narratives/${p.file}`, makePlaceholderNarrative(p));
  console.log(`wrote db/seed/narratives/${p.file}`);
}
