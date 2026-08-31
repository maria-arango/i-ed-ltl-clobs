/**
 * Load the extracted rubric (db/seed/rubric-2026-08-22.json) and the
 * context-card field help (db/seed/field-help.json) into the database.
 * Idempotent: refuses to double-insert a rubric version; field help is
 * replaced wholesale (it is reference data with no history requirement).
 *
 * Usage: node scripts/seed-rubric.mts
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema.ts";

config({ path: ".env.local" });

const rubric = JSON.parse(readFileSync("db/seed/rubric-2026-08-22.json", "utf8"));
const fieldHelp = JSON.parse(readFileSync("db/seed/field-help.json", "utf8"));

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const db = drizzle(pool, { schema });

const existing = await db.query.rubricVersions.findFirst({
  where: eq(schema.rubricVersions.versionLabel, rubric.versionLabel),
});

if (existing) {
  console.log(`Rubric version ${rubric.versionLabel} already seeded; skipping.`);
} else {
  await db.transaction(async (tx) => {
    const [version] = await tx
      .insert(schema.rubricVersions)
      .values({
        versionLabel: rubric.versionLabel,
        sourceRef: rubric.sourceRef,
        effectiveFrom: new Date(),
      })
      .returning({ id: schema.rubricVersions.id });

    for (const g of rubric.guidance) {
      await tx.insert(schema.rubricGuidance).values({
        rubricVersionId: version.id,
        kind: g.kind,
        position: g.position,
        label: g.label,
        text: g.text,
      });
    }

    for (const c of rubric.concepts) {
      const [concept] = await tx
        .insert(schema.rubricConcepts)
        .values({
          rubricVersionId: version.id,
          itemNo: c.itemNo,
          name: c.name,
          statement: c.statement,
          importance: c.importance,
          specialNote: c.specialNote,
        })
        .returning({ id: schema.rubricConcepts.id });

      for (let i = 0; i < c.indicators.length; i++) {
        await tx.insert(schema.rubricIndicators).values({
          conceptId: concept.id,
          position: i + 1,
          text: c.indicators[i],
        });
      }
      for (const n of [1, 2, 3, 4]) {
        await tx.insert(schema.rubricAnchors).values({
          conceptId: concept.id,
          scoreNum: n,
          text: c.anchors[n],
        });
        for (let i = 0; i < c.examples[n].length; i++) {
          await tx.insert(schema.rubricExamples).values({
            conceptId: concept.id,
            scoreNum: n,
            position: i + 1,
            text: c.examples[n][i],
          });
        }
      }
    }
    console.log(`Seeded rubric ${rubric.versionLabel} (${rubric.concepts.length} concepts).`);
  });
}

// Field help: replace wholesale.
await db.delete(schema.fieldHelp).where(eq(schema.fieldHelp.form, fieldHelp.form));
for (const [fieldKey, helpText] of Object.entries(fieldHelp.fields)) {
  await db.insert(schema.fieldHelp).values({
    form: fieldHelp.form,
    fieldKey,
    helpText: helpText as string,
  });
}
console.log(`Seeded ${Object.keys(fieldHelp.fields).length} field-help entries.`);

await pool.end();
